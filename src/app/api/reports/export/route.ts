// POST /api/reports/export — build a classification-aware, PII-masked CSV from
// real database data; record it as a FileUpload + audit EXPORT event.
import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { maskByPiiType, sanitizeFormulaInjection, type MaskMode } from '@/lib/masking'
import { getDatasetData } from '@/lib/data-engine'
import {
  guard, guardBlocked, fail, json, clientIp, visibleDatasetIds, datasetVisible,
  loadPolicy, latestRunsByDataset, issueSlaBreached, notFoundRes,
} from '@/lib/api-helpers'

export const EXPORTS_DIR = join(process.cwd(), 'db', 'exports')

const bodySchema = z.object({
  type: z.enum(['dataset_summary', 'validation_history', 'issue_log', 'executive_scorecard']),
  datasetId: z.string().optional().nullable(),
  format: z.string().max(10).optional().nullable(),
})

function csvCell(v: unknown, piiType: string | null, mode: MaskMode): string {
  const raw = v == null ? '' : String(v)
  const masked = maskByPiiType(piiType, raw, mode)
  const safe = sanitizeFormulaInjection(masked)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function toCsv(headers: string[], rows: unknown[][], piiByIndex: (string | null)[] = [], mode: MaskMode = 'FULL'): string {
  const head = headers.map((h) => csvCell(h, null, mode)).join(',')
  const body = rows.map((r) => r.map((cell, i) => csvCell(cell, piiByIndex[i] ?? null, mode)).join(','))
  return [head, ...body].join('\r\n') + '\r\n'
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'EXPORT_REPORT' })
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { type } = parsed.data
  const datasetId = parsed.data.datasetId ?? null
  const policy = await loadPolicy()
  const maskingLevel = String(policy.get('masking.defaultMode') ?? 'FULL') as MaskMode
  const visible = await visibleDatasetIds(user)

  let classification = 'INTERNAL'
  let headers: string[] = []
  let rows: unknown[][] = []
  let piiByIndex: (string | null)[] = []

  if (datasetId) {
    const dataset = await db.dataset.findUnique({ where: { id: datasetId }, include: { columns: { orderBy: { position: 'asc' } } } })
    if (!dataset) return notFoundRes()
    if (!(await datasetVisible(user, dataset))) return notFoundRes()
    classification = dataset.classification
  }

  if (type === 'dataset_summary') {
    if (!datasetId) return fail(400, 'datasetId is required for dataset_summary exports')
    const dataset = await db.dataset.findUnique({ where: { id: datasetId }, include: { columns: { orderBy: { position: 'asc' } } } })
    if (!dataset) return notFoundRes()
    const { rows: dataRows } = await getDatasetData(dataset.id)
    headers = dataset.columns.map((c) => c.name)
    piiByIndex = dataset.columns.map((c) => (c.isPii ? c.piiType : null))
    rows = dataRows.slice(0, 1000).map((r) => dataset.columns.map((c) => r[c.name]))
  } else if (type === 'validation_history') {
    const runs = await db.validationRun.findMany({
      where: { datasetId: { in: datasetId ? [datasetId] : visible } },
      include: { dataset: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
      take: 1000,
    })
    headers = ['run_id', 'dataset', 'dataset_version', 'trigger', 'status', 'quality_score', 'coverage', 'rows_evaluated', 'rules_total', 'rules_passed', 'rules_failed', 'executed_by', 'correlation_id', 'started_at', 'completed_at', 'duration_ms']
    piiByIndex = headers.map(() => null)
    rows = runs.map((r) => [
      r.id, r.dataset.name, r.datasetVersion, r.trigger, r.status, r.qualityScore, r.coverage,
      r.rowsEvaluated, r.rulesTotal, r.rulesPassed, r.rulesFailed, r.executedBy,
      r.correlationId, r.startedAt.toISOString(), r.completedAt?.toISOString() ?? '', r.durationMs ?? '',
    ])
  } else if (type === 'issue_log') {
    const issues = await db.issue.findMany({
      where: { datasetId: { in: datasetId ? [datasetId] : visible } },
      include: { dataset: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 1000,
    })
    headers = ['key', 'dataset', 'title', 'severity', 'status', 'source_type', 'source_ref', 'sla_due_at', 'sla_breached', 'reported_by', 'assignee', 'opened_at', 'resolved_at', 'resolution_note']
    piiByIndex = headers.map(() => null)
    rows = issues.map((i) => [
      i.key, i.dataset.name, i.title, i.severity, i.status, i.sourceType, i.sourceRef ?? '',
      i.slaDueAt?.toISOString() ?? '', issueSlaBreached(i) ? 'YES' : 'NO', i.reportedBy, i.assignee ?? '',
      i.openedAt.toISOString(), i.resolvedAt?.toISOString() ?? '', i.resolutionNote ?? '',
    ])
  } else {
    // executive_scorecard
    const datasets = await db.dataset.findMany({ where: { id: { in: visible } }, orderBy: { name: 'asc' } })
    const runsByDataset = await latestRunsByDataset(visible)
    const openAgg = await db.issue.groupBy({
      by: ['datasetId'],
      where: { datasetId: { in: visible }, status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED'] } },
      _count: { _all: true },
    })
    const openMap = new Map(openAgg.map((r) => [r.datasetId, r._count._all]))
    headers = ['dataset', 'domain', 'business_unit', 'classification', 'criticality', 'is_cde', 'latest_score', 'coverage', 'open_issues', 'last_run_at', 'sla_hours']
    piiByIndex = headers.map(() => null)
    rows = datasets.map((d) => {
      const info = runsByDataset.get(d.id)
      return [
        d.name, d.domain, d.businessUnit, d.classification, d.criticality, d.isCde ? 'YES' : 'NO',
        info?.latestSucceeded?.qualityScore ?? '', info?.latestSucceeded?.coverage ?? '',
        openMap.get(d.id) ?? 0, info?.latestSucceeded?.startedAt.toISOString() ?? '', d.slaHours,
      ]
    })
  }

  mkdirSync(EXPORTS_DIR, { recursive: true })
  const fileId = randomUUID()
  const fileName = `${fileId}.csv`
  const filePath = join(EXPORTS_DIR, fileName)
  const csv = toCsv(headers, rows, piiByIndex, maskingLevel)
  writeFileSync(filePath, csv, { encoding: 'utf8', mode: 0o600 })

  const file = await db.fileUpload.create({
    data: {
      originalName: `${type}-${Date.now()}.csv`,
      storedName: filePath,
      sizeBytes: Buffer.byteLength(csv, 'utf8'),
      mimeType: 'text/csv',
      signatureOk: true,
      scanStatus: 'CLEAN',
      status: 'ACCEPTED',
      datasetId,
      uploadedBy: user.name,
    },
  })
  const auditId = await recordAudit({
    actor: user.name, actorRole: user.role, action: 'EXPORT',
    resourceType: 'Report', resourceId: file.id, datasetId,
    detail: { type, classification, maskingLevel, fileId: file.id, rows: rows.length },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({
    downloadUrl: `/api/reports/download/${file.id}`,
    auditId,
    classification,
    maskingLevel,
    expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  })
}
