import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DIMENSION_LABELS, isDimensionKey } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

type Body = { action?: string; operatorEmail?: string; name?: string; sentence?: string; dimension?: string }

/**
 * จัดการเงื่อนไขส่วนกลางรายตัว
 * - PATCH: TOGGLE_ENABLED (เปิด/ปิดใช้งาน) หรือ UPDATE (แก้ชื่อ/ประโยค/มิติ — เฉพาะเงื่อนไขที่ผู้ใช้สร้าง)
 * - DELETE: ลบเงื่อนไข — ได้เฉพาะที่ผู้ใช้สร้าง และห้ามลบหากยังมีกฎอ้างอิงอยู่
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_RULES')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const action = String(body.action ?? '').trim().toUpperCase()
    if (!['TOGGLE_ENABLED', 'UPDATE'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (TOGGLE_ENABLED | UPDATE)' }, { status: 400 })
    }

    const template = await db.conditionTemplate.findUnique({ where: { id } })
    if (!template) {
      return NextResponse.json({ error: 'ไม่พบเงื่อนไขนี้ในระบบ' }, { status: 404 })
    }

    if (action === 'TOGGLE_ENABLED') {
      if (template.isSystem) {
        return NextResponse.json({ error: 'เงื่อนไขมาตรฐานของระบบเปิดใช้งานตลอดเวลา (ปิดไม่ได้)' }, { status: 400 })
      }
      const updated = await db.conditionTemplate.update({ where: { id }, data: { enabled: !template.enabled } })
      await db.auditLog.create({
        data: {
          action: 'TOGGLE_CONDITION',
          actor: op.ctx.email,
          target: template.name,
          detail: `${updated.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}เงื่อนไขส่วนกลาง "${template.name}" (รหัส ${template.key}) (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ condition: updated })
    }

    // UPDATE — เฉพาะเงื่อนไขที่ผู้ใช้สร้าง
    if (template.isSystem) {
      return NextResponse.json({ error: 'เงื่อนไขมาตรฐานของระบบแก้ไขไม่ได้' }, { status: 400 })
    }
    const name = String(body.name ?? template.name).trim()
    const sentence = String(body.sentence ?? template.sentence).trim()
    const dimension = String(body.dimension ?? template.dimension).trim()
    if (name.length < 2) return NextResponse.json({ error: 'ชื่อเงื่อนไขต้องมีอย่างน้อย 2 ตัวอักษร' }, { status: 400 })
    if (sentence.length < 3) return NextResponse.json({ error: 'ประโยค must ต้องมีอย่างน้อย 3 ตัวอักษร' }, { status: 400 })
    if (!isDimensionKey(dimension)) return NextResponse.json({ error: 'มิติคุณภาพข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const updated = await db.conditionTemplate.update({ where: { id }, data: { name, sentence, dimension } })
    await db.auditLog.create({
      data: {
        action: 'UPDATE_CONDITION',
        actor: op.ctx.email,
        target: updated.name,
        detail: `แก้ไขเงื่อนไขส่วนกลาง "${updated.name}" — must ${updated.sentence}, มิติ ${DIMENSION_LABELS[dimension].th} (บทบาท ${op.ctx.roleTh})`,
      },
    })
    return NextResponse.json({ condition: updated })
  } catch (e) {
    console.error('PATCH /api/dq/conditions/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถจัดการเงื่อนไขได้' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    const op = await resolveOperator(body?.operatorEmail, 'MANAGE_RULES')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const template = await db.conditionTemplate.findUnique({ where: { id } })
    if (!template) {
      return NextResponse.json({ error: 'ไม่พบเงื่อนไขนี้ในระบบ' }, { status: 404 })
    }
    if (template.isSystem) {
      return NextResponse.json({ error: 'เงื่อนไขมาตรฐานของระบบลบไม่ได้' }, { status: 400 })
    }
    const usage = await db.dqRule.count({ where: { condition: template.key } })
    if (usage > 0) {
      return NextResponse.json(
        { error: `ลบไม่ได้ — ยังมีกฎ ${usage} รายการที่ใช้เงื่อนไขนี้อยู่ (ปิดใช้งานแทนได้)` },
        { status: 409 },
      )
    }

    await db.conditionTemplate.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        action: 'DELETE_CONDITION',
        actor: op.ctx.email,
        target: template.name,
        detail: `ลบเงื่อนไขส่วนกลาง "${template.name}" (รหัส ${template.key}, เอนจิน ${template.engineType}) (บทบาท ${op.ctx.roleTh})`,
      },
    })
    return NextResponse.json({ condition: null })
  } catch (e) {
    console.error('DELETE /api/dq/conditions/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถลบเงื่อนไขได้' }, { status: 500 })
  }
}
