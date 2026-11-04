/**
 * GET /api/dq/ml/anomalies (v0.25.0 — ① Anomaly Detection)
 * คืนผลประเมินความผิดปกติข้ามรอบรายกฎ พร้อมประวัติ sparkline
 * - ?batchId= ผลของ batch นั้น (ถ้ายังไม่เคยประเมิน → backfill คำนวณแล้วบันทึก ตามสเปก auto-compute)
 * - ไม่ระบุ → batch ล่าสุด · ถ้าไม่มี batch เลย (เช่นข้อมูล seed) → โหมดสด LATEST_RUNS (ไม่บันทึก)
 * เกณฑ์ทั้งหมดอยู่ที่ src/lib/ml.ts — client import ตารางเดียวกันไปแสดงได้โดยตรง
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

    // ยังไม่มี batch ในระบบ — โหมดสดจากผลรันล่าสุดรายกฎ (ไม่บันทึก)
    return NextResponse.json(await evaluateLatest())
  } catch (e) {
    console.error('GET /api/dq/ml/anomalies', e)
    return NextResponse.json({ error: 'ไม่สามารถประเมินความผิดปกติได้' }, { status: 500 })
  }
}
