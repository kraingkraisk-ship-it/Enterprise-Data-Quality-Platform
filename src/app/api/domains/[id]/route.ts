import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { DOMAIN_DESC_MAX, DOMAIN_NAME_MAX, isValidDomainColor } from '@/lib/domains'

/**
 * PATCH /api/domains/[id] — แก้ไขหรือลบโดเมนข้อมูล
 *   body: { operatorEmail, action: 'UPDATE' | 'DELETE', name?, nameEn?, description?, color? }
 * สิทธิ์: MANAGE_DATASETS — ทุกการเปลี่ยนแปลงบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - แก้ชื่อซ้ำในระดับเดียวกันไม่ได้ · ห้ามย้ายระดับ (กัน depth เกิน 2 — ย้าย = ลบแล้วสร้างใหม่)
 * - ลบได้เฉพาะโดเมนที่ว่าง (ไม่มีโดเมนย่อย · ไม่มี Data Asset · ไม่มีชุดข้อมูล DQ · ไม่มีคอลัมน์จัดหมวด) — กันข้อมูลหลุดโดเมนโดยไม่ตั้งใจ
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const action = String(body.action ?? 'UPDATE').trim().toUpperCase()
    if (!['UPDATE', 'DELETE'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (UPDATE | DELETE)' }, { status: 400 })
    }

    const domain = await db.dataDomain.findUnique({
      where: { id },
      include: { _count: { select: { children: true, assets: true, columnAssignments: true, datasets: true, elements: true } } },
    })
    if (!domain) return NextResponse.json({ error: 'ไม่พบโดเมนข้อมูลนี้ในระบบ' }, { status: 404 })

    if (action === 'DELETE') {
      if (domain._count.children > 0) {
        return NextResponse.json(
          { error: `ลบไม่ได้ — "${domain.name}" ยังมีโดเมนย่อย ${domain._count.children} รายการ (ลบโดเมนย่อยก่อน)` },
          { status: 409 },
        )
      }
      if (domain._count.assets > 0 || domain._count.columnAssignments > 0 || domain._count.datasets > 0 || domain._count.elements > 0) {
        const parts: string[] = []
        if (domain._count.assets > 0) parts.push(`ข้อมูลผูกอยู่ ${domain._count.assets} รายการ`)
        if (domain._count.datasets > 0) parts.push(`ชุดข้อมูล DQ สังกัดอยู่ ${domain._count.datasets} ชุด`)
        if (domain._count.columnAssignments > 0) parts.push(`คอลัมน์ที่ถูกจัดหมวดอยู่ ${domain._count.columnAssignments} คอลัมน์`)
        if (domain._count.elements > 0) parts.push(`Data Element แขวนอยู่ ${domain._count.elements} รายการ`)
        return NextResponse.json(
          { error: `ลบไม่ได้ — "${domain.name}" ยังมี${parts.join(' และ ')} (ย้ายหรือนำออกจากโดเมนก่อน)` },
          { status: 409 },
        )
      }
      await db.dataDomain.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: 'DELETE_DATA_DOMAIN',
          actor: op.ctx.email,
          target: domain.name,
          detail: `ลบ${domain.parentId ? 'โดเมนย่อย' : 'โดเมนหลัก'} "${domain.name}" โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ลบโดเมน "${domain.name}" เรียบร้อย` })
    }

    // ---------- UPDATE ----------
    const name = String(body.name ?? domain.name).trim()
    const nameEn = String(body.nameEn ?? domain.nameEn).trim().slice(0, DOMAIN_NAME_MAX)
    const description = String(body.description ?? domain.description).trim().slice(0, DOMAIN_DESC_MAX)
    const color = String(body.color ?? domain.color).trim()

    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อโดเมน' }, { status: 400 })
    if (name.length > DOMAIN_NAME_MAX) return NextResponse.json({ error: `ชื่อโดเมนยาวเกิน ${DOMAIN_NAME_MAX} ตัวอักษร` }, { status: 400 })
    if (!isValidDomainColor(color)) return NextResponse.json({ error: 'สีที่เลือกไม่ถูกต้อง' }, { status: 400 })

    if (name !== domain.name) {
      const dup = await db.dataDomain.findFirst({
        where: { name: { equals: name }, parentId: domain.parentId, id: { not: domain.id } },
        select: { id: true },
      })
      if (dup) {
        return NextResponse.json({ error: `มี${domain.parentId ? 'โดเมนย่อย' : 'โดเมนหลัก'}ชื่อ "${name}" อยู่แล้วในระดับเดียวกัน` }, { status: 409 })
      }
    }

    const updated = await db.dataDomain.update({ where: { id }, data: { name, nameEn, description, color } })
    await db.auditLog.create({
      data: {
        action: 'UPDATE_DATA_DOMAIN',
        actor: op.ctx.email,
        target: updated.name,
        detail: `แก้ไข${domain.parentId ? 'โดเมนย่อย' : 'โดเมนหลัก'} "${domain.name}" → "${updated.name}" โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ domain: updated, message: `บันทึกโดเมน "${updated.name}" เรียบร้อย` })
  } catch (e) {
    console.error('PATCH /api/domains/[id]', e)
    return NextResponse.json({ error: 'ดำเนินการกับโดเมนข้อมูลไม่สำเร็จ' }, { status: 500 })
  }
}
