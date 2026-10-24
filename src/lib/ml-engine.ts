/**
 * ML Engine (v0.25.0) — ① Anomaly Detection ข้ามรอบ + ④ Root Cause Clustering
 * คณิตทั้งหมดอ่านเกณฑ์จาก src/lib/ml.ts (ตารางข้อมูล — anti-drift เดียวกับ regulation.ts)
 * v0.28.0 — เกณฑ์ปรับได้: ดึงค่าจริงจาก DqMlSettings ผ่าน getMlSettings() ครั้งเดียวต่อการประเมิน
 * (ไม่มีแถว/อ่านไม่ได้ = ใช้ค่าเริ่มต้นจากตารางค่าคงที่ — ระบบไม่เคยพังเพราะ settings)
 *
 * การทำงาน 2 โหมด:
 * - evaluateBatch(batchId): คำนวณ + บันทึกผลลง DqAnomaly/DqFailureCluster (idempotent ต่อ batch)
 *   เรียกอัตโนมัติหลัง /api/dq/run และ /api/dq/run-domain จบ batch (caller ห่อ try/catch เอง)
 * - evaluateLatest(): โหมดสด — คำนวณจากผลรันล่าสุดรายกฎ×ชุดข้อมูล (เมื่อยังไม่มี batch เช่นข้อมูล seed)
 *   คืนผลแบบไม่บันทึก พร้อม mode: 'LATEST_RUNS' เพื่อแสดงบนหน้าจออย่างตรงไปตรงมา
 *
 * หลักการล็อก: ฟังก์ชันนี้ "ไม่มีสิทธิ์" แตะ DqRun.status / DqRule.threshold / การตัดสินผ่าน-ไม่ผ่านเดิม
 * ฝั่ง caller (run routes) ต้องห่อ try/catch — ML ล้มเหลว = การรัน validation ยังสำเร็จปกติ
 */
import { db } from '@/lib/db'
import {
  ANOMALY_METHOD,
  MAD_TO_SD,
  MIN_MAD,
  SIGNAL_LEVELS,
  zLevelOf,
  type MlCriteria,
} from '@/lib/ml'
import { getMlSettings } from '@/lib/ml-settings-server'
import { DIMENSION_LABELS, isDimensionKey, type DimensionKey } from '@/lib/dq'

/** มิติที่ไม่รู้จัก → แสดงเป็นค่าดิบ (กัน label หาย) */
function dimensionThOf(dimension: string): string {
  return isDimensionKey(dimension) ? DIMENSION_LABELS[dimension].th : dimension
}

/* ------------------------------ สถิติพื้นฐาน ------------------------------ */

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** linear regression แบบ least squares — คืนความชัน + R² (x = 1..n) — export ให้ forecast-engine (③) ใช้คณิตเดียวกัน */
export function linearTrend(values: number[]): { slope: number; r2: number } {
  const n = values.length
  if (n < 2) return { slope: 0, r2: 0 }
  const meanX = (n + 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = i + 1 - meanX
    const dy = values[i] - meanY
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy)
  return { slope, r2 }
}

/* --------------------------- โครงผลลัพธ์ร่วม ---------------------------- */

export interface AnomalyView {
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
  failRate: number
  baseline: number
  mad: number
  zScore: number
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' | 'INSUFFICIENT_HISTORY'
  label: string
  badgeClass: string
  /** จริงเมื่อห่างจาก baseline ในทิศ "ดีขึ้น" (failRate ต่ำกว่า baseline เกินเกณฑ์) — ไม่นับเป็นความเสี่ยง ไม่ส่งสัญญาณ */
  better: boolean
  driftSlope: number | null
  driftR2: number | null
  drift: boolean
  windowSize: number
  history: Array<{ at: string; failRate: number }>
  at: string
}

export interface ClusterView {
  signatureKey: string
  sourceType: string
  datasetId: string
  datasetName: string
  dimension: string
  dimensionTh: string
  members: Array<{ ruleId: string; column: string; conditionName: string; failedRows: number; totalRows: number }>
  groupFailedRows: number
  totalFailedRows: number
  sharePct: number
  hypothesis: string
}

export interface MlEvaluation {
  mode: 'BATCH' | 'LATEST_RUNS'
  batchId: string | null
  batchAt: string | null
  anomalies: AnomalyView[]
  clusters: ClusterView[]
  totalFailedRows: number
  evaluatedAt: string
}

