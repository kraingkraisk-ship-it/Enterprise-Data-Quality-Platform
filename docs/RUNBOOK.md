# Runbook — Enterprise Data Quality Platform (EDQP)

Audience: platform on-call / data engineers. Reference: `docs/ARCHITECTURE.md` (modules, API), `docs/GOVERNANCE.md` §17 (score), `docs/DEPLOYMENT.md` (deploy).

---

## 1. Health & readiness

**Endpoint:** `GET /api/health` — public, unauthenticated (rate-limited like every route).

Response contract (per `src/lib/api-client.ts`):

```json
{ "status": "ok", "checks": { "database": "ok", "worker": "ok" } }
```

| Check | Meaning | On failure |
|---|---|---|
| `database` | Prisma can reach the SQLite file (`DATABASE_URL`) | App is degraded: every API route will fail. Check `db/custom.db` exists & is writable, disk not full (`df -h .`), no stale `.db-journal`/`.db-wal` lock file |
| `worker` | Job runner heartbeat has been kicked (`startWorkerHeartbeat()` in `src/instrumentation.ts`, nodejs runtime) | Jobs will sit QUEUED. Restart the server process; verify `src/instrumentation.ts` is registered (the heartbeat must start in the Node.js server, not a browser bundle) |

Quick probes:

```bash
curl -fsS http://localhost:3000/api/health | jq
# containerised:
docker compose -f deploy/docker-compose.yml exec app wget -qO- http://127.0.0.1:3000/api/health
```

Any 5xx/timeout ⇒ treat as **down**: `bun run start` restart (or `docker compose restart app`). Container also has a Docker `HEALTHCHECK` against `/api/health` (see `deploy/Dockerfile`).

## 2. Job triage (DLQ / DEAD jobs)

Job lifecycle: `QUEUED → RUNNING → SUCCEEDED | FAILED→retry | DEAD | CANCELLED` (`src/lib/jobs/runner.ts`).
Retry policy: max 3 attempts (`maxAttempts`), exponential backoff `2^attempt` seconds capped at 60 s + jitter; per-job timeout aborts execution via `AbortController`. A job that exhausts attempts or times out on the last attempt lands in the **DLQ** with `status='DEAD'`.

**Triage a DEAD job**

1. Find it: `dashboard-engineering` (`jobStats.dead`) or API `GET /api/jobs?status=DEAD`.
2. Read the error: `Job.lastError` (first 500 chars; timeouts read `Timeout after <N>ms`).
3. Classify:
   - `dataset <id> not found` → payload references a purged/renamed dataset; do **not** replay, fix the payload.
   - `Timeout after …` → dataset too large for the timeout; raise the job's `timeoutMs` for the replay or investigate data volume.
   - transient DB/IO errors → replay.
4. **Replay:** enqueue again **with the same `idempotencyKey`** — `enqueue()` treats DEAD/CANCELLED keys as reusable and resets the row to `QUEUED` with attempts=0. Reusing a *live* key instead deduplicates (returns the existing job) — that is by design (idempotency).
5. Confirm the job transitions QUEUED→RUNNING→SUCCEEDED and the linked `ValidationRun`/`ProfileSnapshot`/`Anomaly` output appears.

```bash
# DLQ listing (as an authenticated admin/engineer session):
curl -fsS 'http://localhost:3000/api/jobs?status=DEAD&limit=20' -H "Cookie: edqp_session=…"
```

**Cancellation:** `POST /api/jobs/:id/cancel` — QUEUED jobs become CANCELLED instantly; RUNNING jobs are cancelled cooperatively at the next checkpoint (rule loop). A cancelled job is replayable with the same key.

**Idempotency note:** VALIDATION jobs also dedupe on `ValidationRun.correlationId` — a run already finalised with the same correlationId is never computed twice.

## 3. Validation run triage (correlationId)

Every `ValidationRun` has a unique `correlationId` (format `corr-<ts36>-<rand>`, `src/lib/logger.ts:newCorrelationId`), also stamped on its audit rows and job payload.

