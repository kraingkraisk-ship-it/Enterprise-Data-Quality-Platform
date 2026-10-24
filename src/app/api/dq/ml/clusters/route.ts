/**
 * GET /api/dq/ml/clusters (v0.25.0 — ④ Root Cause Clustering)
 * คืนกลุ่มสาเหตุร่วมของรอบรัน (exact-match ตามลายเซ็น แหล่งข้อมูล|ชุดข้อมูล|มิติ)
 * - ?batchId= ผลของ batch นั้น (ถ้ายังไม่เคยประเมิน → backfill)
 * - ไม่ระบุ → batch ล่าสุด · ถ้าไม่มี batch เลย → โหมดสด LATEST_RUNS (ไม่บันทึก)
 * หมายเหตุ: กลุ่มที่ sharePct ≥ CLUSTER_SHARE_MIN (40%) เท่านั้นที่มี hypothesis
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evaluateBatch, evaluateLatest, readBatchEvaluation } from '@/lib/ml-engine'

export async function GET(req: NextRequest) {
  try {
    const batchIdParam = req.nextUrl.searchParams.get('batchId')?.trim() || ''

    if (batchIdParam) {
      const batch = await db.dqValidationBatch.findUnique({ where: { id: batchIdParam }, select: { id: true } })
      if (!batch) return NextResponse.json({ error: 'ไม่พบรอบรัน (batch) ที่ระบุ' }, { status: 404 })
      const stored = await readBatchEvaluation(batchIdParam)
      return NextResponse.json(stored ?? (await evaluateBatch(batchIdParam)))
    }

    const latestBatch = await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (latestBatch) {
      const stored = await readBatchEvaluation(latestBatch.id)
      return NextResponse.json(stored ?? (await evaluateBatch(latestBatch.id)))
    }

    return NextResponse.json(await evaluateLatest())
  } catch (e) {
    console.error('GET /api/dq/ml/clusters', e)
    return NextResponse.json({ error: 'ไม่สามารถจัดกลุ่มสาเหตุร่วมได้' }, { status: 500 })
  }
}