/* ------------------------- หัวใจ ① anomaly ต่อกฎ ------------------------- */

interface RunLite {
  id: string
  ruleId: string
  datasetId: string
  totalRows: number
  failedRows: number
  passRate: number
  dimension: string
  createdAt: Date
}

/** failRate จากผลรัน (จากแถวจริงที่เก็บ — ไม่เดา) */
function failRateOf(run: Pick<RunLite, 'totalRows' | 'failedRows'>): number {
  return run.totalRows > 0 ? run.failedRows / run.totalRows : 0
}

/**
 * ประเมินความผิดปกติของรอบปัจจุบัน (currentRun) เทียบประวัติ (history ไม่รวมรอบปัจจุบัน)
 * คืนผลแบบ view — ผู้เรียกเลือกบันทึกเอง (batch mode) หรือใช้แสดงผล (โหมดสด)
 */
function assessAnomaly(
  currentRun: RunLite,
  history: RunLite[],
  meta: { datasetName: string; sourceType: string; column: string; conditionName: string; severity: string },
  s: MlCriteria,
): AnomalyView {
  const failRate = failRateOf(currentRun)
  // history จาก DB เรียง createdAt desc (ใหม่สุดก่อน) — ต้องกลับเป็นเวลาจริง (เก่า→ใหม่)
  // ก่อนคำนวณ trend ไม่อย่างนั้น slope จะกลับทิศ (ข้อมูลที่ดีขึ้นจะถูกตีความเป็น "แย่ลง")
  const rates = history.map(failRateOf).slice().reverse()
  const baseline = median(rates)
  const madRaw = median(rates.map((r) => Math.abs(r - baseline)))
  const mad = Math.max(madRaw * MAD_TO_SD, MIN_MAD)
  const zScore = Math.abs(failRate - baseline) / mad
  const zl = zLevelOf(zScore, s)
  const trend = linearTrend(rates)
  const drift = trend.slope > 0 && trend.r2 >= s.driftR2Min
  const insufficient = history.length < s.mlMinHistory
  // ทิศทางสำคัญ: ห่างจาก baseline ในทิศ "ดีขึ้น" (failRate ต่ำลงผิดปกติ) ไม่ใช่ความเสี่ยง —
  // แสดงเป็นข้อมูลให้ตรวจ (อาจมีข้อมูลหาย) แต่ไม่นับระดับความเสี่ยงและไม่ส่งสัญญาณ
  const anomalous = zScore >= s.zMedium
  const better = anomalous && failRate < baseline

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
    method: ANOMALY_METHOD,
    failRate,
    baseline,
    mad,
    zScore: Number(zScore.toFixed(2)),
    level: insufficient || better ? 'NORMAL' : zl.level,
    label: insufficient ? 'ยังไม่ประเมิน' : better ? 'ดีขึ้นผิดปกติ' : zl.label,
    badgeClass: insufficient
      ? 'bg-slate-50 text-slate-500 border-slate-200'
      : better
        ? 'bg-teal-50 text-teal-800 border-teal-200'
        : zl.badgeClass,
    better,
    driftSlope: Number(trend.slope.toFixed(6)),
    driftR2: Number(trend.r2.toFixed(3)),
    drift,
    windowSize: history.length,
    history: [
      ...history
        .slice()
        .reverse()
        .map((h) => ({ at: h.createdAt.toISOString(), failRate: Number(failRateOf(h).toFixed(4)) })),
      { at: currentRun.createdAt.toISOString(), failRate: Number(failRate.toFixed(4)) },
    ],
    at: currentRun.createdAt.toISOString(),
  }
}

/* ----------------------- หัวใจ ④ cluster ต่อชุดผลรัน ---------------------- */

/**
 * จัดกลุ่มผลรันที่ล้มเหลวด้วยลายเซ็น (แหล่งข้อมูล, ชุดข้อมูล, มิติ) แบบ exact-match
 * ตัวนับใช้ DqRun.failedRows โดยตรง (ไม่ติด cap 200 ของ failure record) — แม่นกว่าและอธิบายได้
 */