**Trace an investigation end-to-end:**

```bash
# 1. find the run (validations view, or API):
curl -fsS 'http://localhost:3000/api/validations?datasetId=<id>&limit=10' -H "Cookie: edqp_session=…"
# 2. pull run detail incl. per-rule results + masked evidence:
curl -fsS 'http://localhost:3000/api/validations/<runId>' -H "Cookie: edqp_session=…"
# 3. grep logs for the correlation id:
rg "corr-<id>" dev.log        # dev (bun run dev tees to dev.log)
rg "corr-<id>" server.log     # production start
```

Fields that matter while triaging: `attempt` (runner retry count), `retriedFrom` (set when attempt > 1), `ruleSetVersion` (snapshot of active rule versions, `rs-<date>`), `status` (`FAILED` = job-level failure; `PARTIAL` reserved for partial-failure capture), `durationMs`. Failed *rules* within a SUCCEEDED run are normal quality findings, not outages — route them to issues (§19 GOVERNANCE), not to engineering.

## 4. Score guardrail explanation (what "capped" means)

The score (`src/lib/ml/scoring.ts`) is: weighted mean of per-dimension effective pass rates, renormalised over measured dimensions, with two guardrails:

1. **Critical damping** — a rule that FAILED with severity CRITICAL contributes `passRate ÷ score.criticalWeight` (default 2.0).
2. **Coverage cap** — when CDE rule coverage `ValidationRun.coverage < score.coverageFloor` (default **0.6**), the final score is pinned to **70** regardless of pass rates, and the payload carries `guardrails: { capped: true, noteEn, noteTh }`.

**Operator interpretation:** a capped score is **not a malfunction** — it is the anti-gaming control working (a dataset cannot look healthy while its critical data elements are mostly untested). The seeded Marketing Consents dataset intentionally demonstrates this (score 70).

**Remediation = add rules, not tune policy:** author + approve + activate rules covering the flagged CDE columns (see GOVERNANCE §10) until coverage ≥ floor; the cap lifts automatically on the next run. Lowering `score.coverageFloor` via Administration → Policy is possible but is a *governance decision* (Data Governance Council), audited as `POLICY_UPDATE` — never do it to make a number look better.

## 5. Policy change procedure

Policy parameters (`PolicySetting`, defaults in `src/lib/types.ts:POLICY_DEFAULTS`) are runtime-configurable.

1. **Authorise:** only SYSTEM_ADMIN (`ADMIN_POLICY`). For material parameters (score weights, coverage floor, SLA hours, masking mode, shadow duration) obtain Data Governance Council sign-off first (GOVERNANCE §5).
2. **Apply:** UI path **Administration → Policy**, edit the key's JSON value, save → `POST /api/admin/policy {key, value}`.
3. **Verify:** the audit trail records `POLICY_UPDATE` (actor, role, key, value, IP, correlationId) — confirm in `audit-logs`.
4. **Communicate:** score-affecting changes alter historical comparability; note the change date in the governance minutes (trend charts must be annotated).

Prohibited values are rejected at the edge (e.g. `masking.defaultMode: 'NONE'` for PII). See GOVERNANCE §30 for the full parameter table and effects.

## 6. Backup & restore

State of the system = **one SQLite file + two directories**:

| Asset | Path | Notes |
|---|---|---|
| Database | `db/custom.db` | all 19 models incl. immutable `AuditLog` |
| Uploads | `uploads/` | UUID-renamed files (`FileUpload.storedName`) |
| Exports | `exports/` | generated report artefacts |
| Config/secrets | env vars | `DATABASE_URL`, `SESSION_SECRET` — store in secret manager |

**Backup (consistent, recommended)**

```bash
# online backup via SQLite's own API (safe while server runs):
sqlite3 db/custom.db ".backup 'backups/custom-$(date +%F).db'"
# plus content dirs:
tar czf "backups/files-$(date +%F).tgz" uploads exports
```

