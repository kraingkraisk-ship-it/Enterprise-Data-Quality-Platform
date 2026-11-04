// GET /api/dashboards/executive — weighted portfolio score, trend, risk sets.
import { db } from '@/lib/db'
import { DIMENSIONS } from '@/lib/types'
import {
  guard, guardBlocked, json, visibleDatasetIds, latestRunsByDataset,
  refreshSlaBreaches, issueSlaBreached,
} from '@/lib/api-helpers'
import type { ExecutiveDashboardDTO, Dimension, Severity } from '@/lib/types'

const WEIGHT: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 1 }

function dayKey(d: Date): string {
  return d.toISOString().slice(5, 10)
}

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_DASHBOARD' })
  if (guardBlocked(g)) return g
  const { user } = g

  const ids = await visibleDatasetIds(user)
  const datasets = ids.length
    ? await db.dataset.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })
    : []
  const idSet = new Set(ids)
  const runsByDataset = await latestRunsByDataset(ids)

  const latestScores: { ds: typeof datasets[number]; score: number | null; coverage: number | null }[] = datasets.map((ds) => {
    const info = runsByDataset.get(ds.id)
    return {
      ds,
      score: info?.latestSucceeded?.qualityScore ?? null,
      coverage: info?.latestSucceeded?.coverage ?? null,
    }
  })

  // overall score: criticality-weighted mean of latest run scores
  let weightedSum = 0
  let weightSum = 0
  let coverageSum = 0
  let coverageN = 0
  for (const { ds, score, coverage } of latestScores) {
    const w = WEIGHT[ds.criticality] ?? 1
    if (score != null) {
      weightedSum += score * w
      weightSum += w
    }
    if (coverage != null) {
      coverageSum += coverage
      coverageN++
    }
  }
  const overallScore = weightSum > 0 ? Number((weightedSum / weightSum).toFixed(1)) : 0
  const coverage = coverageN > 0 ? Number((coverageSum / coverageN).toFixed(3)) : 0

  // 30-day daily mean of SUCCEEDED run scores
  const since = new Date(Date.now() - 30 * 24 * 3600_000)
  const trendRuns = ids.length
    ? await db.validationRun.findMany({
        where: { datasetId: { in: ids }, status: 'SUCCEEDED', startedAt: { gte: since } },
        select: { startedAt: true, qualityScore: true },
        orderBy: { startedAt: 'asc' },
      })
    : []
  const byDay = new Map<string, { sum: number; n: number }>()
  for (const r of trendRuns) {
    const k = dayKey(r.startedAt)
    const t = byDay.get(k) ?? { sum: 0, n: 0 }
    t.sum += r.qualityScore
    t.n++
    byDay.set(k, t)
  }
  const scoreTrend: { date: string; score: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 24 * 3600_000))
    const t = byDay.get(k)
    if (t) scoreTrend.push({ date: k, score: Number((t.sum / t.n).toFixed(1)) })
  }

  // issues + SLA recompute (persisted so lists stay consistent)
  const breachedIssues = await refreshSlaBreaches(ids)
  const openIssuesAgg = await db.issue.groupBy({
    by: ['datasetId', 'severity'],
    where: { datasetId: { in: ids }, status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED'] } },
    _count: { _all: true },
  })
  const openIssues = openIssuesAgg.reduce((a, r) => a + r._count._all, 0)
  const criticalIssuesByDataset = new Map<string, number>()
  for (const r of openIssuesAgg) {
    if (r.severity === 'CRITICAL') criticalIssuesByDataset.set(r.datasetId, r._count._all)
  }

  // datasets at risk: latest score < 87 or open critical issue
  const atRisk = latestScores
    .filter(({ ds, score }) => (score != null && score < 87) || criticalIssuesByDataset.has(ds.id))
    .map(({ ds, score }) => {
      const info = runsByDataset.get(ds.id)
      const prev = info?.previousWeek?.qualityScore ?? null
      const latest = info?.latestSucceeded?.qualityScore ?? null
      return {
        id: ds.id, name: ds.name, domain: ds.domain,
        score: latest ?? score ?? 0,
        trend7d: latest != null && prev != null ? Number((latest - prev).toFixed(1)) : 0,
      }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)

  // business-unit rollup
  const unitMap = new Map<string, { scoreSum: number; scoreN: number; openIssues: number; criticalIssues: number }>()
  for (const { ds, score } of latestScores) {
    const unit = ds.businessUnit || 'Unassigned'
    const t = unitMap.get(unit) ?? { scoreSum: 0, scoreN: 0, openIssues: 0, criticalIssues: 0 }
    if (score != null) {
      t.scoreSum += score
      t.scoreN++
    }
    unitMap.set(unit, t)
  }
  for (const r of openIssuesAgg) {
    const ds = datasets.find((d) => d.id === r.datasetId)
    if (!ds || !idSet.has(r.datasetId)) continue
    const unit = ds.businessUnit || 'Unassigned'
    const t = unitMap.get(unit) ?? { scoreSum: 0, scoreN: 0, openIssues: 0, criticalIssues: 0 }
    t.openIssues += r._count._all
    if (r.severity === 'CRITICAL') t.criticalIssues += r._count._all
    unitMap.set(unit, t)
  }
  const businessUnitRisk = [...unitMap.entries()]
    .map(([unit, t]) => ({
      unit,
      score: t.scoreN > 0 ? Number((t.scoreSum / t.scoreN).toFixed(1)) : 0,
      openIssues: t.openIssues,
      criticalIssues: t.criticalIssues,
    }))
    .sort((a, b) => a.score - b.score)

  const slaBreaches = breachedIssues
    .filter((i) => i.slaDueAt && idSet.has(i.datasetId))
    .map((i) => ({
      key: i.key, title: i.title,
      dataset: datasets.find((d) => d.id === i.datasetId)?.name ?? i.datasetId,
      severity: i.severity as Severity,
      dueAt: (i.slaDueAt as Date).toISOString(),
      hoursOverdue: Math.max(0, Number(((Date.now() - (i.slaDueAt as Date).getTime()) / 3600_000).toFixed(1))),
    }))
    .sort((a, b) => b.hoursOverdue - a.hoursOverdue)
    .slice(0, 20)

  // dimension means across latest runs
  const dimMap = new Map<Dimension, { sum: number; n: number }>()
  for (const { ds } of latestScores) {
    const latest = runsByDataset.get(ds.id)?.latestSucceeded
    const dims = (latest?.dimensionResults ?? {}) as Record<string, { rate: number }>
    for (const d of DIMENSIONS) {
      const r = dims[d]
      if (!r || typeof r.rate !== 'number') continue
      const t = dimMap.get(d) ?? { sum: 0, n: 0 }
      t.sum += r.rate
      t.n++
      dimMap.set(d, t)
    }
  }
  const dimensionScores: ExecutiveDashboardDTO['dimensionScores'] = DIMENSIONS
    .filter((d) => dimMap.has(d))
    .map((d) => ({ dimension: d, rate: Number((dimMap.get(d)!.sum / dimMap.get(d)!.n).toFixed(3)) }))

  const first = scoreTrend[0]?.score ?? overallScore
  const last = scoreTrend[scoreTrend.length - 1]?.score ?? overallScore
  const payload: ExecutiveDashboardDTO = {
    overallScore,
    scoreTrend,
    coverage,
    openIssues,
    slaBreached: breachedIssues.filter((i) => issueSlaBreached(i)).length,
    criticalDatasetsAtRisk: atRisk,
    businessUnitRisk,
    slaBreaches,
    dimensionScores,
    improving: last > first,
    delta30d: Number((last - first).toFixed(1)),
  }
  return json(payload)
}
