/**
 * DQ Engine — Single Source of Truth ของระบบตรวจสอบคุณภาพข้อมูล
 * - นิยามเงื่อนไข (conditions) ของ Rule Builder + มิติคุณภาพข้อมูลที่เกี่ยวข้อง
 * - ประกอบประโยคกฎมาตรฐาน 5 ส่วน (For / must / using / when / otherwise)
 * - ประเมินกฎกับข้อมูลตัวอย่าง (sandbox rows) — ไม่แตะข้อมูลต้นทางจริงเสมอ
 * - สร้าง "สัญญาณ ML" แบบ deterministic — เป็นเพียงข้อแนะนำ ต้องมีมนุษย์ทบทวนเสมอ
 * - ปิดบัง PII ตามบทบาท (masking by default ตามหลัก PDPA)
 * ใช้ร่วมกันทั้ง Backend (API) และ Frontend (Core Features Console)
 */

import { hasPermission, ROLE_LIST, type PermissionKey, type RoleKey } from '@/lib/rbac'

/* ------------------------------ dimensions ------------------------------- */

export type DimensionKey =
  | 'COMPLETENESS'
  | 'ACCURACY'
  | 'VALIDITY'
  | 'CONSISTENCY'
  | 'UNIQUENESS'
  | 'TIMELINESS'
  | 'INTEGRITY'
  | 'VOLUME'
  | 'SCHEMA_CONFORMANCE'

export const DIMENSION_LABELS: Record<DimensionKey, { th: string; en: string }> = {
  COMPLETENESS: { th: 'ความสมบูรณ์', en: 'Completeness' },
  ACCURACY: { th: 'ความถูกต้อง', en: 'Accuracy' },
  VALIDITY: { th: 'ความถูกต้องตามรูปแบบ', en: 'Validity' },
  CONSISTENCY: { th: 'ความสอดคล้อง', en: 'Consistency' },
  UNIQUENESS: { th: 'ความไม่ซ้ำซ้อน', en: 'Uniqueness' },
  TIMELINESS: { th: 'ความทันเวลา', en: 'Timeliness' },
  INTEGRITY: { th: 'เอกภาพการอ้างอิง', en: 'Integrity Constraints' },
  VOLUME: { th: 'ปริมาณข้อมูล', en: 'Volume / Amount' },
  SCHEMA_CONFORMANCE: { th: 'การตรงตามโครงสร้าง', en: 'Schema Conformance' },
}

/* ------------------------------ conditions -------------------------------- */

export type ConditionKey =
  | 'NOT_NULL'
  | 'EMAIL'
  | 'REGEX'
  | 'RANGE'
  | 'IN_LIST'
  | 'UNIQUE'
  | 'MAX_AGE_DAYS'

export type SeverityKey = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface ConditionDefinition {
  key: ConditionKey
  th: string // คำอธิบายเงื่อนไข (ภาษาไทย)
  en: string
  /** ชิ้นส่วนประโยค "must ..." */
  sentence: string
  dimension: DimensionKey
  params: Array<{
    key: string
    label: string
    type: 'number' | 'text'
    placeholder?: string
  }>
}

