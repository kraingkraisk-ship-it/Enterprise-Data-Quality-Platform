// Shared API helpers — auth guard, CSRF, rate limiting, dataset visibility
// (deny-by-default), policy loading and DTO serializers used by every route.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { hasPermission, POLICY_DEFAULTS, type Permission, type UserDTO, type Role } from '@/lib/types'
import type {
  Dataset, DatasetColumn, DataSource, Rule, RuleVersion, ValidationRun,
  ValidationRuleResult, Anomaly, Issue, IssueComment, MLModel, AuditLog, Job, User,
} from '@prisma/client'
import type {
  DatasetDTO, RuleDTO, ValidationRunDTO, ValidationResultDTO, AnomalyDTO,
  IssueDTO, MLModelDTO, AuditLogDTO, DataSourceDTO, JobDTO, RuleDefinition,
  RuleTemplate, RuleVersionStatus, SourceType, Severity,
} from '@/lib/types'

// ─── Primitive responses ─────────────────────────────────────────────────────

/** JSON response with no-store caching (session + permission filtered data). */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
  })
}

/** Error payload with optional audit id so the UI can reference the event. */
export function fail(status: number, message: string, auditId?: string): NextResponse {
  return json({ error: message, ...(auditId ? { auditId } : {}) }, status)
}

/** Dataset-like resources must never disclose existence to unauthorised callers. */
export function notFoundRes(): NextResponse {
  return fail(404, 'Resource not found or not permitted')
}

// ─── Request context ─────────────────────────────────────────────────────────

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

