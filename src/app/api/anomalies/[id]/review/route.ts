// POST /api/anomalies/[id]/review — human triage of ML findings; CONFIRMED_ISSUE
// auto-creates an SLA-tracked data quality issue (ML source).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, fail, json, clientIp, notFoundRes, datasetVisible,
  loadPolicy, nextCode, slaDueAt,
} from '@/lib/api-helpers'

const bodySchema = z.object({
  reviewStatus: z.enum(['CONFIRMED_ISSUE', 'FALSE_POSITIVE', 'PENDING']),
  note: z.string().max(1000).optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'REVIEW_ANOMALY' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const anomaly = await db.anomaly.findUnique({ where: { id }, include: { dataset: true } })
  if (!anomaly) return notFoundRes()
  if (!(await datasetVisible(user, anomaly.dataset))) return notFoundRes()

  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { reviewStatus, note } = parsed.data

  await db.anomaly.update({
    where: { id: anomaly.id },
    data: {
      reviewStatus,
      reviewedBy: user.name,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
      status: reviewStatus === 'CONFIRMED_ISSUE' ? 'TRIAGED' : anomaly.status,
    },
  })

  let issueKey: string | null = null
  if (reviewStatus === 'CONFIRMED_ISSUE') {
    const policy = await loadPolicy()
    issueKey = await nextCode('DQ', 'issue')
    const title = (anomaly.explanationEn ?? `Confirmed ${anomaly.type} anomaly`).slice(0, 60)
    await db.issue.create({
      data: {
        key: issueKey, datasetId: anomaly.datasetId,
        title, titleTh: (anomaly.explanationTh ?? 'ยืนยันความผิดปกติ').slice(0, 60),
        description: [
          anomaly.explanationEn ?? 'Confirmed ML anomaly.',
          note ? `Reviewer note: ${note}` : null,
          `Source anomaly: ${anomaly.type} (score ${anomaly.score}) on ${anomaly.dataset.name} ${anomaly.datasetVersion}.`,
        ].filter(Boolean).join(' '),
        severity: anomaly.severity, status: 'OPEN',
        sourceType: 'ML', sourceRef: anomaly.id,
        slaDueAt: slaDueAt(policy, anomaly.severity),
        reportedBy: user.name,
      },
    })
  }

  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'ANOMALY_REVIEW',
    resourceType: 'Anomaly', resourceId: anomaly.id, datasetId: anomaly.datasetId,
    detail: {
      reviewStatus, note: note ?? null, modelId: anomaly.modelId, score: anomaly.score,
      issueKey,
    },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true })
}
