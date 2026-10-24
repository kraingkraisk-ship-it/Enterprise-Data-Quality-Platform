/**
 * Forecast Engine (v0.27.0) — ③ Quality Trend Forecasting
 * พยากรณ์อัตราล้มเหลวรายกฎ×ชุดข้อมูลจาก linear trend ของหน้าต่าง 10 รอบล่าสุด (รวมรอบปัจจุบัน เรียงเวลาจริง)
 * คณิตทั้งหมดอ่านเกณฑ์จาก src/lib/forecast.ts + ml.ts + regulation.ts (single source of truth)
 *
 * การทำงาน 2 โหมด (แนวเดียวกับ ml-engine):
 * - evaluateForecastBatch(batchId): คำนวณ + บันทึกลง DqForecast (idempotent ต่อ batch) + ส่งสัญญาณเมื่อผ่านเกณฑ์
 *   เรียกอัตโนมัติหลัง /api/dq/run และ /api/dq/run-domain จบ batch (caller ห่อ try/catch เอง — ล้มไม่กระทบการรัน)
 * - evaluateForecastLatest(): โหมดสดเมื่อยังไม่มี batch (เช่นข้อมูล seed) — คณิตเดียวกัน ไม่บันทึก
 *
 * หลักการล็อก: พยากรณ์เป็น "สัญญาณล่วงหน้ารอมนุษย์ทบทวน" — ไม่แตะ DqRun.status / threshold / การตัดสินผ่าน-ไม่ผ่าน
 */
import { db } from '@/lib/db'
import { DRIFT_R2_MIN, ML_MIN_HISTORY, ML_WINDOW } from '@/lib/ml'
import { linearTrend } from '@/lib/ml-engine'
import { DIMENSION_LABELS, isDimensionKey } from '@/lib/dq'
import { likelihoodOf } from '@/lib/regulation'
import {
  confidenceOf,
  directionOf,
  FORECAST_HORIZONS,
  FORECAST_METHOD,
  F_MIN_SIGNAL_BAND,
  F_MIN_SLOPE,
} from '@/lib/forecast'

/* --------------------------- โครงผลลัพธ์ (UI ใช้ type-only) --------------------------- */

export interface ForecastHorizons {
  1: number | null
  3: number | null
  5: number | null
}

export interface ForecastView {
  ruleId: string
  datasetId: string
  datasetName: string
  sourceType: string
  column: string
  conditionName: string
  severity: string
  dimension: string
  dimensionTh: string
  method: string
  /** อัตราล้มเหลวรอบล่าสุด (จุดตั้งต้นของการพยากรณ์) */
  failRate: number
  slope: number
  r2: number
  confidence: { key: 'HIGH' | 'MEDIUM' | 'LOW'; label: string; badgeClass: string }
  direction: { key: 'WORSE' | 'BETTER' | 'STABLE'; label: string; badgeClass: string; color: string }
  forecasts: ForecastHorizons
  windowSize: number
  /** หน้าต่างประวัติที่ใช้ regress เรียงเวลาจริงเก่า→ใหม่ (รวมรอบปัจจุบัน) */
  history: Array<{ at: string; failRate: number }>
  /** ระดับสัญญาณเมื่อผ่านเกณฑ์ส่ง (CRITICAL/HIGH/MEDIUM) — null เมื่อไม่ผ่าน */
  signalLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | null
  at: string
}

export interface ForecastEvaluation {
  mode: 'BATCH' | 'LATEST_RUNS'
  batchId: string | null
  batchAt: string | null
  forecasts: ForecastView[]
  evaluatedAt: string
}

/* ------------------------------ คณิตหัวใจ ------------------------------ */

interface RunLite {
  id: string
  ruleId: string
  datasetId: string
  totalRows: number
  failedRows: number
  dimension: string
  createdAt: Date
}

function failRateOf(run: Pick<RunLite, 'totalRows' | 'failedRows'>): number {
  return run.totalRows > 0 ? run.failedRows / run.totalRows : 0
}

function dimensionThOf(dimension: string): string {
  return isDimensionKey(dimension) ? DIMENSION_LABELS[dimension].th : dimension
}

