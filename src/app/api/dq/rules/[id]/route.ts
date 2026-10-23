import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildRuleSentence } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

type Body = { action?: string; operatorEmail?: string; threshold?: number; dataElementId?: string | null }

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
    if (!['TOGGLE_ENABLED', 'DELETE', 'SET_THRESHOLD', 'SET_ELEMENT'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (TOGGLE_ENABLED | DELETE | SET_THRESHOLD | SET_ELEMENT)' }, { status: 400 })
    }

    const rule = await db.dqRule.findUnique({
      where: { id },
      include: { datasets: { include: { dataset: { select: { name: true } } } } },
    })
    if (!rule) {
      return NextResponse.json({ error: 'ไม่พบกฎนี้ในระบบ' }, { status: 404 })
    }
    const datasetNames = rule.datasets.map((rd) => rd.dataset.name)
    const targetLabel = datasetNames.join(', ') || '(ไม่มีชุดข้อมูล)'

    if (action === 'TOGGLE_ENABLED') {
      const updated = await db.dqRule.update({ where: { id }, data: { enabled: !rule.enabled } })
      await db.auditLog.create({
        data: {
          action: 'TOGGLE_RULE',
          actor: op.ctx.email,
          target: targetLabel,
          detail: `${updated.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}กฎ: ${buildRuleSentence({ ...updated, datasetNames })} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ rule: updated })
    }

    if (action === 'SET_THRESHOLD') {
      const raw = Number(body.threshold)
      if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
        return NextResponse.json({ error: 'ค่าผ่านขั้นต่ำ (threshold) ต้องเป็นตัวเลข 0–100' }, { status: 400 })
      }
      const threshold = Math.round(raw * 10) / 10
      const updated = await db.dqRule.update({ where: { id }, data: { threshold } })
      await db.auditLog.create({
        data: {
          action: 'SET_RULE_THRESHOLD',
          actor: op.ctx.email,
          target: targetLabel,
          detail: `ตั้งค่าผ่านขั้นต่ำของกฎ "${rule.column}" → ${threshold}% (เดิม ${rule.threshold}%) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ rule: updated, message: `ตั้งค่าผ่านขั้นต่ำ ${threshold}% เรียบร้อย` })
    }

    if (action === 'SET_ELEMENT') {
      // ผูก/ปลดกฎกับ Data Element (v0.18.0) — dataElementId = null/ว่าง = ปลดการผูก
      const rawId = String(body.dataElementId ?? '').trim()
      let elementPath = '(ไม่ผูก Data Element)'
      if (rawId) {
        const el = await db.dataElement.findUnique({
          where: { id: rawId },
          select: { id: true, code: true, nameTh: true, subDomain: { select: { name: true, parent: { select: { name: true } } } } },
        })
        if (!el) {
          return NextResponse.json({ error: 'ไม่พบ Data Element ที่ระบุในระบบ' }, { status: 404 })
        }
        elementPath = el.subDomain.parent ? `${el.subDomain.parent.name} / ${el.subDomain.name} / ${el.nameTh}` : el.nameTh
      }
      const updated = await db.dqRule.update({ where: { id }, data: { dataElementId: rawId || null } })
      await db.auditLog.create({
        data: {
          action: 'SET_RULE_ELEMENT',
          actor: op.ctx.email,
          target: targetLabel,
          detail: `ผูกกฎ "${rule.column}" กับ Data Element: ${elementPath} (เดิม ${rule.dataElementId ? 'ผูกอยู่แล้ว' : 'ไม่ผูก'}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ rule: updated, message: rawId ? `ผูกกฎกับ Data Element "${elementPath}" เรียบร้อย` : 'ปลดการผูกกฎกับ Data Element เรียบร้อย' })
    }

    // DELETE
    await db.dqRule.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        action: 'DELETE_RULE',
        actor: op.ctx.email,
        target: targetLabel,
        detail: `ลบกฎ: ${buildRuleSentence({ ...rule, datasetNames })} (บทบาท ${op.ctx.roleTh})`,
      },
    })
    return NextResponse.json({ rule: null })
  } catch (e) {
    console.error('PATCH /api/dq/rules/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถจัดการกฎได้' }, { status: 500 })
  }
}
