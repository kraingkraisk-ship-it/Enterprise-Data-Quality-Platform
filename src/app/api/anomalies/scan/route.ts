// POST /api/anomalies/scan — enqueue an ML anomaly scan (hourly idempotency key).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { enqueue } from '@/lib/jobs/runner'
import { hasPermission } from '@/lib/types'
import {
  guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible,
} from '@/lib/api-helpers'

const bodySchema = z.object({ datasetId: z.string().min(1) })

export async function POST(req: Request) {
  const g = await guard(req, {})
  if (guardBlocked(g)) return g
  const { user } = g
  if (!(hasPermission(user.role, 'REVIEW_ANOMALY') || user.role === 'DATA_SCIENTIST')) {
    return fail(403, 'Missing permission: REVIEW_ANOMALY')
  }
  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const dataset = await db.dataset.findUnique({ where: { id: parsed.data.datasetId } })
  if (!dataset) return notFoundRes()
  if (!(await datasetVisible(user, dataset))) return notFoundRes()

  // champion model: active promoted IsolationForest scoped to this dataset, else global
  const model = await db.mLModel.findFirst({
    where: {
      algorithm: 'IsolationForest', stage: 'PROMOTED', isActive: true,
      OR: [{ scopeDatasetId: dataset.id }, { scopeDatasetId: null }],
    },
    orderBy: [{ scopeDatasetId: 'desc' }, { createdAt: 'desc' }],
  })
  const { jobId } = await enqueue('ANOMALY_SCAN', {
    idempotencyKey: `scan-${dataset.id}-${Math.floor(Date.now() / 3600000)}`,
    payload: { datasetId: dataset.id, modelId: model?.id ?? null },
    timeoutMs: 240_000,
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'VALIDATION_RUN',
    resourceType: 'AnomalyScan', resourceId: dataset.id, datasetId: dataset.id,
    detail: { jobId, modelId: model?.id ?? null, algorithm: 'IsolationForest' },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ jobId }, 202)
}
