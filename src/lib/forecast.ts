/**
 * Quality Trend Forecasting (③) — ค่าคงที่และเกณฑ์ทั้งหมดของ "การพยากรณ์แนวโน้มคุณภาพข้อมูล" (v0.27.0 · ปรับได้ตั้งแต่ v0.28.0)
 * หลักการเดียวกับ src/lib/regulation.ts / ml.ts / sampling.ts: ตารางข้อมูลเป็น single source of truth
 * — engine อ่านจากตารางนี้ และ UI แสดงเกณฑ์จากตารางนี้โดยตรง (แก้ที่เดียวเปลี่ยนทั้งระบบ)
 *
 * ขอบเขตที่ล็อกไว้: พยากรณ์เป็น "สัญญาณล่วงหน้ารอมนุษย์ทบทวน" — ไม่ตัดสินผ่าน/ไม่ผ่านแทน threshold เดิม
 * ไม่แตะ DqRun.status และไม่แก้ข้อมูลใด ๆ · ใช้คณิต linear regression เดิมจาก ml-engine (slope + R²)
 * หน้าต่างและประวัติขั้นต่ำ reuse จาก src/lib/ml.ts (ML_WINDOW / ML_MIN_HISTORY) — ไม่ทำซ้ำค่า
 * v0.28.0 — เกณฑ์ปรับได้: ทุกฟังก์ชันรับ settings เป็นพารามิเตอร์เสริม ไม่ส่ง = ใช้ค่าเริ่มต้นจากตารางด้านล่าง
 */
import { DRIFT_R2_MIN, ML_MIN_HISTORY, ML_WINDOW } from '@/lib/ml'

/** วิธีพยากรณ์ (โชว์บนหน้าจอเพื่อตรวจย้อน) */
export const FORECAST_METHOD = 'LINEAR_TREND_FORECAST'

/** จุดพยากรณ์ (จำนวนรอบข้างหน้า) — คงที่ ไม่ปรับ */
export const FORECAST_HORIZONS = [1, 3, 5] as const

/** R² ที่ถือว่าเส้น trend แม่นยำสูง (≥ ค่านี้) — ต่ำกว่าเกณฑ์ drift = แม่นยำต่ำ — ค่าเริ่มต้น */
export const F_R2_HIGH = 0.8

/** ความชันขั้นต่ำที่ถือว่า "มีทิศทาง" — ต่ำกว่านี้ = ทรงตัว (0.01 = 1 จุด % ต่อรอบ) — ค่าเริ่มต้น */
export const F_MIN_SLOPE = 0.01

/** แถวโอกาสขั้นต่ำของค่าคาดรอบถัดไปที่จะส่งสัญญาณ (3 = ปานกลาง = อัตราคาด ≥ 10% ตาม LIKELIHOOD_BANDS) — ค่าเริ่มต้น */
export const F_MIN_SIGNAL_BAND = 3

/** เกณฑ์พยากรณ์ที่ปรับได้ (v0.28.0) — engine/UI รับเป็นพารามิเตอร์ (โครงสร้างแบบ structural ไม่พึง import type) */
export interface ForecastCriteria {
  fR2High: number
  fMinSlope: number
  fMinSignalBand: number
  driftR2Min: number
  mlWindow: number
  mlMinHistory: number
}

/** ค่าเริ่มต้นของเกณฑ์พยากรณ์ — อ้างอิงค่าคงที่ด้านบน + ml.ts เสมอ (anti-drift) */
export const DEFAULT_FORECAST_CRITERIA: ForecastCriteria = {
  fR2High: F_R2_HIGH,
  fMinSlope: F_MIN_SLOPE,
  fMinSignalBand: F_MIN_SIGNAL_BAND,
  driftR2Min: DRIFT_R2_MIN,
  mlWindow: ML_WINDOW,
  mlMinHistory: ML_MIN_HISTORY,
}

/** ความเชื่อมั่นจาก R² — HIGH ≥ fR2High · MEDIUM ≥ driftR2Min (ค่าเริ่มต้น 0.6 เดิมของ ①) · LOW ต่ำกว่านั้น */
export function confidenceOf(
  r2: number,
  s?: Pick<ForecastCriteria, 'fR2High' | 'driftR2Min'>,
): { key: 'HIGH' | 'MEDIUM' | 'LOW'; label: string; badgeClass: string } {
  const fR2High = s?.fR2High ?? F_R2_HIGH
  const driftR2Min = s?.driftR2Min ?? DRIFT_R2_MIN
  if (r2 >= fR2High) return { key: 'HIGH', label: 'แม่นยำสูง', badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
  if (r2 >= driftR2Min) return { key: 'MEDIUM', label: 'แม่นยำปานกลาง', badgeClass: 'border-amber-200 bg-amber-50 text-amber-900' }
  return { key: 'LOW', label: 'แม่นยำต่ำ', badgeClass: 'border-slate-200 bg-slate-50 text-slate-600' }
}

/** ทิศทางจากความชัน — บวก = แย่ลง (rose) · ลบ = ดีขึ้น (teal) · ใกล้ศูนย์ = ทรงตัว (slate) */
export function directionOf(
  slope: number,
  s?: Pick<ForecastCriteria, 'fMinSlope'>,
): { key: 'WORSE' | 'BETTER' | 'STABLE'; label: string; badgeClass: string; color: string } {
  const fMinSlope = s?.fMinSlope ?? F_MIN_SLOPE
  if (slope >= fMinSlope) return { key: 'WORSE', label: 'แย่ลง', badgeClass: 'border-rose-200 bg-rose-50 text-rose-800', color: '#e11d48' }
  if (slope <= -fMinSlope) return { key: 'BETTER', label: 'ดีขึ้น', badgeClass: 'border-teal-200 bg-teal-50 text-teal-800', color: '#0f766e' }
  return { key: 'STABLE', label: 'ทรงตัว', badgeClass: 'border-slate-200 bg-slate-50 text-slate-600', color: '#64748b' }
}

/** ข้อความเกณฑ์สำหรับ footnote บนหน้าจอ (ประกอบจาก settings ปัจจุบัน — ไม่ส่ง = ค่าเริ่มต้น) */
export function forecastFootnoteTh(s: ForecastCriteria = DEFAULT_FORECAST_CRITERIA): string {
  return (
    'พยากรณ์ = เส้น linear trend ของอัตราล้มเหลว ' +
    s.mlWindow +
    ' รอบล่าสุด (รวมรอบปัจจุบัน เรียงเวลาจริง) — ค่าคาด k รอบข้างหน้า = รอบล่าสุด + ความชัน × k (จำกัด 0–100%)' +
    ' · ความเชื่อมั่นจาก R²: ≥ ' +
    s.fR2High +
    ' = แม่นยำสูง / ≥ ' +
    s.driftR2Min +
    ' = แม่นยำปานกลาง / ต่ำกว่า = แม่นยำต่ำ · ทิศทางนับเมื่อ |ความชัน| ≥ ' +
    s.fMinSlope * 100 +
    ' จุด % ต่อรอบ · ประวัติต้องมีอย่างน้อย ' +
    s.mlMinHistory +
    ' รอบ จึงจะเริ่มพยากรณ์'
  )
}