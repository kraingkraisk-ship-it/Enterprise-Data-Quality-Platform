// /api/sources — GET list (with dataset counts), POST create (MANAGE_SOURCE).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { guard, guardBlocked, fail, json, clientIp, serializeSource } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'MANAGE_SOURCE' })
  if (guardBlocked(g)) return g
  const sources = await db.dataSource.findMany({ orderBy: { name: 'asc' } })
  const counts = await db.dataset.groupBy({ by: ['sourceId'], _count: { _all: true } })
  const countMap = new Map(counts.filter((c) => c.sourceId).map((c) => [c.sourceId as string, c._count._all]))
  return json({ sources: sources.map((s) => serializeSource(s, countMap.get(s.id) ?? 0)) })
}

const createSchema = z.object({
  name: z.string().min(2, 'name must be at least 2 characters').max(120),
  type: z.enum(['CSV', 'XLSX', 'POSTGRESQL', 'MSSQL', 'REST_API']),
  host: z.string().max(200).optional().nullable(),
  connectionRef: z.string().max(200).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  owner: z.string().max(120).optional().nullable(),
})

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'MANAGE_SOURCE' })
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = createSchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const existing = await db.dataSource.findFirst({ where: { name: parsed.data.name }, select: { id: true } })
  if (existing) return fail(409, 'A data source with this name already exists')
  const source = await db.dataSource.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      host: parsed.data.host ?? null,
      // connectionRef points to a secret-manager entry — raw credentials are never stored
      connectionRef: parsed.data.connectionRef ?? null,
      description: parsed.data.description ?? null,
      owner: parsed.data.owner ?? user.name,
    },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'SOURCE_CREATE',
    resourceType: 'DataSource', resourceId: source.id,
    detail: { name: source.name, type: source.type },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ source: serializeSource(source, 0) }, 201)
}
