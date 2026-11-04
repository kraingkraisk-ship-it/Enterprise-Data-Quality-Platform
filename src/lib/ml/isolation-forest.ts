// Isolation Forest (unsupervised numeric anomaly detection) — iForest algorithm:
// random feature + random split, path length h(x); score = 2^(-E(h)/c(n)).
// Scores are in (0,1); >= ~0.6 suggests anomaly, policy threshold default 0.75.

interface IFNode {
  splitFeature?: number
  splitValue?: number
  left?: IFNode | null
  right?: IFNode | null
  size?: number
  isLeaf: boolean
}

export interface IsolationForestParams {
  nTrees?: number      // default 100
  sampleSize?: number  // default 256
  seed?: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function c(n: number): number {
  if (n <= 1) return 0
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n
}

export class IsolationForest {
  private trees: IFNode[] = []
  private params: Required<IsolationForestParams>
  private trained = false

  constructor(params: IsolationForestParams = {}) {
    this.params = { nTrees: params.nTrees ?? 100, sampleSize: params.sampleSize ?? 256, seed: params.seed ?? 42 }
  }

  fit(X: number[][]): void {
    const rnd = mulberry32(this.params.seed)
    const n = X.length
    if (n === 0) return
    const dim = X[0].length
    const sample = Math.min(this.params.sampleSize, n)
    const heightLimit = Math.ceil(Math.log2(Math.max(2, sample)))
    this.trees = []
    for (let t = 0; t < this.params.nTrees; t++) {
      const idx: number[] = []
      const used = new Set<number>()
      while (idx.length < sample && used.size < n) {
        const i = Math.floor(rnd() * n)
        if (!used.has(i)) { used.add(i); idx.push(i) }
      }
      this.trees.push(this.buildTree(idx.map((i) => X[i]), 0, heightLimit, dim, rnd))
    }
    this.trained = true
  }

  private buildTree(rows: number[][], depth: number, limit: number, dim: number, rnd: () => number): IFNode {
    if (depth >= limit || rows.length <= 1) return { isLeaf: true, size: rows.length }
    let f = -1
    for (let attempt = 0; attempt < dim; attempt++) {
      const cand = Math.floor(rnd() * dim)
      const vals = rows.map((r) => r[cand])
      const min = Math.min(...vals), max = Math.max(...vals)
      if (min < max) { f = cand; break }
    }
    if (f === -1) return { isLeaf: true, size: rows.length }
    const vals = rows.map((r) => r[f])
    const min = Math.min(...vals), max = Math.max(...vals)
    const splitValue = min + rnd() * (max - min)
    const left = rows.filter((r) => r[f] < splitValue)
    const right = rows.filter((r) => r[f] >= splitValue)
    return {
      isLeaf: false, splitFeature: f, splitValue,
      left: this.buildTree(left, depth + 1, limit, dim, rnd),
      right: this.buildTree(right, depth + 1, limit, dim, rnd),
    }
  }

  private pathLength(x: number[], node: IFNode | null | undefined, depth: number): number {
    if (!node || node.isLeaf) return depth + c(node?.size ?? 1)
    const v = x[node.splitFeature!]
    return v < node.splitValue! ? this.pathLength(x, node.left, depth + 1) : this.pathLength(x, node.right, depth + 1)
  }

  scoreSample(x: number[]): number {
    if (!this.trained || this.trees.length === 0) return 0
    const sampleSize = this.params.sampleSize
    let sum = 0
    for (const tree of this.trees) sum += this.pathLength(x, tree, 0)
    const eh = sum / this.trees.length
    return Math.pow(2, -eh / c(sampleSize))
  }

  isTrained(): boolean { return this.trained }
}

/** Score rows, return per-row score + top contributing features (deviation from median). */
export function detectNumericOutliers(
  rows: number[][],
  columns: string[],
  params?: IsolationForestParams,
): { scores: number[]; contributions: { feature: string; contribution: number }[][] } {
  const forest = new IsolationForest(params)
  forest.fit(rows)
  const medians = columns.map((_, j) => {
    const vals = rows.map((r) => r[j]).sort((a, b) => a - b)
    return vals[Math.floor(vals.length / 2)] ?? 0
  })
  const mads = columns.map((_, j) => {
    const vals = rows.map((r) => Math.abs(r[j] - medians[j])).sort((a, b) => a - b)
    return vals[Math.floor(vals.length / 2)] || 1e-9
  })
  const scores = rows.map((r) => forest.scoreSample(r))
  const contributions = rows.map((r) => {
    const devs = r.map((v, j) => Math.abs(v - medians[j]) / mads[j])
    const total = devs.reduce((a, b) => a + b, 0) || 1e-9
    return columns
      .map((feature, j) => ({ feature, contribution: Number((devs[j] / total).toFixed(3)) }))
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
  })
  return { scores, contributions }
}
