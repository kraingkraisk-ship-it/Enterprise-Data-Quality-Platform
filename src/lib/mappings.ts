/**
 * Data Mapping — Shared Library (v0.21.0)
 * ค่าคงที่และตัวช่วยสำหรับการแมป Data Element ต้นทาง → ปลายทาง
 * ใช้ร่วมกันทั้ง Backend (API) และ Frontend (Dialog element + หน้า Data Mapping)
 */

export const MAPPING_NAME_MAX = 500
export const MAPPING_TEXT_MAX = 500

/** สถานะของ Data Mapping (เปลี่ยนผ่าน workflow อนุมัติเท่านั้น — เหมือน Data Element) */
export const MAPPING_STATUSES = ['DRAFT', 'ACTIVE', 'DEPRECATED'] as const
export type MappingStatus = (typeof MAPPING_STATUSES)[number]

/**
 * ประเภทการแมป (v0.21.0) — อ้างอิง taxonomy มาตรฐานสากล:
 * - DAMA-DMBOK v2 หัวข้อ Data Integration & Interoperability (การจำแนก mapping ตามวิธีผลิตค่าปลายทาง)
 * - แนวปฏิบัติ ETL/Data Integration Mapping Specification (Direct / Derived / Aggregate / Transformation / Lookup-Crosswalk)
 *
 * DIRECT   — ข้อมูลชนิดเดียวกัน คัดลอกตรงโดยไม่เปลี่ยนแปลงค่า (1:1)
 * TRANSFORM — ความหมายเดียวกัน แต่แปลงรูปแบบ/หน่วย/การเข้ารหัส (เช่น รูปแบบวันที่, สกุลเงิน)
 * DERIVED  — ปลายทางคำนวณจากต้นทางตามสูตร/กฎ (เช่น อายุจากวันเกิด, ราคารวม VAT)
 * AGGREGATE — หลายแถว/หลายแหล่งสรุปเป็นค่าเดียว (เช่น ยอดขายรวมรายเดือน)
 * LOOKUP   — แมปผ่านตารางอ้างอิง/crosswalk (เช่น รหัสจังหวัดไทย → ISO 3166-2)
 */
export const MAPPING_TYPE_KEYS = ['DIRECT', 'RENAME', 'TRANSFORM', 'DERIVED', 'AGGREGATE', 'LOOKUP'] as const
export type MappingTypeKey = (typeof MAPPING_TYPE_KEYS)[number]

export const MAPPING_TYPES: Record<
  MappingTypeKey,
  { th: string; en: string; desc: string; example: string; requiresNote: boolean }
> = {
  DIRECT: {
    th: 'ตรง 1:1',
    en: 'Direct',
    desc: 'ข้อมูลชนิดเดียวกัน คัดลอกตรงโดยไม่เปลี่ยนแปลงค่า',
    example: 'รหัสลูกค้า → customer_id',
    requiresNote: false,
  },
  RENAME: {
    th: 'เปลี่ยนชื่อ',
    en: 'Direct/Rename',
    desc: 'ข้อมูลชนิดเดียวกัน ค่าเดิม แต่ต่างชื่อเรียก/ชื่อคอลัมน์ระหว่างระบบ (เติมกฎการแปลงได้ เช่น TRIM)',
    example: 'customer_no → customer_id (เปลี่ยนชื่อ + TRIM)',
    requiresNote: false,
  },
  TRANSFORM: {
    th: 'แปลงรูปแบบ',
    en: 'Transform',
    desc: 'ความหมายเดียวกัน แต่แปลงรูปแบบ/หน่วย/การเข้ารหัสของค่า',
    example: 'วันที่ DD/MM/YYYY → YYYY-MM-DD',
    requiresNote: true,
  },
  DERIVED: {
    th: 'คำนวณมา',
    en: 'Derived',
    desc: 'ค่าปลายทางคำนวณจากต้นทางตามสูตรหรือกฎที่กำหนด',
    example: 'วันเกิด → อายุ (คำนวณจากวันปัจจุบัน)',
    requiresNote: true,
  },
  AGGREGATE: {
    th: 'รวมข้อมูล',
    en: 'Aggregate',
    desc: 'หลายแถว/หลายแหล่งสรุปรวมเป็นค่าเดียวของปลายทาง',
    example: 'รายการสั่งซื้อ → ยอดขายรวมรายเดือน',
    requiresNote: true,
  },
  LOOKUP: {
    th: 'ผ่านตารางอ้างอิง',
    en: 'Lookup / Crosswalk',
    desc: 'แมปค่าผ่านตารางอ้างอิงหรือตารางแปลงรหัส (crosswalk)',
    example: 'รหัสจังหวัดไทย → รหัส ISO 3166-2',
    requiresNote: true,
  },
}

