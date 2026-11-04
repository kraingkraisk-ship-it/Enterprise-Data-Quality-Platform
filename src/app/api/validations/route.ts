// /api/validations — GET history (visibility-scoped), POST enqueue a validation run.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { enqueue } from '@/lib/jobs/runner'
import {
  guard, guardBlocked, fail, json, clientIp, visibleDatasetIds, serializeRun,
  intParam, notFoundRes,
} from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_VALIDATION' })
  if (guardBlocked(g)) return g
  const { user } = g
  const url = new URL(req.url)
  const datasetId = url.searchParams.get('datasetId') ?? ''
  const status = url.searchParams.get('status') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = intParam(url.searchParams.get('limit'), 50, 200)

  const ids = await visibleDatasetIds(user)
  if (ids.length === 0) return json({ runs: [] })
  if (datasetId && !ids.includes(datasetId)) return json({ runs: [] })

  const datasets = await db.dataset.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const nameById = new Map(datasets.map((d) => [d.id, d.name]))
  const runs = await db.validationRun.findMany({
    where: {
      datasetId: { in: datasetId ? [datasetId] : ids },
      ...(status ? { status } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: limit * 2,
  })
  const filtered = runs.filter((r) => {
    if (!q) return true
    const name = (nameById.get(r.datasetId) ?? '').toLowerCase()
    return name.includes(q) || r.correlationId.toLowerCase().includes(q)
  }).slice(0, limit)
  return json({ runs: filtered.map((r) => serializeRun(r, nameById.get(r.datasetId))) })
}

const runSchema = z.object({
  datasetId: z.string().min(1),
  ruleIds: z.array(z.string()).optional(),
  trigger: z.enum(['MANUAL', 'SCHEDULED', 'API', 'ON_UPLOAD']).optional(),
})

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'RUN_VALIDATION' })
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = runSchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { datasetId, ruleIds, trigger } = parsed.data
  const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
  if (!dataset) return notFoundRes()
  const visible = await visibleDatasetIds(user)
  if (!visible.includes(datasetId)) return notFoundRes()

  // ensure there is something to evaluate
  const activeRules = await db.rule.findMany({
    where: { datasetId, isActive: true, ...(ruleIds?.length ? { id: { in: ruleIds } } : {}) },
    select: { id: true },
  })
  if (activeRules.length === 0) {
    return fail(409, 'No active rules to evaluate for this dataset')
  }

  const correlationId = `run-${datasetId}-${Date.now()}`
  const { jobId, deduplicated } = await enqueue('VALIDATION', {
    idempotencyKey: correlationId,
    payload: {
      datasetId, ruleIds: ruleIds ?? null, trigger: trigger ?? 'MANUAL',
      executedBy: user.name, correlationId,
    },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'VALIDATION_RUN',
    resourceType: 'ValidationRun', resourceId: correlationId, datasetId,
    detail: { jobId, deduplicated, correlationId, trigger: trigger ?? 'MANUAL', rules: activeRules.length },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
    correlationId,
  })
  return json({ runId: null, correlationId }, 202)
}
