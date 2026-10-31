/**
 * DQ Engine — Single Source of Truth ของระบบตรวจสอบคุณภาพข้อมูล
 * - นิยามเงื่อนไข (conditions) ของ Rule Builder + มิติคุณภาพข้อมูลที่เกี่ยวข้อง
 * - ประกอบประโยคกฎมาตรฐาน 5 ส่วน (For / must / using / when / otherwise)
 * - ประเมินกฎกับข้อมูลตัวอย่าง (sandbox rows) — ไม่แตะข้อมูลต้นทางจริงเสมอ
 * - สร้าง "คำแนะนำจาก ML" แบบ deterministic — เป็นเพียงข้อแนะนำ ระบบไม่แก้ไขข้อมูลอัตโนมัติ
 * - ปิดบัง PII ตามบทบาท (masking by default ตามหลัก PDPA)
 * ใช้ร่วมกันทั้ง Backend (API) และ Frontend (Core Features Console)
 */

import { hasPermission, ROLE_LIST, type PermissionKey, type RoleKey } from '@/lib/rbac'

/* ------------------------------ dimensions ------------------------------- */

/**
 * มิติคุณภาพข้อมูล 9 มิติ — อ้างอิงกรอบมาตรฐาน DAMA-DMBOK
 * (1) Accuracy (2) Completeness (3) Consistency (4) Validity (5) Uniqueness
 * (6) Integrity (7) Timeliness (8) Currentness (9) Reasonableness
 */
export type DimensionKey =
  | 'ACCURACY'
  | 'COMPLETENESS'
  | 'CONSISTENCY'
  | 'VALIDITY'
  | 'UNIQUENESS'
  | 'INTEGRITY'
  | 'TIMELINESS'
  | 'CURRENTNESS'
  | 'REASONABLENESS'

export interface DimensionMeta {
  /** ชื่อภาษาไทย */
  th: string
  /** ชื่อภาษาอังกฤษ (ตาม DAMA-DMBOK) */
  en: string
  /** คำถามสั้น ๆ ช่วยผู้ใช้เลือกมิติให้ถูก */
  question: string
  /** คำอธิบายหนึ่งประโยค */
  description: string
  /** ตัวอย่างการตรวจที่พบบ่อย */
  examples: string[]
  /** เอนจินที่แนะนำให้ใช้กับมิตินี้ */
  recommendedEngines: ConditionKey[]
  /** คลาสสีของ badge/card (เขียนเป็น literal เพื่อให้ Tailwind scan เจอ) */
  badgeClass: string
  /** ไอคอน (key) — map เป็น component ใน dimension-picker.tsx */
  icon: string
}

