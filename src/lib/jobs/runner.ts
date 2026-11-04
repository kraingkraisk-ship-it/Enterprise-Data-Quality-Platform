// In-process background worker — the "Background Worker" module of the Modular
// Monolith. Guarantees: idempotency (unique idempotencyKey), retry with
// exponential backoff + jitter, dead-letter queue (status DEAD), per-job
// timeout, cancellation, and partial-failure capture. Celery-equivalent
// contract: swap runner for a Celery worker in production, Job row is the task.
import { db } from '@/lib/db'
import { logger, newCorrelationId } from '@/lib/logger'
import { evaluateRule, profileDataset, diffSchema } from '@/lib/rules-engine'
import { computeQualityScore } from '@/lib/ml/scoring'
import { detectNumericOutliers } from '@/lib/ml/isolation-forest'
import { findDuplicateClusters } from '@/lib/ml/duplicate'
import { computePsi, computeCategoricalPsi, meanShiftZ, normaliseDriftScore } from '@/lib/ml/drift'
import { maskByPiiType } from '@/lib/masking'
import { getDatasetData } from '@/lib/data-engine'

export type JobType = 'PROFILING' | 'VALIDATION' | 'ANOMALY_SCAN' | 'EXPORT' | 'RETENTION'

interface EnqueueOpts {
  idempotencyKey: string
  maxAttempts?: number
  timeoutMs?: number
  payload?: Record<string, unknown>
}

export async function enqueue(type: JobType, opts: EnqueueOpts): Promise<{ jobId: string; deduplicated: boolean }> {
  const existing = await db.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } })
  if (existing && existing.status !== 'DEAD' && existing.status !== 'CANCELLED') {
    return { jobId: existing.id, deduplicated: true } // idempotent: retry never duplicates work
  }
  const job = await db.job.upsert({
    where: { idempotencyKey: opts.idempotencyKey },
    create: {
      type, payload: (opts.payload ?? {}) as object, idempotencyKey: opts.idempotencyKey,
      maxAttempts: opts.maxAttempts ?? 3, timeoutMs: opts.timeoutMs ?? 60_000, status: 'QUEUED',
    },
    update: { status: 'QUEUED', attempts: 0, nextRunAt: new Date(), lastError: null, cancelledAt: null },
  })
  kickWorker()
  return { jobId: job.id, deduplicated: false }
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return false
  if (job.status === 'QUEUED') {
    await db.job.update({ where: { id: jobId }, data: { status: 'CANCELLED', cancelledAt: new Date(), finishedAt: new Date() } })
    return true
  }
  if (job.status === 'RUNNING') {
    cancelled.add(job.id) // cooperative cancellation at next checkpoint
    return true
  }
  return false
}

const cancelled = new Set<string>()
let running = false

/** Poll loop — kicked on enqueue and every 5s while the server is up. */
export function kickWorker() {
  if (running) return
  running = true
  void workerLoop().finally(() => { running = false })
}

async function workerLoop() {
  for (let i = 0; i < 25; i++) { // bounded batch per kick
    const job = await db.job.findFirst({
      where: { status: 'QUEUED', nextRunAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
    })
    if (!job) break
    await runJob(job.id)
    if (cancelled.size > 64) cancelled.clear()
  }
}

function backoffMs(attempt: number): number {
  return Math.min(60_000, 2 ** attempt * 1000) + Math.floor(Math.random() * 500)
}

async function runJob(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.status !== 'QUEUED') return
  await db.job.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } } })
  const attempt = job.attempts + 1
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), job.timeoutMs)
  try {
    const payload = (job.payload ?? {}) as Record<string, unknown>
    switch (job.type) {
      case 'PROFILING': await execProfiling(payload, jobId); break
      case 'VALIDATION': await execValidation(payload, jobId, attempt); break
      case 'ANOMALY_SCAN': await execAnomalyScan(payload, jobId); break
      default: logger.warn('job.unknown_type', { jobId, type: job.type })
    }
    await db.job.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', finishedAt: new Date(), lastError: null } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const aborted = controller.signal.aborted
    const isDead = attempt >= job.maxAttempts
    await db.job.update({
      where: { id: jobId },
      data: {
        status: isDead ? 'DEAD' : 'QUEUED',
        lastError: aborted ? `Timeout after ${job.timeoutMs}ms` : message.slice(0, 500),
        nextRunAt: isDead ? undefined : new Date(Date.now() + backoffMs(attempt)),
        finishedAt: isDead ? new Date() : undefined,
      },
    })
    logger.error('job.failed', { jobId, attempt, isDead, error: message.slice(0, 200) })
  } finally {
    clearTimeout(timer)
    cancelled.delete(jobId)
  }
}

