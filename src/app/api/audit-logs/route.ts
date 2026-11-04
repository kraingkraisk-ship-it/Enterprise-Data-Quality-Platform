// GET /api/audit-logs — immutable audit trail query (VIEW_AUDIT).
import { db } from '@/lib/db'
import { guard, guardBlocked, json, serializeAuditLog, intParam } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_AUDIT' })
  if (guardBlocked(g)) return g
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const action = url.searchParams.get('action') ?? ''
  const actor = url.searchParams.get('actor') ?? ''
  const limit = intParam(url.searchParams.get('limit'), 100, 500)

  const rows = await db.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(actor ? { actor: { contains: actor } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const filtered = q
    ? rows.filter((r) => `${r.actor} ${r.resourceId} ${r.resourceType}`.toLowerCase().includes(q))
    : rows
  return json({ logs: filtered.map(serializeAuditLog) })
}
