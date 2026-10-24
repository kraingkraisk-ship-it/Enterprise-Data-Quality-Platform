/**
 * Reference Data helpers (v0.31.0) — ทะเบียนค่าอ้างอิงศูนย์กลาง (DAMA-DMBOK: Reference Data Management)
 * หลักการ:
 * - ค่ามาตรฐานขององค์กรอยู่ที่เดียว (ทะเบียน) — กฎ/Element/Mapping ที่ผูกไว้ใช้ค่าใหม่ทันที
 * - Workflow อนุมัติแบบเดียวกับ Data Element: DRAFT → (ส่ง) รออนุมัติ → ACTIVE → DEPRECATED
 *   (ผู้ส่ง = MANAGE_DATASETS · ผู้อนุมัติ = APPROVE_EXCEPTIONS — ไม่เพิ่มสิทธิ์ใหม่)
 * - เวอร์ชันทะเบียน +0.1 อัตโนมัติเมื่ออนุมัติเนื้อหาค่าที่แก้ไขหลังอนุมัติครั้งก่อน (เหมือน Data Mapping)
 * - ค่าเลิกใช้ด้วยสถานะ RETIRED ไม่ลบ — คงประวัติตรวจสอบย้อนหลังได้
 * - สิทธิ์จัดการ: MANAGE_DATASETS เดิม (เช่นเดียวกับ Data Element — ไม่เพิ่มสิทธิ์ใหม่)
 * ไฟล์นี้ client-safe (ไม่ import db ตรง ๆ — ฟังก์ชันที่ต้องใช้ DB รับ delegate เป็นพารามิเตอร์)
 */

/* ------------------------------------------------------------------ */
/* ค่าคงที่                                                            */
/* ------------------------------------------------------------------ */

export const REFERENCE_CODE_PREFIX = 'RD'
export const REFERENCE_NAME_MAX = 120
export const REFERENCE_TEXT_MAX = 500
export const REFERENCE_VALUE_MAX = 100 // ความยาวสูงสุดของ "ค่า" เช่น USD
export const REFERENCE_VALUES_CAP = 1000 // จำนวนค่าสูงสุดต่อทะเบียน (กันนำเข้าขนาดยักษ์โดยไม่ตั้งใจ)
export const REFERENCE_IMPORT_MAX_ROWS = 500 // จำนวนแถวสูงสุดต่อการนำเข้า CSV 1 ครั้ง
export const REFERENCE_SCAN_TOP_VALUES = 50 // จำนวน "ค่าแปลกปลอม" สูงสุดที่รายงานต่อการสแกน

/** สถานะทะเบียน (แบบเดียวกับ Data Element — ISO 11179 registration status) */
export const REFERENCE_STATUSES = ['DRAFT', 'ACTIVE', 'DEPRECATED'] as const
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number]