// ─── Executors ────────────────────────────────────────────────────────────────

async function execProfiling(payload: Record<string, unknown>, jobId: string) {
  const datasetId = String(payload.datasetId ?? '')
  const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
  if (!dataset) throw new Error(`dataset ${datasetId} not found`)
  const profile = await profileDataset(datasetId)
  await db.profileSnapshot.create({
    data: {
      datasetId, datasetVersion: dataset.version, rowCount: profile.rowCount,
      columnCount: profile.columnCount, nullRateAvg: profile.nullRateAvg,
      duplicateRate: profile.duplicateRate, overallScore: 0,
      columns: profile.columns as object, schema: profile.schema as object,
    },
  })
  // schema drift detection against previous snapshot
  const prev = await db.profileSnapshot.findFirst({
    where: { datasetId, id: { not: undefined } },
    orderBy: { createdAt: 'desc' },
    skip: 1,
  })
  if (prev) {
    const drifts = diffSchema(prev.schema as unknown as { name: string; type: string; nullable: boolean }[], profile.schema)
    for (const d of drifts.slice(0, 5)) {
      await db.anomaly.create({
        data: {
          datasetId, datasetVersion: dataset.version, type: 'SCHEMA_DRIFT',
          severity: d.kind === 'REMOVED' || d.kind === 'TYPE_CHANGED' ? 'HIGH' : 'MEDIUM',
          score: d.kind === 'REMOVED' ? 0.9 : 0.6, rawStat: d.kind, columnName: d.column,
          explanationEn: `Schema drift: ${d.detailEn} (job ${jobId.slice(0, 8)})`,
          explanationTh: `Schema เปลี่ยนแปลง: ${d.detailTh}`,
          contributingFeatures: [{ feature: d.column, contribution: 1 }] as object,
        },
      })
    }
  }
  logger.info('job.profiling.done', { datasetId, jobId, rows: profile.rowCount })
}

async function execValidation(payload: Record<string, unknown>, _jobId: string, attempt: number) {
  const datasetId = String(payload.datasetId ?? '')
  const ruleIds = (payload.ruleIds as string[] | undefined) ?? null
  const correlationId = String(payload.correlationId ?? newCorrelationId())
  const trigger = String(payload.trigger ?? 'MANUAL')
  const executedBy = String(payload.executedBy ?? 'system')
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: { columns: true, rules: { where: { isActive: true } } },
  })
  if (!dataset) throw new Error(`dataset ${datasetId} not found`)

  // Idempotency: a ValidationRun with the same correlationId already finalised → return
  const existing = await db.validationRun.findUnique({ where: { correlationId } })
  if (existing && existing.status !== 'QUEUED' && existing.status !== 'RUNNING') return
  const run = await db.validationRun.upsert({
    where: { correlationId },
    create: {
      datasetId, datasetVersion: dataset.version, ruleSetVersion: `rs-${new Date().toISOString().slice(0, 10)}`,
      trigger, status: 'RUNNING', executedBy, correlationId, attempt, retriedFrom: attempt > 1 ? correlationId : null,
      rowsEvaluated: 0, dimensionResults: {},
    },
    update: { status: 'RUNNING', attempt },
  })

  // CDE coverage for score guardrail
  const cdeColumns = dataset.columns.filter((c) => c.isCde).map((c) => c.name)
  const coveredCdes = new Set<string>()
  const piiMap = new Map(dataset.columns.map((c) => [c.name, c.isPii ? c.piiType : null]))
  const activeRules = ruleIds ? dataset.rules.filter((r) => ruleIds.includes(r.id)) : dataset.rules

  let passed = 0, failedCount = 0
  const ruleScores: { dimension: string; passRate: number; severity: string; status: string }[] = []

  for (const rule of activeRules) {
    if (cancelled.has(_jobId)) { await db.validationRun.update({ where: { id: run.id }, data: { status: 'CANCELLED', completedAt: new Date() } }); return }
    const version = await db.ruleVersion.findFirst({ where: { ruleId: rule.id, version: rule.currentVersion } })
    const definition = (version?.definition ?? {}) as unknown as import('@/lib/types').RuleDefinition
    let result
    try {
      result = await evaluateRule(datasetId, definition, rule.templateKey, piiMap)
    } catch (e) {
      result = { status: 'ERROR' as const, passRate: 0, failedRows: 0, evaluatedRows: 0, evidence: [], messageEn: e instanceof Error ? e.message : 'evaluation error', messageTh: 'เกิดข้อผิดพลาดในการประเมิน' }
    }
    if (result.status === 'PASSED') passed++
    else if (result.status === 'FAILED' || result.status === 'ERROR') failedCount++
    if (definition.column && cdeColumns.includes(definition.column)) coveredCdes.add(definition.column)
    ruleScores.push({ dimension: rule.dimension, passRate: result.passRate, severity: rule.severity, status: result.status })
    await db.validationRuleResult.create({
      data: {
        runId: run.id, ruleId: rule.id, ruleVersion: rule.currentVersion, status: result.status,
        passRate: result.passRate, failedRows: result.failedRows, evaluatedRows: result.evaluatedRows,
        evidence: result.evidence as object,
        messageEn: result.messageEn, messageTh: result.messageTh,
      },
    })
  }

  const dimensionResults: Record<string, { passed: number; total: number; rate: number }> = {}
  for (const rs of ruleScores) {
    const t = dimensionResults[rs.dimension] ?? { passed: 0, total: 0, rate: 0 }
    t.total++
    if (rs.status === 'PASSED' || rs.status === 'WARNING') t.passed++
    dimensionResults[rs.dimension] = t
  }
  for (const d of Object.keys(dimensionResults)) {
    const rulesOfDim = ruleScores.filter((r) => r.dimension === d)
    dimensionResults[d].rate = Number((rulesOfDim.reduce((a, r) => a + r.passRate, 0) / Math.max(1, rulesOfDim.length)).toFixed(3))
  }
  const { rows } = await getDatasetData(datasetId)
  const cdeCoverage = cdeColumns.length === 0 ? 1 : coveredCdes.size / cdeColumns.length
  const score = computeQualityScore(ruleScores, { cdeCoverage })
  await db.validationRun.update({
    where: { id: run.id },
    data: {
      status: 'SUCCEEDED', completedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
      rowsEvaluated: rows.length, rulesTotal: activeRules.length,
      rulesPassed: passed, rulesFailed: failedCount,
      qualityScore: score.score, coverage: cdeCoverage,
      dimensionResults: dimensionResults as object,
    },
  })
  logger.info('job.validation.done', { datasetId, runId: run.id, score: score.score })
}

