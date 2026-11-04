// /api/datasets/[id]/profiles — GET history (last 5), POST enqueue profiling job.
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { enqueue } from '@/lib/jobs/runner'
import { hasPermission } from '@/lib/types'
import {
  guard, guardBlocked, fail, json, notFoundRes, loadVisibleDataset, clientIp,
} from '@/lib/api-helpers'
import type { ColumnProfile } from '@/lib/types'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'VIEW_PROFILE' })
  if (guardBlocked(g)) return g
  const { id } = await params
  const dataset = await loadVisibleDataset(g.user, id)
  if (!dataset) return notFoundRes()
  const profiles = await db.profileSnapshot.findMany({
    where: { datasetId: id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  return json({
    profiles: profiles.map((p) => ({
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      datasetVersion: p.datasetVersion,
      rowCount: p.rowCount,
      columnCount: p.columnCount,
      nullRateAvg: p.nullRateAvg,
      duplicateRate: p.duplicateRate,
      overallScore: p.overallScore,
      columns: (p.columns ?? []) as unknown as ColumnProfile[],
    })),
  })
}

const postSchema = z.object({}).loose()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, {})
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  if (!(hasPermission(user.role, 'VIEW_PROFILE') || hasPermission(user.role, 'RUN_VALIDATION'))) {
    return fail(403, 'Missing permission: VIEW_PROFILE')
  }
  const dataset = await loadVisibleDataset(user, id)
  if (!dataset) return notFoundRes()
  // body is intentionally empty; validate defensively
  try {
    const body = await req.json().catch(() => ({}))
    if (!postSchema.safeParse(body).success) return fail(400, 'Invalid body')
  } catch {
    return fail(400, 'Invalid body')
  }
  const { jobId, deduplicated } = await enqueue('PROFILING', {
    idempotencyKey: `prof-${id}-${Math.floor(Date.now() / 60000)}`,
    payload: { datasetId: id },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'VALIDATION_RUN',
    resourceType: 'ProfileSnapshot', resourceId: id, datasetId: id,
    detail: { jobId, deduplicated, kind: 'PROFILING' },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ jobId, deduplicated }, 202)
}
