// Duplicate detection — fuzzy matching via Jaro-Winkler + exact-key blocking,
// record-linkage style pair scoring across configured fields.

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1
  const l1 = s1.length, l2 = s2.length
  if (l1 === 0 || l2 === 0) return 0
  const matchWindow = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1)
  const s1Matches = new Array<boolean>(l1).fill(false)
  const s2Matches = new Array<boolean>(l2).fill(false)
  let matches = 0
  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, l2)
    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) { s1Matches[i] = true; s2Matches[j] = true; matches++; break }
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < l1; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++
      if (s1[i] !== s2[k]) transpositions++
      k++
    }
  }
  return (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3
}

export function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const j = jaro(s1.toLowerCase().trim(), s2.toLowerCase().trim())
  if (j === 0) return 0
  let prefix = 0
  const a = s1.toLowerCase().trim(), b = s2.toLowerCase().trim()
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  return j + prefix * prefixScale * (1 - j)
}

export interface LinkageField { name: string; weight: number; kind: 'exact' | 'fuzzy' }

export interface DuplicateCluster {
  rowIndices: number[]
  pairScore: number
  fieldScores: { field: string; score: number }[]
}

/** Pairwise record linkage; clusters records whose weighted field score >= threshold. */
export function findDuplicateClusters(
  rows: Record<string, string>[],
  fields: LinkageField[],
  threshold = 0.9,
  maxScan = 2000,
): DuplicateCluster[] {
  const n = Math.min(rows.length, maxScan)
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const union = (a: number, b: number) => { parent[find(a)] = find(b) }
  const pairFindings: DuplicateCluster[] = []
  const wSum = fields.reduce((a, f) => a + f.weight, 0) || 1

  const blockKey = (r: Record<string, string>) => {
    const ex = fields.find((f) => f.kind === 'exact')
    return ex ? String(r[ex.name] ?? '').toLowerCase() : null
  }
  const hasBlocking = fields.some((f) => f.kind === 'exact')

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hasBlocking && blockKey(rows[i]) !== blockKey(rows[j])) continue
      const fieldScores = fields.map((f) => {
        const v1 = String(rows[i][f.name] ?? ''), v2 = String(rows[j][f.name] ?? '')
        if (v1 === '' && v2 === '') return { field: f.name, score: 1 }
        const score = f.kind === 'exact' ? (v1.toLowerCase() === v2.toLowerCase() ? 1 : 0) : jaroWinkler(v1, v2)
        return { field: f.name, score: Number(score.toFixed(3)) }
      })
      const pair = fieldScores.reduce((a, fs, idx) => a + fs.score * fields[idx].weight, 0) / wSum
      if (pair >= threshold) {
        union(i, j)
        pairFindings.push({ rowIndices: [i, j], pairScore: Number(pair.toFixed(3)), fieldScores })
      }
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const best = pairFindings.find((c) => c.rowIndices.every((r) => g.includes(r)))
      return best ?? { rowIndices: g, pairScore: threshold, fieldScores: [] }
    })
}
