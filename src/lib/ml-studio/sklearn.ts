/**
 * ML Studio — ตัวเชื่อมเอนจิน scikit-learn (v0.37.0) — รันฝั่ง server เท่านั้น
 * เอนจินเรียนรู้อยู่ที่ mini-services/ml-engine (พอร์ต 3020) — Next.js เรียกผ่าน localhost เท่านั้น
 * หลักการเดิมคงอยู่ที่แพลตฟอร์ม: ชุดฝึก = Data Asset · ผู้ติดป้าย = กฎ DQ · แบ่ง train/test แบบตรวจย้อนได้
 * เอนจินรับเพียง "เวกเตอร์คุณลักษณะ + ป้าย" — ไม่มีข้อมูลดิบ/PII ออกจากระบบ
 */

const BASE_URL = 'http://127.0.0.1:3020'

export interface SkTrainRow {
  features: Record<string, number>
  y: 0 | 1
}

export interface SkMetrics {
  accuracy: number | null
  precision: number | null
  recall: number | null
  f1: number | null
  rocAuc: number | null
  tp: number
  fp: number
  tn: number
  fn: number
}

export interface SkTrainResult {
  metrics: SkMetrics
  testProbabilities: number[]
  coefficients: Array<{ name: string; weight: number }>
  intercept: number
  featureCount: number
  sklearnVersion: string
  modelKey: string
}

/** error จากเอนจิน scikit-learn (แยกรหัส เช่น MODEL_NOT_FOUND เพื่อ degrade อย่างนุ่มนวล) */
export class SkEngineError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    throw new Error(
      `ติดต่อเอนจิน scikit-learn (บริการ ml-engine พอร์ต 3020) ไม่สำเร็จ — ตรวจว่าบริการทำงานอยู่ (${e instanceof Error ? e.message : 'unknown'})`,
    )
  }
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string; detail?: string }) | null
  if (!res.ok || !data || data.ok === false) {
    const code = data?.error ?? `HTTP ${res.status}`
    if (code === 'SINGLE_CLASS') {
      throw new Error('ชุดฝึกมีคลาสเดียว — โมเดลต้องเห็นทั้งแถว "ถูกต้อง" และ "ไม่ถูกต้อง" เพิ่มกฎ DQ หรือข้อมูลสอนก่อนเทรน')
    }
    if (code === 'MODEL_NOT_FOUND') {
      throw new SkEngineError('MODEL_NOT_FOUND', 'ไม่พบไฟล์โมเดลบนเอนจิน — เวอร์ชันนี้อาจถูกนำเข้าจากไฟล์หรือเทรนก่อนหน้าเอนจิน v0.37.0 (ต้องเทรนใหม่จึงใช้พยากรณ์ได้)')
    }
    throw new SkEngineError(code, `เอนจิน scikit-learn ผิดพลาด: ${code}${data?.detail ? ` (${data.detail})` : ''}`)
  }
  return data
}

/** เทรนโมเดล LogisticRegression — คืน metrics (จากชุดทดสอบ) + ความน่าจะเป็นรายแถวทดสอบ + สัมประสิทธิ์ */
export async function skTrain(input: { modelKey: string; train: SkTrainRow[]; test: SkTrainRow[]; randomState?: number }): Promise<SkTrainResult> {
  const data = await postJson<SkTrainResult>('/train', input, 120_000)
  return { ...data, modelKey: data.modelKey ?? input.modelKey }
}

/** พยากรณ์ความน่าจะเป็น "ไม่ถูกต้อง" รายแถว (ลำดับผลลัพธ์ตรงกับ rows ที่ส่งไป) */
export async function skPredict(modelKey: string, rows: Array<Record<string, number>>): Promise<number[]> {
  if (rows.length === 0) return []
  const data = await postJson<{ probabilities: number[] }>('/predict', { modelKey, rows }, 30_000)
  return data.probabilities ?? []
}
