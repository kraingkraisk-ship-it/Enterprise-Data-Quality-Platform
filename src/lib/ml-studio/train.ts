/**
 * ML Studio — ผู้เทรนโมเดล (v0.35.0) — รันฝั่ง server เท่านั้น
 * ขั้นตอนการเทรน 1 รอบ (ทุกรอบ = เวอร์ชันใหม่):
 *   1) รวม Data Asset ตามโดเมน (ชุดฝึก = ข้อมูลจริง)
 *   2) กฎ DQ ทุกข้อทำหน้าที่ "ผู้ติดป้าย" — แถวใดล้มกฎข้อใด = ไม่ถูกต้อง พร้อมเหตุผล
 *   3) เพิ่ม "ข้อมูลสอน" จากมนุษย์ (คลัง label ที่ยืนยัน/แก้ + สุ่มตรวจที่ตัดสินแล้ว) เข้าชุดฝึก
 *   4) สุ่มแบ่งแถวตาม % train/test (deterministic — ตรวจย้อนได้)
 *   5) เรียนรู้พารามิเตอร์จาก "ชุดฝึกเท่านั้น" แล้ววัดความแม่นยำบน "ชุดทดสอบ"
 *   6) บันทึกเวอร์ชัน + สร้างคลัง label ให้มนุษย์ตรวจต่อ (human-in-the-loop)
 */

import { db } from '@/lib/db'
import { CONDITIONS, isConditionKey, type DimensionKey } from '@/lib/dq'
import { isDimensionKey } from '@/lib/dq'
import {
  labelRows,
  learnParams,
  measureOnTest,
  seededShuffle,
  valueCountsOf,
  verdictOf,
  type Corpus,
  type LabelerRule,
  type LabeledRow,
  type ModelParams,
  type ColumnProfile,
} from './engine'

/** จำกัดแถวต่อ Data Asset (คุมเวลาเทรน — ข้อมูลใหญ่พิจารณาเฉพาะส่วนต้นตามลำดับแถว) */
const MAX_ROWS_PER_ASSET = 2000
/** จำกัดจำนวน label item ที่สร้างต่อเวอร์ชัน (จัดลำดับความสำคัญ: ไม่ถูกต้อง → ยังไม่แน่ใจ → ถูกต้อง) */
const MAX_LABEL_ITEMS = 400

export interface MlSettingsView {
  trainPct: number
  minTrainRows: number
  minTestRows: number
  confidenceHigh: number
  confidenceMedium: number
  auditSampleSize: number
  updatedBy: string | null
  updatedAt: Date
}

/** อ่านเกณฑ์ ML Studio — สร้างแถว singleton อัตโนมัติถ้ายังไม่มี */
export async function getMlSettings(): Promise<MlSettingsView> {
  const s = await db.mlSettings.findUnique({ where: { id: 1 } })
  if (s) return s
  return db.mlSettings.create({ data: { id: 1 } })
}

/** โหลดกฎทุกข้อ (enabled) ในบทบาทผู้ติดป้าย — แปลง condition → engineType ผ่านคลังเงื่อนไข */
export async function loadLabelerRules(): Promise<LabelerRule[]> {
  const [rules, templates] = await Promise.all([
    db.dqRule.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } }),
    db.conditionTemplate.findMany(),
  ])
  const templateMap = new Map(templates.map((t) => [t.key, t]))
  const out: LabelerRule[] = []
  for (const rule of rules) {
    const template = templateMap.get(rule.condition)
    const engineType = template?.engineType ?? (isConditionKey(rule.condition) ? rule.condition : null)
    if (!engineType) continue
    const dim: string = template?.dimension ?? (isConditionKey(rule.condition) ? CONDITIONS[rule.condition].dimension : 'ACCURACY')
    const conditionName = template?.name ?? (isConditionKey(rule.condition) ? CONDITIONS[rule.condition].th : rule.condition)
    out.push({
      id: rule.id,
      column: rule.column,
      engineType,
      parameters: rule.parameters,
      dimension: (isDimensionKey(dim) ? dim : 'ACCURACY') as DimensionKey,
      severity: rule.severity,
      conditionName,
    })
  }
  return out
}

