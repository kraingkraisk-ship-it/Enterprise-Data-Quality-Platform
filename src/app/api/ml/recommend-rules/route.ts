/**
 * API /api/ml/recommend-rules (v0.35.0) — B1 แนะนำกฎสำหรับคอลัมน์ (ใช้ใน Rule Builder และ ML Studio)
 * GET ?assetId=&column= หรือ ?datasetId=&column= — สิทธิ์: REVIEW_SIGNALS
 * แนะนำจาก: ชนิดข้อมูลจริงของคอลัมน์ + โปรไฟล์ที่โมเดล ACTIVE เรียนรู้ + ประวัติสาเหตุจากการเทรน
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOperator } from '@/lib/operator'
import { recommendRules, recommendForDataset } from '@/lib/ml-studio/predict'

export async function GET(req: NextRequest) {
  try {
    const op = await resolveOperator(null, 'REVIEW_SIGNALS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const assetId = req.nextUrl.searchParams.get('assetId')?.trim() ?? ''
    const datasetId = req.nextUrl.searchParams.get('datasetId')?.trim() ?? ''
    const column = req.nextUrl.searchParams.get('column')?.trim() ?? ''
    if ((!assetId && !datasetId) || !column) {
      return NextResponse.json({ error: 'กรุณาระบุ assetId หรือ datasetId พร้อม column' }, { status: 400 })
    }

    const result = assetId ? await recommendRules(assetId, column) : await recommendForDataset(datasetId, column)
    return NextResponse.json(result)
  } catch (e) {
    console.error('GET /api/ml/recommend-rules', e)
    const message = e instanceof Error ? e.message : 'ไม่สามารถแนะนำกฎได้'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