/** ข้อมูลครบของทั้ง 9 มิติ — แหล่งเดียวที่ UI ทุกจุดอ้างอิง */
export const DIMENSION_META: Record<DimensionKey, DimensionMeta> = {
  ACCURACY: {
    th: 'ความถูกต้อง',
    en: 'Accuracy',
    question: 'ค่านี้ตรงกับความจริงหรือแหล่งอ้างอิงหรือไม่?',
    description: 'ข้อมูลถูกต้องตรงตามความเป็นจริงหรือแหล่งข้อมูลมาตรฐาน เช่น รหัสกลุ่มลูกค้า ยอดเงิน ที่อยู่',
    examples: ['รหัสกลุ่มลูกค้าตรงตามมาตรฐานที่กำหนด', 'ค่าที่บันทึกต้องตรงกับระบบต้นทาง'],
    recommendedEngines: ['REFERENCE_MATCH', 'IN_LIST', 'REGEX'],
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: 'target',
  },
  COMPLETENESS: {
    th: 'ความสมบูรณ์',
    en: 'Completeness',
    question: 'ข้อมูลมีครบทุกฟิลด์/ทุกระเบียนที่จำเป็นหรือไม่?',
    description: 'ไม่มีค่าว่างหรือระเบียนหายในฟิลด์ที่จำเป็นต้องมี',
    examples: ['อีเมลลูกค้าห้ามว่าง', 'ทุกระเบียนต้องมีรหัสประจำตัว'],
    recommendedEngines: ['NOT_NULL'],
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    icon: 'clipboard-check',
  },
  CONSISTENCY: {
    th: 'ความสอดคล้อง',
    en: 'Consistency',
    question: 'ข้อมูลสอดคล้องกันทั้งระบบหรือไม่?',
    description: 'ค่า/รูปแบบ/โครงสร้างเหมือนกันทุกชุดข้อมูลและข้ามระบบ เช่น สถานะใช้ชุดรหัสเดียวกัน',
    examples: ['สถานะธุรกรรมใช้รหัสเดียวกันทุกระบบ', 'สกุลเงินต้องอยู่ในรายการที่ระบบรองรับ'],
    recommendedEngines: ['IN_LIST', 'REGEX'],
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    icon: 'layers',
  },
  VALIDITY: {
    th: 'ความถูกต้องตามรูปแบบ',
    en: 'Validity',
    question: 'รูปแบบ/ชนิดข้อมูลถูกต้องตามข้อกำหนดหรือไม่?',
    description: 'ข้อมูลอยู่ในรูปแบบหรือโดเมนที่กำหนด เช่น อีเมล หมายเลขโทรศัพท์ รหัสไปรษณีย์',
    examples: ['อีเมลต้องมีรูปแบบถูกต้อง', 'เบอร์โทรไทย 10 หลักขึ้นต้นด้วย 0'],
    recommendedEngines: ['EMAIL', 'REGEX'],
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    icon: 'shield-check',
  },
  UNIQUENESS: {
    th: 'ความไม่ซ้ำซ้อน',
    en: 'Uniqueness',
    question: 'มีค่าหรือระเบียนซ้ำกันหรือไม่?',
    description: 'ไม่มีระเบียนหรือค่าซ้ำซ้อนในชุดข้อมูลเดียวกัน',
    examples: ['รหัสธุรกรรมห้ามซ้ำ', 'อีเมลหนึ่งคนหนึ่งระเบียน'],
    recommendedEngines: ['UNIQUE'],
    badgeClass: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
    icon: 'fingerprint',
  },
  INTEGRITY: {
    th: 'ความเชื่อมโยงถูกต้อง',
    en: 'Integrity',
    question: 'การอ้างอิงข้ามตาราง/ระบบถูกต้องหรือไม่?',
    description: 'ค่าที่อ้างอิงถึงข้อมูลอื่นต้องมีอยู่จริงและสัมพันธ์ถูกต้อง (Referential Integrity)',
    examples: ['รหัสสาขาต้องมีอยู่ในทะเบียนสาขาหลัก', 'รหัสลูกค้าต้องมีในระบบหลัก'],
    recommendedEngines: ['EXISTS_IN_DATASET', 'IN_LIST'],
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: 'link',
  },
  TIMELINESS: {
    th: 'ความทันเวลา',
    en: 'Timeliness',
    question: 'ข้อมูลมาถึง/พร้อมใช้ตามเวลาที่กำหนดหรือไม่?',
    description: 'ข้อมูลอัปเดตตามรอบเวลาที่กำหนด เช่น รายวัน รายชั่วโมง ตาม SLA',
    examples: ['ข้อมูลต้องอัปเดตตามรอบรายวัน', 'ไฟล์รายวันต้องมาไม่เกินเวลาที่กำหนด'],
    recommendedEngines: ['MAX_AGE_HOURS'],
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    icon: 'clock',
  },
  CURRENTNESS: {
    th: 'ความเป็นปัจจุบัน',
    en: 'Currentness',
    question: 'ข้อมูลยังใหม่ ไม่ค้างเก่าหรือไม่?',
    description: 'ข้อมูลเป็นเวอร์ชันล่าสุด ไม่เก่ากว่าหน้าต่างเวลาที่ยอมรับได้ (ความสดของข้อมูล)',
    examples: ['วันที่ทำรายการไม่เก่าเกิน 30 วัน', 'ราคาสินค้าอัปเดตไม่เกิน 7 วัน'],
    recommendedEngines: ['MAX_AGE_DAYS'],
    badgeClass: 'bg-lime-50 text-lime-800 border-lime-200',
    icon: 'calendar-clock',
  },
  REASONABLENESS: {
    th: 'ความสมเหตุสมผล',
    en: 'Reasonableness',
    question: 'ค่านี้สมเหตุสมผล ไม่ผิดปกติเกินคาดหรือไม่?',
    description: 'ค่าอยู่ในกรอบที่สมเหตุสมผลตามธุรกิจ เช่น จำนวนไม่ติดลบ อายุ 0–120 ปี',
    examples: ['วงเงินเครดิตอยู่ในช่วง 0–1,000,000', 'จำนวนเงินธุรกรรมไม่ติดลบ'],
    recommendedEngines: ['RANGE', 'REGEX'],
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: 'gauge',
  },
}

