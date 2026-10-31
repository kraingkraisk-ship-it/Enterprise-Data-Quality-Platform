/**
 * Regulation & Classification Knowledge Base — Single Source of Truth
 * แดชบอร์ดส่วน Regulation / Risk / Data Classification อ้างอิงไฟล์นี้เป็นแหล่งเดียว
 *
 * ส่วนที่ 1 — กรอบมาตรฐาน (Frameworks) 5 กรอบ ตามที่องค์กรกำหนด:
 *   3.1 Enterprise Data Management          → DAMA-DMBOK
 *   3.2 Data Quality Model                  → ISO/IEC 25012
 *   3.3 Master Data & Data Exchange Quality → ISO 8000
 *   3.4 Data Quality Measurement            → ISO/IEC 25024
 *   3.5 Metadata Registry                   → ISO/IEC 11179
 * แต่ละกรอบแตก "ส่วนย่อย (domain)" ได้ และแต่ละส่วนย่อยแมปกับมิติ DQ ของระบบ
 * เพื่อให้ระบบคำนวณ "สถานะตามข้อมูลจริงในระบบ" (คะแนนมิติล่าสุด + จำนวนกฎ)
 *
 * ส่วนที่ 2 — การจำแนกประเภทข้อมูล (Data Classification) 11 ประเภท (5.1–5.11)
 * พร้อมมาตรฐานที่เกี่ยวข้อง มิติ DQ ที่เน้นตรวจ และผลกระทบเมื่อคุณภาพข้อมูลไม่ดี
 *
 * ส่วนที่ 3 — Logic ความเสี่ยง (Risk / DQ Impact):
 *   ระดับโอกาสเกิดจากอัตราการล้มเหลวของผลตรวจล่าสุด
 *   ระดับผลกระทบจากระดับความรุนแรง (severity) ของกฎ
 *   คะแนนความเสี่ยง = โอกาส × ผลกระทบ (สูงสุด 25) — เป็นข้อมูลประกอบการตัดสินใจของมนุษย์เสมอ
 */

import { DIMENSION_LABELS, type DimensionKey } from '@/lib/dq'
import { DAMA_STANDARDS } from '@/lib/dama'

/* ==================== ส่วนที่ 1 — กรอบมาตรฐาน (Regulation) ==================== */

export interface FrameworkDomain {
  id: string
  th: string
  en: string
  /** ข้อกำหนด/คำอธิบายของส่วนย่อย (อ่านเหมือนบทมาตรฐาน) */
  detail: string
  /** มิติ DQ ของระบบที่แมปกับส่วนย่อยนี้ — ใช้คำนวณคะแนน/จำนวนกฎจากระบบจริง (ว่าง = ยังไม่มีเกณฑ์ตรวจในระบบ) */
  dimensions: DimensionKey[]
  /** น้ำหนักของส่วนย่อยต่อคะแนนรวมของกรอบ (คะแนนกรอบ = Σ(score_i×w_i)/Σ(w_i) เฉพาะส่วนย่อยที่วัดได้) */
  weight: number
  /** หมวดหมู่เฉพาะของกรอบ (เช่น inherent/system ของ ISO 25012) — แสดงเป็นป้ายกำกับ */
  category?: string
}

export interface Framework {
  id: string
  /** เลขกลุ่มตามที่องค์กรกำหนด เช่น 3.1 */
  no: string
  groupTh: string
  groupEn: string
  name: string
  fullName: string
  description: string
  domains: FrameworkDomain[]
}

/** ป้ายหมวดของ ISO/IEC 25012 (คุณลักษณะโดยธรรมชาติของข้อมูล / ระบบที่ประมวลผล) */
const INHERENT = 'Inherent — คุณลักษณะโดยธรรมชาติของข้อมูล'
const SYSTEM = 'System Dependent — ขึ้นกับระบบที่ประมวลผล'
const BOTH = 'Inherent + System Dependent'