export const REFERENCE_STATUS_LABELS: Record<ReferenceStatus, { th: string; en: string; chip: string }> = {
  DRAFT: { th: 'ร่าง', en: 'Draft', chip: 'border-amber-300 bg-amber-50 text-amber-800' },
  ACTIVE: { th: 'ใช้งาน', en: 'Active', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  DEPRECATED: { th: 'เลิกใช้', en: 'Deprecated', chip: 'border-slate-300 bg-slate-100 text-slate-600' },
}

export function isReferenceStatus(v: string): v is ReferenceStatus {
  return (REFERENCE_STATUSES as readonly string[]).includes(v)
}

/** สถานะรายค่า — เลิกใช้ (RETIRED) แทนการลบ เพื่อคงประวัติ */
export const REFERENCE_VALUE_STATUSES = ['ACTIVE', 'RETIRED'] as const
export type ReferenceValueStatus = (typeof REFERENCE_VALUE_STATUSES)[number]

export const REFERENCE_VALUE_STATUS_LABELS: Record<ReferenceValueStatus, { th: string; en: string; chip: string }> = {
  ACTIVE: { th: 'ใช้งาน', en: 'Active', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  RETIRED: { th: 'เลิกใช้', en: 'Retired', chip: 'border-rose-300 bg-rose-50 text-rose-800' },
}

export function isReferenceValueStatus(v: string): v is ReferenceValueStatus {
  return (REFERENCE_VALUE_STATUSES as readonly string[]).includes(v)
}

/** เวอร์ชันทะเบียน (แบบเดียวกับ Data Mapping v0.22.0) — +0.1 ตอนอนุมัติเนื้อหาที่แก้ไข */
export const REFERENCE_VERSION_PATTERN = /^\d+\.\d$/

export function isValidReferenceVersion(value: string): boolean {
  return REFERENCE_VERSION_PATTERN.test(value)
}

export function bumpReferenceVersion(version: string): string {
  const n = Number.parseFloat(version)
  const base = Number.isFinite(n) && n > 0 ? n : 1
  return (Math.round((base + 0.1) * 10) / 10).toFixed(1)
}

/* ------------------------------------------------------------------ */
/* Types — รูปทรงข้อมูลที่ API คืนให้ UI                               */
/* ------------------------------------------------------------------ */

/** ทะเบียนข้อมูลอ้างอิง 1 รายการ (แบบรายการ) */
export interface ReferenceSetItem {
  id: string
  code: string
  name: string
  nameEn: string
  description: string
  subDomainId: string
  subDomainName: string
  parentDomainName: string | null
  ownerId: string | null
  stewardId: string | null
  status: string
  pendingApproval: boolean
  approvedBy: string | null
  approvedAt: string | null
  version: string
  /** จำนวนค่าทั้งหมด (ACTIVE + RETIRED) */
  valueCount: number
  /** จำนวนค่าที่ใช้งานอยู่ (ACTIVE) — ตัวที่เอนจินกฎใช้จริง */
  activeValueCount: number
  /** จำนวนกฎ DQ ที่ params.referenceSetId ชี้ทะเบียนนี้ */
  ruleCount: number
  /** จำนวน Data Element ที่ valueDomain ผูกทะเบียนนี้ */
  elementCount: number
  /** จำนวน Data Mapping แบบ LOOKUP ที่อ้างทะเบียนนี้ */
  mappingCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** ค่าอ้างอิง 1 ค่า */
export interface ReferenceValueItem {
  id: string
  setId: string
  value: string
  labelTh: string
  labelEn: string
  definition: string
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* รหัสอัตโนมัติ RD-0001                                               */
/* ------------------------------------------------------------------ */

/** รูปทรงเล็กสุดที่ต้องมี (กัน lock-in กับ Prisma type — เช่นเดียวกับ nextElementCode) */
interface CodeLookupDelegate {
  referenceSet: {
    findFirst(args: { orderBy: { code: 'desc' }; select: { code: true } }): Promise<{ code: string } | null>
  }
}

/** สร้างรหัสทะเบียนถัดไป RD-0001, RD-0002 … (ตามลำดับตัวเลขสูงสุดที่มีอยู่) */
export async function nextReferenceCode(db: CodeLookupDelegate): Promise<string> {
  const last = await db.referenceSet.findFirst({ orderBy: { code: 'desc' }, select: { code: true } })
  const n = last ? parseInt(last.code.replace(`${REFERENCE_CODE_PREFIX}-`, ''), 10) || 0 : 0
  return `${REFERENCE_CODE_PREFIX}-${String(n + 1).padStart(4, '0')}`
}

/* ------------------------------------------------------------------ */
/* CSV ของค่าอ้างอิง — ใช้ทั้งนำเข้า (import) และส่งออก (export)          */
/* รูปแบบ: value,labelTh,labelEn,definition (คั่นด้วย , รองรับ "คำพูด") */
/* ------------------------------------------------------------------ */

const VALUES_CSV_HEADER = ['value', 'labelTh', 'labelEn', 'definition'] as const

/** ตัว parser CSV เล็ก ๆ รองรับเครื่องหมายคำพูด (ภาษาไทยมักมี , ในนิยาม) — แถวเดียวต่อครั้ง */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export interface ParsedValueRow {
  value: string
  labelTh: string
  labelEn: string
  definition: string
}

export interface ParseValuesCsvResult {
  rows: ParsedValueRow[]
  /** แถวที่ข้ามพร้อมเหตุผล (ค่าว่าง / เกินความยาว) */
  skipped: Array<{ line: number; reason: string }>
}

/**
 * แปลงข้อความ CSV เป็นรายการค่าอ้างอิง
 * - ข้าม header อัตโนมัติถ้าแถวแรกเป็น "value,..." (ไม่สนตัวพิมพ์)
 * - แถวที่ value ว่างถูกข้ามพร้อมเหตุผล (ไม่ fail ทั้งไฟล์)
 */
export function parseValuesCsv(text: string): ParseValuesCsvResult {
  const rows: ParsedValueRow[] = []
  const skipped: ParseValuesCsvResult['skipped'] = []
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l !== '' || i < arr.length - 1)

  let started = false
  let lineNo = 0
  for (const line of lines) {
    lineNo++
    if (line.trim() === '') continue
    const cells = parseCsvLine(line).map((c) => c.trim())
    if (!started) {
      started = true
      // header เช่น value,labelTh,labelEn,definition — ข้าม
      if (cells[0]?.toLowerCase() === VALUES_CSV_HEADER[0]) continue
    }
    const value = (cells[0] ?? '').trim()
    if (!value) {
      skipped.push({ line: lineNo, reason: 'ค่า (value) ว่าง' })
      continue
    }
    if (value.length > REFERENCE_VALUE_MAX) {
      skipped.push({ line: lineNo, reason: `ค่ายาวเกิน ${REFERENCE_VALUE_MAX} ตัวอักษร` })
      continue
    }
    rows.push({
      value,
      labelTh: (cells[1] ?? '').slice(0, REFERENCE_TEXT_MAX),
      labelEn: (cells[2] ?? '').slice(0, REFERENCE_TEXT_MAX),
      definition: (cells[3] ?? '').slice(0, REFERENCE_TEXT_MAX),
    })
  }
  return { rows, skipped }
}

/** เรียงลำดับตามสถานะ (ACTIVE ก่อน RETIRED) แล้วตาม sortOrder → value — ใช้ทั้ง API และ export */
export function compareValueRows(a: { status: string; sortOrder: number; value: string }, b: { status: string; sortOrder: number; value: string }): number {
  if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.value.localeCompare(b.value)
}

/** CSV string สำหรับส่งออก (มี header — ผู้ใช้วนกลับเข้า import ได้ทันที) */
export function toValuesCsv(values: Array<{ value: string; labelTh: string; labelEn: string; definition: string; status: string }>): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const head = VALUES_CSV_HEADER.join(',')
  const body = values.map((v) => [v.value, v.labelTh, v.labelEn, v.definition].map((c) => esc(String(c ?? ''))).join(','))
  return [head, ...body].join('\n')
}

/** ชื่อไฟล์ส่งออก เช่น reference-values-RD-0001-20260119-1430.csv */
export function exportFileName(code: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, '-')
    .slice(0, 16)
  return `reference-values-${code}-${stamp}.csv`
}
