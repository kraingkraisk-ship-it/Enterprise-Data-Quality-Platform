// POST /api/ml-models/[id]/stage — lifecycle state machine with promotion guard.
// REGISTERED→VALIDATED→SHADOW→PROMOTED (first-of-algorithm may go VALIDATED→PROMOTED
// when no champion exists); RETIRED reachable from any stage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp } from '@/lib/api-helpers'

const bodySchema = z.object({
  stage: z.enum(['REGISTERED', 'VALIDATED', 'SHADOW', 'PROMOTED', 'RETIRED']),
  reason: z.string().max(500).optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'MANAGE_ML' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const model = await db.mLModel.findUnique({ where: { id } })
  if (!model) return fail(404, 'Model not found')

  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const to = parsed.data.stage
  const from = model.stage
  if (from === to) return fail(409, `Model is already in stage ${to}`)

  if (to === 'PROMOTED') {
    if (from !== 'SHADOW') {
      if (from === 'VALIDATED') {
        const promotedCount = await db.mLModel.count({ where: { algorithm: model.algorithm, stage: 'PROMOTED' } })
        if (promotedCount > 0) {
          return fail(409, 'Promotion requires shadow evaluation against the current champion first')
        }
        // first-of-algorithm: no champion exists — direct promotion permitted, noted in audit
      } else {
        return fail(409, `Cannot promote from ${from}`)
      }
    }
  } else if (to === 'SHADOW') {
    if (from !== 'VALIDATED') return fail(409, `Cannot move to SHADOW from ${from}`)
    if (!model.shadowOfId) return fail(409, 'A shadow candidate must reference its champion via shadowOfId')
    const champion = await db.mLModel.findUnique({ where: { id: model.shadowOfId } })
    if (!champion || champion.stage !== 'PROMOTED' || champion.algorithm !== model.algorithm) {
      return fail(409, 'shadowOfId must reference a PROMOTED model of the same algorithm')
    }
  } else if (to === 'VALIDATED') {
    if (from !== 'REGISTERED') return fail(409, `Cannot validate from ${from}`)
  } else if (to === 'REGISTERED') {
    return fail(409, 'REGISTERED is the initial stage and cannot be re-entered')
  }

  const data: { stage: string; isActive?: boolean } = { stage: to }
  if (to === 'PROMOTED') {
    // single active model per algorithm+scope: retire previous champion's active flag
    await db.mLModel.updateMany({
      where: {
        algorithm: model.algorithm,
        isActive: true,
        id: { not: model.id },
        scopeDatasetId: model.scopeDatasetId,
      },
      data: { isActive: false },
    })
    data.isActive = true
  } else if (to === 'RETIRED') {
    data.isActive = false
  }
  await db.mLModel.update({ where: { id: model.id }, data })

  await recordAudit({
    actor: user.name, actorRole: user.role,
    action: to === 'PROMOTED' ? 'MODEL_PROMOTE' : 'MODEL_STAGE_CHANGE',
    resourceType: 'MLModel', resourceId: model.id, datasetId: model.scopeDatasetId,
    detail: {
      from, to,
      comparedWith: to === 'PROMOTED' || to === 'SHADOW' ? model.shadowOfId : undefined,
      algorithm: model.algorithm,
      note: parsed.data.reason ?? (to === 'PROMOTED' && from === 'VALIDATED' ? 'first-of-algorithm promotion (no champion existed)' : undefined),
    },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
