/**
 * GET /api/dq/ml/forecasts (v0.27.0 — ③ Quality Trend Forecasting)
 * คืนผลพยากรณ์แนวโน้มอัตราล้มเหลวรายกฎ พร้อมค่าคาด 1/3/5 รอบข้างหน้า
 * - ?batchId= ผลของ batch นั้น (ถ้ายังไม่เคยประเมิน → backfill คำนวณแล้วบันทึก ตามสเปก auto-compute)
 * - ไม่ระบุ → batch ล่าสุด · ถ้าไม่มี batch เลย (เช่นข้อมูล seed) → โหมดสด LATEST_RUNS (ไม่บันทึก)
 * เกณฑ์ทั้งหมดอยู่ที่ src/lib/forecast.ts — client import ตารางเดียวกันไปแสดงได้โดยตรง
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evaluateForecastBatch, evaluateForecastLatest, readForecastBatch } from '@/lib/forecast-engine'

export async function GET(req: NextRequest) {
  try {
    const batchIdParam = req.nextUrl.searchParams.get('batchId')?.trim() || ''

    if (batchIdParam) {
      const batch = await db.dqValidationBatch.findUnique({ where: { id: batchIdParam }, select: { id: true } })
      if (!batch) return NextResponse.json({ error: 'ไม่พบรอบรัน (batch) ที่ระบุ' }, { status: 404 })
      const stored = await readForecastBatch(batchIdParam)
      return NextResponse.json(stored ?? (await evaluateForecastBatch(batchIdParam)))
    }

    const latestBatch = await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (latestBatch) {
      const stored = await readForecastBatch(latestBatch.id)
      return NextResponse.json(stored ?? (await evaluateForecastBatch(latestBatch.id)))
    }

    // ยังไม่มี batch ในระบบ — โหมดสดจากผลรันล่าสุดรายกฎ (ไม่บันทึก)
    return NextResponse.json(await evaluateForecastLatest())
  } catch (e) {
    console.error('GET /api/dq/ml/forecasts', e)
    return NextResponse.json({ error: 'ไม่สามารถพยากรณ์แนวโน้มได้' }, { status: 500 })
  }
}
