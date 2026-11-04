// GET /api/validations/[id] — run detail + per-rule results (rule code/name joined).
import { db } from '@/lib/db'
import { guard, guardBlocked, json, notFoundRes, serializeRun, serializeResult, visibleDatasetIds } from '@/lib/api-helpers'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'VIEW_VALIDATION' })
  if (guardBlocked(g)) return g
  const { id } = await params
  const run = await db.validationRun.findUnique({
    where: { id },
    include: { dataset: true, results: { include: { rule: true }, orderBy: { id: 'asc' } } },
  })
  if (!run) return notFoundRes()
  const ids = await visibleDatasetIds(g.user)
  if (!ids.includes(run.datasetId)) return notFoundRes()
  return json({
    run: serializeRun(run, run.dataset.name),
    results: run.results.map((r) => serializeResult(r)),
  })
}
