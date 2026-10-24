/**
 * Sampling Engine (v0.26.0) — ② Risk-based Sampling
 * จัดสรร "งบการทบทวน" ตามคะแนนความเสี่ยงรายกฎ×ชุดข้อมูล + สุ่มรายแถวแบบ deterministic
 * คณิตทั้งหมดอ่านเกณฑ์จาก src/lib/sampling.ts และ src/lib/regulation.ts (single source of truth)
 *
 * การทำงาน 2 โหมด:
 * - generateSamplePlan(batchId, policy): คำนวณ + บันทึกแผนลง DqSamplePlan (1 นโยบายต่อ batch —
 *   สร้างใหม่ = transaction ลบของเดิมทั้ง batch แล้วใส่ชุดใหม่ กันปนนโยบาย)
 * - readSamplePlan(batchId): อ่านแผนที่บันทึกไว้ (GET — ไม่เขียน DB)
 *
 * หลักการล็อก: แผนนี้เป็น "ข้อเสนองบการทบทวนให้มนุษย์" — ไม่แตะ DqRun/DqFailureRecord ต้นทาง
 * ไม่ตัดสินผ่าน/ไม่ผ่านแทนเกณฑ์ และทำซ้ำได้ (batch + นโยบายเดิม + สถานะแถวเดิม = ชุดแถวเดิมเป๊ะ)
 */
import { db } from '@/lib/db'
import { likelihoodOf, riskBandOf, SEVERITY_WEIGHT, type RiskBand } from '@/lib/regulation'
import { getMlSettings } from '@/lib/ml-settings-server'
import {
  DRIFT_BOOST,
  ML_LEVEL_BOOST,
  PII_BOOST,
  policyOf,
  RISK_SCORE_MAX,
  SAMPLING_METHOD,
  SAMPLING_SEED_SALT,
  type SamplingPolicyKey,
} from '@/lib/sampling'
import { DIMENSION_LABELS, isDimensionKey } from '@/lib/dq'

/* --------------------------- โครงผลลัพธ์ (UI ใช้ type-only) --------------------------- */

export interface SampleFactors {
  likelihood: number
  likelihoodLabel: string
  impact: number
  mlBoost: number
  driftBoost: number
  piiBoost: number
  zScore: number | null
}

export interface SamplePickedRow {
  id: string
  rowNo: number
  status: string
}

export interface SampleGroupView {
  ruleId: string
  datasetId: string
  datasetName: string
  sourceType: string
  column: string
  conditionName: string
  severity: string
  dimension: string
  dimensionTh: string
  failRate: number
  factors: SampleFactors
  riskScore: number
  riskBand: { band: RiskBand; label: string; className: string }
  failedRows: number
  reviewableRows: number
  sampleSize: number
  included: boolean
  picked: SamplePickedRow[]
  statusCounts: { NEW: number; FIXED: number; IGNORED: number }
}

export interface SamplePlanSummary {
  totalFailedRows: number
  reviewableRows: number
  budgetRows: number
  includedGroups: number
  totalGroups: number
  riskCoveragePct: number
}

export interface SamplePlanView {
  mode: 'BATCH'
  batchId: string
  batchAt: string
  policy: SamplingPolicyKey
  policyLabel: string
  method: string
  summary: SamplePlanSummary
  groups: SampleGroupView[]
  createdAt: string
}

export interface SamplePlanResponse {
  plan: SamplePlanView | null
  reason?: 'NO_BATCH' | 'NO_FAILURES'
  message?: string
}

/* ------------------------ ฟังก์ชันบริสุทธิ์ (ทดสอบย้อนได้) ------------------------ */

/** FNV-1a 32-bit — แปลง string เป็น seed จำนวนเต็ม (deterministic ข้ามรันไทม์) */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — PRNG เล็ก เร็ว พอสำหรับสุ่มลำดับ (ตั้งใจไม่ใช้ crypto เพื่อให้ทำซ้ำได้เป๊ะ) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** สุ่มเลือก n รายการจากลิสต์ (Fisher–Yates ด้วย rng) — อินพุตเรียงคงที่มาก่อน = ผลซ้ำเดิมเป๊ะ */
export function seededPick<T>(items: T[], n: number, rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr.slice(0, Math.max(0, n))
}

/**
 * จัดสรรงบแบบแปรผันตามสัดส่วนน้ำหนัก + largest remainder (ปรับด้วย cap รายกลุ่ม)
 * - เศษที่เหลือแจกตามลำดับเศษมากสุดก่อน (sort แบบ stable → tie คงลำดับความเสี่ยงที่ให้มา)
 * - คืนโควตารายกลุ่ม; Σโควตา = budget เท่าที่ cap ยอม (ถ้างบเกิน Σcap จะได้ Σcap พอดี)
 */