async function buildClusters(runs: RunLite[], s: MlCriteria): Promise<{ clusters: ClusterView[]; totalFailedRows: number }> {
  const failed = runs.filter((r) => r.failedRows > 0)
  if (failed.length === 0) return { clusters: [], totalFailedRows: 0 }

  const datasetIds = [...new Set(failed.map((r) => r.datasetId))]
  const ruleIds = [...new Set(failed.map((r) => r.ruleId))]
  const [datasets, rules] = await Promise.all([
    db.dataset.findMany({ where: { id: { in: datasetIds } }, select: { id: true, name: true, sourceType: true } }),
    db.dqRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, column: true, condition: true, severity: true } }),
  ])
  const datasetMap = new Map(datasets.map((d) => [d.id, d]))
  const ruleMap = new Map(rules.map((r) => [r.id, r]))

  const totalFailedRows = failed.reduce((a, r) => a + r.failedRows, 0)
  const groups = new Map<string, RunLite[]>()
  for (const run of failed) {
    const sourceType = datasetMap.get(run.datasetId)?.sourceType ?? ''
    const key = `${sourceType}|${run.datasetId}|${run.dimension}`
    const arr = groups.get(key) ?? []
    arr.push(run)
    groups.set(key, arr)
  }

  const clusters: ClusterView[] = [...groups.entries()].map(([key, members]) => {
    const [sourceType, datasetId, dimension] = key.split('|')
    const groupFailedRows = members.reduce((a, r) => a + r.failedRows, 0)
    const sharePct = totalFailedRows > 0 ? Number(((groupFailedRows / totalFailedRows) * 100).toFixed(1)) : 0
    const memberViews = members
      .map((r) => {
        const rule = ruleMap.get(r.ruleId)
        return {
          ruleId: r.ruleId,
          column: rule?.column ?? r.ruleId,
          conditionName: rule?.condition ?? r.ruleId,
          failedRows: r.failedRows,
          totalRows: r.totalRows,
        }
      })
      .sort((a, b) => b.failedRows - a.failedRows)
    const dims = [...new Set(members.map((m) => m.dimension))]
    const hypothesis =
      sharePct >= s.clusterShareMin * 100
        ? `ความล้มเหลว ${sharePct}% ของทั้งรอบมาจากแหล่งข้อมูล "${sourceType || 'ไม่ระบุ'}" ในมิติ${dims
            .map(dimensionThOf)
            .join('/')} (${memberViews.length} กฎ) — แนะนำตรวจสอบต้นทางของแหล่งนี้ก่อนรายกฎ เพราะมักมีสาเหตุร่วมกัน`
        : ''
    return {
      signatureKey: key,
      sourceType,
      datasetId,
      datasetName: datasetMap.get(datasetId)?.name ?? datasetId,
      dimension,
      dimensionTh: dims.map(dimensionThOf).join('/'),
      members: memberViews,
      groupFailedRows,
      totalFailedRows,
      sharePct,
      hypothesis,
    }
  })

  clusters.sort((a, b) => b.groupFailedRows - a.groupFailedRows)
  return { clusters, totalFailedRows }
}

/* --------------------- ประวัติ sparkline รายกฎ×ชุดข้อมูล ------------------- */

