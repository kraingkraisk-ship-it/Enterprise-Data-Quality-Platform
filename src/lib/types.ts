// ─── Domain enums (string unions; DB stores strings for SQLite) ──────────────
export type Role =
  | 'SYSTEM_ADMIN' | 'DATA_OWNER' | 'DATA_STEWARD' | 'DATA_ENGINEER'
  | 'DATA_ANALYST' | 'DATA_SCIENTIST' | 'AUDITOR' | 'EXECUTIVE'

export const ROLES: Role[] = ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','DATA_SCIENTIST','AUDITOR','EXECUTIVE']

export type Classification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Dimension =
  | 'COMPLETENESS' | 'ACCURACY' | 'VALIDITY' | 'CONSISTENCY' | 'UNIQUENESS'
  | 'TIMELINESS' | 'INTEGRITY' | 'VOLUME' | 'SCHEMA_CONFORMITY'
export const DIMENSIONS: Dimension[] = ['COMPLETENESS','ACCURACY','VALIDITY','CONSISTENCY','UNIQUENESS','TIMELINESS','INTEGRITY','VOLUME','SCHEMA_CONFORMITY']

export type SourceType = 'CSV' | 'XLSX' | 'POSTGRESQL' | 'MSSQL' | 'REST_API'
export type RuleTemplate =
  | 'NOT_NULL' | 'REGEX' | 'RANGE' | 'IN_SET' | 'UNIQUE' | 'FRESHNESS'
  | 'ROW_COUNT' | 'SCHEMA_MATCH' | 'CROSS_FIELD' | 'REFERENTIAL'
export type RuleVersionStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETIRED'
export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PARTIAL'
export type ResultStatus = 'PASSED' | 'FAILED' | 'WARNING' | 'ERROR' | 'SKIPPED'
export type AnomalyType = 'NUMERIC_OUTLIER' | 'DUPLICATE' | 'SCHEMA_DRIFT' | 'DATA_DRIFT' | 'VOLUME_SHIFT'
export type ReviewStatus = 'PENDING' | 'CONFIRMED_ISSUE' | 'FALSE_POSITIVE'
export type ModelStage = 'REGISTERED' | 'VALIDATED' | 'SHADOW' | 'PROMOTED' | 'RETIRED'
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'RESOLVED' | 'CLOSED' | 'REJECTED'
export type IssueSourceType = 'RULE' | 'ML' | 'MANUAL' | 'SCHEMA_DRIFT'
export type ViewKey =
  | 'dashboard-executive' | 'dashboard-operational' | 'dashboard-engineering' | 'dashboard-ml' | 'dashboard-audit'
  | 'data-sources' | 'catalogue' | 'dataset-detail' | 'profiling'
  | 'rules' | 'rule-builder' | 'validations' | 'validation-detail'
  | 'anomalies' | 'issues' | 'ml-models' | 'reports' | 'audit-logs' | 'administration' | 'login'

// ─── Shared DTOs (API contract; api-client + routes + views all import these) ─

export interface UserDTO {
  id: string; email: string; name: string; nameTh?: string | null
  role: Role; businessUnit?: string | null; titleEn?: string | null; titleTh?: string | null
  mfaEnabled: boolean
}

export interface ColumnProfile {
  name: string; type: string; count: number; nullCount: number; nullRate: number
  distinct?: number; topValues?: { value: string; count: number }[]
  min?: number; max?: number; mean?: number; median?: number; stddev?: number
  p05?: number; p95?: number
}

export interface DatasetDTO {
  id: string; name: string; nameTh?: string | null; description: string
  domain: string; businessUnit: string; classification: Classification
  criticality: string; isCde: boolean; status: string; version: string
  rowCount: number; columnCount: number; piiFields: number; slaHours: number
  ownerId: string; stewardId: string; lastRefreshAt?: string | null; createdAt: string
  source?: { id: string; name: string; type: SourceType; health: string } | null
  qualityScore?: number | null; lastRunAt?: string | null; openIssues?: number
  activeRules?: number
}

export interface RuleDTO {
  id: string; code: string; datasetId: string; datasetName?: string
  name: string; nameTh?: string | null; dimension: Dimension; severity: Severity
  requiresApproval: boolean; isActive: boolean; currentVersion: number
  owner: string; templateKey?: RuleTemplate | null; tags?: string | null
  createdAt: string
  latestVersion?: {
    version: number; status: RuleVersionStatus; naturalSummaryEn: string; naturalSummaryTh: string
    approvedBy?: string | null; approvedAt?: string | null; effectiveFrom?: string | null
    definition: RuleDefinition
  }
}