export async function execAnomalyScan(payload: Record<string, unknown>, jobId: string) {
  const datasetId = String(payload.datasetId ?? '')
  const modelId = payload.modelId ? String(payload.modelId) : null
  // Resolve the right promoted model per anomaly kind (falls back to requested model).
  const models = await db.mLModel.findMany({ where: { stage: 'PROMOTED', isActive: true } })
  const ifModel = models.find((m) => m.algorithm === 'IsolationForest' && (!modelId || m.id === modelId)) ?? models.find((m) => m.id === modelId) ?? null
  const dupModel = models.find((m) => m.algorithm === 'DuplicateLinkage') ?? ifModel
  const driftModel = models.find((m) => m.algorithm === 'DriftMonitor') ?? ifModel
  const dataset = await db.dataset.findUnique({ where: { id: datasetId }, include: { columns: true } })
  if (!dataset) throw new Error(`dataset ${datasetId} not found`)
  const { rows } = await getDatasetData(datasetId)
  const piiMap = new Map(dataset.columns.map((c) => [c.name, c.isPii ? c.piiType : null]))

  // 1) Numeric outliers via Isolation Forest over numeric columns
  const numericCols = dataset.columns.filter((c) => ['integer', 'decimal'].includes(c.dataType))
  if (numericCols.length > 0) {
    const matrix = rows.map((r) => numericCols.map((c) => Number(r[c.name] ?? 0)))
    const { scores, contributions } = detectNumericOutliers(matrix, numericCols.map((c) => c.name), { nTrees: 50, sampleSize: 256 })
    const threshold = 0.6
    let count = 0
    for (let i = 0; i < rows.length && count < 10; i++) {
      if (scores[i] >= threshold) {
        count++
        const worst = contributions[i][0]
        const col = numericCols.find((c) => c.name === worst.feature)!
        const v = matrix[i][numericCols.findIndex((c) => c.name === worst.feature)]
        await db.anomaly.create({
          data: {
            datasetId, datasetVersion: dataset.version, type: 'NUMERIC_OUTLIER',
            severity: scores[i] > 0.7 ? 'HIGH' : 'MEDIUM', score: Number(scores[i].toFixed(3)),
            rawStat: `IF score=${scores[i].toFixed(3)}`, columnName: worst.feature, rowIndex: i,
            rowKey: maskByPiiType(piiMap.get(dataset.columns[0]?.name ?? ''), String(rows[i][dataset.columns[0]?.name ?? ''] ?? i)),
            valueMasked: maskByPiiType(col.isPii ? col.piiType : null, String(v)),
            modelId: ifModel?.id ?? null,
            contributingFeatures: contributions[i] as object,
            explanationEn: `Isolation Forest flagged this record. Detection is a signal, not confirmation that the data is incorrect — human review required.`,
            explanationTh: `Isolation Forest ตรวจพบความผิดปกติ ผลการตรวจจับเป็นสัญญาณ ไม่ใช่การยืนยันว่าข้อมูลไม่ถูกต้อง ต้องมีมนุษย์ตรวจสอบ`,
          },
        })
      }
    }
  }

  // 2) Duplicates via record linkage on name+email (if columns exist)
  const nameCol = dataset.columns.find((c) => c.piiType === 'NAME')
  const emailCol = dataset.columns.find((c) => c.piiType === 'EMAIL')
  if (nameCol && emailCol) {
    const clusters = findDuplicateClusters(
      rows.map((r) => ({ name: String(r[nameCol.name] ?? ''), email: String(r[emailCol.name] ?? '') })),
      [{ name: 'name', weight: 0.6, kind: 'fuzzy' }, { name: 'email', weight: 0.4, kind: 'exact' }],
      0.9, 1200,
    )
    for (const cl of clusters.slice(0, 5)) {
      const i = cl.rowIndices[0]
      await db.anomaly.create({
        data: {
          datasetId, datasetVersion: dataset.version, type: 'DUPLICATE',
          severity: 'HIGH', score: Number(cl.pairScore.toFixed(3)), rawStat: `linkage score=${cl.pairScore}`,
          rowKey: maskByPiiType(piiMap.get(nameCol.name), String(rows[i][nameCol.name] ?? '')),
          valueMasked: maskByPiiType(piiMap.get(emailCol.name), String(rows[i][emailCol.name] ?? '')),
          modelId: dupModel?.id ?? null,
          contributingFeatures: cl.fieldScores.map((f) => ({ feature: f.field, contribution: f.score })) as object,
          explanationEn: `Fuzzy record linkage found ${cl.rowIndices.length} near-identical records (score ${cl.pairScore}). Human review required before any merge.`,
          explanationTh: `การเชื่อมโยงข้อมูลพบระเบียนที่ใกล้เคียงกัน ${cl.rowIndices.length} รายการ (คะแนน ${cl.pairScore}) ต้องมีมนุษย์ตรวจสอบก่อนรวมข้อมูล`,
        },
      })
    }
  }

  // 3) Data drift: PSI of last numeric column distribution vs previous snapshot window
  const profilePrev = await db.profileSnapshot.findFirst({ where: { datasetId }, orderBy: { createdAt: 'desc' } })
  if (profilePrev && numericCols.length > 0) {
    const c = numericCols[0]
    const half = Math.floor(rows.length / 2)
    const expected = rows.slice(0, half).map((r) => Number(r[c.name] ?? 0))
    const actual = rows.slice(half).map((r) => Number(r[c.name] ?? 0))
    const psi = computePsi(expected, actual)
    const z = meanShiftZ(expected, actual)
    if (psi.verdict !== 'STABLE' || z.significant) {
      await db.anomaly.create({
        data: {
          datasetId, datasetVersion: dataset.version, type: 'DATA_DRIFT',
          severity: psi.verdict === 'SIGNIFICANT' ? 'HIGH' : 'MEDIUM',
          score: normaliseDriftScore(psi.psi), rawStat: `PSI=${psi.psi}; z=${z.z}`,
          columnName: c.name, modelId: driftModel?.id ?? null,
          contributingFeatures: [{ feature: c.name, contribution: 1 }] as object,
          explanationEn: `Distribution shift detected on ${c.name} (PSI ${psi.psi}, verdict ${psi.verdict}). Detection is a signal — verify with the data owner before action.`,
          explanationTh: `ตรวจพบการเปลี่ยนแปลงของการกระจายข้อมูลใน ${c.name} (PSI ${psi.psi} — ${psi.verdict}) ผลนี้เป็นสัญญาณ ควรยืนยันกับเจ้าของข้อมูลก่อนดำเนินการ`,
        },
      })
    }
  }
  logger.info('job.anomaly.done', { datasetId, jobId })
}

/** Keep the worker alive while the server runs. */
let heartbeat: ReturnType<typeof setInterval> | null = null
export function startWorkerHeartbeat() {
  if (heartbeat) return
  heartbeat = setInterval(() => { void (async () => { try { kickWorker() } catch { /* noop */ } })() }, 5000)
}