async function historyFor(ruleId: string, datasetId: string, before: Date, limit = 14): Promise<Array<{ at: string; failRate: number }>> {
  const runs = await db.dqRun.findMany({
    where: { ruleId, datasetId, createdAt: { lt: before } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { totalRows: true, failedRows: true, createdAt: true },
  })
  return runs.map((r) => ({ at: r.createdAt.toISOString(), failRate: Number(failRateOf(r).toFixed(4)) }))
}

/* ------------------------------ โหมด BATCH ------------------------------ */

/** ประเมิน + บันทึกผลของ 1 batch (idempotent — upsert ตาม unique key) */
export async function evaluateBatch(batchId: string): Promise<MlEvaluation> {
  const batch = await db.dqValidationBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error(`ไม่พบ batch ${batchId}`)

  // เกณฑ์ปัจจุบันจาก DqMlSettings (v0.28.0) — ดึงครั้งเดียวต่อการประเมิน
  const s = await getMlSettings()

  const runs = await db.dqRun.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, passRate: true, dimension: true, createdAt: true },
  })
  const dsIds = [...new Set(runs.map((r) => r.datasetId))]
  const ruleIds = [...new Set(runs.map((r) => r.ruleId))]
  const [datasets, rules] = await Promise.all([
    db.dataset.findMany({ where: { id: { in: dsIds } }, select: { id: true, name: true, sourceType: true } }),
    db.dqRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, column: true, condition: true, severity: true } }),
  ])
  const datasetMap = new Map(datasets.map((d) => [d.id, d]))
  const ruleMap = new Map(rules.map((r) => [r.id, r]))

  // ---------- ① anomaly รายกฎ ----------
  const anomalyViews: AnomalyView[] = []
  for (const run of runs) {
    const history = await db.dqRun.findMany({
      where: { ruleId: run.ruleId, datasetId: run.datasetId, createdAt: { lt: batch.createdAt }, id: { notIn: runs.map((x) => x.id) } },
      orderBy: { createdAt: 'desc' },
      take: s.mlWindow,
      select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, passRate: true, dimension: true, createdAt: true },
    })
    const rule = ruleMap.get(run.ruleId)
    const ds = datasetMap.get(run.datasetId)
    const view = assessAnomaly(
      run,
      history,
      {
        datasetName: ds?.name ?? run.datasetId,
        sourceType: ds?.sourceType ?? '',
        column: rule?.column ?? run.ruleId,
        conditionName: rule?.condition ?? run.ruleId,
        severity: rule?.severity ?? 'MEDIUM',
      },
      s,
    )
    anomalyViews.push(view)

    const existing = await db.dqAnomaly.findUnique({
      where: { batchId_ruleId_datasetId: { batchId, ruleId: run.ruleId, datasetId: run.datasetId } },
    })
    const data = {
      method: view.method,
      failRate: view.failRate,
      baseline: view.baseline,
      mad: view.mad,
      zScore: view.zScore,
      level: view.level,
      driftSlope: view.driftSlope,
      driftR2: view.driftR2,
      windowSize: view.windowSize,
    }
    if (existing) {
      await db.dqAnomaly.update({ where: { id: existing.id }, data })
    } else {
      await db.dqAnomaly.create({ data: { batchId, ruleId: run.ruleId, datasetId: run.datasetId, ...data } })
    }

    // ---------- แจ้งเตือนเฉพาะทิศ "แย่ลง" ระดับ HIGH/CRITICAL — เข้ากล่องสัญญาณ พร้อมกันซ้ำ ----------
    if (view.better || !SIGNAL_LEVELS.includes(view.level as 'CRITICAL' | 'HIGH')) continue
    const title = `ความผิดปกติข้ามรอบ (ML): ${view.column} — ${view.conditionName}`
    const dup = await db.dqSignal.findFirst({
      where: { datasetId: run.datasetId, kind: 'ML_ANOMALY', status: 'PENDING_REVIEW', title },
      select: { id: true },
    })
    if (dup) continue
    await db.dqSignal.create({
      data: {
        datasetId: run.datasetId,
        kind: 'ML_ANOMALY',
        dimension: isDimensionKey(view.dimension) ? view.dimension : 'VALIDITY',
        title,
        detail: `z = ${view.zScore} (ระดับ${view.label}) — รอบนี้ ${(view.failRate * 100).toFixed(1)}% เทียบ baseline ${(view.baseline * 100).toFixed(1)}% (มัธยฐาน ${view.windowSize} รอบ, MAD ${(view.mad * 100).toFixed(2)}%)${
          view.drift ? ' + แนวโน้มแย่ลงต่อเนื่อง (R² ≥ ' + s.driftR2Min + ')' : ''
        } — เป็นสัญญาณรอมนุษย์ทบทวน ไม่ตัดสินแทนเกณฑ์ผ่าน/ไม่ผ่านเดิม (ML v0.25.0)`,
        severity: view.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        status: 'PENDING_REVIEW',
      },
    })
  }

  // ---------- ④ cluster ----------
  const { clusters, totalFailedRows } = await buildClusters(runs, s)
  for (const c of clusters) {
    const existing = await db.dqFailureCluster.findUnique({
      where: { batchId_signatureKey: { batchId, signatureKey: c.signatureKey } },
    })
    const data = {
      sourceType: c.sourceType,
      datasetId: c.datasetId,
      dimension: c.dimension,
      memberRunsJson: JSON.stringify(c.members),
      groupFailedRows: c.groupFailedRows,
      totalFailedRows: c.totalFailedRows,
      sharePct: c.sharePct,
      hypothesis: c.hypothesis,
    }
    if (existing) {
      await db.dqFailureCluster.update({ where: { id: existing.id }, data })
    } else {
      await db.dqFailureCluster.create({ data: { batchId, signatureKey: c.signatureKey, ...data } })
    }
  }

  // sparkline ประวัติ (จากผลรันก่อน batch นี้) — แสดงบนหน้าจอเพื่อตรวจย้อน
  for (const v of anomalyViews) {
    v.history = await historyFor(v.ruleId, v.datasetId, batch.createdAt)
  }

  return {
    mode: 'BATCH',
    batchId,
    batchAt: batch.createdAt.toISOString(),
    anomalies: anomalyViews.sort((a, b) => b.zScore - a.zScore),
    clusters,
    totalFailedRows,
    evaluatedAt: new Date().toISOString(),
  }
}

