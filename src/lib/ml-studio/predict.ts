/**
 * ML Studio — ผู้ช่วยทำนาย/แนะนำ (v0.35.0) — รันฝั่ง server เท่านั้น
 * ผลลัพธ์ของโมเดลถูกใช้ 4 ทาง (ML เป็นผู้ช่วย — เสนอแนะ ไม่ตัดสินแทน):
 *   B1 แนะนำกฎ — เลือกคอลัมน์ใน Rule Builder เห็นชนิดข้อมูลแล้ว แนะนำเงื่อนไขที่ควรใช้
 *   B2 สรุปหลังตรวจ — สรุปความผิดปกติของรอบรัน + ขั้นตอนถัดไปที่แนะนำ
 *   สาเหตุร่วม — อธิบายว่าทำไมข้อมูลไม่ถูกต้อง (ลายเซ็นคอลัมน์×มิติ ที่เกิดซ้ำ)
 *   แนวโน้ม — แถวที่เคยไม่ถูกต้องมีโอกาสกลับมาผิดซ้ำ · ความอ่อนของมิติร่วมข้ามโดเมน
 */

import { db } from '@/lib/db'
import { CONDITIONS, DIMENSION_LABELS, isConditionKey, type DimensionKey } from '@/lib/dq'
import { getActiveModel, getActiveVersion } from './train'
import { shapeOf, type ColumnProfile } from './engine'

/* ------------------------------ B1 แนะนำกฎ -------------------------------- */

export interface RuleRecommendation {
  condition: string
  th: string
  dimension: DimensionKey
  dimensionTh: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reason: string
}

interface RecInput {
  /** ชนิดข้อมูลที่รู้จริง (จาก DataAssetColumn หรือ inferred) */
  dataType: string
  /** ค่าทั้งหมดของคอลัมน์ (จากตัวอย่าง — สูงสุด ~200 แถว) */
  values: unknown[]
  /** โปรไฟล์จากโมเดล ACTIVE (ถ้ามี) */
  profile?: ColumnProfile | null
}

