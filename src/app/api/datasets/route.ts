// GET /api/datasets — visibility-filtered catalogue with quality enrichment.
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, json, datasetVisible, serializeDataset, latestRunsByDataset,
} from '@/lib/api-helpers'
import type { Dataset } from '@prisma/client'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'VIEW_DATASET' })
  if (guardBlocked(g)) return g
  const { user } = g
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const domain = url.searchParams.get('domain') ?? ''
  const classification = url.searchParams.get('classification') ?? ''
  const status = url.searchParams.get('status') ?? ''

  const all = await db.dataset.findMany({ include: { source: true }, orderBy: { name: 'asc' } })
  const visible: Dataset[] = []
  for (const d of all) {
    if (await datasetVisible(user, d)) visible.push(d)
  }
  const filtered = visible.filter((d) => {
    if (domain && d.domain !== domain) return false
    if (classification && d.classification !== classification) return false
    if (status && d.status !== status) return false
    if (q) {
      const hay = `${d.name} ${d.nameTh ?? ''} ${d.description}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const ids = filtered.map((d) => d.id)
  const [runs, openIssues, activeRules] = await Promise.all([
    latestRunsByDataset(ids),
    db.issue.groupBy({
      by: ['datasetId'],
      where: { datasetId: { in: ids }, status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED'] } },
      _count: { _all: true },
    }),
    db.rule.groupBy({
      by: ['datasetId'],
      where: { datasetId: { in: ids }, isActive: true },
      _count: { _all: true },
    }),
  ])
  const issueMap = new Map(openIssues.map((r) => [r.datasetId, r._count._all]))
  const ruleMap = new Map(activeRules.map((r) => [r.datasetId, r._count._all]))

  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'DATA_PREVIEW',
    resourceType: 'DatasetList', resourceId: 'catalogue',
    detail: { count: filtered.length, q: q || undefined, domain: domain || undefined },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
  }).catch(() => undefined)

  return json({
    datasets: filtered.map((d) => {
      const info = runs.get(d.id)
      return serializeDataset(d, {
        qualityScore: info?.latestSucceeded?.qualityScore ?? null,
        lastRunAt: info?.latest?.startedAt ?? null,
        openIssues: issueMap.get(d.id) ?? 0,
        activeRules: ruleMap.get(d.id) ?? 0,
      })
    }),
  })
}
