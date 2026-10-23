/**
 * Data Element helpers (v0.18.0) — องค์ประกอบข้อมูลเชิงตรรกะภายใต้โดเมนย่อย
 * โครงสร้าง 4 ระดับ: Data Domain > Sub Data Domain > Data Element > Meta Data
 * หลักการ:
 * - Data Element ต้องแขวนใต้ "โดเมนย่อย" เสมอ (parentId != null) — บังคับใน API (deny-by-default)
 * - Meta Data อ้างอิงแนวคิด ISO/IEC 11179: Naming & Definition / Representation /
 *   Value Domain / Administrative attributes
 * - 1 element (เชิงตรรกะ) แมปได้หลายคอลัมน์ข้ามหลาย Data Asset
 * - สิทธิ์จัดการ: MANAGE_DATASETS เดิม (ไม่เพิ่มสิทธิ์ใหม่ตามการตัดสินใจของเจ้าของระบบ)
 */

/* ------------------------------------------------------------------ */
/* ค่าคงที่                                                            */
/* ------------------------------------------------------------------ */

export const ELEMENT_CODE_PREFIX = 'EL'
export const ELEMENT_NAME_MAX = 120
export const ELEMENT_TEXT_MAX = 500

/** ประเภทข้อมูลของ Data Element (ตรงกับ dataType ที่ระบบอนุมานจากคอลัมน์จริง) */
export const ELEMENT_DATA_TYPES = ['TEXT', 'INTEGER', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME'] as const
export type ElementDataType = (typeof ELEMENT_DATA_TYPES)[number]

export const ELEMENT_DATA_TYPE_LABELS: Record<ElementDataType, { th: string; en: string }> = {
  TEXT: { th: 'ข้อความ', en: 'Text' },
  INTEGER: { th: 'จำนวนเต็ม', en: 'Integer' },
  NUMBER: { th: 'จำนวนจริง', en: 'Number' },
  BOOLEAN: { th: 'ตรรกะ (จริง/เท็จ)', en: 'Boolean' },
  DATE: { th: 'วันที่', en: 'Date' },
  DATETIME: { th: 'วันที่และเวลา', en: 'Datetime' },
}

export function isElementDataType(v: string): v is ElementDataType {
  return (ELEMENT_DATA_TYPES as readonly string[]).includes(v)
}

/** สถานะทะเบียน (แนวคิด ISO 11179 registration status — ปรับให้เหมาะกับระบบ) */
export const ELEMENT_STATUSES = ['DRAFT', 'ACTIVE', 'DEPRECATED'] as const
export type ElementStatus = (typeof ELEMENT_STATUSES)[number]

export const ELEMENT_STATUS_LABELS: Record<ElementStatus, { th: string; en: string; chip: string }> = {
  DRAFT: { th: 'ร่าง', en: 'Draft', chip: 'border-amber-300 bg-amber-50 text-amber-800' },
  ACTIVE: { th: 'ใช้งาน', en: 'Active', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  DEPRECATED: { th: 'เลิกใช้', en: 'Deprecated', chip: 'border-slate-300 bg-slate-100 text-slate-600' },
}

export function isElementStatus(v: string): v is ElementStatus {
  return (ELEMENT_STATUSES as readonly string[]).includes(v)
}

/* ------------------------------------------------------------------ */
/* Types — รูปทรงข้อมูลที่ API คืนให้ UI                               */
/* ------------------------------------------------------------------ */

/** Data Element 1 รายการ (แบบรายการ — ใช้ในลิสต์ใต้โดเมนย่อย) */
export interface ElementItem {
  id: string
  code: string
  subDomainId: string
  nameTh: string
  nameEn: string
  definition: string
  examples: string
  dataType: string
  formatPattern: string
  valueDomain: string
  maxLength: number | null
  unit: string
  ownerId: string | null
  pii: boolean
  classification: string
  status: string
  position: number
  /** จำนวนกฎ DQ ที่ผูกกับ element นี้ */
  ruleCount: number
  /** จำนวนคอลัมน์จริงที่แมปไว้ */
  mappingCount: number
  createdAt: string
  updatedAt: string
}

/** การแมป element ↔ คอลัมน์จริง 1 รายการ */
export interface ElementMappingItem {
  id: string
  assetId: string
  assetName: string
  columnName: string
  note: string
}

/* ------------------------------------------------------------------ */
/* คลัง Meta Data ตัวอย่างตาม ISO/IEC 11179 — ใช้ทั้ง seed และ migration */
/* (แปลงการจัดหมวดรายคอลัมน์เดิม v0.15.0 เป็น Data Element โดยอัตโนมัติ)   */
/* ------------------------------------------------------------------ */

export interface ElementCatalogEntry {
  /** ชื่อโดเมนย่อย (ต้องตรงกับ seed/ข้อมูลจริง) */
  subDomain: string
  /** ชื่อคอลัมน์จริงใน asset ที่ entry นี้ครอบคลุม */
  columnName: string
  nameTh: string
  nameEn: string
  definition: string
  examples: string
  dataType: ElementDataType
  formatPattern?: string
  valueDomain?: string
  maxLength?: number
  unit?: string
  pii: boolean
}

export const ELEMENT_CATALOG: ElementCatalogEntry[] = [
  {
    subDomain: 'ลูกค้าบุคคลธรรมดา',
    columnName: 'customer_id',
    nameTh: 'รหัสลูกค้า',
    nameEn: 'Customer ID',
    definition: 'รหัสประจำตัวลูกค้ารายบุคคลที่ระบบกำหนดขึ้นเมื่อเปิดทะเบียน ใช้อ้างอิงเดียวกันทุกระบบ',
    examples: 'NC-1001',
    dataType: 'TEXT',
    formatPattern: 'NC-#### (NC ตามด้วยตัวเลข 4 หลัก)',
    valueDomain: 'รหัสที่ไม่ซ้ำกันทั้งระบบ',
    maxLength: 16,
    pii: false,
  },
  {
    subDomain: 'ลูกค้าบุคคลธรรมดา',
    columnName: 'full_name',
    nameTh: 'ชื่อ-นามสกุล',
    nameEn: 'Full Name',
    definition: 'ชื่อจริงและนามสกุลของลูกค้าตามบัตรประชาชน (ข้อมูลส่วนบุคคล — ปิดบังตามบทบาท)',
    examples: 'อนันต์ ใจดี',
    dataType: 'TEXT',
    maxLength: 120,
    pii: true,
  },
  {
    subDomain: 'ลูกค้าบุคคลธรรมดา',
    columnName: 'email',
    nameTh: 'อีเมล',
    nameEn: 'Email',
    definition: 'ที่อยู่อีเมลสำหรับติดต่อลูกค้า ต้องอยู่ในรูปแบบอีเมลที่ถูกต้อง',
    examples: 'anan.jaidee@example.co.th',
    dataType: 'TEXT',
    formatPattern: 'name@domain (มี @ คั่น 1 ครั้ง)',
    maxLength: 254,
    pii: true,
  },
  {
    subDomain: 'ลูกค้าบุคคลธรรมดา',
    columnName: 'phone',
    nameTh: 'เบอร์โทรศัพท์',
    nameEn: 'Phone Number',
    definition: 'เบอร์โทรศัพท์ติดต่อของลูกค้าในรูปแบบมาตรฐานของสาขา (รหัสพื้นที่-เลข 6 หลัก)',
    examples: '053-210-101',
    dataType: 'TEXT',
    formatPattern: '###-###-###',
    maxLength: 20,
    pii: true,
  },
  {
    subDomain: 'ลูกค้าบุคคลธรรมดา',
    columnName: 'branch',
    nameTh: 'สาขาที่สังกัด',
    nameEn: 'Branch',
    definition: 'ชื่อสาขาของธนาคารที่ลูกค้าเปิดทะเบียนไว้',
    examples: 'เชียงใหม่',
    dataType: 'TEXT',
    maxLength: 80,
    pii: false,
  },
  {
    subDomain: 'บัญชีและเงินฝาก',
    columnName: 'balance',
    nameTh: 'ยอดเงินคงเหลือ',
    nameEn: 'Account Balance',
    definition: 'ยอดเงินคงเหลือของบัญชีลูกค้า ณ วันที่ข้อมูลถูกดึงล่าสุด (หน่วย: บาท)',
    examples: '42500.50',
    dataType: 'NUMBER',
    unit: 'THB',
    valueDomain: '≥ 0',
    pii: false,
  },
  {
    subDomain: 'KYC / AML',
    columnName: 'kyc_date',
    nameTh: 'วันที่ทำ KYC',
    nameEn: 'KYC Date',
    definition: 'วันที่ลูกค้าทำการยืนยันตัวตน (KYC) ล่าสุดตามข้อกำหนด AML',
    examples: '2026-09-02',
    dataType: 'DATE',
    formatPattern: 'YYYY-MM-DD',
    pii: false,
  },
  {
    subDomain: 'อัตราแลกเปลี่ยน',
    columnName: 'currency',
    nameTh: 'สกุลเงิน',
    nameEn: 'Currency',
    definition: 'รหัสสกุลเงินสากล (ISO 4217) ของอัตราแลกเปลี่ยนรายวัน',
    examples: 'USD',
    dataType: 'TEXT',
    formatPattern: 'ตัวอักษรภาษาอังกฤษ 3 ตัวใหญ่',
    valueDomain: 'USD, EUR, JPY, GBP, SGD, CNY',
    maxLength: 3,
    pii: false,
  },
  {
    subDomain: 'อัตราแลกเปลี่ยน',
    columnName: 'buy',
    nameTh: 'อัตราซื้อ',
    nameEn: 'Buy Rate',
    definition: 'อัตราแลกเปลี่ยนฝั่งซื้อของสกุลเงินต่างประเทศ (หน่วย: บาท ต่อ 1 หน่วยสกุลเงิน)',
    examples: '33.12',
    dataType: 'NUMBER',
    unit: 'THB',
    valueDomain: '> 0',
    pii: false,
  },
  {
    subDomain: 'อัตราแลกเปลี่ยน',
    columnName: 'sell',
    nameTh: 'อัตราขาย',
    nameEn: 'Sell Rate',
    definition: 'อัตราแลกเปลี่ยนฝั่งขายของสกุลเงินต่างประเทศ (หน่วย: บาท ต่อ 1 หน่วยสกุลเงิน)',
    examples: '33.85',
    dataType: 'NUMBER',
    unit: 'THB',
    valueDomain: '> 0',
    pii: false,
  },
  {
    subDomain: 'อัตราแลกเปลี่ยน',
    columnName: 'date',
    nameTh: 'วันที่อัตราแลกเปลี่ยน',
    nameEn: 'Rate Date',
    definition: 'วันที่มีผลของอัตราแลกเปลี่ยน (รายวันทำการ)',
    examples: '2026-10-19',
    dataType: 'DATE',
    formatPattern: 'YYYY-MM-DD',
    pii: false,
  },
]

/** หา catalog entry จาก (โดเมนย่อย, คอลัมน์) — ใช้ตอน migration/seed */
export function findCatalogEntry(subDomainName: string, columnName: string): ElementCatalogEntry | undefined {
  return ELEMENT_CATALOG.find((e) => e.subDomain === subDomainName && e.columnName === columnName)
}

/** แปลงชื่อคอลัมน์ดิบเป็นชื่อที่อ่านง่าย (fallback เมื่อไม่มีในคลัง) — customer_id → "Customer Id" */
export function prettyColumnLabel(columnName: string): string {
  return columnName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ------------------------------------------------------------------ */
/* รหัสอัตโนมัติ EL-0001                                               */
/* ------------------------------------------------------------------ */

/** รูปทรงเล็กสุดที่ต้องมี (กัน lock-in กับ Prisma type ของ client แต่ละแหล่ง) */
interface CodeLookupDelegate {
  dataElement: {
    findFirst(args: { orderBy: { code: 'desc' }; select: { code: true } }): Promise<{ code: string } | null>
  }
}

/** สร้างรหัส element ถัดไป EL-0001, EL-0002 … (ตามลำดับตัวเลขสูงสุดที่มีอยู่) */
export async function nextElementCode(db: CodeLookupDelegate): Promise<string> {
  const last = await db.dataElement.findFirst({ orderBy: { code: 'desc' }, select: { code: true } })
  const n = last ? parseInt(last.code.replace(`${ELEMENT_CODE_PREFIX}-`, ''), 10) || 0 : 0
  return `${ELEMENT_CODE_PREFIX}-${String(n + 1).padStart(4, '0')}`
}

/* ------------------------------------------------------------------ */
/* Rollup คะแนนระดับ Element → Sub Domain → Domain (v0.18.0)            */
/* ------------------------------------------------------------------ */

/** ผลรัน 1 แถวที่ใช้คำนวณ rollup (จาก DqRun) */
export interface RollupRunInput {
  dataElementId: string
  totalRows: number
  passRate: number // 0–1
  status: string // PASSED | FAILED
}

export interface ElementRollup {
  elementId: string
  score: number | null // 0–100 (ถ่วงน้ำหนักจำนวนแถว) — null เมื่อไม่มีแถวเลย
  rulesCount: number
  failedRules: number
  totalRows: number
}

/**
 * คะแนนระดับ element = อัตราผ่านถ่วงน้ำหนักจำนวนแถวของทุกกฎ/ทุกชุดข้อมูลที่รันใน element นั้น
 * (กฎที่รันบน 0 แถว = ผ่านเต็ม แต่ไม่มีน้ำหนัก)
 */
export function rollupByElement(runs: RollupRunInput[]): Map<string, ElementRollup> {
  const acc = new Map<string, { weighted: number; rows: number; rules: number; failed: number }>()
  for (const r of runs) {
    const a = acc.get(r.dataElementId) ?? { weighted: 0, rows: 0, rules: 0, failed: 0 }
    a.weighted += r.passRate * r.totalRows
    a.rows += r.totalRows
    a.rules += 1
    if (r.status === 'FAILED') a.failed += 1
    acc.set(r.dataElementId, a)
  }
  const out = new Map<string, ElementRollup>()
  for (const [elementId, a] of acc) {
    out.set(elementId, {
      elementId,
      score: a.rows > 0 ? (a.weighted / a.rows) * 100 : null,
      rulesCount: a.rules,
      failedRules: a.failed,
      totalRows: a.rows,
    })
  }
  return out
}

/** คะแนนรวมจากหลาย rollup (สำหรับ sub-domain / domain) — ถ่วงน้ำหนักแถวต่อเนื่อง */
export function aggregateRollups(parts: Array<Pick<ElementRollup, 'score' | 'totalRows'>>): number | null {
  let weighted = 0
  let rows = 0
  for (const p of parts) {
    if (p.score === null) continue
    weighted += (p.score / 100) * p.totalRows
    rows += p.totalRows
  }
  return rows > 0 ? (weighted / rows) * 100 : null
}