export const FRAMEWORKS: Framework[] = [
  {
    id: 'DAMA_DMBOK',
    no: '3.1',
    groupTh: 'Enterprise Data Management',
    groupEn: 'Enterprise Data Management',
    name: 'DAMA-DMBOK',
    fullName: 'DAMA Data Management Body of Knowledge',
    description:
      'กรอบการจัดการข้อมูลระดับองค์กร — ระบบแปล "มาตราการประเมิน 9 มาตรา" ของมิติคุณภาพข้อมูลให้เป็นเกณฑ์ตรวจจริงใน Rule Builder และประเมินทุกการรันตรวจ',
    domains: (Object.keys(DAMA_STANDARDS) as DimensionKey[]).map((k) => ({
      id: `DAMA-${k}`,
      th: `มาตราที่ ${DAMA_STANDARDS[k].clauseNo} ${DIMENSION_LABELS[k].th}`,
      en: DIMENSION_LABELS[k].en,
      detail: DAMA_STANDARDS[k].statement,
      dimensions: [k],
      weight: 1.0,
    })),
  },
  {
    id: 'ISO_25012',
    no: '3.2',
    groupTh: 'Data Quality Model',
    groupEn: 'Data Quality Model',
    name: 'ISO/IEC 25012',
    fullName: 'Software Engineering — Data Quality Model (15 คุณลักษณะ)',
    description:
      'แบบจำลองคุณภาพข้อมูล 15 คุณลักษณะ แบ่งเป็นคุณลักษณะโดยธรรมชาติของข้อมูล (Inherent) ขึ้นกับระบบ (System Dependent) และทั้งสอง — ระบบแมปคุณลักษณะที่ตรวจได้เข้ากับมิติ DQ ของระบบ',
    domains: [
      { id: '25012-ACC', category: INHERENT, th: 'ความถูกต้อง', en: 'Accuracy', detail: 'ข้อมูลแสดงความจริงของสิ่งที่อ้างอิงได้ถูกต้อง', dimensions: ['ACCURACY'], weight: 1.5 },
      { id: '25012-CMP', category: INHERENT, th: 'ความสมบูรณ์', en: 'Completeness', detail: 'ข้อมูลมีครบตามที่คาดหวังไว้ ทั้งความลึกและความกว้าง', dimensions: ['COMPLETENESS'], weight: 1.5 },
      { id: '25012-CON', category: INHERENT, th: 'ความสอดคล้อง', en: 'Consistency', detail: 'ข้อมูลไม่ขัดแย้งกันเองและสอดคล้องกันข้ามระบบ', dimensions: ['CONSISTENCY'], weight: 1.25 },
      { id: '25012-CRD', category: INHERENT, th: 'ความน่าเชื่อถือ', en: 'Credibility', detail: 'ข้อมูลถือว่าเป็นความจริง เชื่อถือได้ น่าใช้อ้างอิง', dimensions: ['ACCURACY', 'INTEGRITY'], weight: 1.0 },
      { id: '25012-CUR', category: INHERENT, th: 'ความเป็นปัจจุบัน', en: 'Currentness', detail: 'ข้อมูลเป็นเวอร์ชันล่าสุดตามหน้าต่างเวลาที่กำหนด', dimensions: ['CURRENTNESS'], weight: 1.25 },
      { id: '25012-ACC2', category: BOTH, th: 'ความสามารถเข้าถึงได้', en: 'Accessibility', detail: 'ผู้ใช้ที่ได้รับอนุญาตเข้าถึงข้อมูลได้ง่ายและปลอดภัย — ระบบบังคับด้วย RBAC รายชุดข้อมูล', dimensions: ['COMPLETENESS', 'TIMELINESS'], weight: 0.75 },
      { id: '25012-CPL', category: BOTH, th: 'ความสอดคล้องกฎเกณฑ์', en: 'Compliance', detail: 'ข้อมูลเป็นไปตามมาตรฐาน กฎหมาย และข้อบังคับที่เกี่ยวข้อง (เช่น PDPA)', dimensions: ['VALIDITY', 'CONSISTENCY'], weight: 1.25 },
      { id: '25012-CFD', category: BOTH, th: 'ความลับ', en: 'Confidentiality', detail: 'ข้อมูลจำกัดการเข้าถึงเฉพาะผู้มีสิทธิ์ — ระบบปิดบัง PII ตามบทบาทโดยค่าเริ่มต้น', dimensions: [], weight: 1.0 },
      { id: '25012-EFF', category: BOTH, th: 'ประสิทธิภาพ', en: 'Efficiency', detail: 'ปริมาณข้อมูลที่คาดหวังต่อทรัพยากรที่ใช้ — ตรวจด้วยสัญญาณปริมาณข้อมูลผิดปกติ', dimensions: [], weight: 1.0 },
      { id: '25012-PRC', category: BOTH, th: 'ความละเอียดแม่นยำ', en: 'Precision', detail: 'ข้อมูลมีความละเอียดตรงตามรูปแบบ/หน่วยที่กำหนด', dimensions: ['VALIDITY'], weight: 1.0 },
      { id: '25012-TRC', category: BOTH, th: 'ความสามารถตามรอย', en: 'Traceability', detail: 'สืบค้นที่มาและประวัติข้อมูลได้ — ระบบบันทึก Audit Trail ทุกการดำเนินการ', dimensions: ['INTEGRITY'], weight: 1.0 },
      { id: '25012-UND', category: BOTH, th: 'ความเข้าใจได้', en: 'Understandability', detail: 'ข้อมูลถูกนิยามชัดเจน อ่านแล้วเข้าใจตรงกันทุกหน่วยงาน', dimensions: ['CONSISTENCY', 'COMPLETENESS'], weight: 0.75 },
      { id: '25012-AVA', category: SYSTEM, th: 'ความพร้อมใช้', en: 'Availability', detail: 'ข้อมูลพร้อมใช้ตามระดับที่กำหนด — ตรวจด้วยเกณฑ์ทันตาม SLA', dimensions: ['TIMELINESS'], weight: 1.0 },
      { id: '25012-PRT', category: SYSTEM, th: 'ความสามารถพกพา', en: 'Portability', detail: 'ข้อมูลใช้ได้กับหลายระบบ/แพลตฟอร์มด้วยรูปแบบเดียวกัน', dimensions: ['CONSISTENCY'], weight: 0.5 },
      { id: '25012-REC', category: SYSTEM, th: 'ความสามารถกู้คืน', en: 'Recoverability', detail: 'กู้คืนข้อมูลกลับสู่สถานะถูกต้องหลังเกิดเหตุขัดข้องได้', dimensions: ['INTEGRITY', 'COMPLETENESS'], weight: 0.5 },
    ],
  },
  {
    id: 'ISO_8000',
    no: '3.3',
    groupTh: 'Master Data และ Data Exchange Quality',
    groupEn: 'Master Data & Data Exchange Quality',
    name: 'ISO 8000',
    fullName: 'Data Quality (Master Data และการแลกเปลี่ยนข้อมูล)',
    description:
      'มาตรฐานคุณภาพข้อมูลหลักและการแลกเปลี่ยนข้อมูลระหว่างองค์กร — ครอบคลุมไวยากรณ์ ความหมาย และการเข้ารหัสข้อมูล พร้อมกรอบกระบวนการจัดการคุณภาพ (Plan-Do-Check-Act)',
    domains: [
      { id: '8000-1', th: 'ISO 8000-1 ภาพรวมและหลักการ', en: 'Part 1: Overview', detail: 'หลักการพื้นฐานของคุณภาพข้อมูล — คุณภาพวัดจากการใช้งานจริง (fitness for purpose)', dimensions: ['ACCURACY', 'REASONABLENESS'], weight: 0.75 },
      { id: '8000-2', th: 'ISO 8000-2 ศัพท์ศาสตร์', en: 'Part 2: Vocabulary', detail: 'ศัพท์มาตรฐานของคุณภาพข้อมูลเพื่อให้ทุกหน่วยงานใช้ความหมายตรงกัน', dimensions: ['CONSISTENCY'], weight: 1.0 },
      { id: '8000-8', th: 'ISO 8000-8 ไวยากรณ์และความหมายของข้อมูล', en: 'Part 8: Syntax & Semantics', detail: 'การสร้างแบบข้อมูลที่ระบุทั้งรูปแบบ (syntax) และความหมาย (semantics) อย่างชัดเจน', dimensions: ['VALIDITY', 'ACCURACY'], weight: 1.25 },
      { id: '8000-61', th: 'ISO 8000-61 กรอบกระบวนการคุณภาพข้อมูล', en: 'Part 61: Quality Management Process', detail: 'วงจร Plan-Do-Check-Act ของการจัดการคุณภาพข้อมูล — ระบบแปลงเป็น คลังเงื่อนไข → Rule Builder → รันตรวจ → ดูคำแนะนำ ML', dimensions: ['TIMELINESS'], weight: 0.75 },
      { id: '8000-110', th: 'ISO 8000-110 คุณภาพข้อมูลหลัก', en: 'Part 110: Master Data Quality', detail: 'ข้อมูลหลักต้องถูกต้องทั้งรูปแบบ (syntax) ความหมาย (semantic) และการเข้ารหัส (coding) เช่น รหัสลูกค้า/บัญชีตามทะเบียนหลัก', dimensions: ['VALIDITY', 'ACCURACY', 'CONSISTENCY', 'UNIQUENESS', 'COMPLETENESS'], weight: 1.5 },
      { id: '8000-120', th: 'ISO 8000-120 คุณภาพการแลกเปลี่ยนข้อมูล', en: 'Part 120: Data Exchange Quality', detail: 'เอกสารการแลกเปลี่ยนข้อมูลต้องอ้างอิงสมบัติของรายการได้จริงและส่งถึงกันระหว่างระบบได้ครบถ้วน', dimensions: ['INTEGRITY', 'COMPLETENESS'], weight: 1.5 },
    ],
  },
  {
    id: 'ISO_25024',
    no: '3.4',
    groupTh: 'Data Quality Measurement',
    groupEn: 'Data Quality Measurement',
    name: 'ISO/IEC 25024',
    fullName: 'Measurement of Data Quality (มาตราการวัดคุณภาพข้อมูล)',
    description:
      'มาตราการวัดคุณภาพข้อมูลที่ระบุสูตร/วิธีคำนวณต่อคุณลักษณะ — ระบบแปลงเป็นสูตรที่อ่านง่ายของแต่ละมาตรา แล้วคำนวณจากผลรันจริง',
    domains: [
      { id: '25024-SYN', th: 'ความถูกต้องเชิงไวยากรณ์', en: 'Syntactic accuracy', detail: 'วัดสัดส่วนค่าที่ถูกรูปแบบที่กำหนด เช่น อีเมล รูปแบบเบอร์โทร', dimensions: ['VALIDITY'], weight: 1.25 },
      { id: '25024-SEM', th: 'ความถูกต้องเชิงความหมาย', en: 'Semantic accuracy', detail: 'วัดสัดส่วนค่าที่ตรงกับค่ามาตรฐาน/แหล่งอ้างอิงที่ยืนยันแล้ว', dimensions: ['ACCURACY'], weight: 1.25 },
      { id: '25024-CMP', th: 'ความสมบูรณ์', en: 'Completeness', detail: 'วัดสัดส่วนค่าที่ไม่ว่างในฟิลด์ที่จำเป็น เทียบระเบียนทั้งหมด', dimensions: ['COMPLETENESS'], weight: 1.5 },
      { id: '25024-CON', th: 'ความสอดคล้อง', en: 'Consistency', detail: 'วัดสัดส่วนค่าที่อยู่ในชุดค่ามาตรฐานเดียวกันทั้งระบบ', dimensions: ['CONSISTENCY'], weight: 1.0 },
      { id: '25024-CRD', th: 'ความน่าเชื่อถือ', en: 'Credibility', detail: 'วัดสัดส่วนค่าที่มีแหล่งที่มายืนยันแล้ว (มาจากทะเบียน/ระบบต้นทาง)', dimensions: ['ACCURACY', 'INTEGRITY'], weight: 1.0 },
      { id: '25024-CUR', th: 'ความเป็นปัจจุบัน', en: 'Currentness', detail: 'วัดสัดส่วนระเบียนที่ไม่เก่าเกินหน้าต่างเวลาที่ยอมรับ (วัน)', dimensions: ['CURRENTNESS'], weight: 1.0 },
      { id: '25024-AVA', th: 'ความพร้อมใช้ / ทันเวลา', en: 'Availability / Timeliness', detail: 'วัดสัดส่วนข้อมูลที่มาถึงทันตามรอบ SLA (ชั่วโมง)', dimensions: ['TIMELINESS'], weight: 0.75 },
      { id: '25024-UNQ', th: 'ความไม่ซ้ำซ้อน', en: 'Uniqueness', detail: 'วัดสัดส่วนค่าที่ปรากฏเพียงหนึ่งเดียวในชุดข้อมูล', dimensions: ['UNIQUENESS'], weight: 1.25 },
      { id: '25024-RSN', th: 'ความสมเหตุสมผล', en: 'Reasonableness', detail: 'วัดสัดส่วนค่าที่อยู่ในกรอบธุรกิจที่กำหนด เช่น ช่วงตัวเลขที่เป็นไปได้', dimensions: ['REASONABLENESS'], weight: 1.0 },
      { id: '25024-OTH', th: 'คุณลักษณะอื่น ๆ', en: 'Other characteristics', detail: 'คุณลักษณะที่ตรวจข้ามระบบ/กระบวนการ — ระบบครอบคลุมบางส่วนผ่าน RBAC, PII masking และ Audit Trail', dimensions: [], weight: 1.0 },
    ],
  },
  {
    id: 'ISO_11179',
    no: '3.5',
    groupTh: 'Metadata Registry',
    groupEn: 'Metadata Registry',
    name: 'ISO/IEC 11179',
    fullName: 'Metadata Registries (ทะเบียนเมทาดาทาและองค์ประกอบข้อมูล)',
    description:
      'กรอบทะเบียนเมทาดาทาและการจัดการองค์ประกอบข้อมูล (Data Element) — ระบบแมปกับความครบถ้วนของเมทาดาทาชุดข้อมูล (ชื่อ/แหล่งข้อมูล/การจำแนกประเภท/ธง PII) และชุดค่ามาตรฐาน',
    domains: [
      { id: '11179-1', th: 'Part 1: กรอบและหลักการทั่วไป', en: 'Framework and general principles', detail: 'ทะเบียนเมทาดาทาต้องมีหลักการจัดการที่ชัดเจน ตรวจสอบย้อนหลังได้', dimensions: ['COMPLETENESS'], weight: 0.5 },
      { id: '11179-3', th: 'Part 3: Metamodel — Data Element และ Value Domain', en: 'Registry metamodel', detail: 'ทุกองค์ประกอบข้อมูลต้องผูกกับชุดค่าที่ยอมรับ (Value Domain) — แมปกับกฎ "อยู่ในรายการค่าที่อนุญาต" ของระบบ', dimensions: ['CONSISTENCY'], weight: 1.5 },
      { id: '11179-4', th: 'Part 4: การเขียนนิยามข้อมูล', en: 'Formulating data definitions', detail: 'นิยามข้อมูลต้องครบ ชัดเจน และไม่ซ้ำกัน — แมปกับความสมบูรณ์ของเมทาดาทาในระบบ', dimensions: ['COMPLETENESS'], weight: 1.25 },
      { id: '11179-5', th: 'Part 5: การตั้งชื่อและการระบุเอกลักษณ์', en: 'Naming and identification', detail: 'ตั้งชื่อ/รหัสองค์ประกอบข้อมูลตามหลักที่กำหนด เพื่อระบุเอกลักษณ์ไม่ซ้ำ — แมปกับมิติความไม่ซ้ำซ้อน', dimensions: ['UNIQUENESS'], weight: 1.0 },
      { id: '11179-6', th: 'Part 6: การลงทะเบียน', en: 'Registration', detail: 'สถานะการลงทะเบียนขององค์ประกอบข้อมูล (Preferred/Standard/Recorded) — ตรวจด้วยความครบถ้วนของข้อมูลจำแนกประเภทในแดชบอร์ด', dimensions: ['COMPLETENESS', 'CURRENTNESS'], weight: 0.75 },
    ],
  },
]