A raw `cp` of `db/custom.db` is acceptable **only while the app is stopped** (otherwise take `.backup` as above).

**Restore**

1. Stop the app (`docker compose stop app` or kill the `bun run start` process) — the in-process worker must not write during restore.
2. Replace `db/custom.db` with the backup; restore `uploads/` and `exports/` from the tarball.
3. Remove any stale `db/custom.db-journal` / `-wal` / `-shm` files.
4. Restart and verify: `curl /api/health` → both checks `ok`; spot-check dashboard numbers against the last known-good values; confirm newest `AuditLog` rows predate the incident.
5. After an incident, replay lost work: re-enqueue jobs with their original `idempotencyKey` (§2) — idempotency prevents duplication.

**Retention:** keep ≥ 90 days of backups (matches `upload.retentionDays`); store copies off-host. Audit-log rows are governance evidence — never exclude them from backup.

## 7. Log locations & format

| Environment | Location | Producer |
|---|---|---|
| Dev (`bun run dev`) | `dev.log` (tee of stdout) + console | `next dev` |
| Production (`bun run start`) | `server.log` (tee of stdout) + console | standalone server |
| Container (deploy/) | stdout/stderr of the `app` container → container log driver | `node .next/standalone/server.js` |

**Format:** one JSON object per line (`src/lib/logger.ts`):

```json
{"ts":"2025-01-01T00:00:00.000Z","level":"INFO","service":"edqp-api","msg":"audit.event","action":"RULE_APPROVE","actor":"…","resource":"RuleVersion:…","correlationId":"corr-…"}
```

Useful messages: `audit.event` (every critical action), `job.validation.done` / `job.profiling.done` / `job.anomaly.done`, `job.failed` (attempt, isDead), `job.unknown_type`.

**Rules:** logs are structured and PII-free by policy — values must pass `src/lib/masking.ts` before logging; never log raw dataset content, cookies, or `SESSION_SECRET`. Grep tips: `rg '"level":"ERROR"' server.log`, `rg 'job.failed' dev.log`, `rg '"action":"POLICY_UPDATE"' dev.log`.

## 8. Common alerts mapping

| Alert / signal | Likely cause | First action |
|---|---|---|
| `/api/health` 5xx or `database: fail` | DB file missing/locked, disk full | `df -h`; check `db/custom.db` + lock files; restart app |
| `worker: fail` / jobs stuck QUEUED | heartbeat never started (missing `src/instrumentation.ts` wiring) or process crash | restart process; verify instrumentation; watch `Job.updatedAt` move |
| DLQ depth > 0 (`jobStats.dead`) | persistent job failure | triage `Job.lastError` (§2); replay with same idempotency key |
| `queueDepth` sustained growth | worker slower than enqueue rate (large datasets, timeouts) | raise `timeoutMs`, split worker (DEPLOYMENT §5), throttle uploads |
| Issue SLA breaches rising | steward/owner backlog | operational dashboard → assign; escalate per GOVERNANCE §5 |
| `DATA_DRIFT` anomalies with `PSI>0.25` | upstream distribution shift | verify with Data Owner before action (finding is a signal, not confirmation) |
| `SCHEMA_DRIFT` HIGH anomalies | source column removed/retyped | freeze ingestion, notify source owner, re-approve affected rules |
| Source `successRate < 0.98` / health DEGRADED | source instability | check source host; pause source; expected-latency review |
| Coverage-cap banners on dashboards | CDE rules missing | author/approve CDE rules (§4) — not a policy change |
| 429 responses rising | client retry storm or scraping | identify IP in logs; rate limit is 120/min default (`rateLimit.perMinute`) |
| `Timeout after …ms` in `lastError` | dataset larger than job timeout | raise job `timeoutMs` on replay; investigate volume growth |
| `FILE_REJECT`/quarantined uploads | signature/extension/size gate | confirm with uploader; check `FileUpload.rejectReasonEn`; no bypass — use approved channels |