export interface RuleDefinition {
  column?: string
  operator?: string // e.g. IS_NOT_NULL | MATCHES | BETWEEN | IN | NOT_IN | UNIQUE | WITHIN_HOURS | GREATER_THAN | LESS_THAN | EQUALS | SCHEMA_MATCH | REFERENCE_EXISTS
  parameters?: Record<string, unknown>
  condition?: string // optional filter expression, e.g. "segment = RETAIL"
  severity?: Severity
}

export interface ValidationRunDTO {
  id: string; datasetId: string; datasetName?: string; datasetVersion: string
  ruleSetVersion: string; trigger: string; status: RunStatus
  startedAt: string; completedAt?: string | null; durationMs?: number | null
  rowsEvaluated: number; rulesTotal: number; rulesPassed: number; rulesFailed: number
  qualityScore: number; coverage: number; executedBy: string; correlationId: string
  attempt: number; retriedFrom?: string | null
  dimensionResults?: Record<string, { passed: number; total: number; rate: number }>
}

export interface ResultEvidenceItem {
  row: number; column: string; valueMasked: string
  reasonEn: string; reasonTh: string
}

export interface ValidationResultDTO {
  id: string; runId: string; ruleId: string; ruleCode?: string; ruleName?: string
  ruleVersion: number; status: ResultStatus; passRate: number
  failedRows: number; evaluatedRows: number; durationMs: number
  evidence?: ResultEvidenceItem[] | null
  messageEn?: string | null; messageTh?: string | null
}

export interface AnomalyDTO {
  id: string; datasetId: string; datasetName?: string; datasetVersion: string
  type: AnomalyType; severity: Severity; score: number; rawStat?: string | null
  columnName?: string | null; rowKey?: string | null
  valueMasked?: string | null; expectedMasked?: string | null
  modelId?: string | null; modelName?: string | null; modelVersion?: string | null
  contributingFeatures?: { feature: string; contribution: number }[] | null
  explanationEn?: string | null; explanationTh?: string | null
  reviewStatus: ReviewStatus; reviewedBy?: string | null; reviewNote?: string | null
  status: string; detectedAt: string
}

export interface IssueDTO {
  id: string; key: string; datasetId: string; datasetName?: string
  title: string; titleTh?: string | null; description: string
  severity: Severity; status: IssueStatus; sourceType: IssueSourceType
  sourceRef?: string | null; dimension?: string | null
  slaDueAt?: string | null; slaBreached: boolean
  reportedBy: string; assignee?: string | null
  openedAt: string; resolvedAt?: string | null; resolutionNote?: string | null
  comments?: { id: string; author: string; body: string; createdAt: string }[]
}

export interface MLModelDTO {
  id: string; name: string; algorithm: string; version: string; stage: ModelStage
  trainedAt: string; metrics: { precision?: number; recall?: number; f1?: number; rocAuc?: number }
  params: Record<string, unknown>; trainingRows: number
  featureImportance: { feature: string; weight: number }[]
  shadowOfId?: string | null; isActive: boolean; scopeDatasetId?: string | null
  createdBy: string; createdAt: string
}

export interface AuditLogDTO {
  id: string; actor: string; actorRole: string; action: string
  resourceType: string; resourceId: string; datasetId?: string | null
  detail: Record<string, unknown>; ip?: string | null; correlationId?: string | null
  createdAt: string
}

export interface JobDTO {
  id: string; type: string; status: string; attempts: number; maxAttempts: number
  idempotencyKey: string; lastError?: string | null
  startedAt?: string | null; finishedAt?: string | null; createdAt: string
}

