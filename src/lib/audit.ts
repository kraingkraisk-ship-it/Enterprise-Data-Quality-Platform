// Immutable audit event writer. Every critical action must call recordAudit.
// Records are append-only; the API never exposes update/delete for audit rows.
import { db } from '@/lib/db'
import { logger, newCorrelationId } from '@/lib/logger'

export interface AuditInput {
  actor: string
  actorRole: string
  action: string
  resourceType: string
  resourceId: string
  datasetId?: string | null
  detail?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
  correlationId?: string | null
}

export async function recordAudit(input: AuditInput): Promise<string> {
  const correlationId = input.correlationId ?? newCorrelationId()
  const row = await db.auditLog.create({
    data: {
      actor: input.actor,
      actorRole: input.actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      datasetId: input.datasetId ?? null,
      detail: (input.detail ?? {}) as object,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      correlationId,
    },
  })
  logger.info('audit.event', { action: input.action, actor: input.actor, resource: `${input.resourceType}:${input.resourceId}`, correlationId })
  return row.id
}

export const CRITICAL_AUDIT_ACTIONS = new Set([
  'LOGIN','LOGOUT','RULE_CREATE','RULE_SUBMIT','RULE_APPROVE','RULE_REJECT','RULE_ACTIVATE',
  'VALIDATION_RUN','ANOMALY_REVIEW','ISSUE_UPDATE','EXPORT','FILE_UPLOAD','FILE_REJECT',
  'GRANT_CHANGE','USER_ROLE_CHANGE','POLICY_UPDATE','MODEL_PROMOTE','MODEL_SHADOW','DATA_PREVIEW',
])
