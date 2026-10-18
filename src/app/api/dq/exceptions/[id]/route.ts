import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

type Body = { action?: string; approverEmail?: string }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    // การอนุมัติข้อยกเว้นต้องมีมนุษย์ที่มีสิทธิ์ APPROVE_EXCEPTIONS ตัดสินใจเสมอ
    const op = await resolveOperator(body.approverEmail, 'APPROVE_EXCEPTIONS')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const action = String(body.action ?? '').trim().toUpperCase()
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (APPROVE | REJECT)' }, { status: 400 })
    }

    const exception = await db.dqException.findUnique({
      where: { id },
      include: { dataset: { select: { name: true } } },
    })
    if (!exception) {
      return NextResponse.json({ error: 'ไม่พบคำขอข้อยกเว้นนี้ในระบบ' }, { status: 404 })
    }
    if (exception.status !== 'PENDING') {
      return NextResponse.json({ error: 'คำขอนี้ถูกตัดสินไปแล้ว — ไม่สามารถตัดสินซ้ำได้' }, { status: 409 })
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    const updated = await db.dqException.update({
      where: { id },
      data: { status: newStatus, decidedBy: op.ctx.email, decidedAt: new Date() },
    })

    await db.auditLog.create({
      data: {
        action: action === 'APPROVE' ? 'APPROVE_EXCEPTION' : 'REJECT_EXCEPTION',
        actor: op.ctx.email,
        target: exception.dataset.name,
        detail: `${action === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'}คำขอข้อยกเว้นจาก ${exception.requestedBy}: “${exception.reason.slice(0, 80)}${exception.reason.length > 80 ? '…' : ''}” (ผู้ตัดสินบทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ exception: updated })
  } catch (e) {
    console.error('PATCH /api/dq/exceptions/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถตัดสินคำขอข้อยกเว้นได้' }, { status: 500 })
  }
}