export function isMappingType(value: string): value is MappingTypeKey {
  return (MAPPING_TYPE_KEYS as readonly string[]).includes(value)
}

/**
 * การดำเนินการเมื่อกฎ DQ ตรวจไม่ผ่าน (v0.22.0 — อยู่ที่ "กฎ" แต่ละข้อ
 * แล้วหน้ารายละเอียด mapping สรุปรวมจากกฎที่ผูกกับ element ทั้งสองฝั่ง)
 */
export const EXCEPTION_ACTION_KEYS = ['REJECT_RECORD', 'CREATE_ISSUE', 'REJECT_AND_ISSUE', 'OTHER'] as const
export type ExceptionActionKey = (typeof EXCEPTION_ACTION_KEYS)[number]

export const EXCEPTION_ACTIONS: Record<ExceptionActionKey, { th: string; en: string; desc: string }> = {
  REJECT_RECORD: {
    th: 'ปฏิเสธรายการ',
    en: 'Reject record',
    desc: 'ไม่รับข้อมูลแถวนั้นเข้าระบบปลายทาง',
  },
  CREATE_ISSUE: {
    th: 'สร้าง DQ Incident',
    en: 'Create DQ incident',
    desc: 'เปิดเคสคุณภาพข้อมูลให้ทีมเจ้าของข้อมูลตรวจสอบต่อ',
  },
  REJECT_AND_ISSUE: {
    th: 'ปฏิเสธรายการ + สร้าง DQ Incident',
    en: 'Reject record and create DQ incident',
    desc: 'ปฏิเสธแถวข้อมูล และเปิดเคสให้ทีมตรวจสอบพร้อมกัน',
  },
  OTHER: {
    th: 'อื่น ๆ (ระบุ)',
    en: 'Other',
    desc: 'ระบุการดำเนินการเองในหมายเหตุ',
  },
}

export function isExceptionAction(value: string): value is ExceptionActionKey {
  return (EXCEPTION_ACTION_KEYS as readonly string[]).includes(value)
}

/**
 * รหัส mapping รุ่นใหม่ (v0.22.0): MAP-{DOMAIN}-{seq} เช่น MAP-CUST-001
 * — prefix มาจากชื่ออังกฤษของโดเมนหลัก "ฝั่งปลายทาง" ของ mapping (4 ตัวอักษรแรก A-Z0-9)
 * — รายการเดิม (v0.21.0) ใช้ MP-#### ต่อไป ไม่เปลี่ยนย้อนหลัง
 */
export function mappingCodePrefix(source: string): string {
  const cleaned = (source || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cleaned.length >= 2 ? cleaned.slice(0, 4) : 'GEN'
}

export function formatMappingCode(prefix: string, seq: number): string {
  return `MAP-${prefix}-${String(seq).padStart(3, '0')}`
}

/** เวอร์ชันสเปก (v0.22.0) — อัตโนมัติ +0.1 ทุกครั้งที่อนุมัติเนื้อหาที่แก้ไขหลังอนุมัติครั้งก่อน */
export const MAPPING_VERSION_PATTERN = /^\d+\.\d$/

export function isValidMappingVersion(value: string): boolean {
  return MAPPING_VERSION_PATTERN.test(value)
}

export function bumpMappingVersion(version: string): string {
  const n = Number.parseFloat(version)
  const base = Number.isFinite(n) && n > 0 ? n : 1
  return (Math.round((base + 0.1) * 10) / 10).toFixed(1)
}

/** ประกอบเส้นทางแบบเต็มของ element: โดเมนหลัก.โดเมนย่อย.ชื่อ element (เช่น CRM.customer_master.customer_no) */
export function buildElementPath(parts: {
  parentDomainName: string
  subDomainName: string
  elementName: string
}): string {
  return [parts.parentDomainName, parts.subDomainName, parts.elementName]
    .filter(Boolean)
    .join('.')
}