export async function requireUser(): Promise<UserDTO | null> {
  try {
    return await getSessionUser()
  } catch {
    return null
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface GuardOk {
  user: UserDTO
  policy: Map<string, unknown>
}

/**
 * Standard request guard: rate limit (ip+path) → CSRF header for mutations →
 * session → permission check. Returns { user, policy } on success or a
 * NextResponse to return early.
 */
export async function guard(
  req: Request,
  opts: { permission?: Permission; rateLimitPerMin?: number; session?: boolean } = {},
): Promise<GuardOk | NextResponse> {
  const path = new URL(req.url).pathname
  let limitPerMin = opts.rateLimitPerMin ?? 120
  let policy: Map<string, unknown> | null = null
  if (!opts.rateLimitPerMin) {
    policy = await loadPolicy()
    const configured = Number(policy.get('rateLimit.perMinute'))
    if (Number.isFinite(configured) && configured > 0) limitPerMin = configured
  } else {
    policy = await loadPolicy()
  }
  const rl = rateLimit(`${clientIp(req)}:${path}`, limitPerMin)
  if (!rl.allowed) {
    return fail(429, `Too many requests. Retry after ${rl.retryAfterSec}s`)
  }
  if (MUTATING.has(req.method.toUpperCase()) && !req.headers.get('x-requested-with')) {
    return fail(403, 'Missing required header: x-requested-with')
  }
  if (opts.session !== false) {
    const user = await requireUser()
    if (!user) return fail(401, 'Authentication required')
    if (opts.permission && !hasPermission(user.role, opts.permission)) {
      return fail(403, `Missing permission: ${opts.permission}`)
    }
    return { user, policy: policy ?? (await loadPolicy()) }
  }
  return { user: null as unknown as UserDTO, policy: policy ?? new Map() }
}

/** Type guard for the guard() union. */
export function guardBlocked(g: GuardOk | NextResponse): g is NextResponse {
  return g instanceof NextResponse
}

// ─── Policy ──────────────────────────────────────────────────────────────────

/** Policy map (DB overrides over POLICY_DEFAULTS). Never throws. */
export async function loadPolicy(): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>(Object.entries(POLICY_DEFAULTS))
  try {
    const rows = await db.policySetting.findMany()
    for (const r of rows) map.set(r.key, r.value)
  } catch {
    // database unavailable — defaults keep the API usable
  }
  return map
}

export function policyNumber(policy: Map<string, unknown>, key: string, fallback: number): number {
  const v = Number(policy.get(key))
  return Number.isFinite(v) ? v : fallback
}

export function slaHoursFor(policy: Map<string, unknown>, severity: string): number {
  const bySev = (policy.get('sla.hoursBySeverity') ?? {}) as Record<string, number>
  return Number(bySev[severity]) > 0 ? Number(bySev[severity]) : 72
}

// ─── Dataset visibility (deny-by-default) ────────────────────────────────────

const UNRESTRICTED_VIEWERS: Role[] = ['SYSTEM_ADMIN', 'AUDITOR', 'EXECUTIVE', 'DATA_ENGINEER']

export async function datasetVisible(
  user: UserDTO,
  dataset: { id: string; ownerId: string; stewardId: string },
): Promise<boolean> {
  if (UNRESTRICTED_VIEWERS.includes(user.role as Role)) return true
  if (user.role === 'DATA_OWNER' && dataset.ownerId === user.id) return true
  if (user.role === 'DATA_STEWARD' && dataset.stewardId === user.id) return true
  const grant = await db.datasetPermission.findUnique({
    where: { userId_datasetId: { userId: user.id, datasetId: dataset.id } },
    select: { id: true },
  })
  return !!grant
}

/** All dataset ids the user may see (single permission query instead of N). */
export async function visibleDatasetIds(user: UserDTO): Promise<string[]> {
  const all = await db.dataset.findMany({ select: { id: true, ownerId: true, stewardId: true } })
  if (UNRESTRICTED_VIEWERS.includes(user.role as Role)) return all.map((d) => d.id)
  const grants = await db.datasetPermission.findMany({ where: { userId: user.id }, select: { datasetId: true } })
  const granted = new Set(grants.map((g) => g.datasetId))
  return all
    .filter((d) =>
      (user.role === 'DATA_OWNER' && d.ownerId === user.id) ||
      (user.role === 'DATA_STEWARD' && d.stewardId === user.id) ||
      granted.has(d.id))
    .map((d) => d.id)
}

export async function loadVisibleDataset(user: UserDTO, id: string) {
  const dataset = await db.dataset.findUnique({ where: { id }, include: { source: true } })
  if (!dataset) return null
  if (!(await datasetVisible(user, dataset))) return null
  return dataset
}

// ─── Sequences & SLA ─────────────────────────────────────────────────────────

/** Next sequential code with the given prefix, e.g. R-012 or DQ-1009. */
export async function nextCode(prefix: string, model: 'rule' | 'issue'): Promise<string> {
  if (model === 'rule') {
    const rows = await db.rule.findMany({ select: { code: true } })
    let max = 0
    for (const r of rows) {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(r.code)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `${prefix}-${String(max + 1).padStart(3, '0')}`
  }
  const rows = await db.issue.findMany({ select: { key: true } })
  let max = 1000
  for (const r of rows) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(r.key)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

export function slaDueAt(policy: Map<string, unknown>, severity: string, from = new Date()): Date {
  return new Date(from.getTime() + slaHoursFor(policy, severity) * 3600_000)
}

// ─── Natural-language rule summaries (EN + TH, server-authoritative) ─────────

function condText(d: RuleDefinition, templateKey: string | null | undefined): { en: string; th: string; params: string } {
  const col = d.column ?? 'the record'
  const p = d.parameters ?? {}
  switch (templateKey) {
    case 'NOT_NULL':
      return { en: 'be present (not null)', th: 'มีค่า (ไม่เป็นค่าว่าง)', params: '' }
    case 'REGEX':
      return { en: `match the pattern ${String(p.pattern ?? '')}`, th: `ตรงตามรูปแบบ ${String(p.pattern ?? '')}`, params: String(p.pattern ?? '') }
    case 'RANGE':
      return { en: `be within the range [${p.min ?? '-∞'}, ${p.max ?? '∞'}]`, th: `อยู่ในช่วง [${p.min ?? '-∞'}, ${p.max ?? '∞'}]`, params: `min=${p.min ?? ''}, max=${p.max ?? ''}` }
    case 'IN_SET':
      return { en: `be one of the allowed values {${(p.values as string[] | undefined ?? []).join(', ')}}`, th: `อยู่ในชุดค่าที่อนุญาต {${(p.values as string[] | undefined ?? []).join(', ')}}`, params: JSON.stringify(p.values ?? []) }
    case 'UNIQUE':
      return { en: 'be unique across all records', th: 'ไม่ซ้ำกันทั้งชุดข้อมูล', params: '' }
    case 'FRESHNESS':
      return { en: `be no older than ${p.maxHours ?? 24} hours`, th: `ไม่เก่ากว่า ${p.maxHours ?? 24} ชั่วโมง`, params: `maxHours=${p.maxHours ?? 24}` }
    case 'ROW_COUNT':
      return { en: `have a row count within [${p.minRows ?? 0}, ${p.maxRows ?? '∞'}]`, th: `มีจำนวนแถวอยู่ในช่วง [${p.minRows ?? 0}, ${p.maxRows ?? '∞'}]`, params: `minRows=${p.minRows ?? 0}, maxRows=${p.maxRows ?? ''}` }
    case 'SCHEMA_MATCH':
      return { en: 'conform to the expected schema', th: 'สอดคล้องกับโครงสร้างสคีมาที่กำหนด', params: JSON.stringify(p.expected ?? []) }
    case 'CROSS_FIELD':
      return { en: `satisfy ${String(p.left ?? '')} ${String(p.op ?? '')} ${String(p.right ?? p.rightValue ?? '')}`, th: `ผ่านเงื่อนไขข้ามฟิลด์ ${String(p.left ?? '')} ${String(p.op ?? '')} ${String(p.right ?? p.rightValue ?? '')}`, params: JSON.stringify(p) }
    case 'REFERENTIAL':
      return { en: `exist in the referenced dataset ${String(p.dataset ?? '')}.${String(p.column ?? '')}`, th: `มีอยู่จริงในชุดข้อมูลอ้างอิง ${String(p.dataset ?? '')}.${String(p.column ?? '')}`, params: `${String(p.dataset ?? '')}.${String(p.column ?? '')}` }
    default:
      break
  }
  switch (d.operator) {
    case 'IS_NOT_NULL': return { en: 'be present (not null)', th: 'มีค่า (ไม่เป็นค่าว่าง)', params: '' }
    case 'MATCHES': return { en: `match the pattern ${String(p.pattern ?? '')}`, th: `ตรงตามรูปแบบ ${String(p.pattern ?? '')}`, params: String(p.pattern ?? '') }
    case 'BETWEEN': return { en: `be within the range [${p.min ?? '-∞'}, ${p.max ?? '∞'}]`, th: `อยู่ในช่วง [${p.min ?? '-∞'}, ${p.max ?? '∞'}]`, params: `min=${p.min ?? ''}, max=${p.max ?? ''}` }
    case 'IN': case 'NOT_IN': return { en: `be one of the allowed values {${(p.values as string[] | undefined ?? []).join(', ')}}`, th: `อยู่ในชุดค่าที่กำหนด {${(p.values as string[] | undefined ?? []).join(', ')}}`, params: JSON.stringify(p.values ?? []) }
    case 'UNIQUE': return { en: 'be unique across all records', th: 'ไม่ซ้ำกันทั้งชุดข้อมูล', params: '' }
    case 'WITHIN_HOURS': return { en: `be no older than ${p.maxHours ?? 24} hours`, th: `ไม่เก่ากว่า ${p.maxHours ?? 24} ชั่วโมง`, params: `maxHours=${p.maxHours ?? 24}` }
    case 'GREATER_THAN': return { en: `be greater than ${String(p.value ?? 0)}`, th: `มากกว่า ${String(p.value ?? 0)}`, params: `value=${String(p.value ?? '')}` }
    case 'LESS_THAN': return { en: `be less than ${String(p.value ?? 0)}`, th: `น้อยกว่า ${String(p.value ?? 0)}`, params: `value=${String(p.value ?? '')}` }
    case 'EQUALS': return { en: `be equal to ${String(p.value ?? '')}`, th: `เท่ากับ ${String(p.value ?? '')}`, params: `value=${String(p.value ?? '')}` }
    case 'REFERENCE_EXISTS': return { en: `exist in the referenced dataset ${String(p.dataset ?? '')}.${String(p.column ?? '')}`, th: `มีอยู่จริงในชุดข้อมูลอ้างอิง ${String(p.dataset ?? '')}.${String(p.column ?? '')}`, params: `${String(p.dataset ?? '')}.${String(p.column ?? '')}` }
    case 'SCHEMA_MATCH': return { en: 'conform to the expected schema', th: 'สอดคล้องกับโครงสร้างสคีมาที่กำหนด', params: JSON.stringify(p.expected ?? []) }
    default: return { en: 'satisfy the configured validation criteria', th: 'ผ่านเกณฑ์การตรวจสอบที่กำหนด', params: JSON.stringify(p) }
  }
}

/** Authoritative bilingual summary for a rule definition. */
export function naturalSummary(
  datasetName: string, d: RuleDefinition, templateKey: string | null | undefined, severity: string,
): { en: string; th: string } {
  const c = condText(d, templateKey)
  const col = d.column ?? 'each record'
  const filter = d.condition?.trim()
  const params = c.params || 'the configured parameters'
  const when = filter ? `when the row matches "${filter}"` : 'when no additional filter applies'
  const whenTh = filter ? `เมื่อแถวตรงกับเงื่อนไข "${filter}"` : 'เมื่อไม่มีเงื่อนไขเพิ่มเติม'
  return {
    en: `For ${datasetName}, ${col} must ${c.en} using ${params} ${when}, otherwise mark as ${severity}.`,
    th: `สำหรับ ${datasetName} คอลัมน์ ${col} ต้อง${c.th} โดยใช้ ${params} ${whenTh} มิฉะนั้นให้ระบุความรุนแรงเป็น ${severity}`,
  }
}

// ─── Serializers ─────────────────────────────────────────────────────────────

export function serializeUser(u: User, includeActive = false): UserDTO & { active?: boolean } {
  const dto: UserDTO = {
    id: u.id, email: u.email, name: u.name, nameTh: u.nameTh,
    role: u.role as Role, businessUnit: u.businessUnit,
    titleEn: u.titleEn, titleTh: u.titleTh, mfaEnabled: u.mfaEnabled,
  }
  return includeActive ? { ...dto, active: u.active } : dto
}

export function serializeDataset(
  d: Dataset & { source?: DataSource | null },
  extra: { qualityScore?: number | null; lastRunAt?: Date | null; openIssues?: number; activeRules?: number } = {},
): DatasetDTO {
  return {
    id: d.id, name: d.name, nameTh: d.nameTh, description: d.description,
    domain: d.domain, businessUnit: d.businessUnit,
    classification: d.classification as DatasetDTO['classification'],
    criticality: d.criticality, isCde: d.isCde, status: d.status, version: d.version,
    rowCount: d.rowCount, columnCount: d.columnCount, piiFields: d.piiFields, slaHours: d.slaHours,
    ownerId: d.ownerId, stewardId: d.stewardId,
    lastRefreshAt: d.lastRefreshAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(),
    source: d.source ? { id: d.source.id, name: d.source.name, type: d.source.type as SourceType, health: d.source.health } : null,
    qualityScore: extra.qualityScore ?? null,
    lastRunAt: extra.lastRunAt?.toISOString() ?? null,
    openIssues: extra.openIssues ?? 0,
    activeRules: extra.activeRules ?? 0,
  }
}

export function serializeSource(s: DataSource, datasetCount?: number): DataSourceDTO {
  return {
    id: s.id, name: s.name, type: s.type as DataSourceDTO['type'], status: s.status, health: s.health,
    host: s.host, connectionRef: s.connectionRef, lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    latencyP95Ms: s.latencyP95Ms, successRate: s.successRate, owner: s.owner,
    description: s.description, ...(datasetCount !== undefined ? { datasetCount } : {}),
  }
}

export function serializeRule(
  r: Rule & { dataset?: { name: string } | null; versions?: RuleVersion[] },
  latestVersion?: RuleVersion | null,
): RuleDTO {
  const versions = r.versions
  const latest = latestVersion ?? (versions ? [...versions].sort((a, b) => b.version - a.version)[0] ?? null : null)
  return {
    id: r.id, code: r.code, datasetId: r.datasetId, datasetName: r.dataset?.name ?? undefined,
    name: r.name, nameTh: r.nameTh,
    dimension: r.dimension as RuleDTO['dimension'],
    severity: r.severity as RuleDTO['severity'],
    requiresApproval: r.requiresApproval, isActive: r.isActive, currentVersion: r.currentVersion,
    owner: r.owner, templateKey: (r.templateKey ?? null) as RuleTemplate | null, tags: r.tags,
    createdAt: r.createdAt.toISOString(),
    latestVersion: latest ? {
      version: latest.version,
      status: latest.status as RuleVersionStatus,
      naturalSummaryEn: latest.naturalSummaryEn, naturalSummaryTh: latest.naturalSummaryTh,
      approvedBy: latest.approvedBy, approvedAt: latest.approvedAt?.toISOString() ?? null,
      effectiveFrom: latest.effectiveFrom?.toISOString() ?? null,
      definition: latest.definition as unknown as RuleDefinition,
    } : undefined,
  }
}

export function serializeRun(r: ValidationRun, datasetName?: string): ValidationRunDTO {
  return {
    id: r.id, datasetId: r.datasetId, ...(datasetName ? { datasetName } : {}),
    datasetVersion: r.datasetVersion, ruleSetVersion: r.ruleSetVersion, trigger: r.trigger,
    status: r.status as ValidationRunDTO['status'],
    startedAt: r.startedAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null,
    durationMs: r.durationMs, rowsEvaluated: r.rowsEvaluated, rulesTotal: r.rulesTotal,
    rulesPassed: r.rulesPassed, rulesFailed: r.rulesFailed, qualityScore: r.qualityScore,
    coverage: r.coverage, executedBy: r.executedBy, correlationId: r.correlationId,
    attempt: r.attempt, retriedFrom: r.retriedFrom,
    dimensionResults: (r.dimensionResults ?? {}) as Record<string, { passed: number; total: number; rate: number }>,
  }
}

export function serializeResult(res: ValidationRuleResult & { rule?: Rule | null }): ValidationResultDTO {
  return {
    id: res.id, runId: res.runId, ruleId: res.ruleId,
    ruleCode: res.rule?.code, ruleName: res.rule?.name,
    ruleVersion: res.ruleVersion,
    status: res.status as ValidationResultDTO['status'],
    passRate: res.passRate, failedRows: res.failedRows, evaluatedRows: res.evaluatedRows,
    durationMs: res.durationMs,
    evidence: (res.evidence ?? null) as ValidationResultDTO['evidence'],
    messageEn: res.messageEn, messageTh: res.messageTh,
  }
}

export function serializeAnomaly(a: Anomaly & { dataset?: { name: string } | null; model?: MLModel | null }): AnomalyDTO {
  return {
    id: a.id, datasetId: a.datasetId, datasetName: a.dataset?.name,
    datasetVersion: a.datasetVersion, type: a.type as AnomalyDTO['type'],
    severity: a.severity as AnomalyDTO['severity'], score: a.score, rawStat: a.rawStat,
    columnName: a.columnName, rowKey: a.rowKey, valueMasked: a.valueMasked, expectedMasked: a.expectedMasked,
    modelId: a.modelId, modelName: a.model?.name ?? null,
    modelVersion: a.model?.version ?? null,
    contributingFeatures: (a.contributingFeatures ?? null) as AnomalyDTO['contributingFeatures'],
    explanationEn: a.explanationEn, explanationTh: a.explanationTh,
    reviewStatus: a.reviewStatus as AnomalyDTO['reviewStatus'],
    reviewedBy: a.reviewedBy, reviewNote: a.reviewNote, status: a.status,
    detectedAt: a.detectedAt.toISOString(),
  }
}

export function issueSlaBreached(i: Pick<Issue, 'slaDueAt' | 'slaBreached' | 'status'>, now = new Date()): boolean {
  const closed = i.status === 'RESOLVED' || i.status === 'CLOSED' || i.status === 'REJECTED'
  return !closed && !!i.slaDueAt && i.slaDueAt.getTime() < now.getTime()
}

export function serializeIssue(
  i: Issue & { dataset?: { name: string } | null; comments?: IssueComment[] }, now = new Date(),
): IssueDTO {
  return {
    id: i.id, key: i.key, datasetId: i.datasetId, datasetName: i.dataset?.name,
    title: i.title, titleTh: i.titleTh, description: i.description,
    severity: i.severity as IssueDTO['severity'],
    status: i.status as IssueDTO['status'],
    sourceType: i.sourceType as IssueDTO['sourceType'],
    sourceRef: i.sourceRef, dimension: i.dimension,
    slaDueAt: i.slaDueAt?.toISOString() ?? null, slaBreached: issueSlaBreached(i, now),
    reportedBy: i.reportedBy, assignee: i.assignee,
    openedAt: i.openedAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null,
    resolutionNote: i.resolutionNote,
    comments: i.comments?.map((c) => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt.toISOString() })),
  }
}

export function serializeModel(m: MLModel): MLModelDTO {
  return {
    id: m.id, name: m.name, algorithm: m.algorithm, version: m.version,
    stage: m.stage as MLModelDTO['stage'], trainedAt: m.trainedAt.toISOString(),
    metrics: (m.metrics ?? {}) as MLModelDTO['metrics'],
    params: (m.params ?? {}) as Record<string, unknown>,
    trainingRows: m.trainingRows,
    featureImportance: (m.featureImportance ?? []) as MLModelDTO['featureImportance'],
    shadowOfId: m.shadowOfId, isActive: m.isActive, scopeDatasetId: m.scopeDatasetId,
    createdBy: m.createdBy, createdAt: m.createdAt.toISOString(),
  }
}

export function serializeAuditLog(l: AuditLog): AuditLogDTO {
  return {
    id: l.id, actor: l.actor, actorRole: l.actorRole, action: l.action,
    resourceType: l.resourceType, resourceId: l.resourceId, datasetId: l.datasetId,
    detail: (l.detail ?? {}) as Record<string, unknown>, ip: l.ip,
    correlationId: l.correlationId, createdAt: l.createdAt.toISOString(),
  }
}

export function serializeJob(j: Job): JobDTO {
  return {
    id: j.id, type: j.type, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts,
    idempotencyKey: j.idempotencyKey, lastError: j.lastError,
    startedAt: j.startedAt?.toISOString() ?? null, finishedAt: j.finishedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  }
}

export function serializeColumn(c: DatasetColumn) {
  return {
    id: c.id, name: c.name, dataType: c.dataType, nullable: c.nullable,
    isPii: c.isPii, piiType: c.piiType, classification: c.classification,
    description: c.description, isCde: c.isCde, position: c.position,
  }
}

/** Attach ML model name/version to anomalies (Anomaly stores modelId as a plain string). */
export async function withModelInfo<T extends { modelId: string | null }>(
  anomalies: T[],
): Promise<(T & { model: MLModel | null })[]> {
  const ids = [...new Set(anomalies.map((a) => a.modelId).filter((v): v is string => !!v))]
  const models = ids.length ? await db.mLModel.findMany({ where: { id: { in: ids } } }) : []
  const byId = new Map(models.map((m) => [m.id, m]))
  return anomalies.map((a) => ({ ...a, model: a.modelId ? byId.get(a.modelId) ?? null : null }))
}

// ─── Run lookups shared by lists & dashboards ────────────────────────────────

export interface LatestRunInfo {
  latest: ValidationRun | null
  latestSucceeded: ValidationRun | null
  /** run ~7 days before the latest one (for 7-day trend deltas) */
  previousWeek: ValidationRun | null
}

/** Latest run + latest SUCCEEDED run per dataset (single query for a set of datasets). */
export async function latestRunsByDataset(datasetIds: string[]): Promise<Map<string, LatestRunInfo>> {
  const map = new Map<string, LatestRunInfo>()
  if (datasetIds.length === 0) return map
  for (const id of datasetIds) map.set(id, { latest: null, latestSucceeded: null, previousWeek: null })
  const runs = await db.validationRun.findMany({
    where: { datasetId: { in: datasetIds } },
    orderBy: { startedAt: 'desc' },
    take: Math.max(datasetIds.length * 40, 120),
  })
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000)
  for (const r of runs) {
    const info = map.get(r.datasetId)
    if (!info) continue
    if (!info.latest) info.latest = r
    if (!info.latestSucceeded && r.status === 'SUCCEEDED') info.latestSucceeded = r
    if (!info.previousWeek && info.latest && r.startedAt <= weekAgo && r.status === 'SUCCEEDED') info.previousWeek = r
  }
  return map
}