// BUGFIX (Task 2-e): PolicySetting was imported by api-client.ts but missing here.
export interface PolicySetting {
  key: string
  value: unknown
  descriptionEn?: string | null
  descriptionTh?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface DataSourceDTO {
  id: string; name: string; type: SourceType; status: string; health: string
  host?: string | null; connectionRef?: string | null; lastSyncAt?: string | null
  latencyP95Ms?: number | null; successRate?: number | null
  owner?: string | null; description?: string | null; datasetCount?: number
}

// ─── Dashboard payloads ───────────────────────────────────────────────────────

export interface ExecutiveDashboardDTO {
  overallScore: number; scoreTrend: { date: string; score: number }[]
  coverage: number; openIssues: number; slaBreached: number
  criticalDatasetsAtRisk: { id: string; name: string; domain: string; score: number; trend7d: number }[]
  businessUnitRisk: { unit: string; score: number; openIssues: number; criticalIssues: number }[]
  slaBreaches: { key: string; title: string; dataset: string; severity: Severity; dueAt: string; hoursOverdue: number }[]
  dimensionScores: { dimension: Dimension; rate: number }[]
  improving: boolean; delta30d: number
}

export interface OperationalDashboardDTO {
  datasetsNeedingAction: { id: string; name: string; score: number; failedRules: number; lastRunAt?: string | null }[]
  lateDatasets: { id: string; name: string; slaHours: number; hoursLate: number }[]
  schemaDrifts: { id: string; dataset: string; column: string; detailEn: string; detailTh: string; detectedAt: string; anomalyId: string }[]
  jobsAttention: JobDTO[]
  failedRules: { ruleCode: string; ruleName: string; dataset: string; passRate: number; failedRows: number; runId: string }[]
  kpis: { activeRules: number; runs24h: number; passRate24h: number; avgDurationMs: number; queueDepth: number; dlqCount: number }
}

export interface EngineeringDashboardDTO {
  sourceHealth: { id: string; name: string; type: string; health: string; latencyP95Ms?: number | null; successRate?: number | null; lastSyncAt?: string | null }[]
  jobStats: { queued: number; running: number; succeeded: number; failed: number; dead: number; cancelled: number }
  recentJobs: JobDTO[]
  schemaDriftCount: number
  runStats: { date: string; count: number; failed: number }[]
}

export interface MlDashboardDTO {
  models: MLModelDTO[]
  anomalyStats: { type: string; open: number; pendingReview: number }[]
  detectionTrend: { date: string; count: number }[]
  shadowComparisons: { candidate: string; champion: string; precisionDelta: number; recallDelta: number; f1Delta: number }[]
}

export interface AuditDashboardDTO {
  criticalEvents: AuditLogDTO[]
  eventCounts: { action: string; count: number }[]
  actorStats: { actor: string; actions: number; lastSeen?: string | null }[]
  exportEvents: number; rejectEvents: number
  evidenceCompleteness: number // % of critical actions with correlation id
}

// ─── RBAC permission matrix (deny by default) ─────────────────────────────────
export type Permission =
  | 'VIEW_DASHBOARD' | 'VIEW_DATASET' | 'MANAGE_DATASET' | 'MANAGE_SOURCE'
  | 'VIEW_RULE' | 'CREATE_RULE' | 'SUBMIT_RULE' | 'APPROVE_RULE' | 'ACTIVATE_RULE'
  | 'RUN_VALIDATION' | 'VIEW_VALIDATION' | 'VIEW_ANOMALY' | 'REVIEW_ANOMALY'
  | 'MANAGE_ISSUE' | 'VIEW_ISSUE' | 'VIEW_ML' | 'MANAGE_ML'
  | 'VIEW_AUDIT' | 'EXPORT_REPORT' | 'ADMIN_USERS' | 'ADMIN_POLICY' | 'UPLOAD_FILE' | 'VIEW_PROFILE'

const ALL: Permission[] = ['VIEW_DASHBOARD','VIEW_DATASET','MANAGE_DATASET','MANAGE_SOURCE','VIEW_RULE','CREATE_RULE','SUBMIT_RULE','APPROVE_RULE','ACTIVATE_RULE','RUN_VALIDATION','VIEW_VALIDATION','VIEW_ANOMALY','REVIEW_ANOMALY','MANAGE_ISSUE','VIEW_ISSUE','VIEW_ML','MANAGE_ML','VIEW_AUDIT','EXPORT_REPORT','ADMIN_USERS','ADMIN_POLICY','UPLOAD_FILE','VIEW_PROFILE']
const READ: Permission[] = ['VIEW_DASHBOARD','VIEW_DATASET','VIEW_RULE','VIEW_VALIDATION','VIEW_ANOMALY','VIEW_ISSUE','VIEW_ML','VIEW_AUDIT','EXPORT_REPORT','VIEW_PROFILE']
const NONE: Permission[] = []

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  SYSTEM_ADMIN: ALL,
  DATA_OWNER: [...READ, 'MANAGE_DATASET','APPROVE_RULE','ACTIVATE_RULE','RUN_VALIDATION','REVIEW_ANOMALY','MANAGE_ISSUE','UPLOAD_FILE'],
  DATA_STEWARD: [...READ, 'CREATE_RULE','SUBMIT_RULE','ACTIVATE_RULE','RUN_VALIDATION','REVIEW_ANOMALY','MANAGE_ISSUE','UPLOAD_FILE'],
  DATA_ENGINEER: [...READ, 'MANAGE_SOURCE','RUN_VALIDATION','UPLOAD_FILE'],
  DATA_ANALYST: ['VIEW_DASHBOARD','VIEW_DATASET','VIEW_RULE','VIEW_VALIDATION','VIEW_ANOMALY','VIEW_ISSUE','VIEW_PROFILE','EXPORT_REPORT'],
  DATA_SCIENTIST: [...READ, 'MANAGE_ML','REVIEW_ANOMALY'],
  AUDITOR: READ,
  EXECUTIVE: ['VIEW_DASHBOARD','VIEW_DATASET','VIEW_ISSUE','VIEW_ML','EXPORT_REPORT'],
}

