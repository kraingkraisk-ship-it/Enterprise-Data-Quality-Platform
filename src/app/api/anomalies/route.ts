// GET /api/anomalies — ML findings (visibility-scoped, model joined).
import { db } from '@/lib/db'
import { guard, guardBlocked, json, visibleDatasetIds, serializeAnomaly, withModelInfo, intParam } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_ANOMALY' })
  if (guardBlocked(g)) return g
  const { user } = g
  const url = new URL(req.url)
  const datasetId = url.searchParams.get('datasetId') ?? ''
  const type = url.searchParams.get('type') ?? ''
  const reviewStatus = url.searchParams.get('reviewStatus') ?? ''
  const status = url.searchParams.get('status') ?? ''
  const limit = intParam(url.searchParams.get('limit'), 100, 300)

  const ids = await visibleDatasetIds(user)
  if (ids.length === 0) return json({ anomalies: [] })
  if (datasetId && !ids.includes(datasetId)) return json({ anomalies: [] })

  const anomalies = await db.anomaly.findMany({
    where: {
      datasetId: { in: datasetId ? [datasetId] : ids },
      ...(type ? { type } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(status ? { status } : {}),
    },
    include: { dataset: { select: { name: true } } },
    orderBy: { detectedAt: 'desc' },
    take: limit,
  })
  return json({ anomalies: (await withModelInfo(anomalies)).map((a) => serializeAnomaly(a)) })
}