/** ตารางแนะนำตามหลักฐานจริงของคอลัมน์ (ชนิดข้อมูล + หน้าตาค่า + 9 มิติ) — ใช้ร่วมทั้ง Data Asset และ Dataset */
function buildRecommendations(input: RecInput): RuleRecommendation[] {
  const { values, profile } = input
  const nonBlank = values.filter((v) => shapeOf(v) !== 'blank')
  const blankRate = values.length > 0 ? (values.length - nonBlank.length) / values.length : 0
  const shapes = nonBlank.map((v) => shapeOf(v))
  const shapeRatio = (target: string) => (shapes.length > 0 ? shapes.filter((s) => s === target).length / shapes.length : 0)
  const uniqueSet = new Set(nonBlank.map((v) => String(v)))
  const uniqueRate = profile?.uniqueRate ?? (shapes.length > 0 ? uniqueSet.size / shapes.length : 0)
  const dataType = input.dataType

  const recs: RuleRecommendation[] = []
  const push = (condition: string, confidence: RuleRecommendation['confidence'], reason: string) => {
    const def = isConditionKey(condition) ? CONDITIONS[condition] : null
    if (!def) return
    recs.push({
      condition,
      th: def.th,
      dimension: def.dimension,
      dimensionTh: DIMENSION_LABELS[def.dimension].th,
      confidence,
      reason,
    })
  }

  // หลักการ 9 มิติ — แนะนำตามหลักฐานที่เห็นจริง
  if (blankRate > 0.02) {
    push('NOT_NULL', blankRate > 0.15 ? 'HIGH' : 'MEDIUM', `พบค่าว่าง ${(blankRate * 100).toFixed(1)}% — ควรกำหนดว่าห้ามว่าง (ความครบถ้วน)`)
  } else {
    push('NOT_NULL', 'MEDIUM', `แทบไม่มีค่าว่าง (${(blankRate * 100).toFixed(1)}%) — ตั้งกฎคุมไว้ไม่ให้เกิดค่าว่างในอนาคต`)
  }

  const emailRatio = shapeRatio('email')
  const emailColumn = /email|อีเมล/i.test(dataType) || false
  if (emailRatio > 0.5 || emailColumn) {
    push('EMAIL', emailRatio > 0.7 || emailColumn ? 'HIGH' : 'MEDIUM', `หน้าตาค่าเป็นอีเมล ~${(emailRatio * 100).toFixed(0)}% — ควรตรวจรูปแบบอีเมล`)
  }
  if (dataType === 'INTEGER' || dataType === 'NUMBER' || shapeRatio('numeric') > 0.6) {
    const p5 = profile?.p5 ?? null
    const p95 = profile?.p95 ?? null
    push(
      'RANGE',
      'HIGH',
      `คอลัมน์ตัวเลข — แนะนำกำหนดช่วงที่สมเหตุสมผล${p5 !== null && p95 !== null ? ` (จากการเทรนพบช่วงทั่วไป ${p5}–${p95})` : ''}`,
    )
  }
  if (uniqueRate > 0.95 && shapes.length > 10) {
    push('UNIQUE', uniqueRate > 0.99 ? 'HIGH' : 'MEDIUM', `ค่าไม่ซ้ำกันถึง ${(uniqueRate * 100).toFixed(1)}% — น่าจะเป็นคีย์ ควรกันข้อมูลซ้ำ`)
  }
  if (dataType === 'DATE' || dataType === 'DATETIME' || shapeRatio('date') > 0.5) {
    push('MAX_AGE_DAYS', 'MEDIUM', 'คอลัมน์วันที่ — ควรกำหนดอายุข้อมูลสูงสุด (ความทันสมัย)')
  }
  if (dataType === 'TEXT' && !emailColumn && shapeRatio('text') > 0.3) {
    push('REGEX', 'LOW', 'ข้อความอิสระ — พิจารณากำหนดรูปแบบ (pattern) ถ้ามีมาตรฐานรหัสที่ชัดเจน')
  }

  // ประวัติสาเหตุจากการเทรน — สิ่งที่เคยพบจริงให้น้ำหนักเพิ่ม
  if (profile && profile.topReasons.length > 0) {
    recs.push({
      condition: '—',
      th: `ประวัติจากการเทรน: ${profile.topReasons.map((t) => t.reason).join(' · ')}`,
      dimension: 'ACCURACY',
      dimensionTh: DIMENSION_LABELS.ACCURACY.th,
      confidence: 'MEDIUM',
      reason: 'ข้อความนี้มาจากสาเหตุจริงที่พบในข้อมูลเทรนของโดเมนนี้',
    })
  }

  return recs
}

/** อ่านชนิดข้อมูลคอลัมน์จาก Data Asset (inferred ตอนนำเข้า) */
async function columnDataType(assetId: string, column: string): Promise<string> {
  const col = await db.dataAssetColumn.findFirst({ where: { assetId, name: column }, select: { dataType: true } })
  return col?.dataType ?? 'TEXT'
}

/** ค่าตัวอย่างของคอลัมน์จาก DataAssetRecord */
async function assetColumnValues(assetId: string, column: string): Promise<unknown[]> {
  const records = await db.dataAssetRecord.findMany({ where: { assetId }, orderBy: { rowNo: 'asc' }, take: 200, select: { payload: true } })
  const values: unknown[] = []
  for (const rec of records) {
    try {
      const row = JSON.parse(rec.payload) as Record<string, unknown>
      if (column in row) values.push(row[column])
    } catch {
      /* ข้าม */
    }
  }
  return values
}

/**
 * B1 — แนะนำเงื่อนไขกฎสำหรับคอลัมน์ของ Data Asset
 * ต่อกฎจาก: (1) ชนิดข้อมูลจริงของคอลัมน์ (2) โปรไฟล์ที่โมเดลเรียนรู้ (3) ประวัติสาเหตุจากการเทรน
 */