/** ประเมินพยากรณ์ของ 1 กฎ×ชุดข้อมูล จากหน้าต่างประวัติ (เรียงเวลาจริงเก่า→ใหม่ รวมรอบปัจจุบัน) */
function assessForecast(
  currentRun: RunLite,
  window: RunLite[],
  meta: { datasetName: string; sourceType: string; column: string; conditionName: string; severity: string },
): ForecastView {
  // window จาก DB มาแบบ desc (ใหม่สุดก่อน) — ผู้เรียกต้อง reverse เป็นเวลาจริงก่อนส่งเข้ามา (บทเรียน drift ทิศกลับ v0.25.0)
  const rates = window.map(failRateOf)
  const failRate = failRateOf(currentRun)
  const insufficient = window.length < ML_MIN_HISTORY
  const trend = linearTrend(rates)
  const slope = insufficient ? 0 : trend.slope
  const r2 = insufficient ? 0 : trend.r2
  const dir = insufficient ? directionOf(0) : directionOf(slope)
  const conf = insufficient ? { key: 'LOW' as const, label: 'ยังไม่พอประเมิน', badgeClass: 'border-slate-200 bg-slate-50 text-slate-500' } : confidenceOf(r2)

  // ค่าคาด k รอบข้างหน้า = รอบล่าสุด + slope×k (จำกัด 0–1) — เกณฑ์จาก forecast.ts
  const last = rates.length > 0 ? rates[rates.length - 1] : failRate
  const forecasts: ForecastHorizons = { 1: null, 3: null, 5: null }
  if (!insufficient) {
    for (const k of FORECAST_HORIZONS) {
      forecasts[k] = Math.min(1, Math.max(0, last + slope * k))
    }
  }

  // เกณฑ์ส่งสัญญาณ (จากตารางค่าคงที่): ทิศแย่ลง + R² ≥ DRIFT_R2_MIN + แถวโอกาสของค่าคาดรอบถัดไป ≥ F_MIN_SIGNAL_BAND
  let signalLevel: ForecastView['signalLevel'] = null
  if (!insufficient && forecasts[1] !== null) {
    const band = likelihoodOf(forecasts[1])
    if (dir.key === 'WORSE' && r2 >= DRIFT_R2_MIN && band.level >= F_MIN_SIGNAL_BAND) {
      signalLevel = band.level >= 5 ? 'CRITICAL' : band.level >= 4 ? 'HIGH' : 'MEDIUM'
    }
  }

  return {
    ruleId: currentRun.ruleId,
    datasetId: currentRun.datasetId,
    datasetName: meta.datasetName,
    sourceType: meta.sourceType,
    column: meta.column,
    conditionName: meta.conditionName,
    severity: meta.severity,
    dimension: currentRun.dimension,
    dimensionTh: dimensionThOf(currentRun.dimension),
    method: FORECAST_METHOD,
    failRate,
    slope: Number(slope.toFixed(6)),
    r2: Number(r2.toFixed(4)),
    confidence: conf,
    direction: dir,
    forecasts: {
      1: forecasts[1] === null ? null : Number(forecasts[1].toFixed(4)),
      3: forecasts[3] === null ? null : Number(forecasts[3].toFixed(4)),
      5: forecasts[5] === null ? null : Number(forecasts[5].toFixed(4)),
    },
    windowSize: window.length,
    history: window.map((w) => ({ at: w.createdAt.toISOString(), failRate: Number(failRateOf(w).toFixed(4)) })),
    signalLevel,
    at: currentRun.createdAt.toISOString(),
  }
}

/** หน้าต่างประวัติล่าสุดของคู่กฎ×ชุดข้อมูล ก่อนเวลาที่กำหนด (รวมรอบที่มี createdAt ≤ before) — เรียงเวลาจริงเก่า→ใหม่ */
async function windowFor(ruleId: string, datasetId: string, before: Date): Promise<RunLite[]> {
  const rows = await db.dqRun.findMany({
    where: { ruleId, datasetId, createdAt: { lte: before } },
    orderBy: { createdAt: 'desc' },
    take: ML_WINDOW,
    select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, dimension: true, createdAt: true },
  })
  return rows.reverse() // desc → เวลาจริงเก่า→ใหม่
}

async function metaFor(ruleId: string, datasetId: string) {
  const [rule, ds] = await Promise.all([
    db.dqRule.findUnique({ where: { id: ruleId }, select: { column: true, condition: true, severity: true } }),
    db.dataset.findUnique({ where: { id: datasetId }, select: { name: true, sourceType: true } }),
  ])
  return {
    datasetName: ds?.name ?? datasetId,
    sourceType: ds?.sourceType ?? '',
    column: rule?.column ?? ruleId,
    conditionName: rule?.condition ?? ruleId,
    severity: rule?.severity ?? 'MEDIUM',
  }
}

