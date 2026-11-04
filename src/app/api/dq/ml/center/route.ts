/**
 * GET /api/dq/ml/center (v0.28.0) — ข้อมูลหน้า "ศูนย์ ML" ใน response เดียว:
 * ภาพรวม 4 ตัว ML (① anomaly · ④ cluster · ③ forecast · ② sampling) + สุขภาพ ML
 * + แนวโน้มข้ามรอบ 8 batch ล่าสุด + ค่าดิบ (usage) สำหรับหน้าปรับเกณฑ์ค่าคงที่
 * - มี batch = อ่านผลที่บันทึกไว้ (backfill คำนวณถ้ายังไม่เคยประเมิน — แนวเดียวกับ /api/dq/ml/*)
 * - ไม่มี batch = โหมดสด LATEST_RUNS (ไม่บันทึก — เช่นข้อมูล seed)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMlSettings } from '@/lib/ml-settings-server'
import { evaluateBatch, evaluateLatest, readBatchEvaluation, type MlEvaluation } from '@/lib/ml-engine'
import { evaluateForecastBatch, evaluateForecastLatest, readForecastBatch, type ForecastEvaluation } from '@/lib/forecast-engine'
import { readSamplePlan } from '@/lib/sampling-engine'

export async function GET() {
  try {
    const s = await getMlSettings()
    const latestBatch = await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' } })

    let mode: 'BATCH' | 'LATEST_RUNS' = 'LATEST_RUNS'
    let batchId: string | null = null
    let batchAt: string | null = null
    let mlEval: MlEvaluation
    let fcEval: ForecastEvaluation
    if (latestBatch) {
      mode = 'BATCH'
      batchId = latestBatch.id
      batchAt = latestBatch.createdAt.toISOString()
      mlEval = (await readBatchEvaluation(latestBatch.id)) ?? (await evaluateBatch(latestBatch.id))
      fcEval = (await readForecastBatch(latestBatch.id)) ?? (await evaluateForecastBatch(latestBatch.id))
    } else {
      mlEval = await evaluateLatest()
      fcEval = await evaluateForecastLatest()
    }

    const plan = latestBatch ? await readSamplePlan(latestBatch.id) : null

    /* ---------- สรุปรายตัว ML ---------- */
    const anomalies = mlEval.anomalies
    const summaryAnomalies = {
      total: anomalies.length,
      critical: anomalies.filter((a) => a.level === 'CRITICAL').length,
      high: anomalies.filter((a) => a.level === 'HIGH').length,
      medium: anomalies.filter((a) => a.level === 'MEDIUM').length,
      better: anomalies.filter((a) => a.better).length,
      normal: anomalies.filter((a) => a.level === 'NORMAL' && !a.better).length,
      insufficient: anomalies.filter((a) => a.level === 'INSUFFICIENT_HISTORY').length,
      drift: anomalies.filter((a) => a.drift).length,
    }
    const clusters = mlEval.clusters
    const topCluster = clusters.length > 0 ? clusters.reduce((a, b) => (b.sharePct > a.sharePct ? b : a)) : null
    const summaryClusters = {
      total: clusters.length,
      withHypothesis: clusters.filter((c) => c.hypothesis).length,
      topSharePct: topCluster?.sharePct ?? 0,
      topLabel: topCluster ? `${topCluster.sourceType || 'ไม่ระบุแหล่ง'} · ${topCluster.datasetName}` : null,
    }
    const forecasts = fcEval.forecasts
    const summaryForecasts = {
      total: forecasts.length,
      worse: forecasts.filter((f) => f.direction.key === 'WORSE').length,
      better: forecasts.filter((f) => f.direction.key === 'BETTER').length,
      stable: forecasts.filter((f) => f.direction.key === 'STABLE').length,
      signals: forecasts.filter((f) => f.signalLevel !== null).length,
      insufficient: forecasts.filter((f) => f.windowSize < s.mlMinHistory).length,
    }
    const summarySampling = plan
      ? {
          policy: plan.policy,
          policyLabel: plan.policyLabel,
          budgetRows: plan.summary.budgetRows,
          reviewableRows: plan.summary.reviewableRows,
          includedGroups: plan.summary.includedGroups,
          totalGroups: plan.summary.totalGroups,
          riskCoveragePct: plan.summary.riskCoveragePct,
          createdAt: plan.createdAt,
        }
      : null

    /* ---------- สุขภาพ ML: คู่กฎ×ชุดข้อมูลพอประเมิน/ยังไม่พอ (ตามเกณฑ์ปัจจุบัน) ---------- */
    const pairs = anomalies.length
    const evaluated = anomalies.filter((a) => a.windowSize >= s.mlMinHistory).length
    const health = {
      pairs,
      evaluated,
      pending: pairs - evaluated,
      evaluatedPct: pairs > 0 ? Math.round((evaluated / pairs) * 100) : 0,
      datasets: new Set(anomalies.map((a) => a.datasetId)).size,
    }

    /* ---------- แนวโน้มข้ามรอบ 8 batch ล่าสุด (จากผลที่บันทึกไว้จริงใน DB) ---------- */
    const recentBatches = await db.dqValidationBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, createdAt: true, failedRules: true, overallScore: true },
    })
    const ids = recentBatches.map((b) => b.id)
    const [anomCounts, fcCounts] = ids.length
      ? await Promise.all([
          db.dqAnomaly.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, level: { in: ['HIGH', 'CRITICAL'] } }, _count: { _all: true } }),
          db.dqForecast.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, direction: 'WORSE' }, _count: { _all: true } }),
        ])
      : [[], []]
    const anomMap = new Map(anomCounts.map((r) => [r.batchId, r._count._all]))
    const fcMap = new Map(fcCounts.map((r) => [r.batchId, r._count._all]))
    const trend = recentBatches
      .slice()
      .reverse()
      .map((b) => ({
        id: b.id,
        at: b.createdAt.toISOString(),
        highAnomalies: anomMap.get(b.id) ?? 0,
        worseForecasts: fcMap.get(b.id) ?? 0,
        failedRules: b.failedRules,
        overallScore: b.overallScore,
      }))

    /* ---------- ค่าดิบสำหรับหน้าปรับเกณฑ์ (ผลกระทบเรียลไทม์ คำนวณฝั่ง client) ----------
       zScore/slope/r2/forecast1/sharePct เป็นค่าดิบไม่ขึ้นกับเกณฑ์ — นับใหม่ด้วยเกณฑ์ใดก็ได้ทันที */
    const usage = {
      pairs,
      zScores: anomalies.filter((a) => a.level !== 'INSUFFICIENT_HISTORY').map((a) => a.zScore),
      windows: anomalies.map((a) => a.windowSize),
      slopeR2: forecasts
        .filter((f) => f.windowSize >= s.mlMinHistory)
        .map((f) => ({ slope: f.slope, r2: f.r2, f1: f.forecasts[1] })),
      shares: clusters.map((c) => Number((c.sharePct / 100).toFixed(4))),
    }

    return NextResponse.json({
      mode,
      batchId,
      batchAt,
      settings: s,
      summary: { anomalies: summaryAnomalies, clusters: summaryClusters, forecasts: summaryForecasts, sampling: summarySampling },
      health,
      trend,
      usage,
    })
  } catch (e) {
    console.error('GET /api/dq/ml/center', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดภาพรวม ML ได้' }, { status: 500 })
  }
}