export const CONDITIONS: Record<ConditionKey, ConditionDefinition> = {
  NOT_NULL: {
    key: 'NOT_NULL',
    th: 'ไม่มีค่าว่าง',
    en: 'Must not be empty',
    sentence: 'not be empty',
    dimension: 'COMPLETENESS',
    params: [],
  },
  EMAIL: {
    key: 'EMAIL',
    th: 'รูปแบบอีเมลถูกต้อง',
    en: 'Must be a valid email',
    sentence: 'be a valid email address',
    dimension: 'VALIDITY',
    params: [],
  },
  REGEX: {
    key: 'REGEX',
    th: 'ตรงตามรูปแบบที่กำหนด',
    en: 'Must match a pattern',
    sentence: 'match the pattern',
    dimension: 'VALIDITY',
    params: [{ key: 'pattern', label: 'รูปแบบ (Regular Expression)', type: 'text', placeholder: '^0[0-9]{9}$' }],
  },
  RANGE: {
    key: 'RANGE',
    th: 'อยู่ในช่วงตัวเลขที่กำหนด',
    en: 'Must be within a range',
    sentence: 'be within the range',
    dimension: 'ACCURACY',
    params: [
      { key: 'min', label: 'ค่าต่ำสุด', type: 'number' },
      { key: 'max', label: 'ค่าสูงสุด', type: 'number' },
    ],
  },
  IN_LIST: {
    key: 'IN_LIST',
    th: 'อยู่ในรายการค่าที่อนุญาต',
    en: 'Must be one of allowed values',
    sentence: 'be one of the allowed values',
    dimension: 'CONSISTENCY',
    params: [{ key: 'values', label: 'ค่าที่อนุญาต (คั่นด้วยเครื่องหมาย ,)', type: 'text', placeholder: 'ACTIVE, INACTIVE' }],
  },
  UNIQUE: {
    key: 'UNIQUE',
    th: 'ไม่ซ้ำกันในชุดข้อมูล',
    en: 'Must be unique',
    sentence: 'be unique across the dataset',
    dimension: 'UNIQUENESS',
    params: [],
  },
  MAX_AGE_DAYS: {
    key: 'MAX_AGE_DAYS',
    th: 'ข้อมูลไม่เก่าเกินกี่วัน',
    en: 'Must not be older than N days',
    sentence: 'not be older than',
    dimension: 'TIMELINESS',
    params: [{ key: 'days', label: 'จำนวนวันที่ยอมรับได้', type: 'number', placeholder: '7' }],
  },
}

export const CONDITION_KEYS = Object.keys(CONDITIONS) as ConditionKey[]

