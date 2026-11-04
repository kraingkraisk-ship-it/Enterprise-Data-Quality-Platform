// GET /api/datasets/[id] — dataset detail + ordered columns (404 when not permitted).
import { db } from '@/lib/db'
import {
  guard, guardBlocked, json, notFoundRes, loadVisibleDataset,
  serializeDataset, serializeColumn, latestRunsByDataset,
} from '@/lib/api-helpers'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'VIEW_DATASET' })
  if (guardBlocked(g)) return g
  const { id } = await params
  const dataset = await loadVisibleDataset(g.user, id)
  if (!dataset) return notFoundRes()

  const [columns, runs, openIssues, activeRules, ownerUser, stewardUser] = await Promise.all([
    db.datasetColumn.findMany({ where: { datasetId: id }, orderBy: { position: 'asc' } }),
    latestRunsByDataset([id]),
    db.issue.count({ where: { datasetId: id, status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED'] } } }),
    db.rule.count({ where: { datasetId: id, isActive: true } }),
    db.user.findUnique({ where: { id: dataset.ownerId }, select: { name: true } }),
    db.user.findUnique({ where: { id: dataset.stewardId }, select: { name: true } }),
  ])
  const info = runs.get(id)
  return json({
    dataset: {
      ...serializeDataset(dataset, {
        qualityScore: info?.latestSucceeded?.qualityScore ?? null,
        lastRunAt: info?.latest?.startedAt ?? null,
        openIssues,
        activeRules,
      }),
      ownerName: ownerUser?.name ?? null,
      stewardName: stewardUser?.name ?? null,
    },
    columns: columns.map(serializeColumn),
  })
}
