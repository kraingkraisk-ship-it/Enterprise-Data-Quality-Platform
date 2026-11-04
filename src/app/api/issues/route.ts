// /api/issues — GET list (visibility-scoped, comments included), POST create with SLA.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, fail, json, clientIp, visibleDatasetIds, serializeIssue,
  nextCode, slaDueAt, intParam, notFoundRes, datasetVisible, loadPolicy,
} from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_ISSUE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const url = new URL(req.url)
  const datasetId = url.searchParams.get('datasetId') ?? ''
  const status = url.searchParams.get('status') ?? ''
  const severity = url.searchParams.get('severity') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = intParam(url.searchParams.get('limit'), 100, 300)

  const ids = await visibleDatasetIds(user)
  if (ids.length === 0) return json({ issues: [] })
  if (datasetId && !ids.includes(datasetId)) return json({ issues: [] })

  const datasets = await db.dataset.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const nameById = new Map(datasets.map((d) => [d.id, d.name]))
  const issues = await db.issue.findMany({
    where: {
      datasetId: { in: datasetId ? [datasetId] : ids },
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
    },
    include: { dataset: { select: { name: true } }, comments: { orderBy: { createdAt: 'asc' } } },
    orderBy: { openedAt: 'desc' },
    take: limit * 2,
  })
  const filtered = issues.filter((i) => {
    if (!q) return true
    const name = (nameById.get(i.datasetId) ?? '').toLowerCase()
    return `${i.key} ${i.title} ${i.titleTh ?? ''} ${name}`.toLowerCase().includes(q)
  }).slice(0, limit)
  return json({ issues: filtered.map((i) => serializeIssue(i)) })
}

const createSchema = z.object({
  datasetId: z.string().min(1),
  title: z.string().min(3, 'title must be at least 3 characters').max(200),
  description: z.string().min(3, 'description must be at least 3 characters').max(4000),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  assignee: z.string().max(120).optional().nullable(),
  sourceType: z.enum(['RULE', 'ML', 'MANUAL', 'SCHEMA_DRIFT']).optional(),
})

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'MANAGE_ISSUE' })
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

  const policy = await loadPolicy()
  const key = await nextCode('DQ', 'issue')
  const issue = await db.issue.create({
    data: {
      key, datasetId: dataset.id, title: body.title, description: body.description,
      severity: body.severity, status: 'OPEN',
      sourceType: body.sourceType ?? 'MANUAL', sourceRef: null,
      slaDueAt: slaDueAt(policy, body.severity),
      reportedBy: user.name, assignee: body.assignee ?? null,
    },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'ISSUE_UPDATE',
    resourceType: 'Issue', resourceId: issue.id, datasetId: dataset.id,
    detail: { created: true, key: issue.key, severity: issue.severity },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ issue: serializeIssue({ ...issue, dataset, comments: [] }) }, 201)
}
