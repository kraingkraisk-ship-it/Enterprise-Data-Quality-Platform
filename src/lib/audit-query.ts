/**
 * Audit query builder (v0.30.0) — แปลง query params ของ /api/audit* เป็น Prisma where
 * ใช้ร่วมกันระหว่าง route รายการ (GET /api/audit) และ route ส่งออก CSV (GET /api/audit/export)
 * เพื่อให้ทั้งสองฝั่ง "เห็นผลการกรองชุดเดียวกัน" — ส่งออกตรงกับที่เห็นบนจอเสมอ (หลัก footnote เดียว)
 */
import { Prisma } from '@prisma/client'
import { AUDIT_ACTIONS, AUDIT_GROUPS, AUDIT_GROUP_ORDER, actionsOfGroups, type AuditGroupKey } from './audit-actions'

/** วันแบบ YYYY-MM-DD → Date (เริ่มวันหรือสิ้นวัน) — รูปแบบไม่ถูก = null (ข้ามตัวกรองนั้น) */
export function parseDayParam(v: string | null, endOfDay = false): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(endOfDay ? `${v}T23:59:59.999` : `${v}T00:00:00.000`)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface AuditFilterResult {
  where: Prisma.AuditLogWhereInput
  /** คำอธิบายตัวกรองภาษาไทย (ใช้แสดงบนจอ / บันทึก CSV) */
  summary: string
  /** จำนวนเงื่อนไขที่ใช้จริง */
  count: number
}

/**
 * สร้าง where จาก params:
 * - groups  csv กลุ่ม (rbac/asset/rule/dq/ml/system) → ขยายเป็น action ทั้งกลุ่มตามคลังกลาง
 * - actions csv action เฉพาะ (เสริมจาก groups ได้)
 * - actor   ผู้กระทำ (match บางส่วน)
 * - q       ค้นข้อความใน detail/target/action
 * - from/to YYYY-MM-DD (รวมทั้งวัน)
 */
export function buildAuditWhere(sp: URLSearchParams): AuditFilterResult {
  const parts: string[] = []

  const groupKeys = (sp.get('groups') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((g): g is AuditGroupKey => (AUDIT_GROUP_ORDER as string[]).includes(g))
  const explicitActions = (sp.get('actions') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((a) => a in AUDIT_ACTIONS)

  const allActions = [...new Set([...(groupKeys.length > 0 ? actionsOfGroups(groupKeys) : []), ...explicitActions])]
  if (allActions.length > 0) {
    parts.push(groupKeys.length > 0 ? `กลุ่ม ${groupKeys.map((g) => AUDIT_GROUPS[g].th).join(' + ')}` : `action เฉพาะ ${allActions.length} ชนิด`)
  }

  const actor = (sp.get('actor') ?? '').trim()
  if (actor) parts.push(`ผู้กระทำมีคำ "${actor}"`)

  const q = (sp.get('q') ?? '').trim()
  if (q) parts.push(`ค้นหา "${q}"`)

  const from = parseDayParam(sp.get('from'))
  const to = parseDayParam(sp.get('to'), true)
  if (from) parts.push(`ตั้งแต่ ${from.toISOString().slice(0, 10)}`)
  if (to) parts.push(`ถึง ${to.toISOString().slice(0, 10)}`)

  const where: Prisma.AuditLogWhereInput = {}
  if (allActions.length > 0) where.action = { in: allActions }
  if (actor) where.actor = { contains: actor }
  if (q) {
    // action เก็บเป็นตัวพิมพ์ใหญ่เสมอ — ส่งคำค้นแบบพิมพ์ใหญ่ช่วยให้ LIKE ของ SQLite เจอ (ASCII case-insensitive อยู่แล้วสำหรับ detail/target)
    where.OR = [{ detail: { contains: q } }, { target: { contains: q } }, { action: { contains: q.toUpperCase() } }]
  }
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

  return { where, summary: parts.length > 0 ? parts.join(' · ') : 'ทุกรายการ (ไม่กรอง)', count: parts.length }
}