/* ==================== ส่วนที่ 2 — การจำแนกประเภทข้อมูล ==================== */

export interface ClassificationStandard {
  name: string
  /** มิติ DQ ที่มาตรฐานนี้ให้น้ำหนัก — ใช้ประเมินความครอบคลุมของกฎในระบบ */
  dims: DimensionKey[]
}

export interface DataClassificationDef {
  id: string
  no: string // 5.1 ... 5.11
  th: string
  en: string
  description: string
  standards: ClassificationStandard[]
  /** มิติ DQ ที่เน้นตรวจของประเภทนี้ (รวมจากทุกมาตรฐาน) */
  focusDimensions: DimensionKey[]
  /** ผลกระทบเมื่อคุณภาพข้อมูลประเภทนี้ไม่ดี (ใช้ในแดชบอร์ด Risk ด้วย) */
  impacts: string[]
}

export const DATA_CLASSIFICATIONS: DataClassificationDef[] = [
  {
    id: 'DATA_GOVERNANCE',
    no: '5.1',
    th: 'การกำกับดูแลข้อมูลองค์กร',
    en: 'Enterprise Data Governance',
    description: 'ข้อมูลหลักและทะเบียนกลางขององค์กรที่ใช้เป็นแหล่งอ้างอิงของทุกระบบ',
    standards: [
      { name: 'แนวนโยบาย Data Governance ของ ธปท.', dims: ['COMPLETENESS', 'ACCURACY', 'INTEGRITY'] },
      { name: 'DAMA-DMBOK', dims: ['ACCURACY', 'COMPLETENESS', 'CONSISTENCY', 'VALIDITY', 'UNIQUENESS', 'INTEGRITY', 'TIMELINESS', 'CURRENTNESS', 'REASONABLENESS'] },
      { name: 'DCAM (EDM Council)', dims: ['COMPLETENESS', 'CONSISTENCY', 'INTEGRITY'] },
    ],
    focusDimensions: ['ACCURACY', 'COMPLETENESS', 'CONSISTENCY', 'VALIDITY', 'UNIQUENESS', 'INTEGRITY', 'TIMELINESS', 'CURRENTNESS', 'REASONABLENESS'],
    impacts: ['การกำกับดูแลข้อมูลไม่ครบถ้วน', 'ระบบอื่นอ้างอิงค่าที่ผิดพลาดลุกลามทั้งองค์กร', 'ตรวจสอบย้อนหลังไม่ได้'],
  },
  {
    id: 'RISK_REPORTING',
    no: '5.2',
    th: 'การรวมและรายงานความเสี่ยง',
    en: 'Risk Aggregation and Reporting',
    description: 'ข้อมูลที่ใช้รวมกลุ่มความเสี่ยงและรายงานผู้บริหาร/ผู้กำกับดูแล',
    standards: [{ name: 'BCBS 239', dims: ['ACCURACY', 'COMPLETENESS', 'TIMELINESS', 'CONSISTENCY'] }],
    focusDimensions: ['ACCURACY', 'COMPLETENESS', 'TIMELINESS', 'CONSISTENCY'],
    impacts: ['รายงานความเสี่ยงคลาดเคลื่อน กระทบการตัดสินใจระดับบริหาร', 'ส่งรายงานต่อผู้กำกับดูแลล่าช้า/ผิด', 'วัดความเสี่ยงรวมไม่ได้จริง'],
  },
  {
    id: 'CUSTOMER_PERSONAL',
    no: '5.3',
    th: 'ข้อมูลส่วนบุคคลของลูกค้า',
    en: 'Customer Personal Data',
    description: 'ข้อมูลส่วนบุคคลของลูกค้าทุกช่องทาง — ต้องปิดบัง PII ตามบทบาทเสมอ',
    standards: [{ name: 'Thailand PDPA', dims: ['ACCURACY', 'CURRENTNESS', 'UNIQUENESS'] }],
    focusDimensions: ['ACCURACY', 'CURRENTNESS', 'UNIQUENESS'],
    impacts: ['ประมวลผลข้อมูลส่วนบุคคลไม่ถูกต้อง — เสี่ยงละเมิด PDPA', 'ติดต่อลูกค้าผิดช่องทาง/ผิดคน', 'สิทธิ์ของเจ้าของข้อมูล (แก้ไข/คัดค้าน) ดำเนินการไม่ได้'],
  },
  {
    id: 'CARD_PAYMENT',
    no: '5.4',
    th: 'การชำระเงินด้วยบัตร',
    en: 'Card Payment',
    description: 'ข้อมูลธุรกรรมบัตรและทะเบียนบัญชี/บัตรที่เกี่ยวข้องกับการชำระเงิน',
    standards: [{ name: 'PCI DSS', dims: ['UNIQUENESS', 'INTEGRITY', 'ACCURACY'] }],
    focusDimensions: ['UNIQUENESS', 'INTEGRITY', 'ACCURACY'],
    impacts: ['ธุรกรรมบัตรผิดพลาด/ปฏิเสธรายการเพิ่มขึ้น', 'ตรวจสอบย้อนหลังธุรกรรมไม่ได้ — เสี่ยงไม่ผ่าน PCI DSS', 'ค่าปรับและข้อร้องเรียนจากผู้ถือบัตร'],
  },
  {
    id: 'SWIFT_TRANSACTION',
    no: '5.5',
    th: 'ธุรกรรมโอนข้ามประเทศ',
    en: 'SWIFT Transaction',
    description: 'ข้อความ/ธุรกรรมโอนระหว่างประเทศผ่านเครือข่าย SWIFT',
    standards: [{ name: 'SWIFT Customer Security Controls Framework (CSCF)', dims: ['INTEGRITY', 'VALIDITY', 'TIMELINESS'] }],
    focusDimensions: ['INTEGRITY', 'VALIDITY', 'TIMELINESS'],
    impacts: ['ธุรกรรมถูกปฏิเสธ/คืนสถานะ กระทบช่องทางโอนต่างประเทศ', 'เสี่ยงไม่สอดคล้อง SWIFT CSCF', 'ค่าธรรมเนียม/ความเสียหายจากรายการล่าช้า'],
  },
  {
    id: 'AML_KYC',
    no: '5.6',
    th: 'AML/KYC — ต่อต้านการฟอกเงิน',
    en: 'AML/KYC',
    description: 'ข้อมูลรู้จักลูกค้า (KYC) และธุรกรรมที่ใช้ตรวจต่อต้านการฟอกเงิน',
    standards: [
      { name: 'กฎหมาย ปปง. (พ.ร.บ.ป้องกันและปราบปรามการฟอกเงิน)', dims: ['COMPLETENESS', 'ACCURACY', 'CURRENTNESS'] },
      { name: 'FATF Recommendations', dims: ['ACCURACY', 'COMPLETENESS'] },
    ],
    focusDimensions: ['COMPLETENESS', 'ACCURACY', 'CURRENTNESS'],
    impacts: ['รายงานธุรกรรมต้องสงสัยต่อ ปปง. คลาดเคลื่อน/ล่าช้า', 'ตรวจ KYC ไม่ครบ — เสี่ยงความเสี่ยงการฟอกเงินผ่านระบบ', 'โทษทางกฎหมายและชื่อเสียงของสถาบันการเงิน'],
  },
  {
    id: 'FINANCIAL_REPORTING',
    no: '5.7',
    th: 'การรายงานทางการเงิน',
    en: 'Financial Reporting',
    description: 'ข้อมูลที่ป้อนงบการเงินและรายงานบัญชี รวมถึงอัตรา/มูลค่าที่ใช้ประเมิน',
    standards: [
      { name: 'TFRS / IFRS', dims: ['ACCURACY', 'COMPLETENESS', 'CONSISTENCY'] },
      { name: 'กฎหมายว่าด้วยการบัญชี', dims: ['ACCURACY', 'COMPLETENESS'] },
      { name: 'SOX (เมื่อเข้าเงื่อนไข — บริษัทจดทะเบียนในสหรัฐฯ)', dims: ['ACCURACY', 'INTEGRITY'] },
    ],
    focusDimensions: ['ACCURACY', 'COMPLETENESS', 'CONSISTENCY'],
    impacts: ['งบการเงินและรายงานบัญชีคลาดเคลื่อน', 'สอบบัญชี/สอบประเมินผ่านยาก', 'การประเมินมูลค่า (เช่น FX) ใช้อัตราผิด'],
  },
  {
    id: 'CREDIT_DATA',
    no: '5.8',
    th: 'ข้อมูลเครดิต',
    en: 'Credit Data',
    description: 'ข้อมูลวงเงิน พฤติกรรมชำระหนี้ และข้อมูลที่ส่งต่อศูนย์ข้อมูลเครดิต',
    standards: [
      { name: 'กฎหมายว่าด้วยข้อมูลเครดิต', dims: ['ACCURACY', 'CURRENTNESS'] },
      { name: 'Thailand PDPA', dims: ['ACCURACY', 'CURRENTNESS', 'UNIQUENESS'] },
    ],
    focusDimensions: ['ACCURACY', 'CURRENTNESS', 'UNIQUENESS'],
    impacts: ['คะแนนเครดิต/การประเมินผ่อนชำระผิดพลาด', 'ส่งข้อมูลเครดิตต่อศูนย์ข้อมูลเครดิตผิด', 'ข้อพิพาทกับลูกหนี้และหน่วยงานกำกับ'],
  },
  {
    id: 'OPERATIONAL_RESILIENCE',
    no: '5.9',
    th: 'ความยืดหยุ่นเชิงปฏิบัติการ',
    en: 'Operational Resilience',
    description: 'ข้อมูลที่ใช้ควบคุมความต่อเนื่อง การกู้คืน และการเฝ้าระวังการดำเนินงาน',
    standards: [
      { name: 'แนวปฏิบัติ ธปท. ด้านความต่อเนื่อง', dims: ['TIMELINESS', 'COMPLETENESS'] },
      { name: 'ISO 22301 (BCM)', dims: ['TIMELINESS', 'COMPLETENESS'] },
    ],
    focusDimensions: ['TIMELINESS', 'COMPLETENESS'],
    impacts: ['กู้คืนระบบ/บริการล่าช้ากว่า RTO', 'ตัดสินใจจัดการเหตุฉุกเฉินบนข้อมูลไม่ครบ', 'บริการหยุดชะงักกระทบลูกค้า'],
  },
  {
    id: 'CYBERSECURITY',
    no: '5.10',
    th: 'ความมั่นคงปลอดภัยไซเบอร์',
    en: 'Cybersecurity',
    description: 'ข้อมูลเหตุการณ์ บันทึกระบบ (log) และภูมิหลังภัยคุกคามที่ใช้เฝ้าระวัง',
    standards: [
      { name: 'แนวปฏิบัติ ธปท. ด้านความมั่นคงปลอดภัย', dims: ['TIMELINESS', 'INTEGRITY'] },
      { name: 'ISO/IEC 27001', dims: ['INTEGRITY', 'CONSISTENCY'] },
      { name: 'NIST CSF', dims: ['TIMELINESS', 'COMPLETENESS'] },
    ],
    focusDimensions: ['TIMELINESS', 'INTEGRITY', 'CONSISTENCY', 'COMPLETENESS'],
    impacts: ['ตรวจจับภัยคุกคามล่าช้า/ตกหล่น', 'log ไม่ครบหรือถูกแก้ไข — ตรวจสอบเหตุการณ์ไม่ได้', 'รายงานเหตุต่อผู้กำกับดูแลไม่ตรงเวลา'],
  },
  {
    id: 'OUTSOURCING_CLOUD',
    no: '5.11',
    th: 'Outsourcing / Cloud',
    en: 'Outsourcing & Cloud',
    description: 'ข้อมูลที่อยู่กับผู้ให้บริการภายนอก/คลาวด์ รวมถึงข้อมูลควบคุมผู้รับจ้าง',
    standards: [
      { name: 'หลักเกณฑ์ ธปท. ว่าด้วยการจ้างผู้ให้บริการด้านเทคโนโลยี', dims: ['INTEGRITY', 'TIMELINESS', 'COMPLETENESS'] },
      { name: 'Third-party Risk Management', dims: ['COMPLETENESS', 'CONSISTENCY'] },
      { name: 'Cloud Security Controls', dims: ['INTEGRITY', 'VALIDITY'] },
    ],
    focusDimensions: ['INTEGRITY', 'TIMELINESS', 'COMPLETENESS', 'CONSISTENCY'],
    impacts: ['ผู้ให้บริการเข้าถึง/ส่งข้อมูลผิดขอบเขต', 'ตรวจสอบและติดตามผู้รับจ้างไม่ได้', 'เสี่ยงไม่สอดคล้องหลักเกณฑ์การใช้คลาวด์'],
  },
]

