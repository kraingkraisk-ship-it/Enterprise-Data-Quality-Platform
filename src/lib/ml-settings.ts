/**
 * ML Settings (v0.28.0) — เกณฑ์ค่าคงที่ของ ML ที่ "ปรับได้จากการใช้งานจริง" (ไฟล์บริสุทธิ์ — ไม่ import db ใช้ฝั่ง client ได้)
 * - ค่าเริ่มต้นอ้างอิงตารางค่าคงที่เดิมใน src/lib/ml.ts + src/lib/forecast.ts (ตัวเลขจริงอยู่ที่เดียว — anti-drift)
 * - ตรวจความถูกต้องด้วย sanitizeMlSettings (ช่วงรายค่า + เงื่อนไขไขว้ระหว่างค่า)
 * - ค่าจริงเก็บในตาราง DqMlSettings (singleton) — อ่าน/บันทึกผ่าน src/lib/ml-settings-server.ts
 * - ปรับได้เฉพาะ "พารามิเตอร์การตรวจจับของ ML" — ห้ามแตะ LIKELIHOOD_BANDS/RISK_BANDS (วิธีการประเมินความเสี่ยงขององค์กร)
 */
import { DEFAULT_ML_CRITERIA, type MlCriteria } from '@/lib/ml'
import { F_MIN_SIGNAL_BAND, F_MIN_SLOPE, F_R2_HIGH } from '@/lib/forecast'

/** เกณฑ์ค่าคงที่ ML ทั้งหมด 10 ค่า (①④ จาก MlCriteria + ③ พยากรณ์ 3 ค่า) */
export interface MlSettings extends MlCriteria {
  fR2High: number
  fMinSlope: number
  fMinSignalBand: number
}

/** ค่าเริ่มต้นของทั้งระบบ — ตรงกับค่าคงที่เดิมทุกตัว (v0.25.0–v0.27.0) */
export const DEFAULT_ML_SETTINGS: MlSettings = {
  ...DEFAULT_ML_CRITERIA,
  fR2High: F_R2_HIGH,
  fMinSlope: F_MIN_SLOPE,
  fMinSignalBand: F_MIN_SIGNAL_BAND,
}

export type MlSettingsKey = keyof MlSettings

/** กลุ่มการแสดงผลบนหน้าจอปรับเกณฑ์ */
export const TUNABLE_GROUPS: Array<{ key: 'window' | 'zband' | 'drift' | 'forecast'; labelTh: string; descTh: string }> = [
  { key: 'window', labelTh: 'หน้าต่างประวัติ', descTh: 'ขนาดข้อมูลย้อนหลังที่ ML ใช้เรียนรู้ — มีผลกับ baseline (①) และเส้น trend (③)' },
  { key: 'zband', labelTh: 'เกณฑ์ความผิดปกติ (z)', descTh: 'จัดระดับความผิดปกติข้ามรอบจากคะแนน z — ปรับขึ้น = เข้มขึ้น (จับเฉพาะที่เบี่ยงเบนมาก) · ปรับลง = ไวขึ้น' },
  { key: 'drift', labelTh: 'แนวโน้มและสาเหตุร่วม', descTh: 'เกณฑ์นับ drift มีนัยสำคัญ (R²) และสัดส่วนที่กลุ่มจะถูกเสนอเป็นสมมติฐานสาเหตุร่วม' },
  { key: 'forecast', labelTh: 'การพยากรณ์แนวโน้ม (③)', descTh: 'ความแม่นยำของเส้น trend ทิศทางที่นับ และแถวโอกาสขั้นต่ำที่ส่งสัญญาณล่วงหน้า' },
]

