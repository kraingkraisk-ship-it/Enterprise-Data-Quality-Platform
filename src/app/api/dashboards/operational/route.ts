// GET /api/dashboards/operational — action queue for stewards & engineers.
import { db } from '@/lib/db'
import {
  guard, guardBlocked, json, visibleDatasetIds, latestRunsByDataset,
  serializeJob,
} from '@/lib/api-helpers'
import type { OperationalDashboardDTO } from '@/lib/types'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_DASHBOARD' })
  if (guardBlocked(g)) return g
  const { user } = g

  const ids = await visibleDatasetIds(user)
  const datasets = ids.length
    ? await db.dataset.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })
    : []
  const nameById = new Map(datasets.map((d) => [d.id, d.name]))
  const runsByDataset = await latestRunsByDataset(ids)

  // datasets needing action: latest run has failures or score below 85
  const needingAction = datasets
    .map((ds) => {
      const latest = runsByDataset.get(ds.id)?.latest
      return {
        id: ds.id, name: ds.name,
        score: latest?.status === 'SUCCEEDED' ? latest.qualityScore : (latest?.qualityScore ?? 0),
        failedRules: latest?.rulesFailed ?? 0,
        lastRunAt: latest?.startedAt.toISOString() ?? null,
      }
    })
    .filter((d) => d.failedRules > 0 || d.score < 85)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)

  // refresh-SLA breaches (timeliness)
  const now = Date.now()
  const lateDatasets = datasets
    .filter((ds) => ds.status === 'ACTIVE' && ds.lastRefreshAt)
    .map((ds) => {
      const due = (ds.lastRefreshAt as Date).getTime() + ds.slaHours * 3600_000
      return { id: ds.id, name: ds.name, slaHours: ds.slaHours, hoursLate: Number(((now - due) / 3600_000).toFixed(1)) }
    })
    .filter((d) => d.hoursLate > 0)
    .sort((a, b) => b.hoursLate - a.hoursLate)
    .slice(0, 10)

  // open schema drifts
  const drifts = ids.length
    ? await db.anomaly.findMany({
        where: { datasetId: { in: ids }, type: 'SCHEMA_DRIFT', status: 'OPEN' },
        include: { dataset: { select: { name: true } } },
        orderBy: { detectedAt: 'desc' },
        take: 20,
      })
    : []
  const schemaDrifts: OperationalDashboardDTO['schemaDrifts'] = drifts.map((a) => ({
    id: a.id,
    dataset: a.dataset.name,
    column: a.columnName ?? '—',
    detailEn: a.explanationEn ?? 'Schema drift detected',
    detailTh: a.explanationTh ?? 'ตรวจพบการเปลี่ยนแปลงของสคีมา',
    detectedAt: a.detectedAt.toISOString(),
    anomalyId: a.id,
  }))

  // jobs needing attention: dead, or queued longer than 5 minutes
  const fiveMinAgo = new Date(now - 5 * 60_000)
  const [deadJobs, staleQueued] = await Promise.all([
    db.job.findMany({ where: { status: 'DEAD' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    db.job.findMany({ where: { status: 'QUEUED', nextRunAt: { lt: fiveMinAgo } }, orderBy: { nextRunAt: 'asc' }, take: 10 }),
  ])
  const seen = new Set<string>()
  const jobsAttention = [...deadJobs, ...staleQueued]
    .filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)))
    .slice(0, 15)
    .map(serializeJob)

  // top failed rules from the latest run of each dataset
  const latestIds = datasets
    .map((ds) => runsByDataset.get(ds.id)?.latest?.id)
    .filter((v): v is string => !!v)
  const failedResults = latestIds.length
    ? await db.validationRuleResult.findMany({
        where: { runId: { in: latestIds }, status: 'FAILED' },
        include: { rule: true, run: { select: { datasetId: true } } },
        orderBy: { passRate: 'asc' },
        take: 10,
      })
    : []
  const failedRules = failedResults.map((r) => ({
    ruleCode: r.rule.code, ruleName: r.rule.name,
    dataset: nameById.get(r.run.datasetId) ?? r.run.datasetId,
    passRate: r.passRate, failedRows: r.failedRows, runId: r.runId,
  }))

  // KPIs
  const since24h = new Date(now - 24 * 3600_000)
  const [activeRules, runs24hRows, queueDepth, dlqCount] = await Promise.all([
    ids.length ? db.rule.count({ where: { datasetId: { in: ids }, isActive: true } }) : Promise.resolve(0),
    ids.length
      ? db.validationRun.findMany({
          where: { datasetId: { in: ids }, startedAt: { gte: since24h } },
          select: { qualityScore: true, durationMs: true },
        })
      : Promise.resolve([] as { qualityScore: number; durationMs: number | null }[]),
    db.job.count({ where: { status: 'QUEUED' } }),
    db.job.count({ where: { status: 'DEAD' } }),
  ])
  const passRate24h = runs24hRows.length > 0
    ? Number((runs24hRows.reduce((a, r) => a + r.qualityScore, 0) / runs24hRows.length).toFixed(1))
    : 0
  const durations = runs24hRows.filter((r) => r.durationMs != null) as { durationMs: number }[]
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, r) => a + r.durationMs, 0) / durations.length)
    : 0

  const payload: OperationalDashboardDTO = {
    datasetsNeedingAction: needingAction,
    lateDatasets,
    schemaDrifts,
    jobsAttention,
    failedRules,
    kpis: {
      activeRules,
      runs24h: runs24hRows.length,
      passRate24h,
      avgDurationMs,
      queueDepth,
      dlqCount,
    },
  }
  return json(payload)
}
