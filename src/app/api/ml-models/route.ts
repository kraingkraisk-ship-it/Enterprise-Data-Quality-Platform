// /api/ml-models — GET registry, POST register new model (stage REGISTERED).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp, serializeModel } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_ML' })
  if (guardBlocked(g)) return g
  const models = await db.mLModel.findMany({ orderBy: { createdAt: 'desc' } })
  return json({ models: models.map(serializeModel) })
}

const registerSchema = z.object({
  name: z.string().min(2, 'name must be at least 2 characters').max(120),
  algorithm: z.enum(['IsolationForest', 'LocalOutlierFactor', 'DuplicateLinkage', 'DriftMonitor']),
  version: z.string().min(1, 'version is required').max(40),
  scopeDatasetId: z.string().optional().nullable(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  featureImportance: z.array(z.object({ feature: z.string(), weight: z.number() })).optional(),
  trainingRows: z.number().int().nonnegative().optional(),
})

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'MANAGE_ML' })
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = registerSchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const body = parsed.data
  if (body.scopeDatasetId) {
    const ds = await db.dataset.findUnique({ where: { id: body.scopeDatasetId }, select: { id: true } })
    if (!ds) return fail(400, 'scopeDatasetId does not reference an existing dataset')
  }
  const model = await db.mLModel.create({
    data: {
      name: body.name, algorithm: body.algorithm, version: body.version,
      stage: 'REGISTERED', trainedAt: new Date(),
      metrics: (body.metrics ?? {}) as object,
      params: (body.params ?? {}) as object,
      trainingRows: body.trainingRows ?? 0,
      featureImportance: (body.featureImportance ?? []) as object,
      scopeDatasetId: body.scopeDatasetId ?? null,
      createdBy: user.name,
    },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'MODEL_REGISTER',
    resourceType: 'MLModel', resourceId: model.id,
    detail: { name: model.name, algorithm: model.algorithm, version: model.version, scopeDatasetId: model.scopeDatasetId },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ model: serializeModel(model) }, 201)
}