export async function recommendRules(assetId: string, column: string): Promise<RecommendResult> {
  const asset = await db.dataAsset.findUnique({ where: { id: assetId }, select: { name: true, domainId: true } })
  if (!asset) throw new Error('ไม่พบ Data Asset นี้ในระบบ')

  const dataType = await columnDataType(assetId, column)
  const model = await getActiveModel(asset.domainId ?? undefined)
  const profile = model?.profiles.find((p) => p.column === column) ?? null
  const values = await assetColumnValues(assetId, column)

  return {
    sourceName: asset.name,
    sourceKind: 'DATA_ASSET',
    dataType,
    modelVersion: model?.version ?? null,
    modelDomain: model?.domainId ?? null,
    profile: profile ? { nullRate: profile.nullRate, uniqueRate: profile.uniqueRate, majorityShape: profile.majorityShape, p5: profile.p5, p95: profile.p95 } : null,
    recommendations: buildRecommendations({ dataType, values, profile }),
  }
}

/**
 * B1 (โหมด Dataset) — แนะนำเงื่อนไขกฎสำหรับคอลัมน์ของชุดข้อมูล (ใช้ใน Rule Builder)
 * ชนิดข้อมูล + หน้าตาค่า อนุโลมจากแถวตัวอย่างของชุดข้อมูล (SampleRow)
 */
export async function recommendForDataset(datasetId: string, column: string): Promise<RecommendResult> {
  const dataset = await db.dataset.findUnique({ where: { id: datasetId }, select: { name: true, domainId: true } })
  if (!dataset) throw new Error('ไม่พบชุดข้อมูลนี้ในระบบ')

  const model = await getActiveModel(dataset.domainId ?? undefined)
  const profile = model?.profiles.find((p) => p.column === column) ?? null

  const samples = await db.sampleRow.findMany({ where: { datasetId }, orderBy: { createdAt: 'asc' }, take: 200, select: { payload: true } })
  const values: unknown[] = []
  for (const rec of samples) {
    try {
      const row = JSON.parse(rec.payload) as Record<string, unknown>
      if (column in row) values.push(row[column])
    } catch {
      /* ข้าม */
    }
  }

  // infer ชนิดข้อมูลจากค่าจริง (เมื่อไม่มี schema กายภาพ)
  const nonBlankShapes = values.map((v) => shapeOf(v)).filter((s) => s !== 'blank')
  const majority = nonBlankShapes.sort(
    (a, b) => nonBlankShapes.filter((s) => s === b).length - nonBlankShapes.filter((s) => s === a).length,
  )[0]
  const dataType = majority === 'numeric' ? 'NUMBER' : majority === 'date' ? 'DATE' : 'TEXT'

  return {
    sourceName: dataset.name,
    sourceKind: 'DATASET',
    dataType,
    modelVersion: model?.version ?? null,
    modelDomain: model?.domainId ?? null,
    profile: profile ? { nullRate: profile.nullRate, uniqueRate: profile.uniqueRate, majorityShape: profile.majorityShape, p5: profile.p5, p95: profile.p95 } : null,
    recommendations: buildRecommendations({ dataType, values, profile }),
  }
}

export interface RecommendResult {
  sourceName: string
  sourceKind: 'DATA_ASSET' | 'DATASET'
  dataType: string
  modelVersion: number | null
  modelDomain: string | null
  profile: { nullRate: number; uniqueRate: number; majorityShape: string; p5: number | null; p95: number | null } | null
  recommendations: RuleRecommendation[]
}

/* --------------------------- B2 สรุปหลังตรวจ ------------------------------ */

export interface RunSummary {
  batchId: string
  datasetName: string
  createdAt: Date
  totalRules: number
  passedRules: number
  failedRules: number
  overallScore: number | null
  modelVersion: number | null
  summaryText: string
  dimensionBreakdown: Array<{ dimension: DimensionKey; dimensionTh: string; failed: number; total: number; passRate: number }>
  commonCauses: Array<{ signature: string; failedRows: number; affectedRules: number; hypothesis: string }>
  advice: string[]
}

