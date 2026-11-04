// GET /api/datasets/[id]/tabs?tab=X — per-tab payloads for the dataset detail view.
// Visibility first; tabs with dedicated permissions return { denied: true } when
// the caller lacks them (content is never leaked through existence disclosure).
import { db } from '@/lib/db'
import {
  guard, guardBlocked, fail, json, notFoundRes, loadVisibleDataset, datasetVisible,
  serializeDataset, serializeRule, serializeRun, serializeAnomaly, serializeIssue,
  serializeAuditLog, serializeSource, withModelInfo,
} from '@/lib/api-helpers'
import { hasPermission } from '@/lib/types'
import type { ColumnProfile } from '@/lib/types'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'VIEW_DATASET' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const url = new URL(req.url)
  const tab = url.searchParams.get('tab') ?? 'overview'
  const dataset = await loadVisibleDataset(user, id)
  if (!dataset) return notFoundRes()

  switch (tab) {
    case 'overview': {
      const [runs, latestRun, openIssues, activeRules, openAnomalies] = await Promise.all([
        db.validationRun.findMany({ where: { datasetId: id, status: 'SUCCEEDED' }, orderBy: { startedAt: 'desc' }, take: 30 }),
        db.validationRun.findFirst({ where: { datasetId: id }, orderBy: { startedAt: 'desc' } }),
        db.issue.count({ where: { datasetId: id, status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED'] } } }),
        db.rule.count({ where: { datasetId: id, isActive: true } }),
        db.anomaly.count({ where: { datasetId: id, status: 'OPEN' } }),
      ])
      const scoreTrend = [...runs]
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        .map((r) => ({ date: r.startedAt.toISOString().slice(5, 10), score: r.qualityScore }))
      const [ownerUser, stewardUser] = await Promise.all([
        db.user.findUnique({ where: { id: dataset.ownerId }, select: { name: true } }),
        db.user.findUnique({ where: { id: dataset.stewardId }, select: { name: true } }),
      ])
      return json({
        dataset: {
          ...serializeDataset(dataset, {
            qualityScore: runs[0]?.qualityScore ?? null,
            lastRunAt: latestRun?.startedAt ?? null,
            openIssues,
            activeRules,
          }),
          ownerName: ownerUser?.name ?? null,
          stewardName: stewardUser?.name ?? null,
        },
        latestRun: latestRun ? serializeRun(latestRun, dataset.name) : null,
        scoreTrend,
        dimensionRates: (latestRun?.dimensionResults ?? {}) as Record<string, { passed: number; total: number; rate: number }>,
        openIssues,
        activeRules,
        openAnomalies,
      })
    }

    case 'schema': {
      const [columns, source] = await Promise.all([
        db.datasetColumn.findMany({ where: { datasetId: id }, orderBy: { position: 'asc' } }),
        dataset.sourceId ? db.dataSource.findUnique({ where: { id: dataset.sourceId } }) : Promise.resolve(null),
      ])
      return json({
        columns: columns.map((c) => ({
          id: c.id, datasetId: c.datasetId, name: c.name, dataType: c.dataType,
          nullable: c.nullable, isPii: c.isPii, piiType: c.piiType,
          classification: c.classification, description: c.description,
          isCde: c.isCde, position: c.position,
        })),
        sourceType: source?.type ?? null,
      })
    }

    case 'profile': {
      if (!hasPermission(user.role, 'VIEW_PROFILE')) return json({ denied: true })
      const profiles = await db.profileSnapshot.findMany({
        where: { datasetId: id }, orderBy: { createdAt: 'desc' }, take: 5,
      })
      return json({
        profiles: profiles.map((p) => ({
          id: p.id, createdAt: p.createdAt.toISOString(), datasetVersion: p.datasetVersion,
          rowCount: p.rowCount, columnCount: p.columnCount, nullRateAvg: p.nullRateAvg,
          duplicateRate: p.duplicateRate, overallScore: p.overallScore,
          columns: (p.columns ?? []) as unknown as ColumnProfile[],
        })),
      })
    }

    case 'rules': {
      if (!hasPermission(user.role, 'VIEW_RULE')) return json({ denied: true })
      const rules = await db.rule.findMany({
        where: { datasetId: id },
        include: { dataset: { select: { name: true } }, versions: { orderBy: { version: 'desc' } } },
        orderBy: { code: 'asc' },
      })
      return json({ rules: rules.map((r) => serializeRule(r)) })
    }

    case 'history': {
      if (!hasPermission(user.role, 'VIEW_VALIDATION')) return json({ denied: true })
      const runs = await db.validationRun.findMany({
        where: { datasetId: id }, orderBy: { startedAt: 'desc' }, take: 30,
      })
      return json({ runs: runs.map((r) => serializeRun(r, dataset.name)) })
    }

    case 'anomalies': {
      if (!hasPermission(user.role, 'VIEW_ANOMALY')) return json({ denied: true })
      const anomalies = await db.anomaly.findMany({
        where: { datasetId: id },
        include: { dataset: { select: { name: true } } },
        orderBy: { detectedAt: 'desc' },
      })
      return json({ anomalies: (await withModelInfo(anomalies)).map((a) => serializeAnomaly(a)) })
    }

    case 'issues': {
      if (!hasPermission(user.role, 'VIEW_ISSUE')) return json({ denied: true })
      const issues = await db.issue.findMany({
        where: { datasetId: id },
        include: { dataset: { select: { name: true } }, comments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { openedAt: 'desc' },
      })
      return json({ issues: issues.map((i) => serializeIssue(i)) })
    }

    case 'lineage': {
      const referential = await db.rule.findMany({
        where: { datasetId: { not: id }, templateKey: 'REFERENTIAL', isActive: true },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      })
      const downstreamIds = new Set<string>()
      for (const r of referential) {
        const def = (r.versions[0]?.definition ?? {}) as { parameters?: { dataset?: unknown } }
        if (String(def.parameters?.dataset ?? '') === dataset.name) downstreamIds.add(r.datasetId)
      }
      if (dataset.sourceId) {
        const siblings = await db.dataset.findMany({
          where: { sourceId: dataset.sourceId, id: { not: id } }, select: { id: true },
        })
        for (const s of siblings) downstreamIds.add(s.id)
      }
      const candidates = await db.dataset.findMany({
        where: { id: { in: [...downstreamIds] } },
        select: { id: true, name: true, ownerId: true, stewardId: true },
      })
      const downstream: { id: string; name: string }[] = []
      for (const c of candidates) {
        if (await datasetVisible(user, c)) downstream.push({ id: c.id, name: c.name })
      }
      return json({
        source: dataset.source ? serializeSource(dataset.source) : null,
        dataset: serializeDataset(dataset),
        downstream,
      })
    }

    case 'access': {
      const [owner, steward] = await Promise.all([
        db.user.findUnique({ where: { id: dataset.ownerId }, select: { id: true, name: true } }),
        db.user.findUnique({ where: { id: dataset.stewardId }, select: { id: true, name: true } }),
      ])
      const isManager = hasPermission(user.role, 'MANAGE_DATASET') || dataset.ownerId === user.id
      const grantRows = isManager
        ? await db.datasetPermission.findMany({
            where: { datasetId: id },
            include: { user: { select: { name: true } } },
            orderBy: { grantedAt: 'desc' },
          })
        : []
      return json({
        owner: owner ?? null,
        steward: steward ?? null,
        grants: grantRows.map((gr) => ({
          id: gr.id, userId: gr.userId, userName: gr.user.name,
          level: gr.level, reason: gr.reason, grantedAt: gr.grantedAt.toISOString(),
        })),
      })
    }

    case 'audit': {
      if (!hasPermission(user.role, 'VIEW_AUDIT')) return json({ denied: true })
      const logs = await db.auditLog.findMany({
        where: { datasetId: id }, orderBy: { createdAt: 'desc' }, take: 100,
      })
      return json({ logs: logs.map(serializeAuditLog) })
    }

    default:
      return fail(400, `Unknown tab: ${tab}`)
  }
}
