/**
 * ML Studio — เอนจินหลัก (v0.35.0)
 * หลักการ: ML เป็น "ผู้ช่วย (Assistant)" — สถิติโปร่งใสทุกตัวเลข ตรวจย้อนได้ ไม่มีกล่องดำ
 * ชุดฝึก (Train set) = ข้อมูลจริงจาก Data Asset · ผู้ติดป้าย (Labeler) = กฎ DQ ทุกข้อ
 * โมเดลเรียนรู้ "น้ำหนักหลักฐาน" (log-likelihood ratio) ของลักษณะที่พบในแถวที่ "ไม่ถูกต้อง"
 * จากชุดฝึกเท่านั้น แล้ววัดความแม่นยำบนชุดทดสอบ (test split) — แยกข้อมูลสอนจากมนุษย์เข้าชุดฝึกเสมอ
 */

import { evaluateRule, type DimensionKey, type Row } from '@/lib/dq'
import { ENGINE_FAILURE_REASONS } from '@/lib/dama'

/* ------------------------------ ชนิดข้อมูล -------------------------------- */

/** กฎ 1 ข้อในบทบาท "ผู้ติดป้าย" */
export interface LabelerRule {
  id: string
  column: string
  /** engineType จาก ConditionTemplate (เช่น NOT_NULL / EMAIL / RANGE) */
  engineType: string
  parameters: string
  dimension: DimensionKey
  severity: string
  conditionName: string
}

/** การละเมิด 1 จุดของแถว (กฎ 1 ข้อล้มเหลวบนแถวนั้น) */
export interface Violation {
  ruleId: string
  column: string
  dimension: DimensionKey
  reason: string
}

/** แถวที่ถูกติดป้ายโดยกฎ (truth = ความจริงตามกฎทั้งหมดที่ใช้ได้) */
export interface LabeledRow {
  source: 'ASSET' | 'HUMAN'
  domainId: string
  assetId: string
  assetName: string
  rowNo: number
  rowData: Row
  /** ชุดคอลัมน์ของ Asset ต้นทาง — กันคุณลักษณะค่าว่างปน schema ข้าม asset (asset ต่างแถวต่างคอลัมน์) */
  assetColumns?: string[]
  truth: 'INCORRECT' | 'CORRECT'
  violations: Violation[]
}

export interface Corpus {
  labels: LabeledRow[]
  appliedRules: string[] // rule id ที่ถูกใช้จริง
  skippedRules: string[] // rule id ที่ข้าม (ต้องใช้บริบทภายนอก เช่น ทะเบียนอ้างอิง)
}

/** กฎที่ต้องใช้บริบทจากชุดข้อมูล/ทะเบียนภายนอก — ข้ามจากการเป็นผู้ติดป้าย (กัน label เพี้ยนทั้งชุด) */
export const CONTEXT_RULE_ENGINES = new Set(['EXISTS_IN_DATASET', 'REFERENCE_MATCH'])

/* --------------------------- ลักษณะค่า (shape) ---------------------------- */

export type ValueShape = 'blank' | 'numeric' | 'email' | 'date' | 'text'

/** จัดลักษณะค่า 1 ค่า — ใช้เรียนรู้ "หน้าตาปกติ" ของคอลัมน์จากชุดฝึก */
export function shapeOf(v: unknown): ValueShape {
  if (v === null || v === undefined) return 'blank'
  const s = String(v).trim()
  if (s === '') return 'blank'
  if (s !== '' && !Number.isNaN(Number(s.replace(/,/g, '')))) return 'numeric'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email'
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(s) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) return 'date'
  return 'text'
}

function isBlank(v: unknown): boolean {
  return shapeOf(v) === 'blank'
}

/* ------------------------- การติดป้ายโดยกฎ DQ ----------------------------- */

/**
 * ติดป้ายทุกแถวด้วยกฎทุกข้อ (ที่ไม่ต้องใช้บริบทภายนอก)
 * แถวใดมีกฎข้อใดล้มเหลว = INCORRECT พร้อมเหตุผลรายข้อ (ภาษาคน) — ตามหลัก "กฎบอกว่าไม่ถูกต้องอย่างไรและเพราะอะไร"
 */
