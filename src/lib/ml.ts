/**
 * ML Evaluations — ค่าคงที่และเกณฑ์ทั้งหมดของฟีเจอร์ ML (v0.25.0 · ปรับได้จากการใช้งานจริงตั้งแต่ v0.28.0)
 * หลักการเดียวกับ src/lib/regulation.ts: ตารางข้อมูลเป็น single source of truth
 * — engine อ่านจากตารางนี้ และ UI แสดงเกณฑ์จากตารางนี้โดยตรง (แก้ที่เดียวเปลี่ยนทั้งระบบ)
 *
 * v0.28.0 — เกณฑ์ปรับได้: ทุกฟังก์ชันรับ settings (MlCriteria) เป็นพารามิเตอร์เสริม
 * ไม่ส่ง = ใช้ค่าเริ่มต้นจากตารางค่าคงที่ด้านล่าง (ค่าจริงปรับได้ผ่านหน้า "ศูนย์ ML" — เก็บใน DqMlSettings)
 *
 * ขอบเขตทางจริยธรรมที่ล็อกไว้: ML เป็น "สัญญาณรอมนุษย์ทบทวน" เท่านั้น
 * ไม่ตัดสินผ่าน/ไม่ผ่านแทน threshold เดิม และไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
 */

/** จำนวนรอบประวัติสูงสุดที่ใช้คำนวณ baseline ต่อกฎ×ชุดข้อมูล (ตัดรอบปัจจุบันออกเสมอ) — ค่าเริ่มต้น */
export const ML_WINDOW = 10

/** ประวัติน้อยกว่านี้ = ยังไม่ประเมิน (INSUFFICIENT_HISTORY) — โปร่งใสแทนการเดา — ค่าเริ่มต้น */
export const ML_MIN_HISTORY = 5

/** วิธีคำนวณหลัก (โชว์บนหน้าจอเพื่อตรวจย้อน) */
export const ANOMALY_METHOD = 'MEDIAN_MAD_Z'

/** MAD × ค่านี้ ≈ SD (สมมติการกระจายปกติ) — คงที่ ไม่ปรับ */
export const MAD_TO_SD = 1.4826

/** พื้น MAD ต่ำสุด (0.5% ของ failRate) — กันหารศูนย์เมื่อประวัตินิ่งสนิท — คงที่ ไม่ปรับ */
export const MIN_MAD = 0.005

