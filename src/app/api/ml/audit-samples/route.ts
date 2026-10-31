/**
 * API /api/ml/audit-samples (v0.37.0) — สุ่มตรวจ (มนุษย์ตัดสิน ML ช่วยแนะนำ)
 * GET ?batchNo= (ไม่ระบุ = รอบล่าสุด) — สิทธิ์: LABEL_ML_DATA
 * POST {domainId?, size?, operatorEmail?} — สุ่มแถวจาก Data Asset ตามโดเมน → รอบสุ่มใหม่ (สิทธิ์: LABEL_ML_DATA)
 * แถวที่สุ่มพร้อม "คำแนะนำของโมเดล ACTIVE" — คำตัดสินสุดท้ายเป็นของมนุษย์ = ความจริงที่สอนโมเดล
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { maskValueByRole } from '@/lib/dq'
import { getMlSettings, getActiveModel } from '@/lib/ml-studio/train'
import { seededShuffle, valueCountsOf, featuresVectorOf, reasonsFromFeatures, verdictFromProbability, type LabeledRow } from '@/lib/ml-studio/engine'
import { skPredict, SkEngineError } from '@/lib/ml-studio/sklearn'

export async function GET(req: NextRequest) {
  try {
    const op = await resolveOperator(null, 'LABEL_ML_DATA')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const batchNoParam = req.nextUrl.searchParams.get('batchNo')?.trim()
    const batchNo = batchNoParam
      ? Number(batchNoParam)
      : (await db.mlAuditSample.findFirst({ orderBy: { batchNo: 'desc' }, select: { batchNo: true } }))?.batchNo ?? 0
    if (!batchNo) {
      return NextResponse.json({ batchNo: 0, rows: [], stats: null, message: 'ยังไม่มีรอบสุ่มตรวจ — กด "เริ่มรอบสุ่มใหม่" เพื่อเริ่ม' })
    }

    const items = await db.mlAuditSample.findMany({ where: { batchNo }, orderBy: { createdAt: 'asc' } })
    const assetIds = [...new Set(items.map((i) => i.assetId))]
    const assets = await db.dataAsset.findMany({ where: { id: { in: assetIds } }, select: { id: true, piiEnabled: true } })
    const piiMap = new Map(assets.map((a) => [a.id, a.piiEnabled]))

    const rows = items.map((item) => {
      let rowData: Record<string, unknown> = {}
      try {
        rowData = JSON.parse(item.rowDataJson) as Record<string, unknown>
      } catch {
        /* แถวเสียหาย */
      }
      const piiEnabled = piiMap.get(item.assetId) ?? true
      const masked: Record<string, string> = {}
      for (const [col, val] of Object.entries(rowData)) {
        masked[col] = maskValueByRole(col, val, op.ctx.role, piiEnabled)
      }
      return {
        id: item.id,
        batchNo: item.batchNo,
        assetId: item.assetId,
        assetName: item.assetName,
        rowNo: item.rowNo,
        rowData: masked,
        mlAdvice: item.mlAdvice,
        mlVerdict: item.mlVerdict,
        mlScore: item.mlScore,
        humanVerdict: item.humanVerdict,
        humanReason: item.humanReason,
        dimension: item.dimension,
        auditedBy: item.auditedBy,
        auditedAt: item.auditedAt,
      }
    })

    const audited = items.filter((i) => i.humanVerdict !== null).length
    const incorrect = items.filter((i) => i.humanVerdict === 'INCORRECT').length
    return NextResponse.json({
      batchNo,
      rows,
      stats: {
        total: items.length,
        audited,
        remaining: items.length - audited,
        incorrect,
      },
      viewerRole: op.ctx.role,
    })
  } catch (e) {
    console.error('GET /api/ml/audit-samples', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรอบสุ่มตรวจได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'LABEL_ML_DATA')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const settings = await getMlSettings()
    const domainId = String(body?.domainId ?? '').trim()
    const size = Math.min(100, Math.max(5, Number(body?.size ?? settings.auditSampleSize) || settings.auditSampleSize))

    // รวมแถวผู้สมัครจาก Data Asset ตามโดเมน
    const assets = await db.dataAsset.findMany({
      where: { status: 'ACTIVE', ...(domainId ? { domainId } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, domainId: true },
    })
    if (assets.length === 0) {
      return NextResponse.json({ error: 'ไม่มี Data Asset ในโดเมนนี้ — นำเข้าข้อมูลก่อนสุ่มตรวจ' }, { status: 400 })
    }

    const model = await getActiveModel(domainId || undefined)
    // ชุดคอลัมน์จริงราย asset (กันคำแนะนำปน schema ข้าม asset)
    const assetColumnMap = new Map<string, string[]>()
    if (model) {
      const cols = await db.dataAssetColumn.findMany({ where: { assetId: { in: assets.map((a) => a.id) } }, select: { assetId: true, name: true } })
      for (const c of cols) {
        const arr = assetColumnMap.get(c.assetId) ?? []
        arr.push(c.name)
        assetColumnMap.set(c.assetId, arr)
      }
    }
    interface Candidate {
      assetId: string
      assetName: string
      domainId: string
      rowNo: number
      payload: Record<string, unknown>
      assetColumns: string[]
    }
    const candidates: Candidate[] = []
    for (const asset of assets) {
      const records = await db.dataAssetRecord.findMany({ where: { assetId: asset.id }, orderBy: { rowNo: 'asc' }, take: 1000, select: { rowNo: true, payload: true } })
      const cols = assetColumnMap.get(asset.id) ?? []
      for (const rec of records) {
        try {
          candidates.push({ assetId: asset.id, assetName: asset.name, domainId: asset.domainId ?? '', rowNo: rec.rowNo, payload: JSON.parse(rec.payload) as Record<string, unknown>, assetColumns: cols })
        } catch {
          /* ข้ามแถวเสียหาย */
        }
      }
    }
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'ไม่มีแถวข้อมูลให้สุ่มตรวจ' }, { status: 400 })
    }

    // สุ่ม deterministic — รอบเดิม + นโยบายเดิม = แถวชุดเดิม (ตรวจย้อนได้ เช่นเดียวกับแนวทางสุ่มตรวจของแพลตฟอร์ม)
    const nextBatchNo = (await db.mlAuditSample.aggregate({ _max: { batchNo: true } }))._max.batchNo ?? 0
    const batchNo = nextBatchNo + 1
    const shuffled = seededShuffle(candidates, `ml-audit|${batchNo}|${domainId}|${size}`)

    // คำแนะนำจากโมเดล ACTIVE (ถ้ามี) — ความน่าจะเป็นจากเอนจิน scikit-learn ประกอบการตัดสินของมนุษย์
    const adviceProfiles = model?.profiles ?? []
    let adviceCounts = new Map<string, Map<string, Map<string, number>>>()
    const modelKey = model?.params?.modelKey ?? null
    const coefMap = model?.params ? new Map(model.params.coefficients.map((c) => [c.name, c.weight])) : undefined
    const toRow = (c: Candidate): LabeledRow => ({
      source: 'ASSET',
      domainId: c.domainId,
      assetId: c.assetId,
      assetName: c.assetName,
      rowNo: c.rowNo,
      rowData: c.payload,
      assetColumns: c.assetColumns,
      truth: 'CORRECT',
      violations: [],
    })
    if (model && modelKey) {
      const sampleRows: LabeledRow[] = candidates.slice(0, 500).map(toRow)
      adviceCounts = valueCountsOf(sampleRows)
    }

    const chosen = shuffled.slice(0, size)
    // พยากรณ์รายแถวจากเอนจิน scikit-learn (เวอร์ชันเก่า/นำเข้าไม่มีไฟล์โมเดล — ข้ามคำแนะนำได้)
    let probs: number[] | null = null
    if (modelKey) {
      try {
        probs = await skPredict(modelKey, chosen.map((c) => featuresVectorOf(toRow(c), adviceProfiles, adviceCounts)))
      } catch (e) {
        if (!(e instanceof SkEngineError)) throw e
        probs = null // เอนจินไม่พร้อม/ไม่พบโมเดล — คำแนะนำว่าง มนุษย์ยังตัดสินได้ตามปกติ
      }
    }
    const created: string[] = []
    for (const [i, c] of chosen.entries()) {
      let advice = ''
      let mlVerdict = ''
      let mlScore = 0
      if (probs) {
        const p = probs[i] ?? 0.5
        advice = reasonsFromFeatures(toRow(c), adviceProfiles, adviceCounts, coefMap).join(' · ')
        mlVerdict = verdictFromProbability(p)
        mlScore = Math.round(p * 1000) / 1000
      }
      const row = await db.mlAuditSample.create({
        data: {
          batchNo,
          domainId: c.domainId,
          assetId: c.assetId,
          assetName: c.assetName,
          rowNo: c.rowNo,
          rowDataJson: JSON.stringify(c.payload),
          mlAdvice: advice.slice(0, 1000),
          mlScore,
          mlVerdict,
        },
      })
      created.push(row.id)
    }

    await db.auditLog.create({
      data: {
        action: 'ML_AUDIT_CREATE',
        actor: op.ctx.email,
        target: `รอบที่ ${batchNo}`,
        detail: `สุ่มตรวจ ${chosen.length} แถว จาก Data Asset ${domainId ? 'ในโดเมน' : 'ทุกโดเมน'} — คำแนะนำจากโมเดล ${model ? `v${model.version} (scikit-learn)` : 'ยังไม่มีโมเดล'} · มนุษย์เป็นผู้ตัดสิน`,
      },
    })
    return NextResponse.json({ batchNo, created: created.length, modelVersion: model?.version ?? null })
  } catch (e) {
    console.error('POST /api/ml/audit-samples', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างรอบสุ่มตรวจได้' }, { status: 500 })
  }
}
