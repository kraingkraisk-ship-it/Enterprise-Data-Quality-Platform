// GET /api/dashboards/audit — compliance overview (VIEW_AUDIT or EXECUTIVE).
import { db } from '@/lib/db'
import { CRITICAL_AUDIT_ACTIONS } from '@/lib/audit'
import { hasPermission } from '@/lib/types'
import { guard, guardBlocked, fail, json, serializeAuditLog } from '@/lib/api-helpers'
import type { AuditDashboardDTO } from '@/lib/types'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_DASHBOARD' })
  if (guardBlocked(g)) return g
  const { user } = g
  if (!(hasPermission(user.role, 'VIEW_AUDIT') || user.role === 'EXECUTIVE')) {
    return fail(403, 'Missing permission: VIEW_AUDIT')
  }

  const criticalActions = [...CRITICAL_AUDIT_ACTIONS]
  const [criticalEvents, eventCounts, actorGroups, exportEvents, rejectEvents] = await Promise.all([
    db.auditLog.findMany({
      where: { action: { in: criticalActions } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 10 }),
    db.auditLog.groupBy({ by: ['actor'], _count: { _all: true }, _max: { createdAt: true }, orderBy: { _count: { actor: 'desc' } }, take: 10 }),
    db.auditLog.count({ where: { action: 'EXPORT' } }),
    db.auditLog.count({ where: { action: 'FILE_REJECT' } }),
  ])

  const criticalTotal = await db.auditLog.count({ where: { action: { in: criticalActions } } })
  const withCorrelation = await db.auditLog.count({
    where: { action: { in: criticalActions }, correlationId: { not: null } },
  })

  const payload: AuditDashboardDTO = {
    criticalEvents: criticalEvents.map(serializeAuditLog),
    eventCounts: eventCounts.map((c) => ({ action: c.action, count: c._count._all })),
    actorStats: actorGroups.map((a) => ({
      actor: a.actor,
      actions: a._count._all,
      lastSeen: a._max.createdAt?.toISOString() ?? null,
    })),
    exportEvents,
    rejectEvents,
    evidenceCompleteness: criticalTotal > 0 ? Number(((withCorrelation / criticalTotal) * 100).toFixed(1)) : 100,
  }
  return json(payload)
}
