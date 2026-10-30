/**
 * API /api/ml/trends (v0.35.0) — แนวโน้มจากผล train/test: ความเสี่ยงซ้ำ · ความอ่อนร่วมข้ามโดเมน · แนวโน้มจากการสอน
 * GET — สิทธิ์: REVIEW_SIGNALS
 */
import { NextResponse } from 'next/server'
import { resolveOperator } from '@/lib/operator'
import { mlTrends } from '@/lib/ml-studio/predict'

export async function GET() {
  try {
    const op = await resolveOperator(null, 'REVIEW_SIGNALS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })
    const trends = await mlTrends()
    return NextResponse.json(trends)
  } catch (e) {
    console.error('GET /api/ml/trends', e)
    return NextResponse.json({ error: 'ไม่สามารถวิเคราะห์แนวโน้มได้' }, { status: 500 })
  }
}