/** นิยามรายค่าที่ปรับได้ — UI แสดงฟอร์มจากตารางนี้ engine ตรวจด้วยตารางนี้ (แหล่งเดียว) */
export interface TunableDef {
  key: MlSettingsKey
  group: (typeof TUNABLE_GROUPS)[number]['key']
  labelTh: string
  descTh: string
  min: number
  max: number
  step: number
  integer?: boolean
  /** true = แสดงเป็น % (ค่าเก็บเป็นสัดส่วน 0–1) */
  asPercent?: boolean
}

export const TUNABLE_DEFS: TunableDef[] = [
  {
    key: 'mlWindow',
    group: 'window',
    labelTh: 'หน้าต่างประวัติ (ML_WINDOW)',
    descTh: 'จำนวนรอบประวัติสูงสุดต่อกฎ×ชุดข้อมูลที่ใช้คำนวณ baseline และเส้น trend — เยอะ = เรียนรู้ยาว นิ่งกว่า · น้อย = ตอบสนองไวกว่า',
    min: 3,
    max: 30,
    step: 1,
    integer: true,
  },
  {
    key: 'mlMinHistory',
    group: 'window',
    labelTh: 'ประวัติขั้นต่ำ (ML_MIN_HISTORY)',
    descTh: 'ประวัติน้อยกว่านี้ = ยังไม่ประเมิน (แสดง "ยังไม่ประเมิน" แทนการเดา) — มากขึ้น = ต้องมีข้อมูลพอก่อนจึงจะตัดสิน',
    min: 3,
    max: 20,
    step: 1,
    integer: true,
  },
  {
    key: 'zCritical',
    group: 'zband',
    labelTh: 'สูงมาก — z ≥',
    descTh: 'คะแนน z ตั้งแต่ระดับนี้ขึ้นไป = สูงมาก (CRITICAL) — จะถูกส่งเข้ากล่องสัญญาณให้มนุษย์ทบทวน',
    min: 1,
    max: 6,
    step: 0.5,
  },
  {
    key: 'zHigh',
    group: 'zband',
    labelTh: 'สูง — z ≥',
    descTh: 'คะแนน z ตั้งแต่ระดับนี้ขึ้นไป (ต่ำกว่าเกณฑ์สูงมาก) = สูง (HIGH) — จะถูกส่งเข้ากล่องสัญญาณเช่นกัน',
    min: 0.5,
    max: 5,
    step: 0.5,
  },
  {
    key: 'zMedium',
    group: 'zband',
    labelTh: 'ปานกลาง — z ≥',
    descTh: 'คะแนน z ตั้งแต่ระดับนี้ขึ้นไป = ผิดปกติระดับปานกลาง — ต่ำกว่านี้ถือว่าปกติ (ไม่แจ้งเตือน)',
    min: 0.5,
    max: 4,
    step: 0.5,
  },
  {
    key: 'driftR2Min',
    group: 'drift',
    labelTh: 'คุณภาพเส้น trend ขั้นต่ำ (R²)',
    descTh: 'R² ต่ำสุดที่ถือว่าแนวโน้มมีนัยสำคัญ — ใช้ทั้ง drift ของ ① และความเชื่อมั่น "แม่นยำปานกลาง" ของ ③',
    min: 0.3,
    max: 0.95,
    step: 0.05,
  },
  {
    key: 'clusterShareMin',
    group: 'drift',
    labelTh: 'สัดส่วนสมมติฐานสาเหตุร่วม',
    descTh: 'กลุ่มความล้มเหลวที่ครอบสัดส่วนตั้งแต่ระดับนี้ขึ้นไปของทั้งรอบ จะถูกเสนอเป็น "สมมติฐานสาเหตุร่วม"',
    min: 0.1,
    max: 0.9,
    step: 0.05,
    asPercent: true,
  },
  {
    key: 'fR2High',
    group: 'forecast',
    labelTh: 'แม่นยำสูง — R² ≥',
    descTh: 'คุณภาพเส้น trend ที่ถือว่าพยากรณ์ "แม่นยำสูง" — ต่ำกว่านี้จะลดเป็นแม่นยำปานกลาง/ต่ำ',
    min: 0.5,
    max: 0.99,
    step: 0.05,
  },
  {
    key: 'fMinSlope',
    group: 'forecast',
    labelTh: 'ความชันขั้นต่ำที่มีทิศทาง',
    descTh: 'ความชันต่อรอบที่นับว่า "แย่ลง/ดีขึ้น" — ต่ำกว่านี้ถือว่าทรงตัว (0.01 = 1 จุด% ต่อรอบ)',
    min: 0,
    max: 0.1,
    step: 0.005,
    asPercent: true,
  },
  {
    key: 'fMinSignalBand',
    group: 'forecast',
    labelTh: 'แถวโอกาสขั้นต่ำที่ส่งสัญญาณ',
    descTh: 'ส่งสัญญาณล่วงหน้าเฉพาะเมื่อค่าคาดรอบถัดไปอยู่แถวโอกาสตั้งแต่ระดับนี้ขึ้นไป (3 = ปานกลาง ≥ 10% · 4 = สูง ≥ 25% · 5 = สูงมาก ≥ 50%)',
    min: 1,
    max: 5,
    step: 1,
    integer: true,
  },
]

