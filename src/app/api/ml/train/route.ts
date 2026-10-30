/**
 * API /api/ml/train (v0.35.0) — เทรนโมเดล ML Studio
 * POST {domainId?, trainPct?, note?, operatorEmail?} — สิทธิ์: TRAIN_ML_MODEL
 * ชุดฝึก = Data Asset ตามโดเมน · ผู้ติดป้าย = กฎ DQ ทุกข้อ · วัดคุณภาพบนชุดทดสอบ (% แบ่งรายแถว)
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOperator } from '@/lib/operator'
import { trainModel } from '@/lib/ml-studio/train'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'TRAIN_ML_MODEL')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const domainId = String(body?.domainId ?? '').trim()
    const trainPctRaw = body?.trainPct
    const trainPct = trainPctRaw === undefined || trainPctRaw === null || trainPctRaw === '' ? undefined : Number(trainPctRaw)
    if (trainPct !== undefined && (!Number.isFinite(trainPct) || trainPct < 30 || trainPct > 90)) {
      return NextResponse.json({ error: '% ชุดฝึกต้องอยู่ระหว่าง 30–90' }, { status: 400 })
    }

    const result = await trainModel({
      domainId,
      trainPct,
      note: String(body?.note ?? ''),
      trainedBy: op.ctx.email,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('POST /api/ml/train', e)
    const message = e instanceof Error ? e.message : 'ไม่สามารถเทรนโมเดลได้'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
