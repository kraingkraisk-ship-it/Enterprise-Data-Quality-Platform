/**
 * ML Evaluations — ค่าคงที่และเกณฑ์ทั้งหมดของฟีเจอร์ ML (v0.25.0)
 * หลักการเดียวกับ src/lib/regulation.ts: ตารางข้อมูลเป็น single source of truth
 * — engine อ่านจากตารางนี้ และ UI แสดงเกณฑ์จากตารางนี้โดยตรง (แก้ที่เดียวเปลี่ยนทั้งระบบ)
 *
 * ขอบเขตทางจริยธรรมที่ล็อกไว้: ML เป็น "สัญญาณรอมนุษย์ทบทวน" เท่านั้น
 * ไม่ตัดสินผ่าน/ไม่ผ่านแทน threshold เดิม และไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
 */

/** จำนวนรอบประวัติสูงสุดที่ใช้คำนวณ baseline ต่อกฎ×ชุดข้อมูล (ตัดรอบปัจจุบันออกเสมอ) */
export const ML_WINDOW = 10

/** ประวัติน้อยกว่านี้ = ยังไม่ประเมิน (INSUFFICIENT_HISTORY) — โปร่งใสแทนการเดา */
export const ML_MIN_HISTORY = 5

/** วิธีคำนวณหลัก (โชว์บนหน้าจอเพื่อตรวจย้อน) */
export const ANOMALY_METHOD = 'MEDIAN_MAD_Z'

/** MAD × ค่านี้ ≈ SD (สมมติการกระจายปกติ) */
export const MAD_TO_SD = 1.4826

/** พื้น MAD ต่ำสุด (0.5% ของ failRate) — กันหารศูนย์เมื่อประวัตินิ่งสนิท */
export const MIN_MAD = 0.005

/** ตารางระดับความผิดปกติจากคะแนน z — ศัพท์ตรงกับระดับความเสี่ยงของระบบ (RISK_BANDS) */
export const Z_LEVELS: Array<{ minZ: number; level: 'CRITICAL' | 'HIGH' | 'MEDIUM'; label: string; badgeClass: string }> = [
  { minZ: 3, level: 'CRITICAL', label: 'สูงมาก', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200' },
  { minZ: 2, level: 'HIGH', label: 'สูง', badgeClass: 'bg-orange-50 text-orange-800 border-orange-200' },
  { minZ: 1, level: 'MEDIUM', label: 'ปานกลาง', badgeClass: 'bg-amber-50 text-amber-900 border-amber-200' },
]

/** ระดับ z ต่ำสุดที่ถือว่า "ผิดปกติ" (ต่ำกว่านี้ = NORMAL ไม่แจ้งเตือน) */
export const Z_MIN_ANOMALY = 1

/** จัดระดับจากคะแนน z — อ่านจากตาราง Z_LEVELS เท่านั้น */
export function zLevelOf(z: number): { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL'; label: string; badgeClass: string } {
  for (const band of Z_LEVELS) {
    if (z >= band.minZ) return { level: band.level, label: band.label, badgeClass: band.badgeClass }
  }
  return { level: 'NORMAL', label: 'ปกติ', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' }
}

/** คุณภาพเส้นแนวโน้ม (R²) ต่ำสุดที่ถือว่า drift มีนัยสำคัญ */
export const DRIFT_R2_MIN = 0.6

/** สัดส่วนความล้มเหลวขั้นต่ำที่กลุ่มต้องครอบจึงเสนอเป็น "สมมติฐานสาเหตุร่วม" (0–1) */
export const CLUSTER_SHARE_MIN = 0.4

/** ระดับ anomaly ที่หยอดเข้ากล่องสัญญาณ (DqSignal) ให้มนุษย์ทบทวน — ตามมติผู้ใช้ v0.25.0 */
export const SIGNAL_LEVELS: Array<'CRITICAL' | 'HIGH'> = ['CRITICAL', 'HIGH']

/** ข้อความโครงสร้างเกณฑ์สำหรับ footnote บนหน้าจอ (แสดงจากค่าคงที่ข้างบนทั้งหมด) */
export const ML_FOOTNOTE_TH =
  'วิธีคำนวณ: baseline = มัธยฐานอัตราล้มเหลว ' +
  ML_WINDOW +
  ' รอบล่าสุด (ตัดรอบปัจจุบัน) · สเปรด = MAD × ' +
  MAD_TO_SD +
  ' (พื้น ' +
  (MIN_MAD * 100).toFixed(1) +
  '%) · z = |รอบนี้ − baseline| ÷ สเปรด → ระดับจากตารางเกณฑ์ · ประวัติ < ' +
  ML_MIN_HISTORY +
  ' รอบ = ยังไม่ประเมิน'
