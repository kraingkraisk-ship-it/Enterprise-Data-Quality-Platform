import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { maskRowByRole, type Row } from '@/lib/dq'

/**
 * GET    /api/assets/[id] — รายละเอียด asset (คอลัมน์ + แถวข้อมูลแบบแบ่งหน้า, ปิดบัง PII ตามบทบาท)
 * PATCH  /api/assets/[id] — เปลี่ยนชื่อ / คำอธิบาย / เปิด-ปิดการปิดบัง PII / ลบ (action)
 * สิทธิ์การเปลี่ยนแปลง: MANAGE_DATASETS (ตาม RBAC) — บันทึก Audit Trail ทุกครั้ง
 */

const PAGE_SIZE_MAX = 100

async function getAsset(id: string) {
  return db.dataAsset.findUnique({
    where: { id },
    include: { columns: { orderBy: { position: 'asc' } } },
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const role = req.nextUrl.searchParams.get('role')?.trim().toUpperCase() ?? 'BUSINESS_USER'
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get('pageSize') ?? '25'), 5), PAGE_SIZE_MAX)
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

    const asset = await getAsset(id)
    if (!asset) return NextResponse.json({ error: 'ไม่พบ Data Asset นี้ในระบบ' }, { status: 404 })

    // ค้นหาแบบง่าย: ตรงข้อความใน payload (บน SQLite — พอเหมาะกับขนาดข้อมูลต่อ asset ≤ 1000 แถว)
    const where = q ? { assetId: id, payload: { contains: q } } : { assetId: id }
    const [total, records] = await Promise.all([
      db.dataAssetRecord.count({ where }),
      db.dataAssetRecord.findMany({
        where,
        orderBy: { rowNo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const rawRows: Row[] = records.map((r) => {
      try {
        return JSON.parse(r.payload) as Row
      } catch {
        return {}
      }
    })
    const piiMasked = asset.piiEnabled
    const maskedRows = rawRows.map((row) => maskRowByRole(row, role, asset.piiEnabled))

    let sourceInfo: Record<string, unknown> = {}
    try {
      sourceInfo = JSON.parse(asset.sourceInfo) as Record<string, unknown>
    } catch {
      sourceInfo = {}
    }

    return NextResponse.json({
      asset: {
        id: asset.id,
        name: asset.name,
        description: asset.description,
        sourceType: asset.sourceType,
        sourceInfo,
        piiEnabled: asset.piiEnabled,
        rowCount: asset.rowCount,
        columnCount: asset.columnCount,
        status: asset.status,
        importedBy: asset.importedBy,
        createdAt: asset.createdAt,
      },
      columns: asset.columns.map((c) => ({ name: c.name, dataType: c.dataType, position: c.position })),
      rows: maskedRows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      piiMasked,
    })
  } catch (e) {
    console.error('GET /api/assets/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายละเอียด Data Asset ได้' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const action = String(body.action ?? 'RENAME').trim().toUpperCase()
    if (!['RENAME', 'TOGGLE_PII', 'DELETE'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (RENAME | TOGGLE_PII | DELETE)' }, { status: 400 })
    }

    const asset = await getAsset(id)
    if (!asset) return NextResponse.json({ error: 'ไม่พบ Data Asset นี้ในระบบ' }, { status: 404 })

    if (action === 'DELETE') {
      await db.dataAsset.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: 'DELETE_DATA_ASSET',
          actor: op.ctx.email,
          target: asset.name,
          detail: `ลบ Data Asset "${asset.name}" (${asset.rowCount} แถว) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ลบ "${asset.name}" เรียบร้อย` })
    }

    if (action === 'TOGGLE_PII') {
      const updated = await db.dataAsset.update({ where: { id }, data: { piiEnabled: !asset.piiEnabled } })
      await db.auditLog.create({
        data: {
          action: 'UPDATE_DATA_ASSET',
          actor: op.ctx.email,
          target: asset.name,
          detail: `${updated.piiEnabled ? 'เปิด' : 'ปิด'}การปิดบัง PII ของ Data Asset "${asset.name}" โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({
        asset: { id: updated.id, piiEnabled: updated.piiEnabled },
        message: `${updated.piiEnabled ? 'เปิด' : 'ปิด'}การปิดบัง PII ของ "${asset.name}" เรียบร้อย`,
      })
    }

    // RENAME — เปลี่ยนชื่อ/คำอธิบาย
    const name = String(body.name ?? asset.name).trim()
    const description = String(body.description ?? asset.description).trim().slice(0, 500)
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อใหม่' }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: 'ชื่อยาวเกิน 120 ตัวอักษร' }, { status: 400 })

    const updated = await db.dataAsset.update({ where: { id }, data: { name, description } })
    await db.auditLog.create({
      data: {
        action: 'RENAME_DATA_ASSET',
        actor: op.ctx.email,
        target: name,
        detail: `แก้ไข Data Asset: "${asset.name}" → "${name}" โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })
    return NextResponse.json({
      asset: { id: updated.id, name: updated.name, description: updated.description },
      message: `บันทึกชื่อและคำอธิบายของ "${name}" เรียบร้อย`,
    })
  } catch (e) {
    console.error('PATCH /api/assets/[id]', e)
    return NextResponse.json({ error: 'ดำเนินการกับ Data Asset ไม่สำเร็จ' }, { status: 500 })
  }
}
