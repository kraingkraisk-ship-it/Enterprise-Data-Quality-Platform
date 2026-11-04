# Deployment Guide — Enterprise Data Quality Platform (EDQP)

Scope: sandbox/demo deployment (Docker) plus the production swap-points. Architecture context: `docs/ARCHITECTURE.md`; operations: `docs/RUNBOOK.md`; assets: `deploy/Dockerfile`, `deploy/docker-compose.yml`, `deploy/ci.yml`.

---

## 1. Environment variables

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:/app/db/custom.db` (repo dev uses `file:/home/z/my-project/db/custom.db`) | Prisma datasource (SQLite; PostgreSQL in production — §4) |
| `SESSION_SECRET` | **yes in production** | dev fallback `edqp-dev-secret-change-in-production` (`src/lib/auth.ts`) | HMAC key for the `edqp_session` cookie. Generate with `openssl rand -base64 48`. Rotating it invalidates all sessions (acceptable, audited as LOGOUT) |
| `NODE_ENV` | set by images/`bun run start` | `production` | enables `secure` cookies, Next.js production mode |
| `FORCE_SEED` | optional | `1` to wipe & reseed | seed override for `prisma/seed.ts` |

Never commit real secrets; in compose/k8s inject them from the environment or a secret manager. The `DataSource.connectionRef` column stores only *references* to secret-manager entries — credentials never enter the database.

## 2. Migrations & seed

Package scripts (repo root, Bun runtime):

```bash
bun install                # deps (bun.lock is authoritative)

bun run db:generate        # prisma generate (client)
bun run db:push            # prisma db push --accept-data-loss → schema → db/custom.db
bun prisma/seed.ts         # idempotent seed: skips when users exist
FORCE_SEED=1 bun prisma/seed.ts   # full reset + reseed (wipes all 19 tables)
```

Notes:

- This project uses **`db push`** (declarative) rather than migration files in the sandbox. For production with PostgreSQL, switch to `bun run db:migrate` (`prisma migrate dev`) / `prisma migrate deploy` and version the SQL (§4 swap-point A2).
- The seed is realistic *and* deterministic: it runs the real rules engine + job runner for today's runs, then backfills 30-day history (10 users, 6 datasets/4 sources, 22 rules, 96 runs, ML anomalies, 8 issues, 5 models, audit trail, policy settings).
- `db:push` with `--accept-data-loss` is destructive by design in the sandbox — never point it at a database holding evidence you must keep.

## 3. Build & run (local)

```bash
bun run dev      # dev server on :3000 (tees stdout to dev.log)
bun run lint     # eslint
bun run build    # next build (output: standalone) + copies .next/static & public into .next/standalone
bun run start    # NODE_ENV=production bun .next/standalone/server.js → server.log
```

Then: `curl -fsS localhost:3000/api/health`, open `http://localhost:3000`, sign in as a seeded persona.

## 4. Production notes — swap-points (assumption A1–A9)

Every sandbox adaptation (assumption A1–A9 in `docs/GOVERNANCE.md` §2) was built behind a stable contract so each swap is local. Checklist for hardening to production:

| Swap | What changes | What stays |
|---|---|---|
| **A2 SQLite → PostgreSQL** | `provider = "postgresql"` in `prisma/schema.prisma`; `DATABASE_URL=postgresql://…`; move to `prisma migrate deploy`; string-state columns can later be tightened to Postgres enums | All models, DTOs, queries |
| **A5 Demo auth → OIDC** | Replace the login handler with an OIDC code flow (PKCE); keep issuing/verifying the same `edqp_session` cookie or move to the IdP session — `getSessionUser()` is the only contract consumers use | RBAC matrix, view gating, audit |
| **A9 Rate limit → Redis** | Swap the body of `rateLimit()` in `src/lib/rate-limit.ts` for a Redis sliding window (INCR/EXPIRE or Lua) — signature `rateLimit(key, limitPerMinute)` unchanged | Route guard chain |
| **A3 In-process worker → Celery/Redis** | Point `enqueue()` at Celery (or keep polling: run `src/lib/jobs/runner.ts` in a **separate process** — it polls the `Job` table, see §5) | Job semantics: idempotencyKey, attempts, timeout, DLQ status names |
| **A4 TS-ML → MLflow** | Export trained params/metrics to MLflow; keep `MLModel` registry rows in sync on stage transitions (audited MODEL_PROMOTE/MODEL_SHADOW) | Lifecycle states, shadow policy, review workflow |
| **A7 AV scan → ClamAV** | In the upload handler, call clamd for `scanStatus` transitions (PENDING→CLEAN/INFECTED) instead of the stub | `FileUpload` lifecycle + quarantine path |
| **A8 Local files → S3** | Put/get for `uploads/` & `exports/` via an S3 adapter keyed by `FileUpload.storedName` | Presigned-download UX, audit trail |
| **A1 Next.js → FastAPI (optional)** | Re-implement routes to the frozen DTOs in `src/lib/types.ts`; keep paths identical to §8 of ARCHITECTURE | `src/lib/api-client.ts` contract |

