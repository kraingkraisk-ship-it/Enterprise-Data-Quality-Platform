// GET /api/rules/[id] — rule detail with all versions (visibility enforced).
import { db } from '@/lib/db'
import { guard, guardBlocked, json, notFoundRes, datasetVisible, serializeRule } from '@/lib/api-helpers'
import type { RuleDefinition } from '@/lib/types'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'VIEW_RULE' })
  if (guardBlocked(g)) return g
  const { id } = await params
  const rule = await db.rule.findUnique({
    where: { id },
    include: { dataset: true, versions: { orderBy: { version: 'desc' } } },
  })
  if (!rule) return notFoundRes()
  if (!(await datasetVisible(g.user, rule.dataset))) return notFoundRes()
  return json({
    rule: serializeRule(rule),
    versions: rule.versions.map((v) => ({
      id: v.id, version: v.version, status: v.status,
      naturalSummaryEn: v.naturalSummaryEn, naturalSummaryTh: v.naturalSummaryTh,
      createdBy: v.createdBy, submittedBy: v.submittedBy,
      approvedBy: v.approvedBy, approvedAt: v.approvedAt?.toISOString() ?? null,
      rejectedReason: v.rejectedReason,
      effectiveFrom: v.effectiveFrom?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
      definition: v.definition as unknown as RuleDefinition,
    })),
  })
}