/** B2 — สรุปความผิดปกติของรอบรัน 1 รอบ + ขั้นตอนถัดไปที่แนะนำ (จากผลจริง + บริบทโมเดล) */
export async function summarizeRun(batchId: string): Promise<RunSummary | null> {
  const batch = await db.dqValidationBatch.findUnique({ where: { id: batchId }, include: { dataset: { select: { name: true, domainId: true } } } })
  if (!batch) return null

  const runs = await db.dqRun.findMany({
    where: { batchId },
    include: { rule: { select: { column: true, condition: true, severity: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (runs.length === 0) return null

  const model = await getActiveModel(batch.dataset.domainId ?? undefined)

  // รายมิติ
  const dimMap = new Map<DimensionKey, { failed: number; total: number }>()
  for (const run of runs) {
    const d = (run.dimension as DimensionKey) ?? 'ACCURACY'
    const cur = dimMap.get(d) ?? { failed: 0, total: 0 }
    cur.total++
    if (run.status === 'FAILED') cur.failed++
    dimMap.set(d, cur)
  }
  const dimensionBreakdown = [...dimMap.entries()]
    .map(([dimension, v]) => ({
      dimension,
      dimensionTh: DIMENSION_LABELS[dimension]?.th ?? dimension,
      failed: v.failed,
      total: v.total,
      passRate: v.total > 0 ? (v.total - v.failed) / v.total : 1,
    }))
    .sort((a, b) => a.passRate - b.passRate)

  // สาเหตุร่วม — ลายเซ็น คอลัมน์×มิติ ที่ล้มซ้อนกัน (อธิบายได้ว่าอะไรพังร่วมกัน)
  const sigMap = new Map<string, { failedRows: number; rules: Set<string>; dimension: DimensionKey }>()
  for (const run of runs) {
    if (run.status !== 'FAILED') continue
    const sig = `${run.rule.column} × ${DIMENSION_LABELS[(run.dimension as DimensionKey) ?? 'ACCURACY']?.th ?? run.dimension}`
    const cur = sigMap.get(sig) ?? { failedRows: 0, rules: new Set<string>(), dimension: (run.dimension as DimensionKey) ?? 'ACCURACY' }
    cur.failedRows += run.failedRows
    cur.rules.add(run.ruleId)
    sigMap.set(sig, cur)
  }
  const totalFailed = [...sigMap.values()].reduce((s, v) => s + v.failedRows, 0)
  const commonCauses = [...sigMap.entries()]
    .sort((a, b) => b[1].failedRows - a[1].failedRows)
    .slice(0, 5)
    .map(([signature, v]) => ({
      signature,
      failedRows: v.failedRows,
      affectedRules: v.rules.size,
      hypothesis:
        totalFailed > 0 && v.failedRows / totalFailed >= 0.35
          ? `สาเหตุร่วมที่อธิบายความล้มเหลวส่วนใหญ่ของรอบนี้ (${Math.round((v.failedRows / totalFailed) * 100)}%) — แก้ที่จุดนี้ได้ผลมากที่สุด`
          : `พบร่วมกัน ${v.rules.size} กฎ — ควรตรวจแหล่งข้อมูลต้นทางของคอลัมน์นี้`,
    }))

  // คำแนะนำถัดไป — จากผลจริง + บริบทของโมเดลที่เทรนไว้
  const advice: string[] = []
  const worst = dimensionBreakdown[0]
  if (worst && worst.failed > 0) {
    advice.push(`มิติอ่อนที่สุด: ${worst.dimensionTh} (${worst.failed}/${worst.total} กฎไม่ผ่าน) — จัดลำดับแก้ที่มิตินี้ก่อน`)
  }
  const criticalFailed = runs.filter((r) => r.status === 'FAILED' && r.rule.severity === 'CRITICAL').length
  if (criticalFailed > 0) {
    advice.push(`มีกฎวิกฤต (CRITICAL) ไม่ผ่าน ${criticalFailed} ข้อ — ควรสร้างปัญหา DQ (Issue) และแจ้งเจ้าของข้อมูลทันที`)
  }
  const noData = runs.filter((r) => r.totalRows === 0).length
  if (noData > 0) {
    advice.push(`${noData} กฎตรวจไม่ได้เพราะชุดข้อมูลว่าง — ตรวจการนำเข้าข้อมูลก่อนสรุปคะแนน`)
  }
  if (model) {
    const weakestCol = model.profiles.filter((p) => p.nullRate > 0.1).sort((a, b) => b.nullRate - a.nullRate)[0]
    if (weakestCol) {
      advice.push(
        `โมเดล v${model.version} เรียนรู้ว่าคอลัมน์ "${weakestCol.column}" มีค่าว่าง ${(weakestCol.nullRate * 100).toFixed(0)}% โดยเฉลี่ย — ถ้ารอบนี้สูงผิดปกติ ให้ตรวจกระบวนการรับข้อมูลล่าสุด`,
      )
    }
    advice.push(`ใช้แท็บ "คลัง label" ยืนยัน/แก้คำตัดสินของโมเดล แล้วเทรนซ้ำ — ยิ่งสอนบ่อย ยิ่งแม่นขึ้น`)
  } else {
    advice.push('ยังไม่มีโมเดล ACTIVE — ไปที่ ML Studio แท็บ "เทรนโมเดล" เพื่อเทรนจาก Data Asset + กฎ DQ ก่อน')
  }

  const failedRules = runs.filter((r) => r.status === 'FAILED').length
  const summaryText =
    `รอบนี้ตรวจ ${runs.length} กฎ — ผ่าน ${runs.length - failedRules}, ไม่ผ่าน ${failedRules}` +
    (model ? ` · อ้างอิงโมเดล v${model.version} (ผู้ช่วยเสนอแนะ ไม่ตัดสินแทนคะแนนกฎ)` : '')

  return {
    batchId: batch.id,
    datasetName: batch.dataset.name,
    createdAt: batch.createdAt,
    totalRules: runs.length,
    passedRules: runs.length - failedRules,
    failedRules,
    overallScore: batch.overallScore,
    modelVersion: model?.version ?? null,
    summaryText,
    dimensionBreakdown,
    commonCauses,
    advice,
  }
}

/* ----------------------------- แนวโน้ม ----------------------------------- */

export interface TrendsResult {
  modelVersion: number | null
  repeatRisk: Array<{ assetId: string; assetName: string; confirmedIncorrect: number; note: string }>
  crossDomain: Array<{ dimensionTh: string; domains: string[]; note: string }>
  auditTrend: { batchCount: number; incorrectRate: number | null; slope: number | null; note: string }
}

/** แนวโน้มจากผล train/test + ข้อมูลสอน — ทำนายความเสี่ยงซ้ำและความอ่อนข้ามโดเมน */
export async function mlTrends(): Promise<TrendsResult> {
  const active = await getActiveVersion()
  const model = active ? await getActiveModel(active.domainId || undefined) : null

  // 1) ความเสี่ยงซ้ำ — แถวที่มนุษย์ยืนยันว่าไม่ถูกต้อง (CONFIRMED + INCORRECT) รวมราย Asset
  const confirmed = await db.mlLabelItem.groupBy({
    by: ['assetId', 'assetName'],
    where: { humanFlag: 'CONFIRMED', mlVerdict: 'INCORRECT' },
    _count: { _all: true },
    orderBy: { _count: { assetId: 'desc' } },
  })
  const repeatRisk = confirmed.slice(0, 8).map((g) => ({
    assetId: g.assetId,
    assetName: g.assetName,
    confirmedIncorrect: g._count._all,
    note: `ผู้สอนยืนยันว่าไม่ถูกต้อง ${g._count._all} แถว — ข้อมูลชุดนี้มีแนวโน้มพบปัญหาซ้ำ ควรกำกับดูแลต่อเนื่องและใช้เป็นชุดสอนหลัก`,
  }))

  // 2) ความอ่อนร่วมข้ามโดเมน — เทียบมิติที่ล้มมากที่สุดของเวอร์ชันล่าสุดรายโดเมน
  const versions = await db.mlModelVersion.findMany({
    where: { status: { in: ['TRAINED', 'ACTIVE'] } },
    orderBy: [{ domainId: 'asc' }, { version: 'desc' }],
    distinct: ['domainId'],
  })
  const dimDomains = new Map<string, Set<string>>()
  for (const v of versions) {
    try {
      const stats = JSON.parse(v.statsJson) as { dimensions?: Array<{ dimension: string; count: number }> }
      const top = (stats.dimensions ?? [])[0]
      if (top && v.domainId) {
        const th = DIMENSION_LABELS[top.dimension as DimensionKey]?.th ?? top.dimension
        const set = dimDomains.get(th) ?? new Set<string>()
        // ชื่อโดเมน
        set.add(v.domainId)
        dimDomains.set(th, set)
      }
    } catch {
      /* ข้าม */
    }
  }
  const domainNames = new Map((await db.dataDomain.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]))
  const crossDomain = [...dimDomains.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([dimensionTh, ids]) => ({
      dimensionTh,
      domains: [...ids].map((id) => domainNames.get(id) ?? id),
      note: `${[...ids].length} โดเมนมีมิติ "${dimensionTh}" อ่อนที่สุดเหมือนกัน — น่าจะมีสาเหตุร่วมระดับกระบวนการ ควรวางมาตรการร่วมกัน`,
    }))

  // 3) แนวโน้มจากการสอนล่าสุด — อัตรา "ไม่ถูกต้อง" จากสุ่มตรวจ (มนุษย์ตัดสิน) ล่าสุด 5 รอบ
  const auditByBatch = await db.mlAuditSample.groupBy({
    by: ['batchNo'],
    where: { humanVerdict: { not: null } },
    _count: { _all: true },
    orderBy: { batchNo: 'asc' },
  })
  const auditIncByBatch = await db.mlAuditSample.groupBy({
    by: ['batchNo'],
    where: { humanVerdict: 'INCORRECT' },
    _count: { _all: true },
    orderBy: { batchNo: 'asc' },
  })
  const incMap = new Map(auditIncByBatch.map((g) => [g.batchNo, g._count._all]))
  const series = auditByBatch.map((g) => ({ batchNo: g.batchNo, rate: (incMap.get(g.batchNo) ?? 0) / Math.max(1, g._count._all) }))
  let slope: number | null = null
  if (series.length >= 3) {
    const n = series.length
    const meanX = (n - 1) / 2
    const meanY = series.reduce((s, v) => s + v.rate, 0) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (series[i].rate - meanY)
      den += (i - meanX) * (i - meanX)
    }
    slope = den > 0 ? num / den : 0
  }
  const lastRate = series.length > 0 ? series[series.length - 1].rate : null
  const auditTrend = {
    batchCount: series.length,
    incorrectRate: lastRate,
    slope,
    note:
      series.length === 0
        ? 'ยังไม่มีผลสุ่มตรวจ — เริ่มแท็บ "สุ่มตรวจ" เพื่อให้คนสอนโมเดลด้วยความจริงจากหน้างาน'
        : slope !== null && slope > 0.02
          ? 'อัตราไม่ถูกต้องจากการสุ่มตรวจมีแนวโน้มเพิ่มขึ้น — ควรเร่งทบทวนแหล่งข้อมูลต้นทาง'
          : slope !== null && slope < -0.02
            ? 'อัตราไม่ถูกต้องลดลง — การสอนและการแก้ไขเริ่มเห็นผล'
            : 'อัตราไม่ถูกต้องคงที่ — สอนเพิ่มเพื่อให้โมเดลแม่นขึ้น',
  }

  return { modelVersion: model?.version ?? null, repeatRisk, crossDomain, auditTrend }
}