export function labelRows(rules: LabelerRule[], rows: Row[], meta: { domainId: string; assetId: string; assetName: string }): Corpus {
  const usable = rules.filter((r) => !CONTEXT_RULE_ENGINES.has(r.engineType) && r.column.trim() !== '')
  const skipped = rules.filter((r) => CONTEXT_RULE_ENGINES.has(r.engineType)).map((r) => r.id)
  const labels: LabeledRow[] = []
  // ชุดคอลัมน์จริงของ Asset นี้ (union ของทุกแถว) — ใช้กันคุณลักษณะค่าว่างปน schema ข้าม asset
  const assetColumns = [...new Set(rows.flatMap((r) => Object.keys(r)))]

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const violations: Violation[] = []
    for (const rule of usable) {
      if (!assetColumns.includes(rule.column)) continue // คอลัมน์นี้ไม่มีใน Asset — กฎยังไม่เกี่ยวข้อง
      const ev = evaluateRule({ column: rule.column, engineType: rule.engineType, parameters: rule.parameters }, [row])
      if (ev.failedRows > 0) {
        violations.push({
          ruleId: rule.id,
          column: rule.column,
          dimension: rule.dimension,
          reason: `${rule.column}: ${ENGINE_FAILURE_REASONS[rule.engineType] ?? 'ค่าไม่เป็นไปตามเงื่อนไข'} (${rule.conditionName})`,
        })
      }
    }
    labels.push({
      source: 'ASSET',
      domainId: meta.domainId,
      assetId: meta.assetId,
      assetName: meta.assetName,
      rowNo: i + 1,
      rowData: row,
      assetColumns,
      truth: violations.length > 0 ? 'INCORRECT' : 'CORRECT',
      violations,
    })
  }
  return { labels, appliedRules: usable.map((r) => r.id), skippedRules: skipped }
}

/* ------------------------------ โปรไฟล์คอลัมน์ ---------------------------- */

export interface ColumnProfile {
  column: string
  /** สัดส่วนค่าว่างในชุดฝึก */
  nullRate: number
  /** สัดส่วนค่าไม่ซ้ำในชุดฝึก */
  uniqueRate: number
  /** "หน้าตาปกติ" ของคอลัมน์ที่เรียนรู้จากชุดฝึก */
  majorityShape: ValueShape
  /** ช่วงตัวเลขที่เรียนรู้ (P5–P95 ของชุดฝึก) — เฉพาะคอลัมน์ตัวเลข */
  p5: number | null
  p95: number | null
  /** สาเหตุที่พบบ่อยจากกฎ (ชุดฝึก) */
  topReasons: Array<{ reason: string; count: number }>
}

/** โปรไฟล์รายคอลัมน์จากแถวชุดฝึก + สาเหตุจากการละเมิด */
export function profileColumns(rows: LabeledRow[]): ColumnProfile[] {
  if (rows.length === 0) return []
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.rowData)))]
  const profiles: ColumnProfile[] = []

  for (const column of columns) {
    // เฉพาะแถวที่ asset ของมันมีคอลัมน์นี้จริง (กัน schema ข้าม asset ในการเทรนรวมหลาย asset)
    const rowsWithCol = rows.filter((r) => (r.assetColumns ? r.assetColumns.includes(column) : column in r.rowData))
    const values = rowsWithCol.map((r) => r.rowData[column])
    if (values.length === 0) continue
    const blanks = values.filter((v) => isBlank(v)).length
    const counts = new Map<string, number>()
    const shapeCount = new Map<ValueShape, number>()
    for (const v of values) {
      const sh = shapeOf(v)
      shapeCount.set(sh, (shapeCount.get(sh) ?? 0) + 1)
      if (sh !== 'blank') {
        const s = String(v)
        counts.set(s, (counts.get(s) ?? 0) + 1)
      }
    }
    const nonBlank = values.length - blanks
    let majorityShape: ValueShape = 'text'
    let best = -1
    for (const [sh, n] of shapeCount) {
      if (sh !== 'blank' && n > best) {
        best = n
        majorityShape = sh
      }
    }
    // P5–P95 ของค่าตัวเลข (เฉพาะเมื่อคอลัมน์เป็นตัวเลขส่วนใหญ่)
    let p5: number | null = null
    let p95: number | null = null
    if (majorityShape === 'numeric') {
      const nums = values
        .map((v) => Number(String(v).replace(/,/g, '')))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
      if (nums.length >= 5) {
        p5 = nums[Math.floor(nums.length * 0.05)]
        p95 = nums[Math.min(nums.length - 1, Math.floor(nums.length * 0.95))]
      }
    }
    // สาเหตุรวมของคอลัมน์นี้ (จากกฎที่ล้มบนแถวไม่ถูกต้อง)
    const reasonCount = new Map<string, number>()
    for (const r of rows) {
      if (r.truth !== 'INCORRECT') continue
      for (const v of r.violations) {
        if (v.column === column) reasonCount.set(v.reason, (reasonCount.get(v.reason) ?? 0) + 1)
      }
    }
    const topReasons = [...reasonCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, count }))

    profiles.push({
      column,
      nullRate: values.length > 0 ? blanks / values.length : 0,
      uniqueRate: nonBlank > 0 ? counts.size / nonBlank : 0,
      majorityShape,
      p5,
      p95,
      topReasons,
    })
  }
  return profiles
}

