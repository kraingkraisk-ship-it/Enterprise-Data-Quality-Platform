// Data Quality Score formula with anti-gaming guardrails (policy-driven).
//
// Score = Σ_dimensions w_d × passRate_d  × coverageCap
//   passRate_d = Σ passed weight / Σ evaluated weight  (CRITICAL failures weigh ×criticalWeight)
//   coverageCap: if CDE rule coverage < score.coverageFloor → cap score at 70
//   (prevents gaming by authoring only easy rules); guardrail report included.

import { DIMENSIONS, type Dimension } from '@/lib/types'

export interface RuleScoreInput { dimension: string; passRate: number; severity: string; status: string }

export interface ScoreResult {
  score: number // 0..100
  dimensionRates: Record<Dimension, number>
  guardrails: { coverageFloor: number; cdeCoverage: number; capped: boolean; noteEn: string; noteTh: string }
}

const DIM_FALLBACK: Record<Dimension, number> = {
  COMPLETENESS: 0.2, ACCURACY: 0.1, VALIDITY: 0.15, CONSISTENCY: 0.1, UNIQUENESS: 0.15,
  TIMELINESS: 0.1, INTEGRITY: 0.05, VOLUME: 0.05, SCHEMA_CONFORMITY: 0.1,
}

/**
 * Score = Σ_d w_d × meanEffectiveRate_d, renormalised over dimensions that have rules.
 * Anti-gaming: failed CRITICAL rules contribute passRate/criticalWeight; when CDE
 * rule coverage is below the policy floor the final score is capped at 70.
 */
export function computeQualityScore(
  rules: RuleScoreInput[],
  opts: {
    weights?: Partial<Record<Dimension, number>>
    coverageFloor?: number      // default 0.6
    criticalWeight?: number     // default 2.0
    cdeCoverage?: number        // fraction of CDE columns covered by at least one active rule
  } = {},
): ScoreResult {
  const weights = { ...DIM_FALLBACK, ...(opts.weights ?? {}) }
  const coverageFloor = opts.coverageFloor ?? 0.6
  const criticalWeight = opts.criticalWeight ?? 2.0
  const cdeCoverage = opts.cdeCoverage ?? 1

  const byDim = new Map<Dimension, { sum: number; n: number }>()
  for (const r of rules) {
    const d = r.dimension as Dimension
    const effective = r.status === 'FAILED' && r.severity === 'CRITICAL' ? r.passRate / criticalWeight : r.passRate
    const t = byDim.get(d) ?? { sum: 0, n: 0 }
    t.sum += Math.max(0, Math.min(1, effective))
    t.n += 1
    byDim.set(d, t)
  }

  const dimensionRates = {} as Record<Dimension, number>
  let weighted = 0
  let weightSum = 0
  for (const d of DIMENSIONS) {
    const t = byDim.get(d)
    if (!t || t.n === 0) continue
    dimensionRates[d] = Number((t.sum / t.n).toFixed(4))
    weighted += weights[d] * (t.sum / t.n)
    weightSum += weights[d]
  }
  const raw = weightSum === 0 ? 0 : weighted / weightSum
  let score = raw * 100
  let capped = false
  let noteEn = 'All guardrails satisfied.'
  let noteTh = 'เงื่อนไขป้องกันการปรับคะแนนเป็นไปตามนโยบาย'
  if (cdeCoverage < coverageFloor) {
    score = Math.min(score, 70)
    capped = true
    noteEn = `CDE rule coverage ${(cdeCoverage * 100).toFixed(0)}% is below the policy floor ${(coverageFloor * 100).toFixed(0)}%; score is capped at 70 until critical data elements are covered.`
    noteTh = `ความครอบคลุมกฎของ CDE ${Math.round(cdeCoverage * 100)}% ต่ำกว่าเกณฑ์นโยบาย ${Math.round(coverageFloor * 100)}% คะแนนจึงถูกจำกัดที่ 70 จนกว่าจะครอบคลุมข้อมูลสำคัญครบ`
  }
  return {
    score: Number(score.toFixed(1)),
    dimensionRates,
    guardrails: { coverageFloor, cdeCoverage: Number(cdeCoverage.toFixed(3)), capped, noteEn, noteTh },
  }
}