export function hasPermission(role: Role | string, perm: Permission): boolean {
  const list = PERMISSION_MATRIX[role as Role] ?? NONE
  return list.includes(perm)
}

export function defaultHomeView(role: Role): ViewKey {
  switch (role) {
    case 'EXECUTIVE': return 'dashboard-executive'
    case 'AUDITOR': return 'dashboard-audit'
    case 'DATA_ENGINEER': return 'dashboard-engineering'
    case 'DATA_SCIENTIST': return 'dashboard-ml'
    default: return 'dashboard-operational'
  }
}

// Views each role can open (navigation is permission-filtered)
export const VIEW_ROLES: Record<ViewKey, Role[] | '*'> = {
  'login': '*',
  'dashboard-executive': ['EXECUTIVE','SYSTEM_ADMIN','DATA_OWNER','AUDITOR'],
  'dashboard-operational': ['DATA_STEWARD','DATA_OWNER','DATA_ENGINEER','DATA_ANALYST','SYSTEM_ADMIN','EXECUTIVE','DATA_SCIENTIST'],
  'dashboard-engineering': ['DATA_ENGINEER','SYSTEM_ADMIN'],
  'dashboard-ml': ['DATA_SCIENTIST','SYSTEM_ADMIN','DATA_ENGINEER','EXECUTIVE','AUDITOR'],
  'dashboard-audit': ['AUDITOR','SYSTEM_ADMIN','EXECUTIVE'],
  'data-sources': ['SYSTEM_ADMIN','DATA_ENGINEER'],
  'catalogue': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','DATA_SCIENTIST','AUDITOR','EXECUTIVE'],
  'dataset-detail': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','DATA_SCIENTIST','AUDITOR','EXECUTIVE'],
  'profiling': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','DATA_SCIENTIST'],
  'rules': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST'],
  'rule-builder': ['SYSTEM_ADMIN','DATA_STEWARD','DATA_OWNER'],
  'validations': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST'],
  'validation-detail': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','AUDITOR'],
  'anomalies': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','DATA_SCIENTIST','AUDITOR'],
  'issues': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ENGINEER','DATA_ANALYST','DATA_SCIENTIST','EXECUTIVE','AUDITOR'],
  'ml-models': ['SYSTEM_ADMIN','DATA_SCIENTIST','DATA_ENGINEER','EXECUTIVE','AUDITOR'],
  'reports': ['SYSTEM_ADMIN','DATA_OWNER','DATA_STEWARD','DATA_ANALYST','DATA_ENGINEER','DATA_SCIENTIST','AUDITOR','EXECUTIVE'],
  'audit-logs': ['AUDITOR','SYSTEM_ADMIN'],
  'administration': ['SYSTEM_ADMIN'],
}

export function canAccessView(role: Role, view: ViewKey): boolean {
  const allowed = VIEW_ROLES[view]
  return allowed === '*' || allowed.includes(role)
}

// ─── Policy defaults (configurable via Administration > Policy) ───────────────
export const POLICY_DEFAULTS: Record<string, unknown> = {
  'score.weights': { COMPLETENESS: 0.2, ACCURACY: 0.1, VALIDITY: 0.15, CONSISTENCY: 0.1, UNIQUENESS: 0.15, TIMELINESS: 0.1, INTEGRITY: 0.05, VOLUME: 0.05, SCHEMA_CONFORMITY: 0.1 },
  'score.coverageFloor': 0.6,        // below this CDE rule coverage, score is capped
  'score.criticalWeight': 2.0,       // failed CRITICAL rules weight multiplier
  'anomaly.scoreThreshold': 0.75,
  'duplicate.similarityThreshold': 0.9,
  'drift.psiThreshold': 0.2,
  'sla.hoursBySeverity': { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 },
  'upload.maxSizeMB': 20,
  'upload.allowedExtensions': ['.csv', '.xlsx'],
  'upload.retentionDays': 90,
  'ml.shadowDurationDays': 14,
  'masking.defaultMode': 'FULL',     // FULL | PARTIAL | NONE (NONE not allowed for PII)
  'rateLimit.perMinute': 120,
}