/** รวมแถวข้อมูลจาก Data Asset ทั้งหมดตามโดเมน (domainId "" = ทุกโดเมน) */
export async function loadAssetRows(domainId: string): Promise<Array<{ assetId: string; assetName: string; domainId: string; rows: Record<string, unknown>[] }>> {
  const assets = await db.dataAsset.findMany({
    where: { status: 'ACTIVE', ...(domainId ? { domainId } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, domainId: true },
  })
  const out: Array<{ assetId: string; assetName: string; domainId: string; rows: Record<string, unknown>[] }> = []
  for (const asset of assets) {
    const records = await db.dataAssetRecord.findMany({
      where: { assetId: asset.id },
      orderBy: { rowNo: 'asc' },
      take: MAX_ROWS_PER_ASSET,
      select: { rowNo: true, payload: true },
    })
    const rows: Record<string, unknown>[] = []
    for (const rec of records) {
      try {
        rows.push(JSON.parse(rec.payload) as Record<string, unknown>)
      } catch {
        /* แถวเสียหาย — ข้าม */
      }
    }
    out.push({ assetId: asset.id, assetName: asset.name, domainId: asset.domainId ?? domainId, rows })
  }
  return out
}

export interface TrainOptions {
  domainId?: string // "" = รวมทุกโดเมน
  trainPct?: number // 30–90
  note?: string
  trainedBy: string
}

export interface TrainResult {
  versionId: string
  version: number
  domainId: string
  trainPct: number
  trainRows: number
  testRows: number
  assetCount: number
  ruleCount: number
  skippedRuleCount: number
  humanTeachCount: number
  metrics: { accuracy: number | null; precision: number | null; recall: number | null; f1: number | null }
  notes: string[]
  message: string
}

/** เทรนโมเดล 1 รอบ — คืนเวอร์ชันใหม่ */
export async function trainModel(opts: TrainOptions): Promise<TrainResult> {
  const settings = await getMlSettings()
  const domainId = (opts.domainId ?? '').trim()
  const trainPct = Math.min(90, Math.max(30, Math.round(opts.trainPct ?? settings.trainPct)))

  // 1) กฎผู้ติดป้าย + ข้อมูลชุดฝึก
  const [rules, assets] = await Promise.all([loadLabelerRules(), loadAssetRows(domainId)])
  if (assets.length === 0) {
    throw new Error('ไม่มี Data Asset ในโดเมนนี้ — นำเข้าข้อมูลก่อนเทรน (หลักการ: ข้อมูลคืออาหารของโมเดล)')
  }
  if (rules.length === 0) {
    throw new Error('ไม่มีกฎ DQ ที่เปิดใช้งาน — กฎคือผู้ติดป้ายบอกว่าอะไรไม่ถูกต้อง ต้องมีกฎก่อนเทรน')
  }

  const corpus: LabeledRow[] = []
  const appliedRuleIds = new Set<string>()
  const skippedRuleIds = new Set<string>()
  for (const asset of assets) {
    const c: Corpus = labelRows(rules, asset.rows, { domainId: asset.domainId, assetId: asset.assetId, assetName: asset.assetName })
    corpus.push(...c.labels)
    for (const id of c.appliedRules) appliedRuleIds.add(id)
    for (const id of c.skippedRules) skippedRuleIds.add(id)
  }

  // 2) ข้อมูลสอนจากมนุษย์ — เข้าชุดฝึกเสมอ (หลักการ "คนสอน")
  const lastVersionNo = await db.mlModelVersion.aggregate({
    where: { domainId },
    _max: { version: true },
  })
  const nextVersion = (lastVersionNo._max.version ?? 0) + 1

  interface TeachEntry {
    row: LabeledRow
  }
  const humanRows: TeachEntry[] = []

  const taughtLabels = await db.mlLabelItem.findMany({
    where: { humanFlag: { not: null }, usedInVersion: 0, ...(domainId ? { domainId } : {}) },
    orderBy: { createdAt: 'asc' },
  })

  const taughtAudit = await db.mlAuditSample.findMany({
    where: { humanVerdict: { not: null }, usedInVersion: 0, ...(domainId ? { domainId } : {}) },
    orderBy: { createdAt: 'asc' },
  })

  // ชุดคอลัมน์จริงของ asset ที่เกี่ยว (ใช้กันคุณลักษณะค่าว่างปน schema ข้าม asset)
  const teachAssetIds = [...new Set([...taughtLabels.map((t) => t.assetId), ...taughtAudit.map((t) => t.assetId)])]
  const teachColumns = new Map<string, string[]>()
  if (teachAssetIds.length > 0) {
    const cols = await db.dataAssetColumn.findMany({ where: { assetId: { in: teachAssetIds } }, select: { assetId: true, name: true } })
    for (const c of cols) {
      const arr = teachColumns.get(c.assetId) ?? []
      arr.push(c.name)
      teachColumns.set(c.assetId, arr)
    }
  }
  for (const item of taughtLabels) {
    let rowData: Record<string, unknown> = {}
    try {
      rowData = JSON.parse(item.rowDataJson) as Record<string, unknown>
    } catch {
      continue
    }
    // CONFIRMED = เห็นด้วยกับ ML · OVERRIDDEN = แก้คำตัดสิน (กลับด้าน)
    const mlSaidIncorrect = item.mlVerdict === 'INCORRECT'
    const truth = item.humanFlag === 'OVERRIDDEN' ? (mlSaidIncorrect ? 'CORRECT' : 'INCORRECT') : mlSaidIncorrect ? 'INCORRECT' : 'CORRECT'
    humanRows.push({
      row: {
        source: 'HUMAN',
        domainId: item.domainId,
        assetId: item.assetId,
        assetName: item.assetName,
        rowNo: item.rowNo,
        rowData,
        assetColumns: teachColumns.get(item.assetId),
        truth: truth as LabeledRow['truth'],
        violations: item.mlVerdict === 'INCORRECT' && item.humanFlag === 'CONFIRMED' ? [{ ruleId: 'HUMAN', column: '', dimension: 'ACCURACY', reason: item.mlReason }] : [],
      },
    })
  }

  for (const item of taughtAudit) {
    let rowData: Record<string, unknown> = {}
    try {
      rowData = JSON.parse(item.rowDataJson) as Record<string, unknown>
    } catch {
      continue
    }
    humanRows.push({
      row: {
        source: 'HUMAN',
        domainId: item.domainId,
        assetId: item.assetId,
        assetName: item.assetName,
        rowNo: item.rowNo,
        rowData,
        assetColumns: teachColumns.get(item.assetId),
        truth: item.humanVerdict === 'INCORRECT' ? 'INCORRECT' : 'CORRECT',
        violations: item.humanVerdict === 'INCORRECT' ? [{ ruleId: 'HUMAN', column: '', dimension: (item.dimension || 'ACCURACY') as DimensionKey, reason: item.humanReason || 'ผู้สอนตัดสินว่าไม่ถูกต้อง (สุ่มตรวจ)' }] : [],
      },
    })
  }

  // 3) แบ่ง train/test — สุ่ม deterministic จากเลขเวอร์ชัน (ตรวจย้อนได้เป๊ะ)
  const shuffled = seededShuffle(corpus, `ml-studio|${domainId}|v${nextVersion}`)
  const splitAt = Math.max(1, Math.round((shuffled.length * trainPct) / 100))
  let trainRows = shuffled.slice(0, splitAt)
  const testRows = shuffled.slice(splitAt)

  // ข้อมูลสอนของมนุษย์เข้าชุดฝึกเท่านั้น (ไม่เข้าชุดทดสอบ — ชุดทดสอบต้องวัดกับ "ความจริงตามกฎ" ล้วน)
  trainRows = trainRows.concat(humanRows.map((h) => h.row))

  if (trainRows.length < settings.minTrainRows) {
    throw new Error(
      `แถวชุดฝึก (${trainRows.length}) น้อยกว่าขั้นต่ำ (${settings.minTrainRows}) — เพิ่มข้อมูล/label/สุ่มตรวจ ก่อนเทรน (ข้อมูลมาก = โมเดลแม่นขึ้น)`,
    )
  }

  // 4) เรียนรู้จากชุดฝึก + วัดบนชุดทดสอบ
  const { params, profiles } = learnParams(trainRows)
  const counts = valueCountsOf(shuffled)
  const metrics = measureOnTest(testRows, profiles, counts, params)
  const canReportMetrics = testRows.length >= settings.minTestRows

  // 5) สถิติประกอบ (ไม่มีข้อมูลดิบ — เฉพาะสรุปรวม)
  const dimensionCount = new Map<string, number>()
  for (const r of corpus) {
    for (const v of r.violations) dimensionCount.set(v.dimension, (dimensionCount.get(v.dimension) ?? 0) + 1)
  }
  const stats = {
    columns: profiles.map((p: ColumnProfile) => ({
      column: p.column,
      nullRate: Math.round(p.nullRate * 1000) / 1000,
      uniqueRate: Math.round(p.uniqueRate * 1000) / 1000,
      majorityShape: p.majorityShape,
      p5: p.p5,
      p95: p.p95,
      topReasons: p.topReasons,
    })),
    dimensions: [...dimensionCount.entries()].sort((a, b) => b[1] - a[1]).map(([dimension, count]) => ({ dimension, count })),
    humanTeach: { labels: taughtLabels.length, audit: taughtAudit.length },
  }

  // 6) บันทึกเวอร์ชัน
  const version = await db.mlModelVersion.create({
    data: {
      version: nextVersion,
      domainId,
      status: 'TRAINED',
      trainPct,
      accuracy: canReportMetrics ? metrics.accuracy : null,
      precision: canReportMetrics ? metrics.precision : null,
      recall: canReportMetrics ? metrics.recall : null,
      f1: canReportMetrics ? metrics.f1 : null,
      trainRows: trainRows.length,
      testRows: testRows.length,
      assetCount: assets.length,
      ruleCount: appliedRuleIds.size,
      labelCount: humanRows.length,
      paramsJson: JSON.stringify(params),
      statsJson: JSON.stringify(stats),
      trainedBy: opts.trainedBy,
      note: (opts.note ?? '').slice(0, 500),
    },
  })

  // 7) สร้างคลัง label จากชุดทดสอบ (ให้มนุษย์ตรวจยืนยัน — human-in-the-loop)
  const scored = testRows.map((r) => ({
    row: r,
    sc: verdictOf(r, profiles, counts, params),
  }))
  const priority = { INCORRECT: 0, SUSPECT: 1, CORRECT: 2 } as const
  scored.sort((a, b) => priority[a.sc.verdict] - priority[b.sc.verdict] || b.sc.confidence - a.sc.confidence)
  const chosen = scored.slice(0, MAX_LABEL_ITEMS)

  const humanMap = new Map(humanRows.map((h) => [`${h.row.assetId}|${h.row.rowNo}`, h.row.truth]))
  for (const { row, sc } of chosen) {
    await db.mlLabelItem.upsert({
      where: { versionId_assetId_rowNo: { versionId: version.id, assetId: row.assetId, rowNo: row.rowNo } },
      create: {
        versionId: version.id,
        version: nextVersion,
        domainId: row.domainId,
        assetId: row.assetId,
        assetName: row.assetName,
        rowNo: row.rowNo,
        rowDataJson: JSON.stringify(row.rowData),
        mlVerdict: sc.verdict,
        mlReason: sc.reasons.join(' · '),
        mlScore: Math.round(sc.confidence * 1000) / 1000,
      },
      update: {
        mlVerdict: sc.verdict,
        mlReason: sc.reasons.join(' · '),
        mlScore: Math.round(sc.confidence * 1000) / 1000,
      },
    })
  }

  // 8) มาร์กข้อมูลสอนที่ถูกใช้แล้ว (กันเทรนซ้ำนับเดิม)
  await db.mlLabelItem.updateMany({ where: { id: { in: taughtLabels.map((t) => t.id) } }, data: { usedInVersion: nextVersion } })
  await db.mlAuditSample.updateMany({ where: { id: { in: taughtAudit.map((t) => t.id) } }, data: { usedInVersion: nextVersion } })

  await db.auditLog.create({
    data: {
      action: 'ML_TRAIN',
      actor: opts.trainedBy,
      target: domainId ? `โดเมน ${domainId}` : 'ทุกโดเมน',
      detail: `เทรนโมเดล v${nextVersion} — ชุดฝึก ${trainRows.length} แถว / ทดสอบ ${testRows.length} แถว (แบ่ง ${trainPct}%) · กฎผู้ติดป้าย ${appliedRuleIds.size} ข้อ · ข้อมูลสอน ${humanRows.length} · ${canReportMetrics ? `accuracy ${(metrics.accuracy! * 100).toFixed(1)}%` : 'ชุดทดสอบน้อยเกินรายงานคุณภาพ'}`,
    },
  })

  return {
    versionId: version.id,
    version: nextVersion,
    domainId,
    trainPct,
    trainRows: trainRows.length,
    testRows: testRows.length,
    assetCount: assets.length,
    ruleCount: appliedRuleIds.size,
    skippedRuleCount: skippedRuleIds.size,
    humanTeachCount: humanRows.length,
    metrics: canReportMetrics
      ? { accuracy: metrics.accuracy, precision: metrics.precision, recall: metrics.recall, f1: metrics.f1 }
      : { accuracy: null, precision: null, recall: null, f1: null },
    notes: params.notes,
    message: canReportMetrics
      ? `เทรนสำเร็จ — เวอร์ชัน v${nextVersion} วัดความแม่นยำบนชุดทดสอบ ${testRows.length} แถว`
      : `เทรนสำเร็จ — เวอร์ชัน v${nextVersion} (ชุดทดสอบ ${testRows.length} แถว น้อยกว่าขั้นต่ำ ${settings.minTestRows} จึงยังไม่รายงานคุณภาพ)`,
  }
}

/** ตัวโมเดลที่พร้อมใช้งานสำหรับโดเมน (ACTIVE รายโดเมนก่อน → ถ้าไม่มี ใช้ของทั้งระบบ) */
export async function getActiveVersion(domainId?: string) {
  if (domainId) {
    const exact = await db.mlModelVersion.findFirst({ where: { domainId, status: 'ACTIVE' }, orderBy: { version: 'desc' } })
    if (exact) return exact
  }
  return db.mlModelVersion.findFirst({ where: { domainId: '', status: 'ACTIVE' }, orderBy: { version: 'desc' } })
}

export interface ParsedModel {
  version: number
  domainId: string
  params: ModelParams
  profiles: ColumnProfile[]
}

/** อ่านพารามิเตอร์เวอร์ชันที่ ACTIVE สำหรับโดเมน (คืน null ถ้ายังไม่มีโมเดล) */
export async function getActiveModel(domainId?: string): Promise<ParsedModel | null> {
  const v = await getActiveVersion(domainId)
  if (!v) return null
  try {
    const params = JSON.parse(v.paramsJson) as ModelParams
    const stats = JSON.parse(v.statsJson) as { columns?: Array<Partial<ColumnProfile> & { column: string }> }
    const profiles: ColumnProfile[] = (stats.columns ?? []).map((c) => ({
      column: c.column,
      nullRate: c.nullRate ?? 0,
      uniqueRate: c.uniqueRate ?? 0,
      majorityShape: (c.majorityShape ?? 'text') as ColumnProfile['majorityShape'],
      p5: c.p5 ?? null,
      p95: c.p95 ?? null,
      topReasons: c.topReasons ?? [],
    }))
    return { version: v.version, domainId: v.domainId, params, profiles }
  } catch {
    return null
  }
}
