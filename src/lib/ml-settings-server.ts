/**
 * ML Settings — ฝั่งเซิร์ฟเวอร์ (v0.28.0): อ่าน/บันทึกเกณฑ์ค่าคงที่ ML จากตาราง DqMlSettings (singleton id=1)
 * - ไม่มีแถวใน DB = ใช้ค่าเริ่มต้นจาก src/lib/ml-settings.ts (ระบบไม่เคยพังเพราะ settings)
 * - cache in-memory 5 วินาที เพื่อไม่ให้ทุกการประเมินต้องยิง DB — invalidate ทุกครั้งที่บันทึก
 * - DB อ่านไม่ได้ชั่วคราว = คืนค่าเริ่มต้น (ML ยังทำงานได้ปกติ — หลัก try/catch แยกของ v0.25.0)
 */
import { db } from '@/lib/db'
import { DEFAULT_ML_SETTINGS, sanitizeMlSettings, type MlSettings } from '@/lib/ml-settings'

const CACHE_TTL_MS = 5_000
let cache: { at: number; s: MlSettings } | null = null

/** อ่านเกณฑ์ ML ที่ใช้จริงตอนนี้ (cache 5 วิ) — ไม่มีแถว/ผิดรูป/DB ล้ม = ค่าเริ่มต้นเสมอ */
export async function getMlSettings(): Promise<MlSettings> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.s
  try {
    const row = await db.dqMlSettings.findUnique({ where: { id: 1 } })
    const res = row ? sanitizeMlSettings(row) : { ok: true as const, values: { ...DEFAULT_ML_SETTINGS } }
    const s = res.ok ? res.values : { ...DEFAULT_ML_SETTINGS }
    cache = { at: now, s }
    return s
  } catch (e) {
    console.error('getMlSettings failed — fallback to defaults', e)
    return { ...DEFAULT_ML_SETTINGS }
  }
}

/** บันทึกเกณฑ์ใหม่ (upsert singleton) + ล้าง cache — ผู้เรียกต้องผ่าน resolveOperator('REVIEW_SIGNALS') แล้ว */
export async function saveMlSettings(values: MlSettings, updatedBy: string): Promise<void> {
  await db.dqMlSettings.upsert({
    where: { id: 1 },
    update: { ...values, updatedBy },
    create: { id: 1, ...values, updatedBy },
  })
  cache = null
}