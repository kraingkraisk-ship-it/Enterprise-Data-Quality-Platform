// POST /api/rules/[id]/activate — ACTIVATE_RULE with approval-gate guard (409).
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible } from '@/lib/api-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'ACTIVATE_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const rule = await db.rule.findUnique({
    where: { id },
    include: { dataset: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
  })
  if (!rule) return notFoundRes()
  if (!(await datasetVisible(user, rule.dataset))) return notFoundRes()
  const latest = rule.versions[0]
  if (rule.requiresApproval && (!latest || latest.status !== 'APPROVED')) {
    return fail(409, 'Rule cannot be activated before the Data Owner approves this exact version.')
  }
  await db.rule.update({ where: { id: rule.id }, data: { isActive: true } })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'RULE_ACTIVATE',
    resourceType: 'Rule', resourceId: rule.id, datasetId: rule.datasetId,
    detail: { code: rule.code, version: latest?.version ?? rule.currentVersion },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