## 5. Scaling path (worker split)

The platform is a modular monolith by design; the first scaling step needs **no code changes**:

1. **Split the worker:** run a second process whose only job is `startWorkerHeartbeat()` + the poll loop — it claims `Job` rows with `status='QUEUED' AND nextRunAt <= now()` from the shared database. With Celery (A3), a small adapter replaces polling while `enqueue()`/`Job` remain the API.
2. **Safety properties already present:** unique `idempotencyKey` (dedupe across processes), per-job timeout + attempts, DLQ. For strict single-execution under concurrent pollers, wrap the claim (`findFirst` → `update RUNNING`) in a transaction or `UPDATE … WHERE status='QUEUED'` guard — required once >1 worker exists.
3. **Multiple app instances:** safe for reads; before scaling horizontally you **must** move the in-memory rate limiter to Redis (A9) and configure sticky sessions or an external session store (the cookie is stateless HMAC — sticky not required for auth itself).
4. **Database:** SQLite is single-writer; horizontal app scaling implies the PostgreSQL swap (A2). Take `VACUUM`/backup windows into account until then (RUNBOOK §6).
5. **Gateway:** terminate TLS upstream (§6) and load-balance app replicas; keep `X-Forwarded-For/Proto` headers (audit stores IP/UA).

## 6. TLS termination at gateway

- Terminate TLS at the gateway (Caddy in this repo — root `Caddyfile` reverse-proxies `:81`/`443` → `localhost:3000`, forwarding `X-Forwarded-For/Proto`; swap for your org's ALB/NGINX/Envoy unchanged).
- Production cookies are `secure` (`NODE_ENV=production`), so **the app must be reachable via HTTPS end-to-end**; never expose :3000 directly to untrusted networks.
- Docker compose demo binds `127.0.0.1:3000:3000` (loopback only) — put Caddy or your gateway in front for anything network-visible; add HSTS at the gateway.
- `/api/health` stays unauthenticated for LB checks; it leaks no data (status + check names only).

## 7. Docker deployment (deploy/)

```bash
# from repo root:
docker build -f deploy/Dockerfile -t edqp:latest .
docker compose -f deploy/docker-compose.yml up -d        # app on 127.0.0.1:3000, volumes: db-data, uploads
# first boot (host has bun, or use the builder stage as a one-off):
DATABASE_URL=file:$PWD/db/custom.db bun run db:push && bun prisma/seed.ts
docker compose -f deploy/docker-compose.yml logs -f app
```

The image (multi-stage): **deps** (bun install) → **build** (`NEXT_TELEMETRY_DISABLED=1`, standalone output, prisma generate) → **runner** (`node:22-alpine`, non-root `node` user, copies `.next/standalone`, `.next/static`, `public`, empty `db/`+`uploads/`+`exports/` dirs, `EXPOSE 3000`, `HEALTHCHECK` against `/api/health`). Mount `db-data` (and `uploads`) volumes so data survives redeploys. `deploy/docker-compose.yml` also contains commented **postgres/redis services — production swap targets** (A2/A3), to be enabled only together with the §4 code swaps.

CI: `deploy/ci.yml` runs on push/PR — checkout → setup-bun → `bun install` → `bunx prisma generate` → `bunx tsc --noEmit` → `bun run lint` → `bun run build`.
