// POST /api/rules/[id]/versions/[versionId]/approve — APPROVE_RULE only
// (the dataset's Data Owner or a SYSTEM_ADMIN). PENDING_APPROVAL → APPROVED/REJECTED.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible } from '@/lib/api-helpers'

const bodySchema = z.object({
  approve: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
  effectiveFrom: z.string().datetime().optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const g = await guard(req, { permission: 'APPROVE_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id, versionId } = await params
  const rule = await db.rule.findUnique({ where: { id }, include: { dataset: true } })
  if (!rule) return notFoundRes()
  if (!(await datasetVisible(user, rule.dataset))) return notFoundRes()
  // APPROVE_RULE is granted to Data Owners (all) and SYSTEM_ADMIN — scope owners to their own dataset.
  if (user.role === 'DATA_OWNER' && rule.dataset.ownerId !== user.id) {
    return notFoundRes()
  }
  const version = await db.ruleVersion.findUnique({ where: { id: versionId } })
  if (!version || version.ruleId !== rule.id) return notFoundRes()
  if (version.status !== 'PENDING_APPROVAL') {
    return fail(409, `Only PENDING_APPROVAL versions can be decided (current status: ${version.status})`)
  }

  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { approve, reason, effectiveFrom } = parsed.data

  if (approve) {
    await db.ruleVersion.update({
      where: { id: version.id },
      data: {
        status: 'APPROVED', approvedBy: user.name, approvedAt: new Date(),
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        rejectedReason: null,
      },
    })
    await db.notification.create({
      data: {
        userId: rule.dataset.stewardId,
        titleEn: `Rule ${rule.code} approved`,
        titleTh: `กฎ ${rule.code} ได้รับการอนุมัติ`,
        bodyEn: `${user.name} approved version ${version.version} of "${rule.name}". It can now be activated.`,
        bodyTh: `${user.name} อนุมัติเวอร์ชัน ${version.version} ของ "${rule.name}" แล้ว สามารถเปิดใช้งานได้`,
        severity: 'LOW',
        link: `rules/${rule.id}`,
      },
    })
    await recordAudit({
      actor: user.name, actorRole: user.role, action: 'RULE_APPROVE',
      resourceType: 'RuleVersion', resourceId: version.id, datasetId: rule.datasetId,
      detail: { code: rule.code, version: version.version, reason: reason ?? null },
      ip: clientIp(req), userAgent: req.headers.get('user-agent'),
    })
  } else {
    await db.ruleVersion.update({
      where: { id: version.id },
      data: { status: 'REJECTED', rejectedReason: reason ?? 'Rejected without a stated reason' },
    })
    await db.notification.create({
      data: {
        userId: rule.dataset.stewardId,
        titleEn: `Rule ${rule.code} rejected`,
        titleTh: `กฎ ${rule.code} ถูกปฏิเสธ`,
        bodyEn: `${user.name} rejected version ${version.version} of "${rule.name}"${reason ? `: ${reason}` : '.'}`,
        bodyTh: `${user.name} ปฏิเสธเวอร์ชัน ${version.version} ของ "${rule.name}"${reason ? `: ${reason}` : ''}`,
        severity: 'MEDIUM',
        link: `rules/${rule.id}`,
      },
    })
    await recordAudit({
      actor: user.name, actorRole: user.role, action: 'RULE_REJECT',
      resourceType: 'RuleVersion', resourceId: version.id, datasetId: rule.datasetId,
      detail: { code: rule.code, version: version.version, reason: reason ?? null },
      ip: clientIp(req), userAgent: req.headers.get('user-agent'),
    })
  }
  return json({ ok: true })
}