/** ตารางระดับความผิดปกติจากคะแนน z (ค่าเริ่มต้น) — ศัพท์ตรงกับระดับความเสี่ยงของระบบ (RISK_BANDS) */
export const Z_LEVELS: Array<{ minZ: number; level: 'CRITICAL' | 'HIGH' | 'MEDIUM'; label: string; badgeClass: string }> = [
  { minZ: 3, level: 'CRITICAL', label: 'สูงมาก', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200' },
  { minZ: 2, level: 'HIGH', label: 'สูง', badgeClass: 'bg-orange-50 text-orange-800 border-orange-200' },
  { minZ: 1, level: 'MEDIUM', label: 'ปานกลาง', badgeClass: 'bg-amber-50 text-amber-900 border-amber-200' },
]

/** ระดับ z ต่ำสุดที่ถือว่า "ผิดปกติ" (ต่ำกว่านี้ = NORMAL ไม่แจ้งเตือน) — ค่าเริ่มต้น = zMedium */
export const Z_MIN_ANOMALY = 1

/** คุณภาพเส้นแนวโน้ม (R²) ต่ำสุดที่ถือว่า drift มีนัยสำคัญ — ค่าเริ่มต้น */
export const DRIFT_R2_MIN = 0.6

/** สัดส่วนความล้มเหลวขั้นต่ำที่กลุ่มต้องครอบจึงเสนอเป็น "สมมติฐานสาเหตุร่วม" (0–1) — ค่าเริ่มต้น */
export const CLUSTER_SHARE_MIN = 0.4

/** ระดับ anomaly ที่หยอดเข้ากล่องสัญญาณ (DqSignal) ให้มนุษย์ทบทวน — ตามมติผู้ใช้ v0.25.0 (คงที่ ไม่ปรับ) */
export const SIGNAL_LEVELS: Array<'CRITICAL' | 'HIGH'> = ['CRITICAL', 'HIGH']

/**
 * เกณฑ์ของ ML ส่วน ①④ ที่ปรับได้ (v0.28.0) — engine/UI รับเป็นพารามิเตอร์
 * ค่าจริงอ่านจาก DqMlSettings ผ่าน src/lib/ml-settings-server.ts (ไม่มีแถว = ใช้ค่าเริ่มต้นด้านล่าง)
 * ห้ามใส่ f* (พยากรณ์) ที่นี่ — อยู่ใน MlSettings ของ ml-settings.ts เพื่อไม่ให้ ml.ts พึง forecast.ts (กัน cycle)
 */
export interface MlCriteria {
  mlWindow: number
  mlMinHistory: number
  zCritical: number
  zHigh: number
  zMedium: number
  driftR2Min: number
  clusterShareMin: number
}

/** ค่าเริ่มต้นของเกณฑ์ ①④ — อ้างอิงตารางค่าคงที่ด้านบนเสมอ (anti-drift — ตัวเลขจริงอยู่ที่เดียว) */
export const DEFAULT_ML_CRITERIA: MlCriteria = {
  mlWindow: ML_WINDOW,
  mlMinHistory: ML_MIN_HISTORY,
  zCritical: Z_LEVELS[0].minZ,
  zHigh: Z_LEVELS[1].minZ,
  zMedium: Z_LEVELS[2].minZ,
  driftR2Min: DRIFT_R2_MIN,
  clusterShareMin: CLUSTER_SHARE_MIN,
}

type ZThresholds = Pick<MlCriteria, 'zCritical' | 'zHigh' | 'zMedium'>

/** ตารางระดับ z จาก settings ปัจจุบัน — รูปทรงเดียวกับ Z_LEVELS (ค่าเริ่มต้น) เพื่อให้ UI ใช้แทนกันได้ */
export function zBandsOf(s: ZThresholds): Array<{ minZ: number; level: 'CRITICAL' | 'HIGH' | 'MEDIUM'; label: string; badgeClass: string }> {
  return [
    { minZ: s.zCritical, level: 'CRITICAL', label: Z_LEVELS[0].label, badgeClass: Z_LEVELS[0].badgeClass },
    { minZ: s.zHigh, level: 'HIGH', label: Z_LEVELS[1].label, badgeClass: Z_LEVELS[1].badgeClass },
    { minZ: s.zMedium, level: 'MEDIUM', label: Z_LEVELS[2].label, badgeClass: Z_LEVELS[2].badgeClass },
  ]
}

/** จัดระดับจากคะแนน z — ไม่ส่ง settings = ใช้ตาราง Z_LEVELS (ค่าเริ่มต้น) */
export function zLevelOf(
  z: number,
  s?: ZThresholds,
): { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL'; label: string; badgeClass: string } {
  const bands = s ? zBandsOf(s) : Z_LEVELS
  for (const band of bands) {
    if (z >= band.minZ) return { level: band.level, label: band.label, badgeClass: band.badgeClass }
  }
  return { level: 'NORMAL', label: 'ปกติ', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' }
}

/** ข้อความโครงสร้างเกณฑ์สำหรับ footnote บนหน้าจอ (ประกอบจาก settings ปัจจุบัน — ไม่ส่ง = ค่าเริ่มต้น) */
export function mlFootnoteTh(s: MlCriteria = DEFAULT_ML_CRITERIA): string {
  return (
    'วิธีคำนวณ: baseline = มัธยฐานอัตราล้มเหลว ' +
    s.mlWindow +
    ' รอบล่าสุด (ตัดรอบปัจจุบัน) · สเปรด = MAD × ' +
    MAD_TO_SD +
    ' (พื้น ' +
    (MIN_MAD * 100).toFixed(1) +
    '%) · z = |รอบนี้ − baseline| ÷ สเปรด → ระดับจากตารางเกณฑ์ · ประวัติ < ' +
    s.mlMinHistory +
    ' รอบ = ยังไม่ประเมิน'
  )
}