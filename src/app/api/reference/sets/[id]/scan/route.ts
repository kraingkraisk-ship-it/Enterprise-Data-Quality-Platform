/**
 * POST /api/reference/sets/[id]/scan (v0.31.0) — สแกน "ค่าแปลกปลอม" (orphan values)
 * เทียบค่าจริงในคอลัมน์ของ Data Asset (DataAssetRecord.payload) กับค่า ACTIVE ของทะเบียน
 * → รายงานค่าที่ไม่อยู่ในทะเบียน รายค่าพร้อมจำนวนแถว (เรียงมาก → น้อย, สูงสุด REFERENCE_SCAN_TOP_VALUES ค่า)
 * body: { operatorEmail, assetId, columnName }
 * สิทธิ์: MANAGE_DATASETS (deny-by-default — การสแกนเปิดเผยค่าจริงในข้อมูล)
 * บันทึก Audit Trail (SCAN_REFERENCE_ORPHAN) — รู้ได้ว่าใครสแกนอะไรเมื่อไร ผลเจอเท่าไร
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { REFERENCE_SCAN_TOP_VALUES } from '@/lib/reference'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const set = await db.referenceSet.findUnique({ where: { id }, select: { id: true, code: true, name: true, status: true } })
    if (!set) return NextResponse.json({ error: 'ไม่พบทะเบียนข้อมูลอ้างอิงนี้ในระบบ' }, { status: 404 })

    const assetId = String(body.assetId ?? '').trim()
    const columnName = String(body.columnName ?? '').trim()
    if (!assetId || !columnName) return NextResponse.json({ error: 'กรุณาเลือกข้อมูลและคอลัมน์ที่ต้องการสแกน' }, { status: 400 })

    const asset = await db.dataAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, columns: { where: { name: columnName }, select: { id: true, name: true } } },
    })
    if (!asset) return NextResponse.json({ error: 'ไม่พบข้อมูลที่ระบุในคลังข้อมูล' }, { status: 404 })
    if (asset.columns.length === 0) {
      return NextResponse.json({ error: `คอลัมน์ "${columnName}" ไม่พบในข้อมูล "${asset.name}"` }, { status: 400 })
    }

    // ค่า ACTIVE ของทะเบียน — เฉพาะทะเบียนที่เปิดใช้งานแล้วจึงมีค่าใช้เทียบได้จริง
    const activeValues = await db.referenceValue.findMany({ where: { setId: id, status: 'ACTIVE' }, select: { value: true } })
    const allowed = new Set(activeValues.map((v) => v.value.trim()).filter(Boolean))

    const records = await db.dataAssetRecord.findMany({ where: { assetId }, select: { payload: true } })

    let totalRows = 0
    let nonEmptyRows = 0
    let orphanRows = 0
    const counter = new Map<string, number>()

    for (const rec of records) {
      try {
        const row = JSON.parse(rec.payload) as Record<string, unknown>
        totalRows++
        const raw = row[columnName]
        const v = raw === null || raw === undefined ? '' : String(raw).trim()
        if (v === '') continue
        nonEmptyRows++
        if (!allowed.has(v)) {
          orphanRows++
          counter.set(v, (counter.get(v) ?? 0) + 1)
        }
      } catch {
        // payload พัง — นับเป็นแถวทั้งหมด แต่ไม่เข้าการนับค่า (ต่างจากกฎตรวจ — ที่นี่โฟกัส "ค่า")
        totalRows++
      }
    }

    const top = [...counter.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, REFERENCE_SCAN_TOP_VALUES)

    const clean = orphanRows === 0

    await db.auditLog.create({
      data: {
        action: 'SCAN_REFERENCE_ORPHAN',
        actor: op.ctx.email,
        target: `${set.code} ${set.name}`,
        detail: `สแกนค่านอกทะเบียน: ข้อมูล "${asset.name}" คอลัมน์ "${columnName}" — แถว ${totalRows} · ค่าแปลกปลอม ${orphanRows} แถว (${counter.size} ค่า)${clean ? ' · สะอาด ตรงทะเบียนทุกค่า' : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      asset: { id: asset.id, name: asset.name },
      columnName,
      totalRows,
      nonEmptyRows,
      orphanRows,
      distinctOrphan: counter.size,
      activeValueCount: allowed.size,
      top,
      truncated: counter.size > top.length,
      clean,
      message: clean
        ? `สแกนเสร็จ — ทุกค่าใน "${columnName}" ตรงกับทะเบียน (${allowed.size} ค่า) ไม่มีค่าแปลกปลอม`
        : `พบค่านอกทะเบียน ${orphanRows} แถว จาก ${nonEmptyRows} แถวที่มีค่า (${counter.size} ค่า)`,
    })
  } catch (e) {
    console.error('POST /api/reference/sets/[id]/scan', e)
    return NextResponse.json({ error: 'สแกนค่านอกทะเบียนไม่สำเร็จ' }, { status: 500 })
  }
}