export const DIMENSION_KEYS = Object.keys(DIMENSION_META) as DimensionKey[]

/** เอนจินประเมินผลที่อยู่ในแต่ละมิติ (จัดกลุ่มตาม CONDITIONS[c].dimension) — ใช้ใน EnginePicker */
export const DIMENSION_ENGINES: Record<DimensionKey, ConditionKey[]> = Object.fromEntries(
  DIMENSION_KEYS.map((k) => [k, [] as ConditionKey[]]),
) as Record<DimensionKey, ConditionKey[]>
// หมายเหตุ: เติมกลุ่มเอนจินต่อท้ายไฟล์ หลังประกาศ CONDITIONS ครบแล้ว (fillDimensionEngines)

/** ป้ายชื่อมิติ (th/en) — อนุพันธ์จาก DIMENSION_META เพื่อให้เป็นแหล่งเดียวกัน */
export const DIMENSION_LABELS: Record<DimensionKey, { th: string; en: string }> = Object.fromEntries(
  DIMENSION_KEYS.map((k) => [k, { th: DIMENSION_META[k].th, en: DIMENSION_META[k].en }]),
) as Record<DimensionKey, { th: string; en: string }>

/* ------------------------------ conditions -------------------------------- */

export type ConditionKey =
  | 'NOT_NULL'
  | 'EMAIL'
  | 'REGEX'
  | 'RANGE'
  | 'IN_LIST'
  | 'UNIQUE'
  | 'MAX_AGE_DAYS'
  | 'REFERENCE_MATCH'
  | 'MAX_AGE_HOURS'
  | 'EXISTS_IN_DATASET'

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
  /** ชนิดพารามิเตอร์: number = ช่องตัวเลข, text = ช่องข้อความ, dataset = เลือกชุดข้อมูลอ้างอิง, dataset-column = เลือกคอลัมน์ของชุดข้อมูลอ้างอิง,
   *  reference-set = เลือกทะเบียนข้อมูลอ้างอิง (โหมดทะเบียน v0.31.0) */
    type: 'number' | 'text' | 'dataset' | 'dataset-column' | 'reference-set'
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
    dimension: 'REASONABLENESS',
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
    params: [
      { key: 'values', label: 'ค่าที่อนุญาต (คั่นด้วยเครื่องหมาย ,)', type: 'text', placeholder: 'ACTIVE, INACTIVE' },
      // โหมดทะเบียน (v0.31.0) — เลือกทะเบียนอ้างอิงแทนการพิมพ์ค่า: แก้ค่าที่ทะเบียน กฎใช้ค่าใหม่ทันที
      { key: 'referenceSetId', label: 'หรือเลือกจากทะเบียนข้อมูลอ้างอิง', type: 'reference-set' },
    ],
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
    dimension: 'CURRENTNESS',
    params: [{ key: 'days', label: 'จำนวนวันที่ยอมรับได้', type: 'number', placeholder: '7' }],
  },
  REFERENCE_MATCH: {
    key: 'REFERENCE_MATCH',
    th: 'ตรงกับค่ามาตรฐานจากระบบต้นทาง',
    en: 'Must match reference values',
    sentence: 'match the reference value from the trusted source system',
    dimension: 'ACCURACY',
    params: [
      { key: 'values', label: 'ค่ามาตรฐานจากระบบต้นทาง (คั่นด้วยเครื่องหมาย ,)', type: 'text', placeholder: 'ENTERPRISE, SME, RETAIL' },
      // โหมดทะเบียน (v0.31.0) — ค่ามาตรฐานจากทะเบียนข้อมูลอ้างอิง (single source of truth)
      { key: 'referenceSetId', label: 'หรือเลือกจากทะเบียนข้อมูลอ้างอิง', type: 'reference-set' },
    ],
  },
  MAX_AGE_HOURS: {
    key: 'MAX_AGE_HOURS',
    th: 'ข้อมูลไม่เก่าเกินกี่ชั่วโมง',
    en: 'Must not be older than N hours',
    sentence: 'not be older than',
    dimension: 'TIMELINESS',
    params: [{ key: 'hours', label: 'จำนวนชั่วโมงที่ยอมรับได้ (ตาม SLA)', type: 'number', placeholder: '72' }],
  },
  EXISTS_IN_DATASET: {
    key: 'EXISTS_IN_DATASET',
    th: 'มีอยู่จริงในชุดข้อมูลอ้างอิง',
    en: 'Must exist in reference dataset',
    sentence: 'exist in the reference dataset column',
    dimension: 'INTEGRITY',
    params: [
      { key: 'refDatasetId', label: 'ชุดข้อมูลอ้างอิง (ทะเบียนหลัก)', type: 'dataset' },
      { key: 'refColumn', label: 'คอลัมน์ในชุดข้อมูลอ้างอิง', type: 'dataset-column' },
    ],
  },
}