/* ------------------------------ โหมด BATCH ------------------------------ */

/** พยากรณ์ + บันทึกผลของ 1 batch (idempotent — upsert ตาม unique key) + ส่งสัญญาณเมื่อผ่านเกณฑ์ */
export async function evaluateForecastBatch(batchId: string): Promise<ForecastEvaluation> {
  const batch = await db.dqValidationBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error(`ไม่พบ batch ${batchId}`)

  const runs = await db.dqRun.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, dimension: true, createdAt: true },
  })

  const views: ForecastView[] = []
  for (const run of runs) {
    // หน้าต่างรวมรอบปัจจุบันของคู่นี้ (createdAt ≤ batch.createdAt — ครอบรอบที่เพิ่งรัน)
    const window = await windowFor(run.ruleId, run.datasetId, batch.createdAt)
    const view = assessForecast(run, window, await metaFor(run.ruleId, run.datasetId))
    views.push(view)

    const existing = await db.dqForecast.findUnique({
      where: { batchId_ruleId_datasetId: { batchId, ruleId: run.ruleId, datasetId: run.datasetId } },
    })
    const data = {
      method: view.method,
      failRate: view.failRate,
      slope: view.slope,
      r2: view.r2,
      confidence: view.confidence.key,
      direction: view.direction.key,
      forecast1: view.forecasts[1],
      forecast3: view.forecasts[3],
      forecast5: view.forecasts[5],
      windowSize: view.windowSize,
    }
    if (existing) {
      await db.dqForecast.update({ where: { id: existing.id }, data })
    } else {
      await db.dqForecast.create({ data: { batchId, ruleId: run.ruleId, datasetId: run.datasetId, ...data } })
    }

    // ---------- สัญญาณล่วงหน้า (เฉพาะผ่านเกณฑ์จาก forecast.ts) — dedup ตาม title แบบเดียวกับ ① ----------
    if (!view.signalLevel) continue
    const f1 = view.forecasts[1]
    if (f1 === null) continue
    const title = `พยากรณ์แนวโน้ม (ML): ${view.column} — ${view.conditionName}`
    const dup = await db.dqSignal.findFirst({
      where: { datasetId: run.datasetId, kind: 'ML_FORECAST', status: 'PENDING_REVIEW', title },
      select: { id: true },
    })
    if (dup) continue
    await db.dqSignal.create({
      data: {
        datasetId: run.datasetId,
        kind: 'ML_FORECAST',
        dimension: isDimensionKey(view.dimension) ? view.dimension : 'VALIDITY',
        title,
        detail: `แนวโน้มแย่ลงต่อเนื่อง (${view.confidence.label}, R² ${view.r2}) — รอบนี้ ${(view.failRate * 100).toFixed(1)}% คาดรอบถัดไป ${(f1 * 100).toFixed(1)}% · อีก 3 รอบ ${view.forecasts[3] !== null ? ((view.forecasts[3] as number) * 100).toFixed(1) + '%' : '—'} · อีก 5 รอบ ${view.forecasts[5] !== null ? ((view.forecasts[5] as number) * 100).toFixed(1) + '%' : '—'} — เป็นสัญญาณล่วงหน้ารอมนุษย์ทบทวน ไม่ตัดสินแทนเกณฑ์ผ่าน/ไม่ผ่านเดิม (ML v0.27.0)`,
        severity: view.signalLevel,
        status: 'PENDING_REVIEW',
      },
    })
  }

  return {
    mode: 'BATCH',
    batchId,
    batchAt: batch.createdAt.toISOString(),
    forecasts: views.sort((a, b) => b.slope - a.slope),
    evaluatedAt: new Date().toISOString(),
  }
}

/* ------------------- อ่านผลที่บันทึกไว้ (GET — ไม่เขียน DB) ------------------ */