export const SEVERITY_LABELS: Record<SeverityKey, { th: string; className: string }> = {
  CRITICAL: { th: 'วิกฤต', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  HIGH: { th: 'สูง', className: 'bg-orange-50 text-orange-800 border-orange-200' },
  MEDIUM: { th: 'ปานกลาง', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  LOW: { th: 'ต่ำ', className: 'bg-slate-50 text-slate-700 border-slate-200' },
}

export const SEVERITY_KEYS: SeverityKey[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export function isConditionKey(v: string): v is ConditionKey {
  return (CONDITION_KEYS as string[]).includes(v)
}

export function isSeverityKey(v: string): v is SeverityKey {
  return (SEVERITY_KEYS as string[]).includes(v)
}

/* --------------------------- rule sentence -------------------------------- */

export interface RuleLike {
  datasetName?: string
  dataset?: { name?: string } | null
  column: string
  condition: string
  parameters: string
  severity: string
  filter?: string | null
}

function formatParamValue(condition: ConditionKey, params: Record<string, unknown>): string {
  switch (condition) {
    case 'RANGE':
      return `[${String(params.min ?? '?')} – ${String(params.max ?? '?')}]`
    case 'IN_LIST': {
      const raw = String(params.values ?? '')
      return `[${raw}]`
    }
    case 'MAX_AGE_DAYS':
      return `${String(params.days ?? '?')} days`
    case 'REGEX':
      return `/${String(params.pattern ?? '')}/`
    default:
      return ''
  }
}

/** ประกอบประโยคกฎมาตรฐาน: For [Dataset], [Column] must [Condition] using [Parameters] when [Filter], otherwise mark as [Severity] */
export function buildRuleSentence(rule: RuleLike): string {
  const datasetName = rule.datasetName ?? rule.dataset?.name ?? '[Dataset]'
  const cond = isConditionKey(rule.condition) ? CONDITIONS[rule.condition] : null
  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(rule.parameters || '{}') as Record<string, unknown>
  } catch {
    params = {}
  }
  const usingPart = cond ? formatParamValue(cond.key, params) : '[Parameters]'
  const severityTh = isSeverityKey(rule.severity) ? SEVERITY_LABELS[rule.severity].th : rule.severity

  let sentence = `For ${datasetName}, ${rule.column} must ${cond?.sentence ?? '[Condition]'}`
  if (usingPart) sentence += ` using ${usingPart}`
  if (rule.filter) sentence += ` when ${rule.filter}`
  sentence += `, otherwise mark as ${severityTh} (${rule.severity})`
  return sentence
}

/* ---------------------------- evaluation ---------------------------------- */

export type Row = Record<string, unknown>

export interface RuleEvaluation {
  totalRows: number
  failedIndexes: number[]
  failedRows: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function valueOf(row: Row, column: string): unknown {
  return row[column]
}

/** ประเมินกฎเดียวกับแถวข้อมูลทั้งหมด (sandbox) */
export function evaluateRule(
  rule: { column: string; condition: string; parameters: string },
  rows: Row[],
): RuleEvaluation {
  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(rule.parameters || '{}') as Record<string, unknown>
  } catch {
    params = {}
  }
  const failedIndexes: number[] = []

  // สำหรับ UNIQUE — เก็บค่าที่เจอแล้ว
  const seen = new Map<string, number>()

  rows.forEach((row, idx) => {
    const value = valueOf(row, rule.column)
    let failed = false

    switch (rule.condition) {
      case 'NOT_NULL':
        failed = value === null || value === undefined || String(value).trim() === ''
        break
      case 'EMAIL':
        failed = value === null || value === undefined || !EMAIL_RE.test(String(value).trim())
        break
      case 'REGEX': {
        const pattern = String(params.pattern ?? '')
        try {
          const re = new RegExp(pattern)
          failed = value === null || value === undefined || !re.test(String(value ?? '').trim())
        } catch {
          failed = true // pattern ไม่ถูกต้องถือว่ากฎพัง — แจ้งเป็น fail เพื่อให้ทบทวน
        }
        break
      }
      case 'RANGE': {
        const min = Number(params.min)
        const max = Number(params.max)
        const num = Number(value)
        failed = value === null || value === undefined || String(value).trim() === '' || Number.isNaN(num) || num < min || num > max
        break
      }
      case 'IN_LIST': {
        const allowed = String(params.values ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        failed = value === null || value === undefined || !allowed.includes(String(value).trim())
        break
      }
      case 'UNIQUE': {
        const key = String(value ?? '').trim()
        if (key === '') {
          failed = true
        } else if (seen.has(key)) {
          failed = true
        } else {
          seen.set(key, idx)
        }
        break
      }
      case 'MAX_AGE_DAYS': {
        const days = Number(params.days)
        const date = new Date(String(value ?? ''))
        failed =
          value === null ||
          value === undefined ||
          String(value).trim() === '' ||
          Number.isNaN(date.getTime()) ||
          Number.isNaN(days) ||
          (Date.now() - date.getTime()) / 86_400_000 > days
        break
      }
      default:
        failed = true
    }

    if (failed) failedIndexes.push(idx)
  })

  return { totalRows: rows.length, failedIndexes, failedRows: failedIndexes.length }
}

/* --------------------------- ML signals ----------------------------------- */

export interface MlSignalDraft {
  kind: 'ML_ANOMALY'
  dimension: DimensionKey
  title: string
  detail: string
  severity: SeverityKey
}

/** ตรวจ outlier แบบ IQR — deterministic ทำซ้ำได้ (ใช้แทนโมเดลจริงใน demo) */
function detectNumericOutliers(column: string, rows: Row[]): Array<{ index: number; value: number }> {
  const nums = rows
    .map((r, i) => ({ index: i, num: Number(r[column]) }))
    .filter((x) => !Number.isNaN(x.num) && x.num !== null)
  if (nums.length < 8) return []

  const values = nums.map((n) => n.num).sort((a, b) => a - b)
  const q1 = values[Math.floor(values.length * 0.25)]
  const q3 = values[Math.floor(values.length * 0.75)]
  const iqr = q3 - q1
  const low = q1 - 1.5 * iqr
  const high = q3 + 1.5 * iqr
  return nums.filter((n) => n.num < low || n.num > high)
}

/** ตรวจ near-duplicate: ค่า text ต่างกันเล็กน้อย (trim + lowercase + ลบช่องว่าง) */
function detectFuzzyDuplicates(column: string, rows: Row[]): Array<{ value: string; indexes: number[] }> {
  const groups = new Map<string, number[]>()
  rows.forEach((row, idx) => {
    const v = String(row[column] ?? '').trim().toLowerCase().replace(/\s+/g, '')
    if (!v) return
    const arr = groups.get(v) ?? []
    arr.push(idx)
    groups.set(v, arr)
  })
  return [...groups.entries()]
    .filter(([, idxs]) => idxs.length > 1)
    .map(([value, indexes]) => ({ value, indexes }))
}

/**
 * สร้างสัญญาณ ML จากข้อมูล — ทุกสัญญาณเป็นข้อแนะนำเท่านั้น (PENDING_REVIEW)
 * ระบบไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
 */
export function generateMlSignals(rows: Row[]): MlSignalDraft[] {
  const signals: MlSignalDraft[] = []
  if (rows.length === 0) return signals

  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]

  // 1) Schema conformance — คอลัมน์ที่ขาดหายในบางแถว
  for (const col of columns) {
    const missing = rows.filter((r) => !(col in r) || r[col] === undefined).length
    if (missing > 0 && missing < rows.length) {
      signals.push({
        kind: 'ML_ANOMALY',
        dimension: 'SCHEMA_CONFORMANCE',
        title: `โครงสร้างคอลัมน์ ${col} ไม่คงที่`,
        detail: `พบ ${missing}/${rows.length} แถวที่ไม่มีคอลัมน์ ${col} — อาจเกิด schema drift จากแหล่งข้อมูล (สัญญาณ AI — รอมนุษย์ทบทวน)`,
        severity: 'HIGH',
      })
      break
    }
  }

  // 2) Numeric outliers (IQR)
  for (const col of columns) {
    const outliers = detectNumericOutliers(col, rows)
    if (outliers.length > 0 && outliers.length <= Math.ceil(rows.length * 0.15)) {
      const sample = outliers.slice(0, 3).map((o) => `แถว #${o.index + 1} = ${o.num}`).join(', ')
      signals.push({
        kind: 'ML_ANOMALY',
        dimension: 'ACCURACY',
        title: `ค่าผิดปกติ (outlier) ในคอลัมน์ ${col}`,
        detail: `โมเดลตรวจพบค่าห่างจากกรอบ IQR ${outliers.length} แถว (${sample}) — โปรดทบทวนก่อนดำเนินการ (สัญญาณ AI ไม่ได้แก้ไขข้อมูล)`,
        severity: 'MEDIUM',
      })
      break
    }
  }

  // 3) Fuzzy duplicates ในคอลัมน์ text ที่ไม่ใช่ id หลัก
  for (const col of columns) {
    if (/^(.*_)?id$/i.test(col)) continue
    const dups = detectFuzzyDuplicates(col, rows)
    if (dups.length > 0) {
      const d = dups[0]
      signals.push({
        kind: 'ML_ANOMALY',
        dimension: 'UNIQUENESS',
        title: `ระเบียนคล้ายกันมากในคอลัมน์ ${col}`,
        detail: `พบค่า “${d.value}” ซ้ำกัน ${d.indexes.length} แถว (แถว #${d.indexes.map((i) => i + 1).join(', #')}) — อาจเป็นระเบียนซ้ำ โปรดทบทวน (สัญญาณ AI)`,
        severity: 'MEDIUM',
      })
      break
    }
  }

  // 4) Volume check — จำนวนแถวผิดปกติ (ต่ำกว่าคาดมากเทียบจำนวนคอลัมน์)
  if (rows.length > 0 && rows.length < columns.length * 2) {
    signals.push({
      kind: 'ML_ANOMALY',
      dimension: 'VOLUME',
      title: 'ปริมาณข้อมูลต่ำกว่าที่คาดหวัง',
      detail: `ชุดข้อมูลมีเพียง ${rows.length} แถว (${columns.length} คอลัมน์) — อาจมีข้อมูลหายระหว่างนำเข้า (สัญญาณ AI — รอมนุษย์ทบทวน)`,
      severity: 'LOW',
    })
  }

  return signals
}

/* --------------------------- PII masking ---------------------------------- */

/** บทบาทที่ได้เห็น PII แบบไม่ปิดบัง (least privilege) */
export const PII_UNMASKED_ROLES: RoleKey[] = [
  'DATA_OWNER',
  'DATA_STEWARD',
  'DQ_ANALYST',
  'COMPLIANCE_OFFICER',
  'SYS_ADMIN',
]

export function canSeePii(role: string): boolean {
  return PII_UNMASKED_ROLES.includes(role as RoleKey)
}

function maskEmail(v: string): string {
  const at = v.indexOf('@')
  if (at <= 0) return '•'.repeat(v.length)
  const name = v.slice(0, at)
  const domain = v.slice(at)
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 3))}${domain}`
}

function maskPhone(v: string): string {
  return v.replace(/[0-9]/g, (d, i) => (i < 3 ? d : '•'))
}

function maskName(v: string): string {
  return `${v.slice(0, 1)}${'•'.repeat(Math.max(v.length - 1, 2))}`
}

/** เขตข้อมูลที่ถือเป็น PII (ใช้ทั้ง seed และ masking) */
export const PII_FIELD_HINTS: Record<string, (v: string) => string> = {
  email: maskEmail,
  phone: maskPhone,
  full_name: maskName,
  name: maskName,
  account_no: () => '••••-••••',
  national_id: () => 'x-xxxx-xxxxx-xx-x',
}

/** ปิดบัง PII ตามบทบาท — ทำฝั่ง backend เสมอ (ห้ามส่ง PII ให้บทบาทที่ไม่มีสิทธิ์) */
export function maskRowByRole(row: Row, role: string, piiEnabled: boolean): Row {
  const masked: Row = { ...row }
  if (!piiEnabled || canSeePii(role)) return masked
  for (const [field, masker] of Object.entries(PII_FIELD_HINTS)) {
    if (field in masked && typeof masked[field] === 'string' && masked[field]) {
      masked[field] = masker(String(masked[field]))
    }
  }
  return masked
}

/** ปิดบังค่าเดี่ยวตามคอลัมน์ + บทบาท — ใช้กับตัวอย่างแถวที่ล้มเหลวในผลรัน */
export function maskValueByRole(column: string, value: unknown, role: string, piiEnabled: boolean): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (!piiEnabled || s === '' || canSeePii(role)) return s
  const masker = PII_FIELD_HINTS[column]
  return masker ? masker(s) : s
}

/* ------------------------- permission gate -------------------------------- */

/** ตรวจว่าบทบาทมีสิทธิ์หรือไม่ — ใช้ใน API ทุกเส้นที่เปลี่ยนสถานะ */
export function permitted(role: string, permission: PermissionKey): boolean {
  return hasPermission(role, permission)
}

/** บทบาททั้งหมดที่มีสิทธิ์นี้ — ใช้แสดงข้อความ 403 ที่ชัดเจนแก่ผู้ใช้ */
export function rolesWithPermission(permission: PermissionKey): Array<{ key: RoleKey; th: string; en: string }> {
  return ROLE_LIST.filter((r) => r.permissions.includes(permission)).map((r) => ({
    key: r.key,
    th: r.th,
    en: r.en,
  }))
}
