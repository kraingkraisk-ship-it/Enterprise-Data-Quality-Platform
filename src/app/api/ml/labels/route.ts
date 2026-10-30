/**
 * API /api/ml/labels (v0.35.0) — คลัง label (human-in-the-loop)
 * GET ?verdict=INCORRECT|CORRECT|SUSPECT&flag=unflagged|CONFIRMED|OVERRIDDEN&take= — สิทธิ์: LABEL_ML_DATA
 * แถวข้อมูลแสดงพร้อมปิดบัง PII ตามบทบาทผู้อ่าน (เช่นเดียวกับ DqFailureRecord)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { maskValueByRole } from '@/lib/dq'

export async function GET(req: NextRequest) {
  try {
    const op = await resolveOperator(null, 'LABEL_ML_DATA')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const verdict = req.nextUrl.searchParams.get('verdict')?.trim() ?? ''
    const flag = req.nextUrl.searchParams.get('flag')?.trim() ?? ''
    const take = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('take') ?? 50)))

    const where: Record<string, unknown> = {}
    if (verdict === 'INCORRECT' || verdict === 'CORRECT' || verdict === 'SUSPECT') where.mlVerdict = verdict
    if (flag === 'unflagged') where.humanFlag = null
    else if (flag === 'CONFIRMED' || flag === 'OVERRIDDEN') where.humanFlag = flag

    const [items, total, stats] = await Promise.all([
      db.mlLabelItem.findMany({ where, orderBy: [{ humanFlag: 'asc' }, { createdAt: 'desc' }], take }),
      db.mlLabelItem.count({ where }),
      db.mlLabelItem.groupBy({
        by: ['mlVerdict', 'humanFlag'],
        _count: { _all: true },
      }),
    ])

    // asset piiEnabled → mask ตามบทบาทผู้อ่าน
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
        version: item.version,
        domainId: item.domainId,
        assetId: item.assetId,
        assetName: item.assetName,
        rowNo: item.rowNo,
        rowData: masked,
        mlVerdict: item.mlVerdict,
        mlReason: item.mlReason,
        mlScore: item.mlScore,
        humanFlag: item.humanFlag,
        humanNote: item.humanNote,
        labeledBy: item.labeledBy,
        labeledAt: item.labeledAt,
        usedInVersion: item.usedInVersion,
        createdAt: item.createdAt,
      }
    })

    const statAgg = { unflagged: 0, confirmed: 0, overridden: 0, incorrect: 0, suspect: 0, correct: 0 }
    for (const g of stats) {
      if (g.humanFlag === null) statAgg.unflagged += g._count._all
      else if (g.humanFlag === 'CONFIRMED') statAgg.confirmed += g._count._all
      else if (g.humanFlag === 'OVERRIDDEN') statAgg.overridden += g._count._all
      if (g.mlVerdict === 'INCORRECT') statAgg.incorrect += g._count._all
      else if (g.mlVerdict === 'SUSPECT') statAgg.suspect += g._count._all
      else if (g.mlVerdict === 'CORRECT') statAgg.correct += g._count._all
    }

    return NextResponse.json({ rows, total, stats: statAgg, viewerRole: op.ctx.role })
  } catch (e) {
    console.error('GET /api/ml/labels', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดคลัง label ได้' }, { status: 500 })
  }
}