export const CONDITION_KEYS = Object.keys(CONDITIONS) as ConditionKey[]

/** เติมกลุ่มเอนจินของแต่ละมิติ (ใช้โดย EnginePicker — จัดกลุ่มตามมิติ) */
function fillDimensionEngines(): void {
  for (const key of CONDITION_KEYS) {
    DIMENSION_ENGINES[CONDITIONS[key].dimension].push(key)
  }
}
fillDimensionEngines()

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

export function isDimensionKey(v: string): v is DimensionKey {
  return (Object.keys(DIMENSION_LABELS) as string[]).includes(v)
}

/* ------------------------ condition templates ------------------------------ */

/** นิยามพารามิเตอร์ของเงื่อนไขส่วนกลาง (เก็บเป็น JSON ใน ConditionTemplate.params) */
export interface TemplateParamDef {
  key: string
  label: string
  /** number = ช่องตัวเลข, text = ช่องข้อความ, dataset = เลือกชุดข้อมูลอ้างอิง, dataset-column = เลือกคอลัมน์ของชุดข้อมูลอ้างอิง,
   *  reference-set = เลือกทะเบียนข้อมูลอ้างอิง (โหมดทะเบียน v0.31.0) */
  type: 'number' | 'text' | 'dataset' | 'dataset-column' | 'reference-set'
  placeholder?: string
}

/** ชนิดพารามิเตอร์ที่ระบบรองรับทั้งหมด — ใช้ตรวจฝั่ง API */
export const TEMPLATE_PARAM_TYPES: TemplateParamDef['type'][] = ['number', 'text', 'dataset', 'dataset-column', 'reference-set']

/** แปลง JSON string เป็นรายการนิยามพารามิเตอร์ — คืน [] หาก JSON ไม่ถูกต้อง (fail-safe) */
export function parseTemplateParams(json: string): TemplateParamDef[] {
  try {
    const arr = JSON.parse(json || '[]') as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (p): p is TemplateParamDef =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as TemplateParamDef).key === 'string' &&
          typeof (p as TemplateParamDef).label === 'string',
      )
      .map((p) => ({
        key: p.key,
        label: p.label,
        type: (TEMPLATE_PARAM_TYPES as string[]).includes(p.type as string)
          ? (p.type as TemplateParamDef['type'])
          : 'text',
        placeholder: typeof p.placeholder === 'string' ? p.placeholder : undefined,
      }))
  } catch {
    return []
  }
}