/** อ่านผลพยากรณ์ของ batch จากฐานข้อมูลโดยตรง — คืน null ถ้า batch นี้ยังไม่เคยถูกประเมิน */
export async function readForecastBatch(batchId: string): Promise<ForecastEvaluation | null> {
  const batch = await db.dqValidationBatch.findUnique({ where: { id: batchId } })
  if (!batch) return null
  const rows = await db.dqForecast.findMany({
    where: { batchId },
    orderBy: { slope: 'desc' },
    include: { rule: { select: { column: true, condition: true, severity: true } }, dataset: { select: { name: true, sourceType: true } } },
  })
  if (rows.length === 0) return null

  const forecasts: ForecastView[] = []
  for (const row of rows) {
    const insufficient = row.windowSize < ML_MIN_HISTORY
    const confidence = insufficient ? { key: 'LOW' as const, label: 'ยังไม่พอประเมิน', badgeClass: 'border-slate-200 bg-slate-50 text-slate-500' } : confidenceOf(row.r2)
    const direction = insufficient ? directionOf(0) : directionOf(row.slope)
    const band = row.forecast1 !== null ? likelihoodOf(row.forecast1) : { level: 0, label: '—' }
    const signalLevel =
      !insufficient && row.forecast1 !== null && direction.key === 'WORSE' && row.r2 >= DRIFT_R2_MIN && band.level >= F_MIN_SIGNAL_BAND
        ? band.level >= 5
          ? ('CRITICAL' as const)
          : band.level >= 4
            ? ('HIGH' as const)
            : ('MEDIUM' as const)
        : null
    forecasts.push({
      ruleId: row.ruleId,
      datasetId: row.datasetId,
      datasetName: row.dataset.name,
      sourceType: row.dataset.sourceType,
      column: row.rule.column,
      conditionName: row.rule.condition,
      severity: row.rule.severity,
      dimension: 'VALIDITY',
      dimensionTh: 'VALIDITY',
      method: row.method,
      failRate: row.failRate,
      slope: row.slope,
      r2: row.r2,
      confidence,
      direction,
      forecasts: { 1: row.forecast1, 3: row.forecast3, 5: row.forecast5 },
      windowSize: row.windowSize,
      history: (await windowFor(row.ruleId, row.datasetId, batch.createdAt)).map((w) => ({
        at: w.createdAt.toISOString(),
        failRate: Number(failRateOf(w).toFixed(4)),
      })),
      signalLevel,
      at: row.createdAt.toISOString(),
    })
  }
  // มิติจริงมาจาก DqRun ของ batch (ตาราง forecast ไม่เก็บมิติ — แนวเดียวกับ anomaly)
  const dimByRule = new Map<string, string>()
  const batchRuns = await db.dqRun.findMany({ where: { batchId }, select: { ruleId: true, dimension: true } })
  for (const r of batchRuns) dimByRule.set(r.ruleId, r.dimension)
  for (const f of forecasts) {
    const dim = dimByRule.get(f.ruleId) ?? 'VALIDITY'
    f.dimension = dim
    f.dimensionTh = dimensionThOf(dim)
  }

  return {
    mode: 'BATCH',
    batchId,
    batchAt: batch.createdAt.toISOString(),
    forecasts,
    evaluatedAt: new Date().toISOString(),
  }
}

/* --------------------------- โหมด LATEST_RUNS --------------------------- */

/** โหมดสด — พยากรณ์จาก "ผลรันล่าสุดรายกฎ×ชุดข้อมูล" (ไม่บันทึก ไม่ส่งสัญญาณ) — คณิตเดียวกับโหมด batch */
export async function evaluateForecastLatest(): Promise<ForecastEvaluation> {
  const pairs = await db.dqRun.groupBy({ by: ['ruleId', 'datasetId'], _max: { createdAt: true } })
  const latestRuns: RunLite[] = []
  for (const p of pairs) {
    if (!p._max.createdAt) continue
    const run = await db.dqRun.findFirst({
      where: { ruleId: p.ruleId, datasetId: p.datasetId, createdAt: p._max.createdAt },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, dimension: true, createdAt: true },
    })
    if (run) latestRuns.push(run)
  }

  const views: ForecastView[] = []
  for (const run of latestRuns) {
    const window = await windowFor(run.ruleId, run.datasetId, run.createdAt)
    views.push(assessForecast(run, window, await metaFor(run.ruleId, run.datasetId)))
  }

  return {
    mode: 'LATEST_RUNS',
    batchId: null,
    batchAt: null,
    forecasts: views.sort((a, b) => b.slope - a.slope),
    evaluatedAt: new Date().toISOString(),
  }
}