/** Recompute and persist slaBreached flags; returns the breached issues. */
export async function refreshSlaBreaches(datasetIds: string[]): Promise<Issue[]> {
  const now = new Date()
  const issues = await db.issue.findMany({
    where: { datasetId: { in: datasetIds }, status: { notIn: ['RESOLVED', 'CLOSED', 'REJECTED'] }, slaDueAt: { not: null } },
  })
  const breached = issues.filter((i) => i.slaDueAt && i.slaDueAt.getTime() < now.getTime())
  const toSet = breached.filter((i) => !i.slaBreached).map((i) => i.id)
  const toClear = await db.issue.findMany({
    where: { datasetId: { in: datasetIds }, slaBreached: true, OR: [{ status: { in: ['RESOLVED', 'CLOSED', 'REJECTED'] } }, { slaDueAt: { gte: now } }, { slaDueAt: null }] },
    select: { id: true },
  })
  if (toSet.length) await db.issue.updateMany({ where: { id: { in: toSet } }, data: { slaBreached: true } })
  if (toClear.length) await db.issue.updateMany({ where: { id: { in: toClear.map((i) => i.id) } }, data: { slaBreached: false } })
  return breached
}

/** Parse a query param into a bounded integer. */
export function intParam(v: string | null, fallback: number, max = 200): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}

export type { Severity }
