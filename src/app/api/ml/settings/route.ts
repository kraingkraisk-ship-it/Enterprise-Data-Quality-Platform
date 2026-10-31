/**
 * API /api/ml/settings (v0.37.0) — เกณฑ์ของ ML Studio (singleton)
 * GET — สิทธิ์: REVIEW_SIGNALS (ดูได้ทุกคนที่เห็นผล ML)
 * PUT {trainPct?, minTrainRows?, minTestRows?, confidenceHigh?, confidenceMedium?, auditSampleSize?, operatorEmail?}
 *   — สิทธิ์: TRAIN_ML_MODEL · บันทึก AuditLog (SET_ML_SETTINGS)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { getMlSettings } from '@/lib/ml-studio/train'

export async function GET() {
  try {
    const op = await resolveOperator(null, 'REVIEW_SIGNALS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })
    const settings = await getMlSettings()
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('GET /api/ml/settings', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดเกณฑ์ ML ได้' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'TRAIN_ML_MODEL')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const current = await getMlSettings()
    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, Math.round(n)))
    }
    const clampF = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, n))
    }

    const trainPct = clamp(body?.trainPct, 30, 90, current.trainPct)
    const minTrainRows = clamp(body?.minTrainRows, 10, 10000, current.minTrainRows)
    const minTestRows = clamp(body?.minTestRows, 5, 10000, current.minTestRows)
    const confidenceHigh = clampF(body?.confidenceHigh, 0.5, 1, current.confidenceHigh)
    const confidenceMedium = clampF(body?.confidenceMedium, 0.1, 0.9, current.confidenceMedium)
    const auditSampleSize = clamp(body?.auditSampleSize, 10, 100, current.auditSampleSize)

    if (confidenceMedium >= confidenceHigh) {
      return NextResponse.json({ error: 'ความเชื่อมั่นระดับกลางต้องต่ำกว่าระดับสูง' }, { status: 400 })
    }

    const settings = await db.mlSettings.update({
      where: { id: 1 },
      data: { trainPct, minTrainRows, minTestRows, confidenceHigh, confidenceMedium, auditSampleSize, updatedBy: op.ctx.email },
    })

    await db.auditLog.create({
      data: {
        action: 'SET_ML_SETTINGS',
        actor: op.ctx.email,
        target: 'ML Studio',
        detail: `ตั้งค่าเกณฑ์: แบ่งชุดฝึก ${settings.trainPct}% · ขั้นต่ำชุดฝึก ${settings.minTrainRows} แถว · ขั้นต่ำชุดทดสอบ ${settings.minTestRows} แถว · สุ่มตรวจรอบละ ${settings.auditSampleSize} แถว`,
      },
    })
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('PUT /api/ml/settings', e)
    return NextResponse.json({ error: 'ไม่สามารถบันทึกเกณฑ์ ML ได้' }, { status: 500 })
  }
}
