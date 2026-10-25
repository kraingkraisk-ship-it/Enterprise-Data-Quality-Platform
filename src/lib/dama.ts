/**
 * มาตราการประเมินคุณภาพข้อมูล 9 มาตรา — อ้างอิงกรอบ DAMA-DMBOK
 * ชั้น "มาตรา" ที่เอนจินประเมินผลใช้อ้างอิง (Single Source of Truth ของการตัดสินผล):
 *   1) ทุกกฎถูกประเมินภายใต้ "มาตรา" ของมิติที่กฎสังกัด (มาตราที่ 1–9 ตามลำดับมาตรฐาน)
 *   2) ผลรายกฎถูกแปลเป็น "คำตัดสิน (verdict)" ภาษาไทยที่อ่านง่าย — ผ่าน/ไม่ผ่านมาตราใด เพราะอะไร และควรทำอย่างไร
 *   3) คะแนนรายมิติ = ค่าเฉลี่ยอัตราผ่านของกฎทั้งหมดในมิตินั้น แล้วจัดเกรดตามเกณฑ์เดียวกันทั้งระบบ
 *   4) ความเห็นทั้งหมดเป็นเพียงข้อแนะนำ — การตัดสินใจแก้ไขข้อมูลเป็นของมนุษย์เสมอ (ระบบไม่แก้ข้อมูลต้นทาง)
 * ไฟล์นี้เป็น pure logic ไม่ผูก backend/frontend — ใช้ร่วมกันทั้งสองฝั่ง
 */

import { DIMENSION_LABELS, DIMENSION_META, type DimensionKey } from '@/lib/dq'

/* --------------------------- มาตราการประเมิน ------------------------------- */

export interface DamaStandard {
  /** เลขมาตรา 1–9 (ตามลำดับมาตรฐาน DAMA-DMBOK ที่องค์กรกำหนด) */
  clauseNo: number
  /** ข้อกำหนดของมาตรา (อ่านเหมือนบทกฎหมาย — สิ่งที่ข้อมูลต้องเป็น) */
  statement: string
  /** มาตราการวัด — วัดอะไรและอย่างไร */
  measure: string
  /** สูตรคำนวณที่คนทั่วไปอ่านรู้เรื่อง */
  formula: string
  /** คำแนะนำเมื่อผลลัพธ์ยังไม่เป็นไปตามมาตรา */
  advice: string
}

/**
 * มาตราที่ 1–9 ของทั้ง 9 มิติ — ลำดับและชื่อมิติอ้างอิงจาก DIMENSION_META ใน lib/dq.ts
 * (1 Accuracy, 2 Completeness, 3 Consistency, 4 Validity, 5 Uniqueness,
 *  6 Integrity, 7 Timeliness, 8 Currentness, 9 Reasonableness)
 */