/* ------------------- อ่านผลที่บันทึกไว้ (GET — ไม่เขียน DB) ------------------ */

/** อ่านผลประเมินของ batch จากฐานข้อมูลโดยตรง — คืน null ถ้า batch นี้ยังไม่เคยถูกประเมิน */
export async function readBatchEvaluation(batchId: string): Promise<MlEvaluation | null> {
  const batch = await db.dqValidationBatch.findUnique({ where: { id: batchId } })
  if (!batch) return null
  // แสดงผลตามเกณฑ์ปัจจุบัน (v0.28.0) — ระดับ/ทิศ drift คำนวณใหม่จากค่าดิบที่เก็บไว้
  const s = await getMlSettings()
  const [anomalyRows, clusterRows] = await Promise.all([
    db.dqAnomaly.findMany({
      where: { batchId },
      orderBy: { zScore: 'desc' },
      include: { rule: { select: { column: true, condition: true, severity: true } }, dataset: { select: { name: true, sourceType: true } } },
    }),
    db.dqFailureCluster.findMany({ where: { batchId }, orderBy: { groupFailedRows: 'desc' } }),
  ])
  if (anomalyRows.length === 0 && clusterRows.length === 0) return null

  const anomalies: AnomalyView[] = []
  for (const row of anomalyRows) {
    const insufficient = row.windowSize < s.mlMinHistory
    const zl = zLevelOf(row.zScore, s)
    const better = !insufficient && row.zScore >= s.zMedium && row.failRate < row.baseline
    anomalies.push({
      ruleId: row.ruleId,
      datasetId: row.datasetId,
      datasetName: row.dataset.name,
      sourceType: row.dataset.sourceType,
      column: row.rule.column,
      conditionName: row.rule.condition,
      severity: row.rule.severity,
      dimension: isDimensionKey(row.rule.condition) ? row.rule.condition : 'VALIDITY',
      dimensionTh: '—',
      method: row.method,
      failRate: row.failRate,
      baseline: row.baseline,
      mad: row.mad,
      zScore: row.zScore,
      level: insufficient ? 'INSUFFICIENT_HISTORY' : better ? 'NORMAL' : zl.level,
      label: insufficient ? 'ยังไม่ประเมิน' : better ? 'ดีขึ้นผิดปกติ' : zl.label,
      badgeClass: insufficient
        ? 'bg-slate-50 text-slate-500 border-slate-200'
        : better
          ? 'bg-teal-50 text-teal-800 border-teal-200'
          : zl.badgeClass,
      better,
      driftSlope: row.driftSlope,
      driftR2: row.driftR2,
      drift: (row.driftSlope ?? 0) > 0 && (row.driftR2 ?? 0) >= s.driftR2Min,
      windowSize: row.windowSize,
      history: await historyFor(row.ruleId, row.datasetId, batch.createdAt),
      at: row.createdAt.toISOString(),
    })
  }
  // มิติจริงของ anomaly ต้องมาจาก DqRun ของ batch (ตาราง anomaly ไม่เก็บมิติ — ใช้ของรอบเดียวกัน)
  const dimByRule = new Map<string, string>()
  const batchRuns = await db.dqRun.findMany({ where: { batchId }, select: { ruleId: true, dimension: true } })
  for (const r of batchRuns) dimByRule.set(r.ruleId, r.dimension)
  for (const a of anomalies) {
    const dim = dimByRule.get(a.ruleId) ?? 'VALIDITY'
    a.dimension = dim
    a.dimensionTh = dimensionThOf(dim)
  }

  const dsIds = [...new Set(clusterRows.map((c) => c.datasetId))]
  const dsList = dsIds.length > 0 ? await db.dataset.findMany({ where: { id: { in: dsIds } }, select: { id: true, name: true } }) : []
  const dsMap = new Map(dsList.map((d) => [d.id, d.name]))
  const clusters: ClusterView[] = clusterRows.map((c) => ({
    signatureKey: c.signatureKey,
    sourceType: c.sourceType,
    datasetId: c.datasetId,
    datasetName: dsMap.get(c.datasetId) ?? c.datasetId,
    dimension: c.dimension,
    dimensionTh: dimensionThOf(c.dimension),
    members: JSON.parse(c.memberRunsJson || '[]') as ClusterView['members'],
    groupFailedRows: c.groupFailedRows,
    totalFailedRows: c.totalFailedRows,
    sharePct: c.sharePct,
    hypothesis: c.hypothesis,
  }))

  return {
    mode: 'BATCH',
    batchId,
    batchAt: batch.createdAt.toISOString(),
    anomalies,
    clusters,
    totalFailedRows: clusterRows[0]?.totalFailedRows ?? clusters[0]?.totalFailedRows ?? 0,
    evaluatedAt: new Date().toISOString(),
  }
}