/** ข้อความอธิบายเอนจินประเมินผล — ใช้ในฟอร์มสร้างเงื่อนไขส่วนกลาง */
export const ENGINE_DESCRIPTIONS: Record<ConditionKey, string> = {
  NOT_NULL: 'ค่าว่างถือว่าล้มเหลว (ไม่ต้องมีพารามิเตอร์)',
  EMAIL: 'ตรวจรูปแบบอีเมล (ไม่ต้องมีพารามิเตอร์)',
  REGEX: 'ตรวจด้วย Regular Expression — ต้องมีพารามิเตอร์ pattern',
  RANGE: 'ตรวจช่วงตัวเลข — ต้องมีพารามิเตอร์ min และ max',
  IN_LIST: 'ตรวจค่าในรายการที่อนุญาต — ต้องมีพารามิเตอร์ values หรือ referenceSetId (โหมดทะเบียน)',
  UNIQUE: 'ตรวจค่าซ้ำในชุดข้อมูล (ไม่ต้องมีพารามิเตอร์)',
  MAX_AGE_DAYS: 'ตรวจอายุข้อมูล (วัน) — ต้องมีพารามิเตอร์ days',
  REFERENCE_MATCH: 'ตรวจว่าค่าตรงกับค่ามาตรฐานที่ระบบต้นทางยืนยัน — ต้องมีพารามิเตอร์ values หรือ referenceSetId (โหมดทะเบียน — ใช้ค่าจากทะเบียนข้อมูลอ้างอิง)',
  MAX_AGE_HOURS: 'ตรวจอายุข้อมูลแบบชั่วโมง (ตาม SLA เช่น feed รายชั่วโมง) — ต้องมีพารามิเตอร์ hours',
  EXISTS_IN_DATASET: 'ตรวจ Referential Integrity — ค่าต้องมีอยู่จริงในคอลัมน์ของชุดข้อมูลอ้างอิง (ต้องมีพารามิเตอร์ refDatasetId และ refColumn)',
}

/** คีย์พารามิเตอร์ที่เอนจินบังคับ — ใช้ตรวจขณะสร้างเงื่อนไขส่วนกลางใหม่ */
export const ENGINE_REQUIRED_PARAM_KEYS: Record<ConditionKey, string[]> = {
  NOT_NULL: [],
  EMAIL: [],
  REGEX: ['pattern'],
  RANGE: ['min', 'max'],
  IN_LIST: ['values'],
  UNIQUE: [],
  MAX_AGE_DAYS: ['days'],
  REFERENCE_MATCH: ['values'],
  MAX_AGE_HOURS: ['hours'],
  EXISTS_IN_DATASET: ['refDatasetId', 'refColumn'],
}

/** สร้างรหัสเงื่อนไขส่วนกลางใหม่ที่ไม่ซ้ำ เช่น CUSTOM_LX2Q8A */
export function generateTemplateKey(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  return `CUSTOM_${stamp}${rand}`.slice(0, 20)
}

/* --------------------------- rule sentence -------------------------------- */

export interface RuleLike {
  datasetName?: string
  dataset?: { name?: string } | null
  /** ชื่อชุดข้อมูลหลายชุด (กฎที่ใช้ร่วมกันหลาย dataset) — มี priority เหนือ datasetName */
  datasetNames?: string[]
  column: string
  /** รหัสเงื่อนไขจากคลังเงื่อนไขส่วนกลาง (system key หรือ CUSTOM_xxx) */
  condition: string
  parameters: string
  severity: string
  filter?: string | null
  /** ประโยค "must ..." จากเงื่อนไขส่วนกลาง (ถ้ามี) */
  conditionSentence?: string
  /** เอนจินประเมินผล (ใช้จัดรูปแบบ using) — เช่น REGEX, RANGE */
  engineType?: string
  /** ชื่อชุดข้อมูลอ้างอิง (สำหรับเอนจิน EXISTS_IN_DATASET — แสดงชื่อที่อ่านง่ายแทน id) */
  refDatasetName?: string
  /** ชื่อทะเบียนข้อมูลอ้างอิง (สำหรับโหมดทะเบียนของ IN_LIST/REFERENCE_MATCH — v0.31.0) */
  refSetName?: string
}