export const DAMA_STANDARDS: Record<DimensionKey, DamaStandard> = {
  ACCURACY: {
    clauseNo: 1,
    statement: 'ข้อมูลต้องถูกต้องตรงตามความจริงหรือค่ามาตรฐานที่ระบบต้นทางยืนยัน',
    measure: 'วัดจากสัดส่วนค่าที่ตรงกับค่ามาตรฐาน/แหล่งอ้างอิง เทียบกับค่าทั้งหมดในคอลัมน์',
    formula: '(จำนวนค่าที่ตรงมาตรฐาน ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'นำค่าที่ล้มเหลวไปเทียบกับระบบต้นทางหรือทะเบียนมาตรฐาน แล้วแก้ไขค่าให้ตรงตามความจริง',
  },
  COMPLETENESS: {
    clauseNo: 2,
    statement: 'ฟิลด์ที่จำเป็นต้องมีค่าครบทุกระเบียน — ห้ามมีค่าว่างหรือระเบียนหาย',
    measure: 'วัดจากสัดส่วนค่าที่ไม่ว่างในฟิลด์ที่จำเป็น',
    formula: '(จำนวนค่าที่ไม่ว่าง ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'ติดตามระเบียนที่ค่าว่างกลับไปยังระบบต้นทาง แล้วเติมข้อมูลให้ครบถ้วนทุกฟิลด์จำเป็น',
  },
  CONSISTENCY: {
    clauseNo: 3,
    statement: 'ค่าและรหัสต้องใช้ชุดเดียวกันทั้งในระบบเดียวกันและข้ามระบบ',
    measure: 'วัดจากสัดส่วนค่าที่อยู่ในชุดค่ามาตรฐานที่ยอมรับ',
    formula: '(จำนวนค่าที่สอดคล้องกับชุดค่ามาตรฐาน ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'กำหนดชุดรหัสมาตรฐานเดียวกับทุกระบบ แล้วแมปค่าเดิมที่ต่างรูปแบบให้เข้าชุดเดียวกัน',
  },
  VALIDITY: {
    clauseNo: 4,
    statement: 'ข้อมูลต้องอยู่ในรูปแบบหรือโดเมนที่กำหนดไว้ เช่น อีเมล เบอร์โทร รหัสไปรษณีย์',
    measure: 'วัดจากสัดส่วนค่าที่ผ่านรูปแบบ/โดเมนที่กำหนด',
    formula: '(จำนวนค่าที่ผ่านรูปแบบ ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'แก้ไขค่าให้ถูกต้องตามรูปแบบที่กำหนด เช่น อีเมลขาด @ เบอร์โทรไม่ครบ 10 หลัก',
  },
  UNIQUENESS: {
    clauseNo: 5,
    statement: 'ไม่มีระเบียนหรือค่าซ้ำซ้อนภายในชุดข้อมูลเดียวกัน',
    measure: 'วัดจากสัดส่วนค่าที่ปรากฏเพียงหนึ่งเดียวในชุดข้อมูล',
    formula: '(จำนวนค่าที่ไม่ซ้ำ ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'ตรวจระเบียนซ้ำและรวมข้อมูล (deduplicate) ให้เหลือระเบียนเดียวต่อหนึ่งเอกลักษณ์',
  },
  INTEGRITY: {
    clauseNo: 6,
    statement: 'ค่าที่อ้างอิงถึงข้อมูลอื่นต้องมีอยู่จริงและสัมพันธ์ถูกต้อง (Referential Integrity)',
    measure: 'วัดจากสัดส่วนค่าที่มีอยู่จริงในคอลัมน์อ้างอิงของทะเบียนหลัก',
    formula: '(จำนวนค่าที่เชื่อมโยงได้ในทะเบียนอ้างอิง ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'ตรวจว่ารหัสอ้างอิงถูกต้อง หากเป็นรายการใหม่ที่ถูกต้องให้เพิ่มเข้าทะเบียนหลัก หรือแก้รหัสให้ตรง',
  },
  TIMELINESS: {
    clauseNo: 7,
    statement: 'ข้อมูลต้องมาถึงและพร้อมใช้ตามรอบเวลาที่ SLA กำหนด (หน่วยชั่วโมง)',
    measure: 'วัดจากสัดส่วนข้อมูลที่อายุไม่เกิน SLA ตามรอบที่กำหนด',
    formula: '(จำนวนระเบียนที่ทันตาม SLA ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'ตรวจไปป์ไลน์นำเข้าและตารางรันงานให้ทันตามรอบ SLA เช่น รายชั่วโมงหรือรายวัน',
  },
  CURRENTNESS: {
    clauseNo: 8,
    statement: 'ข้อมูลต้องเป็นเวอร์ชันล่าสุด ไม่เก่ากว่าหน้าต่างเวลาที่ยอมรับได้ (หน่วยวัน)',
    measure: 'วัดจากสัดส่วนข้อมูลที่ไม่เก่าเกินจำนวนวันที่ยอมรับ',
    formula: '(จำนวนระเบียนที่ไม่เก่าเกินกำหนด ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'รีเฟรชข้อมูลจากระบบต้นทางให้เป็นปัจจุบัน และทบทวนหน้าต่างเวลาที่เหมาะกับการใช้งาน',
  },
  REASONABLENESS: {
    clauseNo: 9,
    statement: 'ค่าต้องอยู่ในกรอบที่สมเหตุสมผลตามธุรกิจ เช่น จำนวนไม่ติดลบ อายุ 0–120 ปี',
    measure: 'วัดจากสัดส่วนค่าที่อยู่ในกรอบ/ช่วงที่ธุรกิจกำหนด',
    formula: '(จำนวนค่าที่สมเหตุสมผลตามกรอบ ÷ จำนวนระเบียนทั้งหมด) × 100',
    advice: 'ตรวจค่าที่ผิดปกติ เช่น จำนวนติดลบหรือเกินจริง แล้วแก้ไขตามความจริงของธุรกรรม',
  },
}

