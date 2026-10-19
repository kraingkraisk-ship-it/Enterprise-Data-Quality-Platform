import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildRuleSentence } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

type Body = { action?: string; operatorEmail?: string }

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
    if (!['TOGGLE_ENABLED', 'DELETE'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (TOGGLE_ENABLED | DELETE)' }, { status: 400 })
    }

    const rule = await db.dqRule.findUnique({ where: { id }, include: { dataset: { select: { name: true } } } })
    if (!rule) {
      return NextResponse.json({ error: 'ไม่พบกฎนี้ในระบบ' }, { status: 404 })
    }

    if (action === 'TOGGLE_ENABLED') {
      const updated = await db.dqRule.update({ where: { id }, data: { enabled: !rule.enabled } })
      await db.auditLog.create({
        data: {
          action: 'TOGGLE_RULE',
          actor: op.ctx.email,
          target: rule.dataset.name,
          detail: `${updated.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}กฎ: ${buildRuleSentence({ ...updated, datasetName: rule.dataset.name })} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ rule: updated })
    }

    // DELETE
    await db.dqRule.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        action: 'DELETE_RULE',
        actor: op.ctx.email,
        target: rule.dataset.name,
        detail: `ลบกฎ: ${buildRuleSentence(rule)} (บทบาท ${op.ctx.roleTh})`,
      },
    })
    return NextResponse.json({ rule: null })
  } catch (e) {
    console.error('PATCH /api/dq/rules/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถจัดการกฎได้' }, { status: 500 })
  }
}