export function allocateBudget(weights: number[], budget: number, caps: number[]): number[] {
  const n = weights.length
  const quota = new Array<number>(n).fill(0)
  if (budget <= 0 || n === 0) return quota
  const totalW = weights.reduce((a, b) => a + b, 0)

  if (totalW <= 0) {
    // ทุกกลุ่มคะแนนศูนย์ — แจกตามลำดับที่ให้มา (เรียงความเสี่ยงมาแล้ว) กลุ่มละ 1 จนงบหมด
    let left = budget
    for (let i = 0; i < n && left > 0; i++) {
      const q = Math.min(1, caps[i])
      quota[i] = q
      left -= q
    }
    return quota
  }

  // ผ่าน 1 — โควตาพื้นจาก floor(สัดส่วน × งบ) จำกัดด้วย cap ของกลุ่ม
  let allocated = 0
  const remainders: Array<{ i: number; frac: number }> = []
  for (let i = 0; i < n; i++) {
    const ideal = (weights[i] / totalW) * budget
    const q = Math.min(Math.floor(ideal), caps[i])
    quota[i] = q
    allocated += q
    remainders.push({ i, frac: ideal - Math.floor(ideal) })
  }

  // ผ่าน 2 — แจกงบคงเหลือรอบรวมตามเศษมากสุดก่อน จนงบหมดหรือทุกกลุ่มเต็ม cap
  let left = budget - allocated
  remainders.sort((a, b) => b.frac - a.frac)
  for (let round = 0; left > 0 && round < n; round++) {
    let progress = false
    for (const { i } of remainders) {
      if (left <= 0) break
      if (quota[i] < caps[i]) {
        quota[i]++
        left--
        progress = true
      }
    }
    if (!progress) break
  }
  return quota
}

/* ------------------------------ คำนวณคะแนนความเสี่ยง ------------------------------ */

/** คะแนนความเสี่ยง = โอกาส × ผลกระทบ + เสริม (ML แย่ลง / drift / PII) — เพดาน RISK_SCORE_MAX */
function riskScoreOf(factors: SampleFactors): number {
  const base = factors.likelihood * factors.impact
  return Math.min(RISK_SCORE_MAX, base + factors.mlBoost + factors.driftBoost + factors.piiBoost)
}

/* ------------------------------ สร้างแผน (POST) ------------------------------ */

interface GroupAgg {
  ruleId: string
  datasetId: string
  dimension: string
  failedRows: number
  totalRows: number
}

