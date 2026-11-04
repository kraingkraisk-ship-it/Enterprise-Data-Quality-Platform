// POST /api/rules/[id]/deactivate — stop evaluating the rule.
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, json, clientIp, notFoundRes, datasetVisible } from '@/lib/api-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'ACTIVATE_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const rule = await db.rule.findUnique({ where: { id }, include: { dataset: true } })
  if (!rule) return notFoundRes()
  if (!(await datasetVisible(user, rule.dataset))) return notFoundRes()
  await db.rule.update({ where: { id: rule.id }, data: { isActive: false } })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'RULE_DEACTIVATE',
    resourceType: 'Rule', resourceId: rule.id, datasetId: rule.datasetId,
    detail: { code: rule.code },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
