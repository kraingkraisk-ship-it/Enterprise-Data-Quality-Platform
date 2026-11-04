// GET /api/dashboards/engineering — source health, job pipeline, run volume.
import { db } from '@/lib/db'
import { guard, guardBlocked, json, serializeJob } from '@/lib/api-helpers'
import type { EngineeringDashboardDTO } from '@/lib/types'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'MANAGE_SOURCE' })
  if (guardBlocked(g)) return g

  const [sources, jobRows, recentJobs, schemaDriftCount, runStatsRows] = await Promise.all([
    db.dataSource.findMany({ orderBy: { name: 'asc' } }),
    db.job.groupBy({ by: ['status'], _count: { _all: true } }),
    db.job.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    db.anomaly.count({ where: { type: 'SCHEMA_DRIFT', status: 'OPEN' } }),
    db.validationRun.findMany({
      where: { startedAt: { gte: new Date(Date.now() - 14 * 24 * 3600_000) } },
      select: { startedAt: true, status: true },
      orderBy: { startedAt: 'asc' },
    }),
  ])

  const count = (s: string) => jobRows.find((c) => c.status === s)?._count._all ?? 0
  const jobStats = {
    queued: count('QUEUED'),
    running: count('RUNNING'),
    succeeded: count('SUCCEEDED'),
    failed: count('FAILED'),
    dead: count('DEAD'),
    cancelled: count('CANCELLED'),
  }

  const byDay = new Map<string, { count: number; failed: number }>()
  for (const r of runStatsRows) {
    const k = r.startedAt.toISOString().slice(5, 10)
    const t = byDay.get(k) ?? { count: 0, failed: 0 }
    t.count++
    if (r.status === 'FAILED') t.failed++
    byDay.set(k, t)
  }
  const runStats: EngineeringDashboardDTO['runStats'] = []
  for (let i = 13; i >= 0; i--) {
    const k = new Date(Date.now() - i * 24 * 3600_000).toISOString().slice(5, 10)
    const t = byDay.get(k) ?? { count: 0, failed: 0 }
    runStats.push({ date: k, count: t.count, failed: t.failed })
  }

  const payload: EngineeringDashboardDTO = {
    sourceHealth: sources.map((s) => ({
      id: s.id, name: s.name, type: s.type, health: s.health,
      latencyP95Ms: s.latencyP95Ms, successRate: s.successRate,
      lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    })),
    jobStats,
    recentJobs: recentJobs.map(serializeJob),
    schemaDriftCount,
    runStats,
  }
  return json(payload)
}