/* --------------------- คุณลักษณะรายแถว (features) -------------------------- */

export interface RowFeatures {
  nulls: string[]
  duplicates: string[]
  shapeMismatches: string[]
  rangeOutliers: string[]
}

/** คำนวณคุณลักษณะของแถว 1 แถว (duplicate คิดราย asset — ส่ง map นับค่าราย asset มาเอง) */
export function featuresOf(row: LabeledRow, profiles: ColumnProfile[], valueCounts: Map<string, Map<string, Map<string, number>>>): RowFeatures {
  const f: RowFeatures = { nulls: [], duplicates: [], shapeMismatches: [], rangeOutliers: [] }
  const assetCounts = valueCounts.get(row.assetId)
  for (const p of profiles) {
    // คอลัมน์ที่ asset ของแถวนี้ไม่มี — ข้าม (ไม่นับเป็นค่าว่าง ไม่นับเป็นหลักฐานใด ๆ)
    if (row.assetColumns && !row.assetColumns.includes(p.column)) continue
    const v = row.rowData[p.column]
    const sh = shapeOf(v)
    if (sh === 'blank') {
      f.nulls.push(p.column)
      continue
    }
    const s = String(v)
    const colCounts = assetCounts?.get(p.column)
    if (colCounts && (colCounts.get(s) ?? 0) > 1) f.duplicates.push(p.column)
    if (sh !== p.majorityShape) f.shapeMismatches.push(p.column)
    if (p.majorityShape === 'numeric' && p.p5 !== null && p.p95 !== null) {
      const n = Number(s.replace(/,/g, ''))
      if (Number.isFinite(n) && (n < p.p5 || n > p.p95)) f.rangeOutliers.push(p.column)
    }
  }
  return f
}

/* ------------------------ การเรียนรู้จากชุดฝึก ----------------------------- */

export interface ColumnWeights {
  nullW: number
  duplicateW: number
  shapeW: number
  rangeW: number
}

export interface ModelParams {
  /** น้ำหนักพื้นฐาน = ln(P(INC)/P(COR)) ของชุดฝึก */
  bias: number
  /** เกณฑ์ตัดสินที่เลือกจากชุดฝึก (max accuracy) */
  threshold: number
  columns: Record<string, ColumnWeights>
  /** คำอธิบายน้ำหนักสำคัญ (ภาษาคน — โชว์บนหน้าจอได้) */
  notes: string[]
}

const W_CAP = 2.5 // จำกัดน้ำหนักต่อหลักฐาน (กันคอลัมน์เดียวครอบทั้งคะแนน)