export const UNCLASSIFIED = 'UNCLASSIFIED'

export const CLASSIFICATION_KEYS: string[] = [...DATA_CLASSIFICATIONS.map((c) => c.id), UNCLASSIFIED]

export function isClassificationKey(v: string): boolean {
  return CLASSIFICATION_KEYS.includes(v)
}

export function classificationLabel(id: string): { th: string; en: string; no: string } {
  const def = DATA_CLASSIFICATIONS.find((c) => c.id === id)
  if (def) return { th: def.th, en: def.en, no: def.no }
  return { th: 'ยังไม่จำแนกประเภท', en: 'Unclassified', no: '—' }
}

/* ==================== ส่วนที่ 3 — Logic ความเสี่ยง (Risk / DQ Impact) ==================== */

/** น้ำหนักระดับผลกระทบ (มาจาก severity ของกฎ) */
export const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2 }

/** ช่วงอัตราการล้มเหลวต่อระดับโอกาสเกิด 1–5 — likelihoodOf ใช้ตารางนี้เป็นเกณฑ์เดียว
 *  และแดชบอร์ด Risk (Risk Methodology) แสดงค่าจากตารางนี้โดยตรง เพื่อไม่ให้เกณฑ์คลาดกันระหว่าง "ตัวเลขที่คำนวณ" กับ "ตัวเลขที่แสดง" */
