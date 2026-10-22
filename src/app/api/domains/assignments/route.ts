import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { domainPath } from '@/lib/domains'

/**
 * GET /api/domains/assignments?assetId=... — การจัดหมวดรายคอลัมน์ของ Data Asset 1 รายการ
 * PUT /api/domains/assignments — บันทึกการจัดหมวดรายคอลัมน์ทั้งชุด (transaction เดียว)
 *   body: { operatorEmail, assetId, items: [{ columnName, domainId | null }] }
 * สิทธิ์ (เฉพาะ PUT): MANAGE_DATASETS — ทุกการบันทึกบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - columnName ต้องเป็นคอลัมน์ที่มีจริงใน DataAssetColumn เท่านั้น (คอลัมน์แปลกปลอม = ปฏิเสธ)
 * - domainId ต้องเป็นโดเมนที่มีจริงในระบบ (null = นำการจัดหมวดออก)
 * - จำกัดจำนวนคอลัมน์ต่อการบันทึกตามขีดจำกัดของระบบ (ไม่เกิน 200)
 */

const MAX_ITEMS = 200

export async function GET(req: NextRequest) {
  try {
    const assetId = req.nextUrl.searchParams.get('assetId')?.trim() ?? ''
    if (!assetId) return NextResponse.json({ error: 'กรุณาระบุ assetId' }, { status: 400 })

    const asset = await db.dataAsset.findUnique({ where: { id: assetId }, select: { id: true, name: true } })
    if (!asset) return NextResponse.json({ error: 'ไม่พบ Data Asset นี้ในระบบ' }, { status: 404 })

    const [assignments, domains] = await Promise.all([
      db.dataDomainColumnAssignment.findMany({
        where: { assetId },
        select: { columnName: true, domainId: true },
      }),
      db.dataDomain.findMany({ select: { id: true, name: true, parentId: true } }),
    ])
    const byId = new Map(domains.map((d) => [d.id, d]))

    return NextResponse.json({
      assignments: assignments.map((a) => {
        const d = byId.get(a.domainId)
        return {
          columnName: a.columnName,
          domainId: a.domainId,
          domainPath: d ? domainPath(d, domains) : 'ไม่ทราบโดเมน',
        }
      }),
      count: assignments.length,
    })
  } catch (e) {
    console.error('GET /api/domains/assignments', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดการจัดหมวดรายคอลัมน์ได้' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const assetId = String(body.assetId ?? '').trim()
    if (!assetId) return NextResponse.json({ error: 'กรุณาระบุ Data Asset' }, { status: 400 })

    const asset = await db.dataAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, columns: { select: { name: true } } },
    })
    if (!asset) return NextResponse.json({ error: 'ไม่พบ Data Asset นี้ในระบบ' }, { status: 404 })

    const rawItems = Array.isArray(body.items) ? body.items : null
    if (!rawItems || rawItems.length === 0) {
      return NextResponse.json({ error: 'กรุณาระบุรายการจัดหมวดอย่างน้อย 1 คอลัมน์' }, { status: 400 })
    }
    if (rawItems.length > MAX_ITEMS) {
      return NextResponse.json({ error: `จำนวนคอลัมน์เกินขีดจำกัด (${MAX_ITEMS})` }, { status: 400 })
    }

    // ---------- deny-by-default: คอลัมน์/โดเมนต้องมีจริงเสมอ ----------
    const validColumns = new Set(asset.columns.map((c) => c.name))
    const items: Array<{ columnName: string; domainId: string | null }> = []
    const seen = new Set<string>()
    for (const raw of rawItems) {
      const columnName = String((raw as Record<string, unknown>)?.columnName ?? '').trim()
      const domainIdRaw = String((raw as Record<string, unknown>)?.domainId ?? '').trim() || null
      if (!columnName) return NextResponse.json({ error: 'พบรายการที่ไม่ระบุชื่อคอลัมน์' }, { status: 400 })
      if (seen.has(columnName)) return NextResponse.json({ error: `คอลัมน์ "${columnName}" ซ้ำในคำขอ` }, { status: 400 })
      if (!validColumns.has(columnName)) {
        return NextResponse.json({ error: `คอลัมน์ "${columnName}" ไม่มีอยู่จริงใน Data Asset นี้` }, { status: 400 })
      }
      if (domainIdRaw) {
        const domain = await db.dataDomain.findUnique({ where: { id: domainIdRaw }, select: { id: true } })
        if (!domain) return NextResponse.json({ error: `ไม่พบโดเมนข้อมูลที่ระบุ (คอลัมน์ ${columnName})` }, { status: 404 })
      }
      seen.add(columnName)
      items.push({ columnName, domainId: domainIdRaw })
    }

    // ---------- สรุปการเปลี่ยนแปลงก่อนบันทึก (สำหรับ Audit Trail) ----------
    const before = await db.dataDomainColumnAssignment.findMany({ where: { assetId }, select: { columnName: true, domainId: true } })
    const beforeMap = new Map(before.map((b) => [b.columnName, b.domainId]))
    let assigned = 0
    let changed = 0
    let cleared = 0
    for (const it of items) {
      const prev = beforeMap.get(it.columnName) ?? null
      if (it.domainId && prev !== it.domainId) changed += 1
      if (it.domainId) assigned += 1
      if (!it.domainId && prev) cleared += 1
    }

    // ---------- transaction: upsert เปลี่ยน / ลบที่นำออก ----------
    await db.$transaction(async (tx) => {
      for (const it of items) {
        if (!it.domainId) {
          await tx.dataDomainColumnAssignment.deleteMany({ where: { assetId, columnName: it.columnName } })
          continue
        }
        await tx.dataDomainColumnAssignment.upsert({
          where: { assetId_columnName: { assetId, columnName: it.columnName } },
          create: { assetId, columnName: it.columnName, domainId: it.domainId, assignedBy: op.ctx.email },
          update: { domainId: it.domainId, assignedBy: op.ctx.email },
        })
      }
    })

    await db.auditLog.create({
      data: {
        action: 'ASSIGN_DOMAIN_COLUMNS',
        actor: op.ctx.email,
        target: asset.name,
        detail: `จัดหมวดรายคอลัมน์ของ "${asset.name}" — ระบุโดเมน ${assigned} คอลัมน์ (แก้ไข ${changed} · นำออก ${cleared}) จากทั้งหมด ${items.length} คอลัมน์ โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      message: `บันทึกการจัดหมวดรายคอลัมน์ของ "${asset.name}" เรียบร้อย — ระบุโดเมน ${assigned}/${items.length} คอลัมน์`,
      assigned,
      cleared,
      total: items.length,
    })
  } catch (e) {
    console.error('PUT /api/domains/assignments', e)
    return NextResponse.json({ error: 'บันทึกการจัดหมวดรายคอลัมน์ไม่สำเร็จ' }, { status: 500 })
  }
}