/** สร้าง (และทับของเดิม) แผนสุ่มตรวจของ 1 batch ด้วยนโยบายที่กำหนด */
export async function generateSamplePlan(batchId: string, policyKey: SamplingPolicyKey): Promise<SamplePlanResponse> {
  const policy = policyOf(policyKey)
  const batch = await db.dqValidationBatch.findUnique({ where: { id: batchId } })
  if (!batch) return { plan: null, reason: 'NO_BATCH', message: 'ไม่พบรอบรัน (batch) นี้ในระบบ' }

  // เกณฑ์ drift อ่านจาก DqMlSettings ปัจจุบัน (v0.28.0 — แก้ duplicate 0.6 เดิมให้อ่านจาก settings เดียวกับ engine ①)
  const s = await getMlSettings()

  // กลุ่ม = ผลรันที่ล้มเหลวของ batch รายกฎ×ชุดข้อมูล (batch เดียวปกติ 1 รันต่อกลุ่ม — รวมกันกัน edge)
  const runs = await db.dqRun.findMany({
    where: { batchId, failedRows: { gt: 0 } },
    select: { ruleId: true, datasetId: true, dimension: true, failedRows: true, totalRows: true },
  })
  if (runs.length === 0) {
    return { plan: null, reason: 'NO_FAILURES', message: 'รอบนี้ไม่มีแถวล้มเหลว — ไม่จำเป็นต้องสุ่มตรวจ (ผลดี)' }
  }
  const agg = new Map<string, GroupAgg>()
  for (const r of runs) {
    const key = `${r.ruleId}|${r.datasetId}`
    const prev = agg.get(key)
    if (prev) {
      prev.failedRows += r.failedRows
      prev.totalRows += r.totalRows
    } else {
      agg.set(key, { ruleId: r.ruleId, datasetId: r.datasetId, dimension: r.dimension, failedRows: r.failedRows, totalRows: r.totalRows })
    }
  }

  // แถวทบทวนได้จริง (snapshot ที่เก็บ — cap 200/กฎ) + สถานะรายแถว
  const records = await db.dqFailureRecord.findMany({
    where: { batchId },
    select: { id: true, ruleId: true, datasetId: true, rowNo: true, status: true },
    orderBy: [{ ruleId: 'asc' }, { datasetId: 'asc' }, { rowNo: 'asc' }],
  })
  const reviewable = new Map<string, typeof records>()
  for (const rec of records) {
    const key = `${rec.ruleId}|${rec.datasetId}`
    const arr = reviewable.get(key) ?? []
    arr.push(rec)
    reviewable.set(key, arr)
  }

  // สัญญาณเสริมจาก ML รอบเดียวกัน (เฉพาะทิศ "แย่ลง" — ดีขึ้นผิดปกติไม่นับเป็นความเสี่ยง)
  const anomalies = await db.dqAnomaly.findMany({
    where: { batchId },
    select: { ruleId: true, datasetId: true, level: true, zScore: true, driftSlope: true, driftR2: true, failRate: true, baseline: true },
  })
  const anomalyMap = new Map<string, { boost: number; z: number | null; drift: boolean }>()
  for (const a of anomalies) {
    const worse = a.failRate >= a.baseline
    const boost = worse && (a.level === 'CRITICAL' || a.level === 'HIGH' || a.level === 'MEDIUM') ? ML_LEVEL_BOOST[a.level] : 0
    const drift = worse && (a.driftSlope ?? 0) > 0 && (a.driftR2 ?? 0) >= s.driftR2Min
    anomalyMap.set(`${a.ruleId}|${a.datasetId}`, { boost, z: a.level === 'INSUFFICIENT_HISTORY' ? null : a.zScore, drift })
  }

  // ธง PII จากผล profiling ล่าสุดรายชุดข้อมูล
  const datasetIds = [...new Set([...agg.values()].map((g) => g.datasetId))]
  const [datasets, rules] = await Promise.all([
    db.dataset.findMany({ where: { id: { in: datasetIds } }, select: { id: true, name: true, sourceType: true } }),
    db.dqRule.findMany({ where: { id: { in: [...agg.keys()].map((k) => k.split('|')[0]) } }, select: { id: true, column: true, condition: true, severity: true } }),
  ])
  const datasetMap = new Map(datasets.map((d) => [d.id, d]))
  const ruleMap = new Map(rules.map((r) => [r.id, r]))
  const piiMap = new Map<string, boolean>()
  for (const dsId of datasetIds) {
    const latestProfile = await db.dqProfileRun.findFirst({
      where: { datasetId: dsId },
      orderBy: { createdAt: 'desc' },
      select: { piiColumnCount: true },
    })
    piiMap.set(dsId, (latestProfile?.piiColumnCount ?? 0) > 0)
  }

  // คะแนนความเสี่ยงต่อกลุ่ม
  const groups = [...agg.values()].map((g) => {
    const failRate = g.totalRows > 0 ? g.failedRows / g.totalRows : 0
    const likelihood = likelihoodOf(failRate)
    const impact = SEVERITY_WEIGHT[ruleMap.get(g.ruleId)?.severity ?? 'MEDIUM'] ?? 3
    const ml = anomalyMap.get(`${g.ruleId}|${g.datasetId}`)
    const factors: SampleFactors = {
      likelihood: likelihood.level,
      likelihoodLabel: likelihood.label,
      impact,
      mlBoost: ml?.boost ?? 0,
      driftBoost: ml?.drift ? DRIFT_BOOST : 0,
      piiBoost: piiMap.get(g.datasetId) ? PII_BOOST : 0,
      zScore: ml?.z ?? null,
    }
    return { g, failRate, factors, riskScore: riskScoreOf(factors) }
  })

  // งบการทบทวน — ฐานจริง = แถว snapshot ที่เก็บไว้ (โปร่งใสแยกจาก failedRows รวม)
  const totalReviewable = records.length
  const budget = policy.frac >= 1 ? totalReviewable : Math.max(1, Math.round(totalReviewable * policy.frac))

  // เรียงกลุ่ม: ความเสี่ยงสูงสุดก่อน (tie: แถวล้มมากกว่า → ruleId → datasetId เพื่อ determinism)
  const ordered = groups
    .map((x) => ({ ...x, reviewableRows: reviewable.get(`${x.g.ruleId}|${x.g.datasetId}`)?.length ?? 0 }))
    .filter((x) => x.reviewableRows > 0)
    .sort(
      (a, b) =>
        b.riskScore - a.riskScore ||
        b.g.failedRows - a.g.failedRows ||
        a.g.ruleId.localeCompare(b.g.ruleId) ||
        a.g.datasetId.localeCompare(b.g.datasetId),
    )

  const quotas = allocateBudget(
    ordered.map((x) => x.riskScore),
    budget,
    ordered.map((x) => x.reviewableRows),
  )

  // เลือกแถวรายกลุ่ม (deterministic) — NEW ก่อน ไม่พอเติมจาก FIXED/IGNORED
  const planRows: Array<{
    batchId: string
    policy: string
    ruleId: string
    datasetId: string
    dimension: string
    riskScore: number
    factorsJson: string
    failRate: number
    failedRows: number
    reviewableRows: number
    sampleSize: number
    included: boolean
    sampledRecordIdsJson: string
  }> = []

  const views: SampleGroupView[] = []
  ordered.forEach((x, idx) => {
    const quota = quotas[idx] ?? 0
    const { g, factors } = x
    const seed = hashString(`${batchId}|${policy.key}|${g.ruleId}|${g.datasetId}|${SAMPLING_SEED_SALT}`)
    const rng = mulberry32(seed)
    const all = reviewable.get(`${g.ruleId}|${g.datasetId}`) ?? []
    const fresh = all.filter((r) => r.status === 'NEW')
    const handled = all.filter((r) => r.status !== 'NEW')
    const pickedFresh = seededPick(fresh, Math.min(quota, fresh.length), rng)
    const pickedHandled = quota > pickedFresh.length ? seededPick(handled, quota - pickedFresh.length, rng) : []
    const picked = [...pickedFresh, ...pickedHandled].sort((a, b) => a.rowNo - b.rowNo)

    const statusCounts = { NEW: 0, FIXED: 0, IGNORED: 0 }
    for (const r of picked) if (r.status in statusCounts) statusCounts[r.status as keyof typeof statusCounts]++

    planRows.push({
      batchId,
      policy: policy.key,
      ruleId: g.ruleId,
      datasetId: g.datasetId,
      dimension: g.dimension,
      riskScore: x.riskScore,
      factorsJson: JSON.stringify(factors),
      failRate: Number(x.failRate.toFixed(6)),
      failedRows: g.failedRows,
      reviewableRows: x.reviewableRows,
      sampleSize: quota,
      included: quota > 0,
      sampledRecordIdsJson: JSON.stringify(picked.map((p) => p.id)),
    })

    const rule = ruleMap.get(g.ruleId)
    const ds = datasetMap.get(g.datasetId)
    views.push({
      ruleId: g.ruleId,
      datasetId: g.datasetId,
      datasetName: ds?.name ?? g.datasetId,
      sourceType: ds?.sourceType ?? '',
      column: rule?.column ?? g.ruleId,
      conditionName: rule?.condition ?? g.ruleId,
      severity: rule?.severity ?? 'MEDIUM',
      dimension: g.dimension,
      dimensionTh: isDimensionKey(g.dimension) ? DIMENSION_LABELS[g.dimension].th : g.dimension,
      failRate: Number(x.failRate.toFixed(4)),
      factors,
      riskScore: x.riskScore,
      riskBand: riskBandOf(x.riskScore),
      failedRows: g.failedRows,
      reviewableRows: x.reviewableRows,
      sampleSize: quota,
      included: quota > 0,
      picked: picked.map((p) => ({ id: p.id, rowNo: p.rowNo, status: p.status })),
      statusCounts,
    })
  })

  // บันทึก — 1 นโยบายต่อ batch: ลบของเดิมทั้งชุดแล้วใส่ใหม่ใน transaction เดียว
  // (ใช้ interactive transaction — batched-array form ของ Prisma 6.19 รายงาน error ผิดจุดเมื่อ args ผิด)
  await db.$transaction(async (tx) => {
    await tx.dqSamplePlan.deleteMany({ where: { batchId } })
    await tx.dqSamplePlan.createMany({ data: planRows })
  })

  const totalRisk = views.reduce((a, v) => a + v.riskScore * v.reviewableRows, 0)
  const coveredRisk = views.filter((v) => v.included).reduce((a, v) => a + v.riskScore * v.reviewableRows, 0)
  const plan: SamplePlanView = {
    mode: 'BATCH',
    batchId,
    batchAt: batch.createdAt.toISOString(),
    policy: policy.key,
    policyLabel: policy.label,
    method: SAMPLING_METHOD,
    summary: {
      totalFailedRows: [...agg.values()].reduce((a, g) => a + g.failedRows, 0),
      reviewableRows: totalReviewable,
      budgetRows: views.reduce((a, v) => a + v.sampleSize, 0),
      includedGroups: views.filter((v) => v.included).length,
      totalGroups: views.length,
      riskCoveragePct: totalRisk > 0 ? Number(((coveredRisk / totalRisk) * 100).toFixed(1)) : 0,
    },
    groups: views,
    createdAt: new Date().toISOString(),
  }
  return { plan }
}

