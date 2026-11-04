/**
 * Element Meta Data helpers (v0.20.0) — แปลง/ตรวจฟิลด์ Meta Data 4 หมวดตาม DAMA-DMBOK
 * Business / Technical / Operational / Governance
 *
 * หลักการ (ตามการตัดสินใจของเจ้าของระบบ):
 * - Business metadata = field ทะเบียนเดิม (nameTh/nameEn/definition/examples) — กรอกครั้งเดียว ไม่ซ้ำ
 * - Technical metadata ระดับ asset = databaseName/schemaName/tableName (แก้ที่ asset) · ระดับคอลัมน์ = primaryKey/nullable (ที่ mapping)
 * - Operational metadata = กรอกมือ (opLastLoadAt/opRecordsLoaded/opRejectedRecords/opJobStatus)
 *   และแสดง "ค่าจริงจากระบบ" คู่กัน (คำนวณจาก DqRun ณ ขณะอ่าน — ไม่เก็บซ้ำ)
 * - Governance metadata = owner เดิม (ownerId) + stewardId/custodianId จากผู้ใช้ในระบบ
 *   (คนละ 1 คนต่อบทบาท) + pii/classification เดิม + retention/accessPolicy/regulatory
 * - Flags เฉพาะที่มีผลต่อระบบ: isCritical (CDE) / isFinancial — ติดตามในแดชบอร์ดผู้บริหาร
 * - Approval workflow: แก้ Meta Data ใด ๆ จะรีเซ็ตสถานะเป็น PENDING ให้ยื่นอนุมัติใหม่เสมอ
 */

import { db } from '@/lib/db'
import { isElementJobStatus } from '@/lib/elements'

export const GOV_TEXT_MAX = 300

export interface OperationalFields {
  opLastLoadAt: Date | null
  opRecordsLoaded: number | null
  opRejectedRecords: number | null
  opJobStatus: string
}

export interface GovernanceFields {
  stewardId: string | null
  custodianId: string | null
  retentionPeriod: string
  accessPolicy: string
  regulatoryRequirements: string
  isCritical: boolean
  isFinancial: boolean
}

/** แปลงตัวเลขจาก body (null / '' / ไม่ใช่ตัวเลข → null) */
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

/** email จาก body (trim + lowercase · '' → null) */
function emailOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  return s || null
}

/** แปลงวันที่จาก body (ISO string หรือ datetime-local) — ไม่ผ่าน → null */
function dateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** ฟิลด์ Operational metadata (กรอกมือ) จาก body */
export function operationalFieldsFrom(body: Record<string, unknown>): OperationalFields {
  const jobStatus = String(body.opJobStatus ?? '').trim().toUpperCase()
  return {
    opLastLoadAt: dateOrNull(body.opLastLoadAt),
    opRecordsLoaded: intOrNull(body.opRecordsLoaded),
    opRejectedRecords: intOrNull(body.opRejectedRecords),
    opJobStatus: isElementJobStatus(jobStatus) ? jobStatus : '',
  }
}

/** ฟิลด์ Governance metadata + flags จาก body */
export function governanceFieldsFrom(body: Record<string, unknown>): GovernanceFields {
  return {
    stewardId: emailOrNull(body.stewardId),
    custodianId: emailOrNull(body.custodianId),
    retentionPeriod: String(body.retentionPeriod ?? '').trim().slice(0, GOV_TEXT_MAX),
    accessPolicy: String(body.accessPolicy ?? '').trim().slice(0, GOV_TEXT_MAX),
    regulatoryRequirements: String(body.regulatoryRequirements ?? '').trim().slice(0, GOV_TEXT_MAX),
    isCritical: Boolean(body.isCritical),
    isFinancial: Boolean(body.isFinancial),
  }
}

/**
 * ตรวจ Governance users (deny-by-default):
 * - ทุกอีเมลต้องเป็นบัญชีจริง + ACTIVE
 * - Owner / Steward / Custodian ต้องเป็น "คนละ 1 คนต่อบทบาท" — ห้ามใช้คนเดียวกันใน element เดียวกัน
 * คืนข้อความ error หรือ null
 */
export async function validateGovernanceUsers(
  ownerEmail: string | null,
  gov: Pick<GovernanceFields, 'stewardId' | 'custodianId'>,
): Promise<string | null> {
  const emails = [...new Set([ownerEmail, gov.stewardId, gov.custodianId].filter((e): e is string => Boolean(e)))]
  if (emails.length === 0) return null

  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { email: true, name: true, status: true } })
  const userMap = new Map(users.map((u) => [u.email, u]))

  const roleEntries: Array<{ role: string; email: string | null }> = [
    { role: 'Data Owner', email: ownerEmail },
    { role: 'Data Steward', email: gov.stewardId },
    { role: 'Data Custodian', email: gov.custodianId },
  ]
  for (const { role, email } of roleEntries) {
    if (!email) continue
    const user = userMap.get(email)
    if (!user) return `ไม่พบบัญชีผู้ใช้ "${email}" ในระบบ — กรุณาเลือกจากรายชื่อผู้ใช้เท่านั้น`
    if (user.status !== 'ACTIVE') return `บัญชี ${user.name} ถูกระงับการใช้งาน — ไม่สามารถตั้งเป็น ${role} ได้`
  }

  const assigned = roleEntries.filter((r) => r.email)
  if (new Set(assigned.map((r) => r.email)).size !== assigned.length) {
    return 'Owner / Steward / Custodian ต้องเป็นคนละคนกัน (คนละ 1 คนต่อบทบาท)'
  }
  return null
}

/** สรุปการเปลี่ยนแปลง Operational/Governance เพื่อบันทึก Audit Trail (ภาษาไทย) */
export function describeGovOpChanges(
  before: OperationalFields & GovernanceFields & { ownerId: string | null },
  after: OperationalFields & GovernanceFields & { ownerId: string | null },
): string[] {
  const changed: string[] = []
  const sameDate = (a: Date | null, b: Date | null) => (a === null && b === null) || (a !== null && b !== null && a.getTime() === b.getTime())
  if (!sameDate(before.opLastLoadAt, after.opLastLoadAt)) changed.push('Last Load Time')
  if (before.opRecordsLoaded !== after.opRecordsLoaded) changed.push('Records Loaded')
  if (before.opRejectedRecords !== after.opRejectedRecords) changed.push('Rejected Records')
  if (before.opJobStatus !== after.opJobStatus) changed.push('Job Status')
  if (before.ownerId !== after.ownerId) changed.push('Data Owner')
  if (before.stewardId !== after.stewardId) changed.push('Data Steward')
  if (before.custodianId !== after.custodianId) changed.push('Data Custodian')
  if (before.retentionPeriod !== after.retentionPeriod) changed.push('Retention Period')
  if (before.accessPolicy !== after.accessPolicy) changed.push('Access Policy')
  if (before.regulatoryRequirements !== after.regulatoryRequirements) changed.push('Regulatory Requirement')
  if (before.isCritical !== after.isCritical) changed.push(after.isCritical ? 'ตั้งธง CDE' : 'ถอนธง CDE')
  if (before.isFinancial !== after.isFinancial) changed.push(after.isFinancial ? 'ตั้งธง Financial' : 'ถอนธง Financial')
  return changed
}
