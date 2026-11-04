// POST /api/jobs/[id]/cancel — cooperative cancellation (queued → CANCELLED,
// running → cooperative checkpoint).
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { cancelJob } from '@/lib/jobs/runner'
import { guard, guardBlocked, fail, json, clientIp } from '@/lib/api-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'MANAGE_SOURCE' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const job = await db.job.findUnique({ where: { id } })
  if (!job) return fail(404, 'Job not found')
  const ok = await cancelJob(id)
  if (!ok) return fail(409, `Job cannot be cancelled from status ${job.status}`)
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'JOB_CANCEL',
    resourceType: 'Job', resourceId: id,
    detail: { type: job.type, idempotencyKey: job.idempotencyKey, previousStatus: job.status },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