export type SanitizeResult = { ok: true; values: MlSettings } | { ok: false; message: string }

/** ตรวจ + ปรับค่าจาก input (partial) — ค่าที่ไม่ส่งมาใช้ค่าเริ่มต้น · ผิดเงื่อนไขใดคืน ok:false พร้อมข้อความไทย */
export function sanitizeMlSettings(input: unknown): SanitizeResult {
  const raw = (input ?? {}) as Record<string, unknown>
  const values: MlSettings = { ...DEFAULT_ML_SETTINGS }

  for (const def of TUNABLE_DEFS) {
    const v0 = raw[def.key]
    if (v0 === undefined || v0 === null || v0 === '') continue
    const v = Number(v0)
    if (!Number.isFinite(v)) return { ok: false, message: `ค่า "${def.labelTh}" ต้องเป็นตัวเลข` }
    if (v < def.min || v > def.max) return { ok: false, message: `ค่า "${def.labelTh}" ต้องอยู่ระหว่าง ${def.min}–${def.max}` }
    if (def.integer && !Number.isInteger(v)) return { ok: false, message: `ค่า "${def.labelTh}" ต้องเป็นจำนวนเต็ม` }
    values[def.key] = v
  }

  if (!(values.zCritical > values.zHigh && values.zHigh > values.zMedium)) {
    return { ok: false, message: 'เกณฑ์ z ต้องเรียงจากมากไปน้อยเสมอ: สูงมาก > สูง > ปานกลาง' }
  }
  if (values.mlMinHistory > values.mlWindow) {
    return { ok: false, message: 'ประวัติขั้นต่ำต้องไม่มากกว่าหน้าต่างประวัติ (ไม่งั้นระบบจะไม่มีวันเริ่มประเมิน)' }
  }
  if (values.fR2High < values.driftR2Min) {
    return { ok: false, message: 'เกณฑ์ "แม่นยำสูง" ของพยากรณ์ต้องไม่ต่ำกว่าเกณฑ์ R² ของ drift' }
  }
  return { ok: true, values }
}

/** เทียบ settings กับค่าเริ่มต้น — จริง = ยังเป็นค่าเริ่มต้นทั้งชุด */
export function isDefaultMlSettings(s: MlSettings): boolean {
  return TUNABLE_DEFS.every((def) => s[def.key] === DEFAULT_ML_SETTINGS[def.key])
}

/** เลือกเฉพาะ 10 ค่าที่ปรับได้จาก object ใด ๆ (กัน key แปลกปลอมจาก DB/request) */
export function pickMlSettings(raw: unknown): MlSettings {
  const res = sanitizeMlSettings(raw)
  return res.ok ? res.values : { ...DEFAULT_ML_SETTINGS }
}