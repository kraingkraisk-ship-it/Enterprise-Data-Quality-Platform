// POST /api/admin/users/[userId]/role — role change (ADMIN_USERS, audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { ROLES } from '@/lib/types'
import { guard, guardBlocked, fail, json, clientIp } from '@/lib/api-helpers'

const bodySchema = z.object({ role: z.enum(ROLES as [string, ...string[]]) })

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const g = await guard(req, { permission: 'ADMIN_USERS' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { userId } = await params
  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) return fail(404, 'User not found')

  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { role } = parsed.data
  if (target.id === user.id && role !== 'SYSTEM_ADMIN') {
    return fail(409, 'Administrators cannot demote their own account')
  }
  await db.user.update({ where: { id: target.id }, data: { role } })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'USER_ROLE_CHANGE',
    resourceType: 'User', resourceId: target.id,
    detail: { from: target.role, to: role, email: target.email },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
