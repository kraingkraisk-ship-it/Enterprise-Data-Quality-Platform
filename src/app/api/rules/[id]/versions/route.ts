// POST /api/rules/[id]/versions — create a new DRAFT version (currentVersion+1).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible, naturalSummary,
} from '@/lib/api-helpers'
import type { RuleDefinition } from '@/lib/types'

const bodySchema = z.object({
  definition: z.object({
    column: z.string().max(120).optional(),
    operator: z.string().max(40).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().max(300).optional(),
    severity: z.string().max(20).optional(),
  }).optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
}).loose()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'CREATE_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const rule = await db.rule.findUnique({
    where: { id },
    include: { dataset: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
  })
  if (!rule) return notFoundRes()
  if (!(await datasetVisible(user, rule.dataset))) return notFoundRes()

  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')

  const definition = (parsed.data.definition ?? (rule.versions[0]?.definition as unknown as RuleDefinition | undefined) ?? {}) as RuleDefinition
  const summaries = naturalSummary(rule.dataset.name, definition, rule.templateKey, rule.severity)
  const nextVersion = rule.currentVersion + 1
  const version = await db.ruleVersion.create({
    data: {
      ruleId: rule.id, version: nextVersion,
      definition: definition as unknown as object,
      naturalSummaryEn: summaries.en, naturalSummaryTh: summaries.th,
      status: 'DRAFT', createdBy: user.name,
      effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null,
    },
  })
  await db.rule.update({ where: { id: rule.id }, data: { currentVersion: nextVersion } })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'RULE_CREATE',
    resourceType: 'Rule', resourceId: rule.id, datasetId: rule.datasetId,
    detail: { code: rule.code, version: nextVersion, note: 'new version' },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ versionId: version.id }, 201)
}