function formatParamValue(engineType: string, params: Record<string, unknown>, refDatasetName?: string, refSetName?: string): string {
  switch (engineType) {
    case 'RANGE':
      return `[${String(params.min ?? '?')} – ${String(params.max ?? '?')}]`
    case 'IN_LIST':
    case 'REFERENCE_MATCH': {
      // โหมดทะเบียน (v0.31.0) — แสดงชื่อทะเบียนที่อ่านง่ายแทน id เมื่อกฎใช้โหมดทะเบียน
      const setId = String(params.referenceSetId ?? '').trim()
      if (setId) return `[ทะเบียน: ${refSetName ?? setId}]`
      const raw = String(params.values ?? '')
      return `[${raw}]`
    }
    case 'MAX_AGE_DAYS':
      return `${String(params.days ?? '?')} days`
    case 'MAX_AGE_HOURS':
      return `${String(params.hours ?? '?')} hours`
    case 'REGEX':
      return `/${String(params.pattern ?? '')}/`
    case 'EXISTS_IN_DATASET':
      return `exists in ${refDatasetName ?? String(params.refDatasetName ?? params.refDatasetId ?? '?')}.${String(params.refColumn ?? '?')}`
    default:
      return ''
  }
}

/** ประกอบประโยคกฎมาตรฐาน: For [Dataset], [Column] must [Condition] using [Parameters] when [Filter], otherwise mark as [Severity] */
export function buildRuleSentence(rule: RuleLike): string {
  const datasetPart =
    rule.datasetNames && rule.datasetNames.length > 0
      ? rule.datasetNames.join(', ')
      : (rule.datasetName ?? rule.dataset?.name ?? '[Dataset]')
  const systemCond = isConditionKey(rule.condition) ? CONDITIONS[rule.condition] : null
  const mustSentence = rule.conditionSentence ?? systemCond?.sentence ?? '[Condition]'
  const engine = rule.engineType ?? (systemCond ? rule.condition : undefined)
  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(rule.parameters || '{}') as Record<string, unknown>
  } catch {
    params = {}
  }
  const usingPart = engine ? formatParamValue(engine, params, rule.refDatasetName, rule.refSetName) : '[Parameters]'
  const severityTh = isSeverityKey(rule.severity) ? SEVERITY_LABELS[rule.severity].th : rule.severity

  let sentence = `For ${datasetPart}, ${rule.column} must ${mustSentence}`
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