/** เรียงมาตรา 1→9 ตามลำดับมาตรฐาน — ใช้ render ตาราง/scorecard */
export const DAMA_CLAUSES: Array<{ dimension: DimensionKey; standard: DamaStandard }> = (
  Object.keys(DAMA_STANDARDS) as DimensionKey[]
).map((k) => ({ dimension: k, standard: DAMA_STANDARDS[k] }))

/* ------------------------------ เกรดผลประเมิน ------------------------------ */

export type GradeBand = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

export interface GradeDef {
  band: GradeBand
  /** ขั้นต่ำของคะแนนที่ได้เกรดนี้ */
  min: number
  /** ชื่อเกรดภาษาไทย */
  label: string
  /** คำอธิบายเกรดแบบอ่านง่าย */
  meaning: string
  /** คลาสสีของ badge (literal เพื่อให้ Tailwind scan เจอ) */
  badgeClass: string
  /** คลาสสีของแถบคะแนน */
  barClass: string
  /** คลาสสีของตัวเลข */
  textClass: string
}

/** เกณฑ์เกรดเดียวกันทั้งระบบ — ใช้ทั้งคะแนนรายมิติและคะแนนรวม */
export const GRADE_DEFS: GradeDef[] = [
  {
    band: 'EXCELLENT',
    min: 95,
    label: 'ดีเยี่ยม',
    meaning: 'เป็นไปตามมาตราเกือบสมบูรณ์ — รักษาระดับนี้ไว้',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    barClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
  {
    band: 'GOOD',
    min: 85,
    label: 'ดี',
    meaning: 'เป็นไปตามมาตราส่วนใหญ่ — มีจุดเล็กน้อยที่ปรับปรุงได้',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    barClass: 'bg-teal-500',
    textClass: 'text-teal-700',
  },
  {
    band: 'FAIR',
    min: 70,
    label: 'ต้องปรับปรุง',
    meaning: 'ยังไม่เป็นไปตามมาตราเพียงพอ — ควรวางแผนแก้ไขโดยเร็ว',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    barClass: 'bg-amber-500',
    textClass: 'text-amber-700',
  },
  {
    band: 'POOR',
    min: 0,
    label: 'วิกฤต',
    meaning: 'ละเมิดมาตราจำนวนมาก — ต้องดำเนินการแก้ไขทันที',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    barClass: 'bg-rose-500',
    textClass: 'text-rose-700',
  },
]

/** จัดเกรดจากคะแนน (0–100) — คืน null ถ้าไม่ได้ประเมิน (ไม่มีกฎในมิตินั้น) */
export function gradeOf(score: number | null): GradeDef | null {
  if (score === null || Number.isNaN(score)) return null
  return GRADE_DEFS.find((g) => score >= g.min) ?? GRADE_DEFS[GRADE_DEFS.length - 1]
}

/* ------------------- เหตุผล/คำแนะนำรายเอนจิน (ภาษาคน) ---------------------- */

/**
 * เหตุผลที่แถวล้มเหลว ต่อเอนจิน — ใช้ประกอบคำตัดสิน "เพราะอะไร"
 * (key = engineType ระบบจาก lib/dq.ts)
 */
export const ENGINE_FAILURE_REASONS: Record<string, string> = {
  NOT_NULL: 'พบค่าว่างในฟิลด์ที่จำเป็น',
  EMAIL: 'รูปแบบอีเมลไม่ถูกต้อง เช่น ขาด @ หรือโดเมน',
  REGEX: 'ค่าไม่ตรงตามรูปแบบที่กำหนดไว้',
  RANGE: 'ค่าอยู่นอกช่วงที่สมเหตุสมผล (ต่ำกว่า/สูงกว่าที่กำหนด)',
  IN_LIST: 'ค่าไม่อยู่ในรายการที่ระบบรองรับ — อาจใช้รหัสต่างจากมาตรฐาน',
  UNIQUE: 'พบค่าซ้ำกันในชุดข้อมูล — ระเบียนอาจถูกบันทึกซ้ำซ้อน',
  MAX_AGE_DAYS: 'ข้อมูลเก่าเกินหน้าต่างเวลาที่ยอมรับ (วัน)',
  MAX_AGE_HOURS: 'ข้อมูลล่าช้าเกิน SLA ที่กำหนด (ชั่วโมง)',
  REFERENCE_MATCH: 'ค่าไม่ตรงกับค่ามาตรฐานที่ระบบต้นทางยืนยัน',
  EXISTS_IN_DATASET: 'ค่าไม่มีอยู่ในทะเบียนอ้างอิง — การเชื่อมโยงอาจผิดพลาด',
}

/** คำแนะนำการแก้ไขต่อเอนจิน — แสดงเมื่อกฎล้มเหลว (เป็นข้อแนะนำ ไม่ใช่การแก้แทน) */
export const ENGINE_FIX_HINTS: Record<string, string> = {
  NOT_NULL: 'เติมค่าที่ขาดตามความจริง หรือกำหนดค่าเริ่มต้นที่ธุรกิจยอมรับ',
  EMAIL: 'แก้ไขรูปแบบอีเมลให้ครบ ชื่อบัญชี@โดเมน',
  REGEX: 'ตรวจค่าที่ล้มเหลวเทียบกับรูปแบบที่กำหนด แล้วแก้ให้ตรง หรือทบทวนรูปแบบหากมาตรฐานเปลี่ยน',
  RANGE: 'ตรวจค่าที่เกินกรอบ เช่น ตัวเลขติดลบหรือเกินจริง แล้วแก้ตามความจริง',
  IN_LIST: 'ปรับรหัสให้ตรงตามชุดค่ามาตรฐานที่ระบบรองรับ',
  UNIQUE: 'ตรวจระเบียนซ้ำแล้วรวมข้อมูลให้เหลือระเบียนเดียวต่อหนึ่งเอกลักษณ์',
  MAX_AGE_DAYS: 'รีเฟรชข้อมูลจากระบบต้นทางให้เป็นปัจจุบัน',
  MAX_AGE_HOURS: 'ตรวจไปป์ไลน์นำเข้าให้ทันตามรอบ SLA ที่กำหนด',
  REFERENCE_MATCH: 'เทียบค่ากับระบบต้นทางแล้วแก้ให้ตรงตามค่ามาตรฐาน',
  EXISTS_IN_DATASET: 'ตรวจว่ารหัสถูกต้อง หากเป็นรายการใหม่ที่ถูกต้องให้เพิ่มเข้าทะเบียนหลัก',
}

/** คำแนะนำของกฎที่ล้มเหลว — ใช้คำแนะนำของเอนจินก่อน ถ้าไม่มีค่อยใช้ของมาตรา */
export function fixHintFor(engineType: string, dimension: DimensionKey): string {
  return ENGINE_FIX_HINTS[engineType] ?? DAMA_STANDARDS[dimension].advice
}

/* ------------------------- คำตัดสินรายกฎ (verdict) ------------------------- */

export interface RuleVerdictInput {
  status: 'PASSED' | 'FAILED' | 'NO_DATA'
  totalRows: number
  failedRows: number
  dimension: DimensionKey
  engineType: string
}

/**
 * แปลผลการรันกฎเดียวเป็นคำตัดสินภาษาไทยที่อ่านง่าย
 * เช่น "ผ่านมาตราที่ 2 ความสมบูรณ์ (Completeness) — ข้อมูลเป็นไปตามมาตราทุกแถว (20/20)"
 *      "ไม่ผ่านมาตราที่ 2 ความสมบูรณ์ (Completeness) — ล้มเหลว 3 จาก 20 แถว เพราะพบค่าว่างในฟิลด์ที่จำเป็น"
 */
export function buildRuleVerdict(input: RuleVerdictInput): string {
  const meta = DIMENSION_LABELS[input.dimension]
  const clause = DAMA_STANDARDS[input.dimension]?.clauseNo
  const head = `มาตราที่ ${clause} ${meta.th} (${meta.en})`
  // v0.32.0 — ชุดข้อมูลว่าง (0 แถว) = ไม่ตัดสินผ่าน/ไม่ผ่าน (ไม่มีหลักฐานให้ตรวจ)
  if (input.status === 'NO_DATA') {
    return `ไม่สามารถตัดสิน${head} — ชุดข้อมูลไม่มีแถวให้ตรวจ (0 แถว) จึงไม่ถือเป็นหลักฐานคุณภาพ ให้นำเข้าข้อมูลก่อนแล้วรันใหม่`
  }
  if (input.status === 'PASSED') {
    return `ผ่าน${head} — ข้อมูลเป็นไปตามมาตราทุกแถว (${input.totalRows}/${input.totalRows})`
  }
  const reason =
    ENGINE_FAILURE_REASONS[input.engineType] ?? 'ค่าไม่เป็นไปตามเงื่อนไขที่มาตรากำหนด'
  return `ไม่ผ่าน${head} — ล้มเหลว ${input.failedRows} จาก ${input.totalRows} แถว เพราะ${reason}`
}

/* --------------------------- สรุปผลรวมการรัน ------------------------------ */

/** ประโยคสรุปผลการประเมินทั้งรัน — อ่านทีเดียวรู้เรื่องทั้งหมด */
export function buildRunSummary(args: {
  rowsCount: number
  rulesCount: number
  passedRules: number
  failedRules: number
  noDataRules?: number
  overallScore: number | null
}): string {
  const { rowsCount, rulesCount, passedRules, failedRules, overallScore } = args
  if (rulesCount === 0) {
    return 'ยังไม่มีกฎที่เปิดใช้งานกับชุดข้อมูลนี้ — เพิ่มกฎใน Rule Builder ก่อนจึงจะประเมินตามมาตราได้'
  }
  const grade = gradeOf(overallScore)
  const tail = grade ? ` — คะแนนรวม ${overallScore?.toFixed(1)}/100 เกรด "${grade.label}"` : ''
  const noDataPart = args.noDataRules ? ` · ไม่มีข้อมูลให้ตรวจ ${args.noDataRules}` : ''
  return `ประเมินตามมาตรา DAMA-DMBOK 9 มิติ ด้วยกฎที่เปิดใช้งาน ${rulesCount} ข้อ (ผ่าน ${passedRules} · ไม่ผ่าน ${failedRules}${noDataPart}) บนข้อมูลตัวอย่าง ${rowsCount} แถว${tail}`
}

/* ----------------------- ชนิดผลลัพธ์รายมิติ (API) -------------------------- */

/** ผลประเมินรายมิติตามมาตรา — ครบทั้ง 9 มิติเสมอ (score = null เมื่อไม่มีกฎในมิตินั้น) */
export interface DimensionResultView {
  dimension: DimensionKey
  th: string
  en: string
  clauseNo: number
  statement: string
  measure: string
  formula: string
  /** คะแนนเฉลี่ยของกฎในมิติ (0–100) — null ถ้าไม่มีกฎ */
  score: number | null
  /** เกรดตามเกณฑ์ระบบ — null ถ้าไม่มีกฎ */
  grade: { band: GradeBand; label: string; badgeClass: string; barClass: string; textClass: string } | null
  rulesCount: number
  failedRules: number
  /** คำแนะนำเมื่อผลยังไม่ดี — ดึงจากมาตรา (แสดงเมื่อเกรดต่ำกว่า "ดี") */
  advice: string | null
}