export const LIKELIHOOD_BANDS: Array<{ level: number; label: string; en: string; minFailRate: number }> = [
  { level: 5, label: 'สูงมาก', en: 'Very high', minFailRate: 0.5 },
  { level: 4, label: 'สูง', en: 'High', minFailRate: 0.25 },
  { level: 3, label: 'ปานกลาง', en: 'Medium', minFailRate: 0.1 },
  { level: 2, label: 'ต่ำ', en: 'Low', minFailRate: 0.03 },
  { level: 1, label: 'หายาก', en: 'Rare', minFailRate: 0 },
]

/** ระดับโอกาสเกิด 1–5 จากอัตราการล้มเหลวของผลตรวจล่าสุด (เกณฑ์ตามตาราง LIKELIHOOD_BANDS) */
export function likelihoodOf(failRate: number): { level: number; label: string } {
  for (const band of LIKELIHOOD_BANDS) {
    if (failRate >= band.minFailRate) return { level: band.level, label: band.label }
  }
  return { level: 1, label: 'หายาก' }
}

export type RiskBand = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

/** ช่วงคะแนนต่อระดับความเสี่ยง (คะแนน = โอกาส 1–5 × ผลกระทบ 2–5 = 2–25) — riskBandOf ใช้ตารางนี้เป็นเกณฑ์เดียว
 *  และแดชบอร์ด Risk (Risk Methodology) แสดงค่าจากตารางนี้โดยตรง */
