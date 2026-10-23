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
export const MAPPING_TYPE_KEYS = ['DIRECT', 'TRANSFORM', 'DERIVED', 'AGGREGATE', 'LOOKUP'] as const
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

/** สร้างรหัส mapping ถัดไป MP-0001 … (ต่อจากรหัสสูงสุดที่มีอยู่) */
export function nextMappingCode(lastCode: string | undefined): string {
  const n = Number.parseInt(lastCode?.replace(/^MP-/, '') ?? '0', 10)
  const next = Number.isFinite(n) ? n + 1 : 1
  return `MP-${String(next).padStart(4, '0')}`
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
