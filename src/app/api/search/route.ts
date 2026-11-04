// GET /api/search — global, permission-filtered search across datasets/rules/issues.
import { db } from '@/lib/db'
import { guard, guardBlocked, json, visibleDatasetIds } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, {})
  if (guardBlocked(g)) return g
  const { user } = g
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase()
  if (!q) return json({ datasets: [], rules: [], issues: [] })

  const ids = await visibleDatasetIds(user)
  if (ids.length === 0) return json({ datasets: [], rules: [], issues: [] })

  const [datasets, rules, issues] = await Promise.all([
    db.dataset.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, nameTh: true, description: true },
      take: 100,
    }),
    db.rule.findMany({
      where: { datasetId: { in: ids } },
      select: { id: true, code: true, name: true, nameTh: true },
      take: 200,
    }),
    db.issue.findMany({
      where: { datasetId: { in: ids } },
      select: { id: true, key: true, title: true, titleTh: true },
      take: 200,
    }),
  ])

  return json({
    datasets: datasets
      .filter((d) => `${d.name} ${d.nameTh ?? ''} ${d.description}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((d) => ({ id: d.id, name: d.name })),
    rules: rules
      .filter((r) => `${r.code} ${r.name} ${r.nameTh ?? ''}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({ id: r.id, code: r.code, name: r.name })),
    issues: issues
      .filter((i) => `${i.key} ${i.title} ${i.titleTh ?? ''}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((i) => ({ id: i.id, key: i.key, title: i.title })),
  })
}
