import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

/**
 * PATCH /api/assets/[id]/columns — จับคู่คอลัมน์ของ Data Asset กับ "โดเมนย่อย" (Sub Data Domain) รายคอลัมน์ (v0.15.0)
 *   body: { operatorEmail, mappings: [{ columnId, domainId | null }] }
 *     - domainId = null → นำคอลัมน์ออกจากโดเมนย่อย (ไม่ระบุ)
 * สิทธิ์: MANAGE_DATASETS (ตาม RBAC) — บันทึก Audit Trail ทุกครั้ง
 * กติกา (deny-by-default):
 * - คอลัมน์ทุก id ต้องเป็นคอลัมน์ของ asset นี้จริง
 * - domainId ต้องเป็น "โดเมนย่อย" เท่านั้น (parentId ต้องไม่ null) — ตามนิยามคอลัมน์สังกัดระดับย่อย
 * - ลบโดเมนย่อยที่มีคอลัมน์ผูกอยู่ไม่ได้ (ตรวจใน /api/domains/[id] — ลบได้เฉพาะโดเมนว่าง)
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as {
      operatorEmail?: unknown
      mappings?: unknown
    } | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    // ---------- ตรวจรูปแบบ mappings ----------
    if (!Array.isArray(body.mappings) || body.mappings.length === 0) {
      return NextResponse.json({ error: 'กรุณาระบุรายการคอลัมน์ที่ต้องการจับคู่ (mappings)' }, { status: 400 })
    }
    if (body.mappings.length > 500) {
      return NextResponse.json({ error: 'จับคู่ครั้งละไม่เกิน 500 คอลัมน์' }, { status: 400 })
    }

    const parsed: Array<{ columnId: string; domainId: string | null }> = []
    for (const m of body.mappings) {
      const row = (m ?? {}) as Record<string, unknown>
      const columnId = String(row.columnId ?? '').trim()
      const rawDomain = row.domainId
      const domainId = rawDomain === null || rawDomain === undefined || String(rawDomain).trim() === '' ? null : String(rawDomain).trim()
      if (!columnId) return NextResponse.json({ error: 'ทุกรายการต้องระบุ columnId' }, { status: 400 })
      parsed.push({ columnId, domainId })
    }

    // กัน columnId ซ้ำในคำขอเดียว
    const seen = new Set<string>()
    for (const p of parsed) {
      if (seen.has(p.columnId)) return NextResponse.json({ error: `columnId "${p.columnId}" ถูกระบุซ้ำในคำขอเดียวกัน` }, { status: 400 })
      seen.add(p.columnId)
    }

    const asset = await db.dataAsset.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!asset) return NextResponse.json({ error: 'ไม่พบ Data Asset นี้ในระบบ' }, { status: 404 })

    const columns = await db.dataAssetColumn.findMany({
      where: { assetId: id },
      select: { id: true, name: true },
    })
    const columnById = new Map(columns.map((c) => [c.id, c]))
    for (const p of parsed) {
      if (!columnById.has(p.columnId)) {
        return NextResponse.json({ error: 'พบ columnId ที่ไม่ใช่คอลัมน์ของ Data Asset นี้ — ไม่อนุญาต (deny-by-default)' }, { status: 400 })
      }
    }

    // ---------- ตรวจโดเมนย่อยทุก id (ต้องมีอยู่จริง + เป็นโดเมนย่อยเท่านั้น) ----------
    const domainIds = [...new Set(parsed.map((p) => p.domainId).filter((v): v is string => v !== null))]
    for (const domainId of domainIds) {
      const domain = await db.dataDomain.findUnique({
        where: { id: domainId },
        select: { id: true, name: true, parentId: true },
      })
      if (!domain) return NextResponse.json({ error: 'ไม่พบโดเมนข้อมูลที่ระบุ' }, { status: 404 })
      if (domain.parentId === null) {
        return NextResponse.json(
          { error: `คอลัมน์ต้องจับคู่กับ "โดเมนย่อย" เท่านั้น — "${domain.name}" เป็นโดเมนหลัก (ให้เลือกโดเมนย่อยภายใต้มัน)` },
          { status: 400 },
        )
      }
    }

    // ---------- บันทึกทั้งหมดในธุรกรรมเดียว ----------
    await db.$transaction(
      parsed.map((p) =>
        db.dataAssetColumn.update({
          where: { id: p.columnId },
          data: { domainId: p.domainId },
        }),
      ),
    )

    // ---------- Audit Trail (สรุปรวมเป็นรายการเดียว) ----------
    const mappedCount = parsed.filter((p) => p.domainId !== null).length
    const clearedCount = parsed.length - mappedCount
    const columnNames = parsed
      .map((p) => columnById.get(p.columnId)?.name ?? '')
      .filter(Boolean)
      .slice(0, 8)
      .join(', ')
    const suffix = parsed.length > 8 ? ` และอีก ${parsed.length - 8} คอลัมน์` : ''
    await db.auditLog.create({
      data: {
        action: 'SET_COLUMN_DOMAIN',
        actor: op.ctx.email,
        target: asset.name,
        detail: `จับคู่คอลัมน์กับโดเมนย่อยของ Data Asset "${asset.name}": ${mappedCount} คอลัมน์ระบุโดเมน${clearedCount > 0 ? ` / นำออก ${clearedCount} คอลัมน์` : ''} (${columnNames}${suffix}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    // คืนคอลัมน์ล่าสุดหลังบันทึก (พร้อมข้อมูลโดเมน)
    const fresh = await db.dataAssetColumn.findMany({
      where: { assetId: id },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        dataType: true,
        position: true,
        domain: { select: { id: true, name: true, color: true, parentId: true, parent: { select: { name: true } } } },
      },
    })

    return NextResponse.json({
      columns: fresh.map((c) => ({
        id: c.id,
        name: c.name,
        dataType: c.dataType,
        position: c.position,
        domain: c.domain
          ? { id: c.domain.id, name: c.domain.name, color: c.domain.color, parentId: c.domain.parentId, parentName: c.domain.parent?.name ?? null }
          : null,
      })),
      mappedCount: fresh.filter((c) => c.domain !== null).length,
      message: `บันทึกการจับคู่ ${parsed.length} คอลัมน์ของ "${asset.name}" เรียบร้อย`,
    })
  } catch (e) {
    console.error('PATCH /api/assets/[id]/columns', e)
    return NextResponse.json({ error: 'บันทึกการจับคู่คอลัมน์กับโดเมนย่อยไม่สำเร็จ' }, { status: 500 })
  }
}
