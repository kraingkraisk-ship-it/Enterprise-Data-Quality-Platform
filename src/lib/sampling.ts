/**
 * Risk-based Sampling — ค่าคงที่และเกณฑ์ทั้งหมดของ "แผนสุ่มตรวจตามความเสี่ยง" (v0.26.0)
 * หลักการเดียวกับ src/lib/regulation.ts และ src/lib/ml.ts: ตารางข้อมูลเป็น single source of truth
 * — engine อ่านจากตารางนี้ และ UI แสดงเกณฑ์จากตารางนี้โดยตรง (แก้ที่เดียวเปลี่ยนทั้งระบบ)
 *
 * ขอบเขตที่ล็อกไว้ (ต่อยอดมติผู้ใช้ v0.25.0 — นโยบายสุ่ม เต็ม/10%/5%/1%):
 * แผนสุ่มเป็น "งบการทบทวนให้มนุษย์" เท่านั้น — ไม่ตัดสินผ่าน/ไม่ผ่านแทน threshold เดิม
 * ไม่ลบ/แก้แถวข้อมูลใด ๆ และไม่ลดขอบเขตการตรวจ (validation ยังรันครบทุกแถวเหมือนเดิม)
 */

/** นโยบายงบการทบทวน — ตามมติผู้ใช้: เต็ม / 10% / 5% / 1% (ของแถวที่เก็บ snapshot ทบทวนได้ใน batch) */
export const SAMPLING_POLICIES: Array<{ key: 'FULL' | 'P10' | 'P5' | 'P1'; label: string; frac: number }> = [
  { key: 'FULL', label: 'เต็ม (100%)', frac: 1 },
  { key: 'P10', label: '10%', frac: 0.1 },
  { key: 'P5', label: '5%', frac: 0.05 },
  { key: 'P1', label: '1%', frac: 0.01 },
]

export type SamplingPolicyKey = (typeof SAMPLING_POLICIES)[number]['key']

export function isSamplingPolicyKey(v: unknown): v is SamplingPolicyKey {
  return SAMPLING_POLICIES.some((p) => p.key === v)
}

/** อ่านนโยบายจาก key — ไม่พบคืนค่าเริ่มต้น 10% (กัน key จาก DB เก่า/ผิดรูป) */
export function policyOf(key: string): { key: SamplingPolicyKey; label: string; frac: number } {
  const found = SAMPLING_POLICIES.find((p) => p.key === key)
  return found ?? SAMPLING_POLICIES[1]
}

/** คะแนนเสริมเมื่อ ML (v0.25.0) ตรวจพบความผิดปกติทิศ "แย่ลง" — รายระดับจาก Z_LEVELS */
export const ML_LEVEL_BOOST: Record<'CRITICAL' | 'HIGH' | 'MEDIUM', number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 }

/** คะแนนเสริมเมื่อมีแนวโน้มแย่ลงต่อเนื่อง (drift: slope > 0 และ R² ≥ DRIFT_R2_MIN) */
export const DRIFT_BOOST = 1

/** คะแนนเสริมเมื่อชุดข้อมูลมีคอลัมน์ PII (จากผล profiling ล่าสุด — piiColumnCount > 0) */
export const PII_BOOST = 1

/** เพดานคะแนน = โอกาส 1–5 × ผลกระทบ 2–5 (สเกลเดียวกับ Risk Methodology = 25) + เสริม 3+1+1 */
export const RISK_SCORE_MAX = 25 + ML_LEVEL_BOOST.CRITICAL + DRIFT_BOOST + PII_BOOST

/** วิธีจัดสรรงบ (โชว์บนหน้าจอเพื่อตรวจย้อน) */
export const SAMPLING_METHOD = 'RISK_WEIGHTED_LARGEST_REMAINDER_SEED'

/** เกลือ seed — เปลี่ยนค่านี้ = สุ่มชุดใหม่ทั้งระบบ (audit ต้องคงค่าเดิมเสมอ) */
export const SAMPLING_SEED_SALT = 'dq-review-sampling-v1'

/** ข้อความเกณฑ์สำหรับ footnote บนหน้าจอ (ประกอบจากค่าคงที่ข้างบนทั้งหมด — anti-drift) */
export const SAMPLING_FOOTNOTE_TH =
  'คะแนนความเสี่ยง = โอกาสเกิดจากอัตราล้มเหลว (1–5 ตาม LIKELIHOOD_BANDS) × น้ำหนักความรุนแรงของกฎ (2–5 ตาม SEVERITY_WEIGHT)' +
  ' + คะแนนเสริม: ML พบความผิดปกติทิศแย่ลง (สูงมาก +' +
  ML_LEVEL_BOOST.CRITICAL +
  ' / สูง +' +
  ML_LEVEL_BOOST.HIGH +
  ' / ปานกลาง +' +
  ML_LEVEL_BOOST.MEDIUM +
  ') · แนวโน้มแย่ลงต่อเนื่อง +' +
  DRIFT_BOOST +
  ' · ชุดข้อมูลมีคอลัมน์ PII +' +
  PII_BOOST +
  ' — จัดสรรงบแปรผันตามสัดส่วนคะแนน (largest remainder) เรียงจากความเสี่ยงสูงสุดก่อนเสมอ'
