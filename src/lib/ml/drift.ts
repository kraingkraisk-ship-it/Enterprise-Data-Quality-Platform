// Data drift detection — Population Stability Index (PSI) + mean-shift z-test.
// PSI thresholds (configurable via policy drift.psiThreshold): <0.1 stable,
// 0.1–0.25 moderate, >0.25 significant.

export interface PsiResult {
  psi: number
  buckets: { label: string; expected: number; actual: number }[]
  verdict: 'STABLE' | 'MODERATE' | 'SIGNIFICANT'
}

export function computePsi(expected: number[], actual: number[], nBuckets = 10): PsiResult {
  if (expected.length === 0 || actual.length === 0) return { psi: 0, buckets: [], verdict: 'STABLE' }
  const sorted = [...expected].sort((a, b) => a - b)
  const edges: number[] = []
  for (let i = 1; i < nBuckets; i++) {
    const q = sorted[Math.floor((i / nBuckets) * sorted.length)]
    if (edges.length === 0 || q !== edges[edges.length - 1]) edges.push(q)
  }
  const bucketOf = (v: number) => {
    let b = 0
    while (b < edges.length && v >= edges[b]) b++
    return b
  }
  const totalBuckets = edges.length + 1
  const expCounts = new Array(totalBuckets).fill(0)
  const actCounts = new Array(totalBuckets).fill(0)
  expected.forEach((v) => expCounts[bucketOf(v)]++)
  actual.forEach((v) => actCounts[bucketOf(v)]++)
  let psi = 0
  const buckets: { label: string; expected: number; actual: number }[] = []
  for (let i = 0; i < totalBuckets; i++) {
    const e = expCounts[i] / expected.length
    const a = actCounts[i] / actual.length
    const eSafe = Math.max(e, 1e-6), aSafe = Math.max(a, 1e-6)
    psi += (aSafe - eSafe) * Math.log(aSafe / eSafe)
    buckets.push({ label: `B${i + 1}`, expected: Number(e.toFixed(4)), actual: Number(a.toFixed(4)) })
  }
  const v = Math.abs(psi)
  return { psi: Number(psi.toFixed(4)), buckets, verdict: v > 0.25 ? 'SIGNIFICANT' : v > 0.1 ? 'MODERATE' : 'STABLE' }
}

/** Categorical PSI over value frequencies (for segment/status-like columns). */
export function computeCategoricalPsi(expected: string[], actual: string[]): PsiResult {
  const cats = [...new Set([...expected, ...actual])]
  const eCounts = new Map<string, number>(), aCounts = new Map<string, number>()
  expected.forEach((v) => eCounts.set(v, (eCounts.get(v) ?? 0) + 1))
  actual.forEach((v) => aCounts.set(v, (aCounts.get(v) ?? 0) + 1))
  let psi = 0
  const buckets: { label: string; expected: number; actual: number }[] = cats.map((c) => {
    const e = (eCounts.get(c) ?? 0) / Math.max(1, expected.length)
    const a = (aCounts.get(c) ?? 0) / Math.max(1, actual.length)
    const eSafe = Math.max(e, 1e-6), aSafe = Math.max(a, 1e-6)
    psi += (aSafe - eSafe) * Math.log(aSafe / eSafe)
    return { label: c, expected: Number(e.toFixed(4)), actual: Number(a.toFixed(4)) }
  })
  const v = Math.abs(psi)
  return { psi: Number(psi.toFixed(4)), buckets, verdict: v > 0.25 ? 'SIGNIFICANT' : v > 0.1 ? 'MODERATE' : 'STABLE' }
}

/** Two-sample mean shift z-statistic (large-sample normal approximation). */
export function meanShiftZ(a: number[], b: number[]): { z: number; significant: boolean } {
  if (a.length < 2 || b.length < 2) return { z: 0, significant: false }
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length
  const varr = (xs: number[], m: number) => xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)
  const m1 = mean(a), m2 = mean(b)
  const se = Math.sqrt(varr(a, m1) / a.length + varr(b, m2) / b.length) || 1e-9
  const z = Math.abs(m1 - m2) / se
  return { z: Number(z.toFixed(3)), significant: z > 2.576 } // p < 0.01 two-tailed
}

/** Normalise PSI into 0..1 detection score (0.5 PSI → 1.0). */
export function normaliseDriftScore(psi: number): number {
  return Math.min(1, Number((Math.abs(psi) / 0.5).toFixed(3)))
}