/** เรียนรู้น้ำหนักหลักฐาน (log-likelihood ratio + Laplace smoothing) จากชุดฝึก */
export function learnParams(train: LabeledRow[]): { params: ModelParams; profiles: ColumnProfile[] } {
  const profiles = profileColumns(train)
  const inc = train.filter((r) => r.truth === 'INCORRECT')
  const cor = train.filter((r) => r.truth === 'CORRECT')
  const nInc = Math.max(1, inc.length)
  const nCor = Math.max(1, cor.length)
  const bias = Math.log(nInc / nCor)

  // นับค่าซ้ำทั้งชุดฝึก (duplicate feature คิดจาก asset เดียวกัน)
  const valueCounts = valueCountsOf(train)

  // นับความถี่หลักฐานในกลุ่ม INC และ COR
  const feat = { inc: {}, cor: {} } as { inc: Record<string, number>; cor: Record<string, number> }
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1
  }
  for (const r of train) {
    const f = featuresOf(r, profiles, valueCounts)
    for (const c of f.nulls) bump(r.truth === 'INCORRECT' ? feat.inc : feat.cor, `null:${c}`)
    for (const c of f.duplicates) bump(r.truth === 'INCORRECT' ? feat.inc : feat.cor, `dup:${c}`)
    for (const c of f.shapeMismatches) bump(r.truth === 'INCORRECT' ? feat.inc : feat.cor, `shape:${c}`)
    for (const c of f.rangeOutliers) bump(r.truth === 'INCORRECT' ? feat.inc : feat.cor, `range:${c}`)
  }

  const columns: Record<string, ColumnWeights> = {}
  const notes: string[] = []
  for (const p of profiles) {
    const llr = (prefix: string) => {
      const a = (feat.inc[`${prefix}:${p.column}`] ?? 0) + 1
      const b = (feat.cor[`${prefix}:${p.column}`] ?? 0) + 1
      return Math.max(-W_CAP, Math.min(W_CAP, Math.log(a / nInc) - Math.log(b / nCor)))
    }
    const w: ColumnWeights = {
      nullW: llr('null'),
      duplicateW: llr('dup'),
      shapeW: llr('shape'),
      rangeW: llr('range'),
    }
    columns[p.column] = w
    if (w.nullW > 1.2) notes.push(`ค่าว่างใน "${p.column}" พบในแถวไม่ถูกต้องมากกว่าแถวถูกต้องหลายเท่า (น้ำหนัก ${w.nullW.toFixed(2)})`)
    if (w.rangeW > 1.2) notes.push(`ค่านอกช่วง P5–P95 ของ "${p.column}" เป็นหลักฐานเชิงลบที่ชัดเจน (น้ำหนัก ${w.rangeW.toFixed(2)})`)
    if (w.shapeW > 1.2) notes.push(`รูปแบบค่าผิดปกติใน "${p.column}" (ไม่ตรงหน้าตาปกติ ${p.majorityShape}) สัมพันธ์กับข้อผิดพลาด`)
  }

  // เลือกเกณฑ์ที่ accuracy สูงสุดบนชุดฝึก (grid search — โปร่งใสตรวจย้อนได้)
  const trialParams: ModelParams = { bias, threshold: bias, columns, notes }
  let bestT = bias
  let bestAcc = -1
  for (let t = bias - 2; t <= bias + 4; t += 0.1) {
    trialParams.threshold = t
    let ok = 0
    for (const r of train) {
      const s = scoreRow(r, profiles, valueCounts, trialParams)
      const pred = s >= t ? 'INCORRECT' : 'CORRECT'
      if (pred === r.truth) ok++
    }
    const acc = ok / train.length
    if (acc > bestAcc) {
      bestAcc = acc
      bestT = t
    }
  }

  return { params: { bias, threshold: bestT, columns, notes }, profiles }
}

/* --------------------------- การให้คะแนนแถว ------------------------------- */

export interface RowScore {
  score: number
  verdict: 'INCORRECT' | 'CORRECT' | 'SUSPECT'
  confidence: number // 0–1 ทิศทาง "ไม่ถูกต้อง"
  reasons: string[] // หลักฐานหลัก (ภาษาคน)
}

/** ให้คะแนนแถวจากพารามิเตอร์โมเดล (บวก = หลักฐานเอียงไป "ไม่ถูกต้อง") */
export function scoreRow(row: LabeledRow, profiles: ColumnProfile[], valueCounts: Map<string, Map<string, Map<string, number>>>, params: ModelParams): number {
  const f = featuresOf(row, profiles, valueCounts)
  let s = params.bias
  for (const c of f.nulls) s += params.columns[c]?.nullW ?? 0
  for (const c of f.duplicates) s += params.columns[c]?.duplicateW ?? 0
  for (const c of f.shapeMismatches) s += params.columns[c]?.shapeW ?? 0
  for (const c of f.rangeOutliers) s += params.columns[c]?.rangeW ?? 0
  return s
}

const GRAY_BAND = 0.25 // ช่วง "ยังไม่แน่ใจ" รอบเกณฑ์ — รายงานเป็น SUSPECT ให้คนช่วยตัดสิน

