// GET /api/jobs — background job queue inspection (DATA_ENGINEER/ADMIN).
import { z } from 'zod'
import { db } from '@/lib/db'
import { guard, guardBlocked, fail, json, serializeJob, intParam } from '@/lib/api-helpers'

const querySchema = z.object({
  status: z.string().max(20).optional(),
  type: z.string().max(20).optional(),
  limit: z.string().optional(),
})

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'MANAGE_SOURCE' })
  if (guardBlocked(g)) return g
  const url = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid query')
  const status = parsed.data.status ?? ''
  const type = parsed.data.type ?? ''
  const limit = intParam(url.searchParams.get('limit'), 50, 200)

  const jobs = await db.job.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return json({ jobs: jobs.map(serializeJob) })
}
