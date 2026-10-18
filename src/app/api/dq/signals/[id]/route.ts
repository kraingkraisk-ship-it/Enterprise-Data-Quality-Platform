import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DIMENSION_LABELS, type DimensionKey } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

type Body = { action?: string; reviewerEmail?: string }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    // สัญญาณ AI ต้องผ่านการทบทวนโดยมนุษย์เสมอ — บังคับสิทธิ์ REVIEW_SIGNALS ตาม RBAC
    const op = await resolveOperator(body.reviewerEmail, 'REVIEW_SIGNALS')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const action = String(body.action ?? '').trim().toUpperCase()
    if (!['CONFIRM', 'DISMISS'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (CONFIRM | DISMISS)' }, { status: 400 })
    }

    const signal = await db.dqSignal.findUnique({
      where: { id },
      include: { dataset: { select: { name: true } } },
    })
    if (!signal) {
      return NextResponse.json({ error: 'ไม่พบสัญญาณนี้ในระบบ' }, { status: 404 })
    }
    if (signal.status !== 'PENDING_REVIEW') {
      return NextResponse.json({ error: 'สัญญาณนี้ถูกทบทวนไปแล้ว — ไม่สามารถทบทวนซ้ำได้' }, { status: 409 })
    }

    const dimTh = DIMENSION_LABELS[signal.dimension as DimensionKey]?.th ?? signal.dimension
    const newStatus = action === 'CONFIRM' ? 'CONFIRMED' : 'DISMISSED'
    const updated = await db.dqSignal.update({
      where: { id },
      data: { status: newStatus, reviewedBy: op.ctx.email, reviewedAt: new Date() },
    })

    await db.auditLog.create({
      data: {
        action: action === 'CONFIRM' ? 'CONFIRM_SIGNAL' : 'DISMISS_SIGNAL',
        actor: op.ctx.email,
        target: signal.dataset.name,
        detail: `${action === 'CONFIRM' ? 'ยืนยัน' : 'ปลด'}สัญญาณ AI [${dimTh}]: ${signal.title} (บทบาท ${op.ctx.roleTh} — การทบทวนโดยมนุษย์)`,
      },
    })

    return NextResponse.json({ signal: updated })
  } catch (e) {
    console.error('PATCH /api/dq/signals/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถทบทวนสัญญาณได้' }, { status: 500 })
  }
}