/* ------------------------------ อ่านแผน (GET) ------------------------------ */

/** อ่านแผนสุ่มตรวจที่บันทึกไว้ของ batch — คืน null ถ้ายังไม่เคยสร้าง */
export async function readSamplePlan(batchId: string): Promise<SamplePlanView | null> {
  const [batch, rows] = await Promise.all([
    db.dqValidationBatch.findUnique({ where: { id: batchId } }),
    db.dqSamplePlan.findMany({
      where: { batchId },
      orderBy: [{ riskScore: 'desc' }, { failedRows: 'desc' }],
      include: {
        rule: { select: { column: true, condition: true, severity: true } },
        dataset: { select: { name: true, sourceType: true } },
      },
    }),
  ])
  if (!batch || rows.length === 0) return null

  const allIds = rows.flatMap((r) => JSON.parse(r.sampledRecordIdsJson || '[]') as string[])
  const recs = allIds.length
    ? await db.dqFailureRecord.findMany({
        where: { id: { in: allIds } },
        select: { id: true, rowNo: true, status: true },
      })
    : []
  const recMap = new Map(recs.map((r) => [r.id, r]))

  const groups: SampleGroupView[] = rows.map((r) => {
    const factors = JSON.parse(r.factorsJson || '{}') as SampleFactors
    const pickedIds = JSON.parse(r.sampledRecordIdsJson || '[]') as string[]
    const picked = pickedIds
      .map((id) => recMap.get(id))
      .filter((p): p is { id: string; rowNo: number; status: string } => Boolean(p))
      .sort((a, b) => a.rowNo - b.rowNo)
    const statusCounts = { NEW: 0, FIXED: 0, IGNORED: 0 }
    for (const p of picked) if (p.status in statusCounts) statusCounts[p.status as keyof typeof statusCounts]++
    return {
      ruleId: r.ruleId,
      datasetId: r.datasetId,
      datasetName: r.dataset.name,
      sourceType: r.dataset.sourceType,
      column: r.rule.column,
      conditionName: r.rule.condition,
      severity: r.rule.severity,
      dimension: r.dimension,
      dimensionTh: isDimensionKey(r.dimension) ? DIMENSION_LABELS[r.dimension].th : r.dimension,
      failRate: r.failRate,
      factors: {
        likelihood: factors.likelihood ?? 1,
        likelihoodLabel: factors.likelihoodLabel ?? '—',
        impact: factors.impact ?? 3,
        mlBoost: factors.mlBoost ?? 0,
        driftBoost: factors.driftBoost ?? 0,
        piiBoost: factors.piiBoost ?? 0,
        zScore: factors.zScore ?? null,
      },
      riskScore: r.riskScore,
      riskBand: riskBandOf(r.riskScore),
      failedRows: r.failedRows,
      reviewableRows: r.reviewableRows,
      sampleSize: r.sampleSize,
      included: r.included,
      picked,
      // statusCounts จาก picked เท่านั้น (แถวที่แผนเลือก) — ต่างจากตอน generate ที่นับทั้งกลุ่ม
      statusCounts,
    }
  })

  const totalRisk = groups.reduce((a, v) => a + v.riskScore * v.reviewableRows, 0)
  const coveredRisk = groups.filter((v) => v.included).reduce((a, v) => a + v.riskScore * v.reviewableRows, 0)
  const policy = policyOf(rows[0].policy)
  return {
    mode: 'BATCH',
    batchId,
    batchAt: batch.createdAt.toISOString(),
    policy: policy.key,
    policyLabel: policy.label,
    method: SAMPLING_METHOD,
    summary: {
      totalFailedRows: groups.reduce((a, v) => a + v.failedRows, 0),
      reviewableRows: groups.reduce((a, v) => a + v.reviewableRows, 0),
      budgetRows: groups.reduce((a, v) => a + v.sampleSize, 0),
      includedGroups: groups.filter((v) => v.included).length,
      totalGroups: groups.length,
      riskCoveragePct: totalRisk > 0 ? Number(((coveredRisk / totalRisk) * 100).toFixed(1)) : 0,
    },
    groups,
    createdAt: rows[0].createdAt.toISOString(),
  }
}