export const RISK_BANDS: Array<{ band: RiskBand; label: string; minScore: number; className: string }> = [
  { band: 'CRITICAL', label: 'สูงมาก', minScore: 15, className: 'bg-rose-50 text-rose-800 border-rose-200' },
  { band: 'HIGH', label: 'สูง', minScore: 8, className: 'bg-orange-50 text-orange-800 border-orange-200' },
  { band: 'MEDIUM', label: 'ปานกลาง', minScore: 4, className: 'bg-amber-50 text-amber-900 border-amber-200' },
  { band: 'LOW', label: 'ต่ำ', minScore: 0, className: 'bg-slate-50 text-slate-700 border-slate-200' },
]

/** จัดระดับความเสี่ยงจากคะแนน (โอกาส 1–5 × ผลกระทบ 2–5 = 2–25) — เกณฑ์ตามตาราง RISK_BANDS */
export function riskBandOf(score: number): { band: RiskBand; label: string; className: string } {
  for (const band of RISK_BANDS) {
    if (score >= band.minScore) return { band: band.band, label: band.label, className: band.className }
  }
  return { band: 'LOW', label: 'ต่ำ', className: 'bg-slate-50 text-slate-700 border-slate-200' }
}

/** ผลกระทบทางธุรกิจของแต่ละมิติ — ใช้เป็น "มุม DQ Impact" ของแดชบอร์ดความเสี่ยง */
export const DIMENSION_IMPACTS: Record<DimensionKey, string[]> = {
  ACCURACY: ['การตัดสินใจบนข้อมูลผิดพลาด', 'รายงานต่อผู้กำกับดูแลคลาดเคลื่อน'],
  COMPLETENESS: ['กระบวนการต่อเนื่องไม่สมบูรณ์', 'ตรวจสอบย้อนหลังไม่ครบ'],
  CONSISTENCY: ['ข้อมูลข้ามระบบไม่ตรงกัน', 'การกระทบยอดล้มเหลว'],
  VALIDITY: ['ระบบปฏิเสธรับข้อมูล', 'การส่งต่อระหว่างระบบผิดพลาด'],
  UNIQUENESS: ['ระเบียนลูกค้า/รายการซ้ำซ้อน', 'ประเมินความเสี่ยงผิดจากระเบียนซ้ำ'],
  INTEGRITY: ['การเชื่อมโยงระหว่างระบบเสียหาย', 'สืบค้นที่มาข้อมูลไม่ได้'],
  TIMELINESS: ['รายงานส่งล่าช้าเกิน SLA', 'ตรวจจับความเสี่ยงไม่ทันการณ์'],
  CURRENTNESS: ['ใช้ข้อมูลเก่าตัดสินใจ', 'ติดต่อลูกค้าด้วยข้อมูลหมดอายุ'],
  REASONABLENESS: ['ยอดเงินผิดปกติไม่ถูกจับตา', 'ความเสี่ยงฉ้อโกงสูงขึ้น'],
}

