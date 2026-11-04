// POST /api/admin/grants — dataset permission upsert (SYSTEM_ADMIN or the
// dataset's Data Owner). Audited as GRANT_CHANGE.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible } from '@/lib/api-helpers'

const bodySchema = z.object({
  userId: z.string().min(1),
  datasetId: z.string().min(1),
  level: z.enum(['VIEW', 'MANAGE']),
  reason: z.string().max(300).optional().nullable(),
})

export async function POST(req: Request) {
  const g = await guard(req, {})
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { userId, datasetId, level, reason } = parsed.data

  const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
  if (!dataset) return notFoundRes()
  const isAdmin = user.role === 'SYSTEM_ADMIN'
  const isOwner = user.role === 'DATA_OWNER' && dataset.ownerId === user.id
  if (!isAdmin && !isOwner) {
    return fail(403, 'Only SYSTEM_ADMIN or the dataset owner can manage grants')
  }
  const targetUser = await db.user.findUnique({ where: { id: userId } })
  if (!targetUser || !targetUser.active) return fail(400, 'Target user does not exist or is inactive')
  if (!(await datasetVisible(user, dataset))) return notFoundRes()

  await db.datasetPermission.upsert({
    where: { userId_datasetId: { userId, datasetId } },
    create: { userId, datasetId, level, grantedBy: user.name, reason: reason ?? null },
    update: { level, grantedBy: user.name, reason: reason ?? null },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'GRANT_CHANGE',
    resourceType: 'DatasetPermission', resourceId: `${userId}:${datasetId}`, datasetId,
    detail: { targetUser: targetUser.name, level, reason: reason ?? null },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