/** บริบทเพิ่มเติมของการประเมิน — เช่น ค่าอ้างอิงจากชุดข้อมูลหลัก (INTEGRITY) หรือค่าจากทะเบียนอ้างอิง */
export interface EvaluationContext {
  /** ค่าที่มีอยู่จริงในคอลัมน์อ้างอิง (ใช้กับเอนจิน EXISTS_IN_DATASET) */
  refValues?: Set<string>
  /** ค่า ACTIVE จากทะเบียนข้อมูลอ้างอิง (ใช้กับโหมดทะเบียนของ IN_LIST/REFERENCE_MATCH — v0.31.0) */
  refSetValues?: Set<string>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function valueOf(row: Row, column: string): unknown {
  return row[column]
}

/** ประเมินกฎเดียวกับแถวข้อมูลทั้งหมด (sandbox) — กำหนดด้วยเอนจิน (engineType) จากคลังเงื่อนไข */
export function evaluateRule(
  rule: { column: string; engineType: string; parameters: string },
  rows: Row[],
  context?: EvaluationContext,
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

    switch (rule.engineType) {
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
        // โหมดทะเบียน (v0.31.0) — params.referenceSetId ชี้ทะเบียน: ใช้ค่า ACTIVE จากทะเบียน (แก้ที่ทะเบียน กฎใช้ใหม่ทันที)
        const setId = String(params.referenceSetId ?? '').trim()
        if (setId) {
          const allowed = context?.refSetValues
          failed = value === null || value === undefined || !allowed || !allowed.has(String(value).trim())
          break
        }
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
      case 'REFERENCE_MATCH': {
        // ความถูกต้อง (ACCURACY) — ค่าต้องตรงกับค่ามาตรฐานที่ระบบต้นทางยืนยัน
        // โหมดทะเบียน (v0.31.0) — params.referenceSetId ชี้ทะเบียน: ใช้ค่า ACTIVE จากทะเบียน (single source of truth)
        const setId = String(params.referenceSetId ?? '').trim()
        if (setId) {
          const allowed = context?.refSetValues
          failed = value === null || value === undefined || !allowed || !allowed.has(String(value).trim())
          break
        }
        const allowed = String(params.values ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        failed = value === null || value === undefined || !allowed.includes(String(value).trim())
        break
      }
      case 'MAX_AGE_HOURS': {
        // ความทันเวลา (TIMELINESS) — อายุข้อมูลหน่วยชั่วโมง ตาม SLA
        const hours = Number(params.hours)
        const date = new Date(String(value ?? ''))
        failed =
          value === null ||
          value === undefined ||
          String(value).trim() === '' ||
          Number.isNaN(date.getTime()) ||
          Number.isNaN(hours) ||
          (Date.now() - date.getTime()) / 3_600_000 > hours
        break
      }
      case 'EXISTS_IN_DATASET': {
        // ความเชื่อมโยงถูกต้อง (INTEGRITY) — ค่าต้องมีอยู่จริงในชุดข้อมูลอ้างอิง
        const key = String(value ?? '').trim()
        failed = key === '' || !context?.refValues || !context.refValues.has(key)
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
 * สร้างคำแนะนำจาก ML — ทุกรายการเป็นข้อแนะนำเท่านั้น (PENDING_REVIEW)
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
        dimension: 'CONSISTENCY',
        title: `โครงสร้างคอลัมน์ ${col} ไม่คงที่`,
        detail: `พบ ${missing}/${rows.length} แถวที่ไม่มีคอลัมน์ ${col} — อาจเกิด schema drift จากแหล่งข้อมูล (คำแนะนำจาก ML)`,
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
        dimension: 'REASONABLENESS',
        title: `ค่าผิดปกติ (outlier) ในคอลัมน์ ${col}`,
        detail: `โมเดลตรวจพบค่าห่างจากกรอบ IQR ${outliers.length} แถว (${sample}) — โปรดพิจารณาก่อนดำเนินการ (คำแนะนำจาก ML — ระบบไม่แก้ไขข้อมูล)`,
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
        detail: `พบค่า “${d.value}” ซ้ำกัน ${d.indexes.length} แถว (แถว #${d.indexes.map((i) => i + 1).join(', #')}) — อาจเป็นระเบียนซ้ำ โปรดพิจารณา (คำแนะนำจาก ML)`,
        severity: 'MEDIUM',
      })
      break
    }
  }

  // 4) Volume check — จำนวนแถวผิดปกติ (ต่ำกว่าคาดมากเทียบจำนวนคอลัมน์)
  if (rows.length > 0 && rows.length < columns.length * 2) {
    signals.push({
      kind: 'ML_ANOMALY',
      dimension: 'COMPLETENESS',
      title: 'ปริมาณข้อมูลต่ำกว่าที่คาดหวัง',
      detail: `ชุดข้อมูลมีเพียง ${rows.length} แถว (${columns.length} คอลัมน์) — อาจมีข้อมูลหายระหว่างนำเข้า (คำแนะนำจาก ML)`,
      severity: 'LOW',
    })
  }

  return signals
}

/* --------------------------- PII masking ---------------------------------- */

/**
 * บทบาทที่ได้เห็น PII แบบไม่ปิดบัง (v0.34.0 — นโยบายผู้ใช้: เห็นได้เฉพาะ "เจ้าของข้อมูล")
 * เดิม (≤ v0.33.0) ให้ 5 บทบาทเห็น PII — ผู้ใช้เสนอหลัก least privilege เข้มขึ้น:
 * เฉพาะ DATA_OWNER (เจ้าของข้อมูล) เท่านั้นที่เห็นข้อมูลส่วนบุคคลแบบเต็ม
 * บทบาทอื่นทั้งหมด (รวมผู้ดูแลระบบ) เห็นเวอร์ชันปิดบัง — ตรวจสอบได้ผ่านหน้า DQ แดชบอร์ด
 */
export const PII_UNMASKED_ROLES: RoleKey[] = ['DATA_OWNER']

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