/** ผลกระทบรวมของกฎที่ล้มเหลว = ผลกระทบของมิติ + ผลกระทบของประเภทข้อมูล (ถ้าจำแนกแล้ว) */
export function impactsOf(dimension: DimensionKey, classification: string | null): string[] {
  const list = [...DIMENSION_IMPACTS[dimension]]
  const def = DATA_CLASSIFICATIONS.find((c) => c.id === classification)
  if (def) for (const i of def.impacts) if (!list.includes(i)) list.push(i)
  return list
}

/** สถานะความครอบคลุมของมาตรฐานในระบบ (แดชบอร์ด Classification / Regulation) */
export type CoverageStatus = 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'NOT_MEASURED'

export function coverageStatusOf(score: number | null, rulesCount: number): { status: CoverageStatus; label: string; className: string } {
  if (rulesCount === 0) return { status: 'NOT_COVERED', label: 'ยังไม่มีกฎครอบคลุม', className: 'bg-slate-50 text-slate-600 border-slate-200' }
  if (score === null) return { status: 'NOT_MEASURED', label: 'ยังไม่ได้รันตรวจ', className: 'bg-slate-50 text-slate-600 border-slate-200' }
  if (score >= 85) return { status: 'COVERED', label: 'ครอบคลุม — คุณภาพดี', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
  return { status: 'PARTIAL', label: 'บางส่วน — ต้องปรับปรุง', className: 'bg-amber-50 text-amber-900 border-amber-200' }
}
