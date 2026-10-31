/**
 * API /api/ml/run-summary (v0.37.0) — B2 สรุปหลังตรวจ + ขั้นตอนถัดไปที่แนะนำ
 * GET ?batchId= (ไม่ระบุ = รอบล่าสุด) — สิทธิ์: REVIEW_SIGNALS
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { summarizeRun } from '@/lib/ml-studio/predict'

export async function GET(req: NextRequest) {
  try {
    const op = await resolveOperator(null, 'REVIEW_SIGNALS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    let batchId = req.nextUrl.searchParams.get('batchId')?.trim() ?? ''
    if (!batchId) {
      const latest = await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } })
      batchId = latest?.id ?? ''
    }
    if (!batchId) {
      return NextResponse.json({ summary: null, message: 'ยังไม่มีรอบรัน (batch) — รัน validation ก่อน' })
    }
    const summary = await summarizeRun(batchId)
    if (!summary) return NextResponse.json({ summary: null, message: 'ไม่พบผลการรันของรอบนี้' })
    return NextResponse.json({ summary })
  } catch (e) {
    console.error('GET /api/ml/run-summary', e)
    return NextResponse.json({ error: 'ไม่สามารถสรุปผลรอบรันได้' }, { status: 500 })
  }
}
