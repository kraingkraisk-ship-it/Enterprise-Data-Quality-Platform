// POST /api/rules/[id]/versions/[versionId]/submit — DRAFT → PENDING_APPROVAL.
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible } from '@/lib/api-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const g = await guard(req, { permission: 'SUBMIT_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id, versionId } = await params
  const rule = await db.rule.findUnique({ where: { id }, include: { dataset: true } })
  if (!rule) return notFoundRes()
  if (!(await datasetVisible(user, rule.dataset))) return notFoundRes()
  const version = await db.ruleVersion.findUnique({ where: { id: versionId } })
  if (!version || version.ruleId !== rule.id) return notFoundRes()
  if (version.status !== 'DRAFT') {
    return fail(409, `Only DRAFT versions can be submitted (current status: ${version.status})`)
  }
  const updated = await db.ruleVersion.update({
    where: { id: version.id },
    data: { status: 'PENDING_APPROVAL', submittedBy: user.name, submittedAt: new Date() },
  })
  await db.notification.create({
    data: {
      userId: rule.dataset.ownerId,
      titleEn: `Rule ${rule.code} awaiting your approval`,
      titleTh: `กฎ ${rule.code} รอการอนุมัติจากคุณ`,
      bodyEn: `${user.name} submitted version ${version.version} of "${rule.name}" on ${rule.dataset.name} for approval.`,
      bodyTh: `${user.name} ส่งเวอร์ชัน ${version.version} ของ "${rule.name}" บน ${rule.dataset.name} เพื่อขออนุมัติ`,
      severity: 'MEDIUM',
      link: `rules/${rule.id}`,
    },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'RULE_SUBMIT',
    resourceType: 'RuleVersion', resourceId: version.id, datasetId: rule.datasetId,
    detail: { code: rule.code, version: version.version, status: updated.status },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
