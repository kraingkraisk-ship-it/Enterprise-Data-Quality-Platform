// PATCH /api/issues/[id] — workflow transitions, assignment, comments.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible,
} from '@/lib/api-helpers'

const patchSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'RESOLVED', 'CLOSED', 'REJECTED']).optional(),
  assignee: z.string().max(120).optional().nullable(),
  resolutionNote: z.string().max(2000).optional().nullable(),
  comment: z.string().max(2000).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'MANAGE_ISSUE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const issue = await db.issue.findUnique({ where: { id }, include: { dataset: true } })
  if (!issue) return notFoundRes()
  if (!(await datasetVisible(user, issue.dataset))) return notFoundRes()

  let parsed
  try {
    parsed = patchSchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { status, assignee, resolutionNote, comment } = parsed.data
  if (!status && !assignee && resolutionNote === undefined && !comment) {
    return fail(400, 'Nothing to update: provide status, assignee, resolutionNote or comment')
  }

  const resolved = status === 'RESOLVED' || status === 'CLOSED'
  const updated = await db.issue.update({
    where: { id: issue.id },
    data: {
      ...(status ? { status } : {}),
      ...(resolved ? { resolvedAt: issue.resolvedAt ?? new Date() } : {}),
      ...(status && !resolved ? { resolvedAt: null } : {}),
      ...(assignee !== undefined ? { assignee } : {}),
      ...(resolutionNote !== undefined ? { resolutionNote } : {}),
    },
  })
  if (comment) {
    await db.issueComment.create({
      data: { issueId: issue.id, author: user.name, body: comment },
    })
  }
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'ISSUE_UPDATE',
    resourceType: 'Issue', resourceId: issue.id, datasetId: issue.datasetId,
    detail: {
      key: issue.key,
      from: issue.status,
      to: status ?? issue.status,
      assignee: assignee ?? null,
      commented: !!comment,
      resolutionNote: resolutionNote ?? null,
    },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