/** ตัดสินแถว 1 แถว + อธิบายหลักฐาน */
export function verdictOf(row: LabeledRow, profiles: ColumnProfile[], valueCounts: Map<string, Map<string, Map<string, number>>>, params: ModelParams): RowScore {
  const score = scoreRow(row, profiles, valueCounts, params)
  const t = params.threshold
  const verdict: RowScore['verdict'] = score >= t + GRAY_BAND ? 'INCORRECT' : score > t - GRAY_BAND ? 'SUSPECT' : 'CORRECT'
  const confidence = 1 / (1 + Math.exp(-(score - t)))

  const f = featuresOf(row, profiles, valueCounts)
  const reasons: string[] = []
  for (const c of f.nulls) {
    const w = params.columns[c]?.nullW ?? 0
    if (w > 0.3) reasons.push(`${c}: ไม่มีข้อมูล (ค่าว่าง) — น้ำหนักหลักฐาน ${w.toFixed(2)}`)
  }
  for (const c of f.rangeOutliers) {
    const w = params.columns[c]?.rangeW ?? 0
    if (w > 0.3) reasons.push(`${c}: ค่าอยู่นอกช่วงที่เรียนรู้จากชุดฝึก — น้ำหนักหลักฐาน ${w.toFixed(2)}`)
  }
  for (const c of f.shapeMismatches) {
    const w = params.columns[c]?.shapeW ?? 0
    if (w > 0.5) reasons.push(`${c}: รูปแบบค่าไม่ตรงหน้าตาปกติของคอลัมน์ — น้ำหนักหลักฐาน ${w.toFixed(2)}`)
  }
  for (const c of f.duplicates) {
    const w = params.columns[c]?.duplicateW ?? 0
    if (w > 0.6) reasons.push(`${c}: พบค่าซ้ำในชุดข้อมูล — น้ำหนักหลักฐาน ${w.toFixed(2)}`)
  }
  if (reasons.length === 0) reasons.push('ไม่พบหลักฐานเชิงลบที่ชัดเจนจากสิ่งที่โมเดลเรียนรู้')
  return { score, verdict, confidence, reasons: reasons.slice(0, 4) }
}

/* ------------------------- การวัดผลบนชุดทดสอบ ----------------------------- */

export interface Metrics {
  accuracy: number | null
  precision: number | null
  recall: number | null
  f1: number | null
  tp: number
  fp: number
  tn: number
  fn: number
}

/** วัด confusion matrix บนชุดทดสอบ — พยากรณ์เชิงบวก = score ≥ threshold (INC/SUSPECT รวมกัน) */
export function measureOnTest(test: LabeledRow[], profiles: ColumnProfile[], valueCounts: Map<string, Map<string, Map<string, number>>>, params: ModelParams): Metrics {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const r of test) {
    const s = scoreRow(r, profiles, valueCounts, params)
    const predPos = s >= params.threshold
    if (r.truth === 'INCORRECT') {
      if (predPos) tp++
      else fn++
    } else if (predPos) {
      fp++
    } else {
      tn++
    }
  }
  const total = tp + fp + tn + fn
  const precision = tp + fp > 0 ? tp / (tp + fp) : null
  const recall = tp + fn > 0 ? tp / (tp + fn) : null
  const accuracy = total > 0 ? (tp + tn) / total : null
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null
  return { accuracy, precision, recall, f1, tp, fp, tn, fn }
}

/** สร้าง valueCounts ราย asset (feature "ค่าซ้ำ" เทียบเฉพาะข้ามใน asset เดียวกัน — กัน schema ข้าม asset) */
export function valueCountsOf(rows: LabeledRow[]): Map<string, Map<string, Map<string, number>>> {
  const byAsset = new Map<string, Map<string, Map<string, number>>>()
  for (const r of rows) {
    let assetMap = byAsset.get(r.assetId)
    if (!assetMap) {
      assetMap = new Map()
      byAsset.set(r.assetId, assetMap)
    }
    for (const [col, v] of Object.entries(r.rowData)) {
      if (isBlank(v)) continue
      let cm = assetMap.get(col)
      if (!cm) {
        cm = new Map()
        assetMap.set(col, cm)
      }
      const s = String(v)
      cm.set(s, (cm.get(s) ?? 0) + 1)
    }
  }
  return byAsset
}

/* --------------------------- ตัวสุ่ม deterministic ------------------------- */

/** PRNG แบบ mulberry32 — แบ่ง train/test แบบสุ่มที่ทำซ้ำได้เป๊ะ (ตรวจย้อนได้) */
export function seededShuffle<T>(items: T[], seedStr: string): T[] {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
