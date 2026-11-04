// GET /api/dashboards/ml — registry, anomaly triage stats, shadow comparisons.
import { db } from '@/lib/db'
import { guard, guardBlocked, json, serializeModel } from '@/lib/api-helpers'
import type { MlDashboardDTO } from '@/lib/types'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_ML' })
  if (guardBlocked(g)) return g

  const [models, anomalyRows] = await Promise.all([
    db.mLModel.findMany({ orderBy: { createdAt: 'desc' } }),
    db.anomaly.findMany({
      where: { detectedAt: { gte: new Date(Date.now() - 14 * 24 * 3600_000) } },
      select: { type: true, status: true, reviewStatus: true, detectedAt: true },
    }),
  ])

  // per-type triage stats over all open findings
  const allAnomalies = await db.anomaly.findMany({ select: { type: true, status: true, reviewStatus: true } })
  const typeSet = [...new Set(allAnomalies.map((a) => a.type))]
  const anomalyStats = typeSet.map((type) => ({
    type,
    open: allAnomalies.filter((a) => a.type === type && a.status === 'OPEN').length,
    pendingReview: allAnomalies.filter((a) => a.type === type && a.reviewStatus === 'PENDING').length,
  })).sort((a, b) => (b.open + b.pendingReview) - (a.open + a.pendingReview))

  const byDay = new Map<string, number>()
  for (const a of anomalyRows) {
    const k = a.detectedAt.toISOString().slice(5, 10)
    byDay.set(k, (byDay.get(k) ?? 0) + 1)
  }
  const detectionTrend: MlDashboardDTO['detectionTrend'] = []
  for (let i = 13; i >= 0; i--) {
    const k = new Date(Date.now() - i * 24 * 3600_000).toISOString().slice(5, 10)
    detectionTrend.push({ date: k, count: byDay.get(k) ?? 0 })
  }

  // shadow comparisons: candidate metrics minus champion metrics
  const shadows = models.filter((m) => m.stage === 'SHADOW' && m.shadowOfId)
  const byId = new Map(models.map((m) => [m.id, m]))
  const shadowComparisons: MlDashboardDTO['shadowComparisons'] = []
  for (const c of shadows) {
    const champion = c.shadowOfId ? byId.get(c.shadowOfId) : null
    if (!champion) continue
    const cm = (c.metrics ?? {}) as Record<string, number>
    const hm = (champion.metrics ?? {}) as Record<string, number>
    const delta = (k: string) => Number(((cm[k] ?? 0) - (hm[k] ?? 0)).toFixed(4))
    shadowComparisons.push({
      candidate: `${c.name}#${c.version}`,
      champion: `${champion.name}#${champion.version}`,
      precisionDelta: delta('precision'),
      recallDelta: delta('recall'),
      f1Delta: delta('f1'),
    })
  }

  const payload: MlDashboardDTO = {
    models: models.map(serializeModel),
    anomalyStats,
    detectionTrend,
    shadowComparisons,
  }
  return json(payload)
}