/* --------------------------- โหมด LATEST_RUNS --------------------------- */

/**
 * โหมดสด — คำนวณจาก "ผลรันล่าสุดรายกฎ×ชุดข้อมูล" (ไม่บันทึก)
 * ใช้เมื่อยังไม่มี batch ในระบบ (เช่นข้อมูล seed) — คณิตเดียวกับโหมด batch ทุกตัวเลข
 */
export async function evaluateLatest(): Promise<MlEvaluation> {
  const s = await getMlSettings()
  // ผลรันล่าสุดของแต่ละคู่ (ruleId, datasetId)
  const pairs = await db.dqRun.groupBy({ by: ['ruleId', 'datasetId'], _max: { createdAt: true } })
  const latestRuns: RunLite[] = []
  for (const p of pairs) {
    if (!p._max.createdAt) continue
    const run = await db.dqRun.findFirst({
      where: { ruleId: p.ruleId, datasetId: p.datasetId, createdAt: p._max.createdAt },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, passRate: true, dimension: true, createdAt: true },
    })
    if (run) latestRuns.push(run)
  }

  const dsIds = [...new Set(latestRuns.map((r) => r.datasetId))]
  const ruleIds = [...new Set(latestRuns.map((r) => r.ruleId))]
  const [datasets, rules] = await Promise.all([
    db.dataset.findMany({ where: { id: { in: dsIds } }, select: { id: true, name: true, sourceType: true } }),
    db.dqRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, column: true, condition: true, severity: true } }),
  ])
  const datasetMap = new Map(datasets.map((d) => [d.id, d]))
  const ruleMap = new Map(rules.map((r) => [r.id, r]))

  const anomalyViews: AnomalyView[] = []
  for (const run of latestRuns) {
    const history = await db.dqRun.findMany({
      where: { ruleId: run.ruleId, datasetId: run.datasetId, createdAt: { lt: run.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: s.mlWindow,
      select: { id: true, ruleId: true, datasetId: true, totalRows: true, failedRows: true, passRate: true, dimension: true, createdAt: true },
    })
    const rule = ruleMap.get(run.ruleId)
    const ds = datasetMap.get(run.datasetId)
    anomalyViews.push(
      assessAnomaly(
        run,
        history,
        {
          datasetName: ds?.name ?? run.datasetId,
          sourceType: ds?.sourceType ?? '',
          column: rule?.column ?? run.ruleId,
          conditionName: rule?.condition ?? run.ruleId,
          severity: rule?.severity ?? 'MEDIUM',
        },
        s,
      ),
    )
  }

  const { clusters, totalFailedRows } = await buildClusters(latestRuns, s)
  for (const v of anomalyViews) {
    v.history = await historyFor(v.ruleId, v.datasetId, new Date(v.at))
  }

  return {
    mode: 'LATEST_RUNS',
    batchId: null,
    batchAt: null,
    anomalies: anomalyViews.sort((a, b) => b.zScore - a.zScore),
    clusters,
    totalFailedRows,
    evaluatedAt: new Date().toISOString(),
  }
}
