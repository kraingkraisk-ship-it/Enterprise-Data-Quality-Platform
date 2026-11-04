// Typed API client — single contract shared by every view. All requests are
// same-origin relative paths; errors are normalised into ApiError.
import type {
  UserDTO, DatasetDTO, RuleDTO, ValidationRunDTO, ValidationResultDTO, AnomalyDTO,
  IssueDTO, MLModelDTO, AuditLogDTO, DataSourceDTO, JobDTO, PolicySetting,
  ExecutiveDashboardDTO, OperationalDashboardDTO, EngineeringDashboardDTO,
  MlDashboardDTO, AuditDashboardDTO, ColumnProfile, RuleDefinition, Role,
} from '@/lib/types'

export class ApiError extends Error {
  status: number
  auditId?: string
  constructor(status: number, message: string, auditId?: string) {
    super(message)
    this.status = status
    this.auditId = auditId
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `Request failed (${res.status})`, (body as { auditId?: string }).auditId)
  return body as T
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const api = {
  me: () => req<{ user: UserDTO | null }>('/api/auth/me'),
  personas: () => req<{ users: (UserDTO & { active: boolean })[] }>('/api/auth/personas'),
  login: (userId: string) => req<{ user: UserDTO }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ userId }) }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  listUsers: () => req<{ users: (UserDTO & { active: boolean })[] }>('/api/admin/users'),

  // Catalogue & datasets
  datasets: (params: { q?: string; domain?: string; classification?: string; status?: string } = {}) =>
    req<{ datasets: DatasetDTO[] }>(`/api/datasets?${qs(params)}`),
  dataset: (id: string) => req<{ dataset: DatasetDTO; columns: { id: string; name: string; dataType: string; nullable: boolean; isPii: boolean; piiType?: string | null; classification?: string | null; description?: string | null; isCde: boolean; position: number }[] }>(`/api/datasets/${id}`),
  datasetTabs: (id: string, tab: string, extra: Record<string, string | undefined> = {}) =>
    req<Record<string, unknown>>(`/api/datasets/${id}/tabs?tab=${encodeURIComponent(tab)}&${qs(extra)}`),
  profileHistory: (id: string) => req<{ profiles: { id: string; createdAt: string; rowCount: number; nullRateAvg: number; duplicateRate: number; columns: ColumnProfile[] }[] }>(`/api/datasets/${id}/profiles`),
  runProfiling: (id: string) => req<{ jobId: string; deduplicated: boolean }>(`/api/datasets/${id}/profiles`, { method: 'POST' }),

  // Data sources
  sources: () => req<{ sources: DataSourceDTO[] }>('/api/sources'),
  createSource: (body: Record<string, unknown>) => req<{ source: DataSourceDTO }>('/api/sources', { method: 'POST', body: JSON.stringify(body) }),

  // Rules
  rules: (params: { datasetId?: string; dimension?: string; status?: string; severity?: string; q?: string } = {}) =>
    req<{ rules: RuleDTO[] }>(`/api/rules?${qs(params)}`),
  createRule: (body: Record<string, unknown>) => req<{ rule: RuleDTO; versionId: string }>('/api/rules', { method: 'POST', body: JSON.stringify(body) }),
  rule: (id: string) => req<{ rule: RuleDTO; versions: { id: string; version: number; status: string; naturalSummaryEn: string; naturalSummaryTh: string; createdBy: string; approvedBy?: string | null; approvedAt?: string | null; effectiveFrom?: string | null; createdAt: string; definition: RuleDefinition }[] }>(`/api/rules/${id}`),
  submitRuleVersion: (ruleId: string, versionId: string) => req<{ ok: boolean }>(`/api/rules/${ruleId}/versions/${versionId}/submit`, { method: 'POST' }),
  approveRuleVersion: (ruleId: string, versionId: string, approve: boolean, reason?: string) =>
    req<{ ok: boolean }>(`/api/rules/${ruleId}/versions/${versionId}/approve`, { method: 'POST', body: JSON.stringify({ approve, reason }) }),
  activateRule: (ruleId: string) => req<{ ok: boolean }>(`/api/rules/${ruleId}/activate`, { method: 'POST' }),
  deactivateRule: (ruleId: string) => req<{ ok: boolean }>(`/api/rules/${ruleId}/deactivate`, { method: 'POST' }),
  testRule: (body: { datasetId: string; definition: RuleDefinition; templateKey?: string }) =>
    req<{ status: string; passRate: number; failedRows: number; evaluatedRows: number; evidence: { row: number; column: string; valueMasked: string; reasonEn: string; reasonTh: string }[]; messageEn?: string; messageTh?: string }>('/api/rules/test', { method: 'POST', body: JSON.stringify(body) }),
  newRuleVersion: (ruleId: string, body: Record<string, unknown>) => req<{ versionId: string }>(`/api/rules/${ruleId}/versions`, { method: 'POST', body: JSON.stringify(body) }),

  // Validation
  validations: (params: { datasetId?: string; status?: string; q?: string; limit?: number } = {}) =>
    req<{ runs: ValidationRunDTO[] }>(`/api/validations?${qs(params)}`),
  validation: (id: string) => req<{ run: ValidationRunDTO; results: ValidationResultDTO[] }>(`/api/validations/${id}`),
  runValidation: (body: { datasetId: string; ruleIds?: string[]; trigger?: string }) =>
    req<{ runId: string | null; correlationId: string }>(`/api/validations`, { method: 'POST', body: JSON.stringify(body) }),

  // Anomalies
  anomalies: (params: { datasetId?: string; type?: string; reviewStatus?: string; status?: string } = {}) =>
    req<{ anomalies: AnomalyDTO[] }>(`/api/anomalies?${qs(params)}`),
  reviewAnomaly: (id: string, body: { reviewStatus: string; note?: string }) =>
    req<{ ok: boolean }>(`/api/anomalies/${id}/review`, { method: 'POST', body: JSON.stringify(body) }),
  scanAnomalies: (datasetId: string) => req<{ jobId: string }>(`/api/anomalies/scan`, { method: 'POST', body: JSON.stringify({ datasetId }) }),

  // Issues
  issues: (params: { datasetId?: string; status?: string; severity?: string; q?: string } = {}) =>
    req<{ issues: IssueDTO[] }>(`/api/issues?${qs(params)}`),
  createIssue: (body: Record<string, unknown>) => req<{ issue: IssueDTO }>('/api/issues', { method: 'POST', body: JSON.stringify(body) }),
  updateIssue: (id: string, body: { status?: string; assignee?: string; resolutionNote?: string; comment?: string }) =>
    req<{ ok: boolean }>(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // ML
  models: () => req<{ models: MLModelDTO[] }>('/api/ml-models'),
  registerModel: (body: Record<string, unknown>) => req<{ model: MLModelDTO }>('/api/ml-models', { method: 'POST', body: JSON.stringify(body) }),
  setModelStage: (id: string, body: { stage: string }) => req<{ ok: boolean }>(`/api/ml-models/${id}/stage`, { method: 'POST', body: JSON.stringify(body) }),

  // Dashboards
  dashboardExecutive: () => req<ExecutiveDashboardDTO>('/api/dashboards/executive'),
  dashboardOperational: () => req<OperationalDashboardDTO>('/api/dashboards/operational'),
  dashboardEngineering: () => req<EngineeringDashboardDTO>('/api/dashboards/engineering'),
  dashboardMl: () => req<MlDashboardDTO>('/api/dashboards/ml'),
  dashboardAudit: () => req<AuditDashboardDTO>('/api/dashboards/audit'),

  // Reports & audit
  exportReport: (body: { type: string; datasetId?: string; format?: string }) =>
    req<{ downloadUrl: string; auditId: string; classification: string; maskingLevel: string; expiresAt: string }>('/api/reports/export', { method: 'POST', body: JSON.stringify(body) }),
  auditLogs: (params: { q?: string; action?: string; actor?: string; limit?: number } = {}) =>
    req<{ logs: AuditLogDTO[] }>(`/api/audit-logs?${qs(params)}`),

  // Admin
  policy: () => req<{ settings: PolicySetting[] }>('/api/admin/policy'),
  updatePolicy: (key: string, value: unknown) => req<{ ok: boolean }>('/api/admin/policy', { method: 'POST', body: JSON.stringify({ key, value }) }),
  setUserRole: (userId: string, role: Role) => req<{ ok: boolean }>(`/api/admin/users/${userId}/role`, { method: 'POST', body: JSON.stringify({ role }) }),
  grantDataset: (body: { userId: string; datasetId: string; level: string; reason?: string }) =>
    req<{ ok: boolean }>('/api/admin/grants', { method: 'POST', body: JSON.stringify(body) }),
  jobs: (params: { status?: string; type?: string; limit?: number } = {}) => req<{ jobs: JobDTO[] }>(`/api/jobs?${qs(params)}`),
  cancelJob: (id: string) => req<{ ok: boolean }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  search: (q: string) => req<{ datasets: { id: string; name: string }[]; rules: { id: string; code: string; name: string }[]; issues: { id: string; key: string; title: string }[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  notifications: () => req<{ notifications: { id: string; titleEn: string; titleTh: string; bodyEn: string; bodyTh: string; severity: string; readAt?: string | null; link?: string | null; createdAt: string }[] }>('/api/notifications'),
  markNotificationRead: (id: string) => req<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  upload: (formData: FormData) => req<{ status: string; auditId?: string; rejectReasonEn?: string; rejectReasonTh?: string; file?: { id: string; originalName: string; sizeBytes: number; scanStatus: string } }>('/api/upload', { method: 'POST', body: formData }),
  health: () => req<{ status: string; checks: Record<string, string> }>('/api/health'),
}
