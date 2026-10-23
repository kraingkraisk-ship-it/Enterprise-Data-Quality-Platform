import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

/**
 * Data Element Column Mapping API (v0.18.0) — แมป element ↔ คอลัมน์จริงในคลังข้อมูล (Data Asset)
 *
 * GET /api/elements/[id]/mappings — รายการ mapping ทั้งหมดของ element (พร้อมชื่อ asset)
 * PUT /api/elements/[id]/mappings — ตั้ง mapping ทั้งชุด (replace-all ใน 1 transaction)
 *      body: { operatorEmail, mappings: [{ assetId, columnName, note? }] }
 *
 * สิทธิ์ (เฉพาะ PUT): MANAGE_DATASETS — บันทึก Audit Trail (MAP_ELEMENT_COLUMNS)
 * กติกา (deny-by-default):
 * - ทุกคอลัมน์ต้องมีจริงใน DataAssetColumn ของ asset นั้น (ปฏิเสธคอลัมน์แปลกปลอม)
 * - element ต้องแขวนใต้โดเมนย่อย (ตรวจซ้ำเสมอ)
 * - dedupe (elementId, assetId, columnName) อัตโนมัติ
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const element = await db.dataElement.findUnique({ where: { id }, select: { id: true, nameTh: true } })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })

    const mappings = await db.dataElementColumnMapping.findMany({
      where: { elementId: id },
      include: { asset: { select: { id: true, name: true } } },
      orderBy: [{ assetId: 'asc' }, { columnName: 'asc' }],
    })

    return NextResponse.json({
      mappings: mappings.map((m) => ({
        id: m.id,
        assetId: m.assetId,
        assetName: m.asset.name,
        columnName: m.columnName,
        note: m.note,
      })),
      count: mappings.length,
    })
  } catch (e) {
    console.error('GET /api/elements/[id]/mappings', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดการแมปคอลัมน์ได้' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const element = await db.dataElement.findUnique({
      where: { id },
      include: { subDomain: { select: { name: true } }, _count: { select: { columnMappings: true } } },
    })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })

    const rawList = Array.isArray(body.mappings) ? body.mappings : null
    if (!rawList) return NextResponse.json({ error: 'กรุณาระบุรายการ mapping (mappings)' }, { status: 400 })

    // ---------- ตรวจความถูกต้องทุกแถวก่อนเขียน (deny-by-default) ----------
    interface MapRow {
      assetId: string
      columnName: string
      note: string
    }
    const rows: MapRow[] = []
    const seen = new Set<string>()
    for (const raw of rawList) {
      const item = (raw ?? {}) as Record<string, unknown>
      const assetId = String(item.assetId ?? '').trim()
      const columnName = String(item.columnName ?? '').trim()
      if (!assetId || !columnName) {
        return NextResponse.json({ error: 'mapping ทุกรายการต้องระบุ assetId และ columnName' }, { status: 400 })
      }
      const key = `${assetId}|${columnName}`
      if (seen.has(key)) continue // dedupe
      seen.add(key)
      rows.push({ assetId, columnName, note: String(item.note ?? '').trim().slice(0, 200) })
    }

    if (rows.length > 0) {
      const assetIds = [...new Set(rows.map((r) => r.assetId))]
      const assets = await db.dataAsset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, name: true, columns: { select: { name: true } } },
      })
      const assetMap = new Map(assets.map((a) => [a.id, a]))
      for (const r of rows) {
        const asset = assetMap.get(r.assetId)
        if (!asset) {
          return NextResponse.json({ error: `ไม่พบข้อมูลในคลังข้อมูลที่ระบุ (assetId: ${r.assetId.slice(-6)})` }, { status: 404 })
        }
        if (!asset.columns.some((c) => c.name === r.columnName)) {
          return NextResponse.json({ error: `คอลัมน์ "${r.columnName}" ไม่มีจริงใน "${asset.name}" — ปฏิเสธคอลัมน์แปลกปลอม` }, { status: 400 })
        }
      }
    }

    // ---------- replace-all ใน 1 transaction ----------
    const result = await db.$transaction(async (tx) => {
      await tx.dataElementColumnMapping.deleteMany({ where: { elementId: id } })
      if (rows.length > 0) {
        await tx.dataElementColumnMapping.createMany({
          data: rows.map((r) => ({ elementId: id, assetId: r.assetId, columnName: r.columnName, note: r.note, mappedBy: op.ctx.email })),
        })
      }
      return tx.dataElementColumnMapping.findMany({
        where: { elementId: id },
        include: { asset: { select: { id: true, name: true } } },
        orderBy: [{ assetId: 'asc' }, { columnName: 'asc' }],
      })
    })

    await db.auditLog.create({
      data: {
        action: 'MAP_ELEMENT_COLUMNS',
        actor: op.ctx.email,
        target: `${element.code} ${element.nameTh}`,
        detail: `แมป Data Element "${element.nameTh}" (โดเมนย่อย ${element.subDomain.name}) กับคอลัมน์จริง ${rows.length} รายการ (เดิม ${element._count.columnMappings}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      mappings: result.map((m) => ({
        id: m.id,
        assetId: m.assetId,
        assetName: m.asset.name,
        columnName: m.columnName,
        note: m.note,
      })),
      message: `บันทึกการแมป ${rows.length} รายการเรียบร้อย`,
    })
  } catch (e) {
    console.error('PUT /api/elements/[id]/mappings', e)
    return NextResponse.json({ error: 'บันทึกการแมปคอลัมน์ไม่สำเร็จ' }, { status: 500 })
  }
}
