// /api/rules — GET filtered list (visibility-scoped), POST create new rule (v1 DRAFT).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, fail, json, clientIp, datasetVisible, serializeRule,
  naturalSummary, nextCode, notFoundRes,
} from '@/lib/api-helpers'
import { DIMENSIONS } from '@/lib/types'
import type { Rule, RuleVersion } from '@prisma/client'
import type { RuleDefinition } from '@/lib/types'

const definitionSchema = z.object({
  column: z.string().max(120).optional(),
  operator: z.string().max(40).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  condition: z.string().max(300).optional(),
  severity: z.string().max(20).optional(),
})

const createSchema = z.object({
  datasetId: z.string().min(1),
  name: z.string().min(2, 'name must be at least 2 characters').max(160),
  nameTh: z.string().max(160).optional().nullable(),
  dimension: z.enum(DIMENSIONS as [string, ...string[]]),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  templateKey: z.enum(['NOT_NULL', 'REGEX', 'RANGE', 'IN_SET', 'UNIQUE', 'FRESHNESS', 'ROW_COUNT', 'SCHEMA_MATCH', 'CROSS_FIELD', 'REFERENTIAL']),
  definition: definitionSchema,
  requiresApproval: z.boolean(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  tags: z.string().max(200).optional().nullable(),
})

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const url = new URL(req.url)
  const datasetId = url.searchParams.get('datasetId') ?? ''
  const dimension = url.searchParams.get('dimension') ?? ''
  const status = url.searchParams.get('status') ?? ''
  const severity = url.searchParams.get('severity') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  const rules = await db.rule.findMany({
    where: {
      ...(datasetId ? { datasetId } : {}),
      ...(dimension ? { dimension } : {}),
      ...(severity ? { severity } : {}),
    },
    include: {
      dataset: { select: { name: true } },
      versions: { orderBy: { version: 'desc' } },
    },
    orderBy: { code: 'asc' },
  })

  const visible: (Rule & { dataset: { name: string }; versions: RuleVersion[] })[] = []
  for (const r of rules) {
    const ds = await db.dataset.findUnique({ where: { id: r.datasetId }, select: { id: true, ownerId: true, stewardId: true } })
    if (!ds || !(await datasetVisible(user, ds))) continue
    if (q && !`${r.code} ${r.name} ${r.nameTh ?? ''}`.toLowerCase().includes(q)) continue
    if (status) {
      const latestStatus = r.versions[0]?.status ?? 'DRAFT'
      if (status === 'ACTIVE') {
        if (!r.isActive) continue
      } else if (latestStatus !== status) continue
    }
    visible.push(r)
  }
  return json({ rules: visible.map((r) => serializeRule(r)) })
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'CREATE_RULE' })
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = createSchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const body = parsed.data
  const dataset = await db.dataset.findUnique({ where: { id: body.datasetId } })
  if (!dataset) return notFoundRes()
  if (!(await datasetVisible(user, dataset))) return notFoundRes()
  // Guard already enforces CREATE_RULE; steward-of-dataset ownership recorded for accountability.

  const code = await nextCode('R', 'rule')
  const summaries = naturalSummary(dataset.name, body.definition as RuleDefinition, body.templateKey, body.severity)
  const rule = await db.rule.create({
    data: {
      code, datasetId: dataset.id, name: body.name, nameTh: body.nameTh ?? null,
      dimension: body.dimension, severity: body.severity,
      requiresApproval: body.requiresApproval, isActive: false, currentVersion: 1,
      owner: user.name,
      templateKey: body.templateKey, tags: body.tags ?? null,
    },
  })
  const version = await db.ruleVersion.create({
    data: {
      ruleId: rule.id, version: 1,
      definition: body.definition as unknown as object,
      naturalSummaryEn: summaries.en, naturalSummaryTh: summaries.th,
      status: 'DRAFT', createdBy: user.name,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
    },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'RULE_CREATE',
    resourceType: 'Rule', resourceId: rule.id, datasetId: dataset.id,
    detail: { code: rule.code, version: 1, templateKey: body.templateKey, severity: body.severity },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ rule: serializeRule({ ...rule, dataset: { name: dataset.name }, versions: [version] }, version), versionId: version.id }, 201)
}
