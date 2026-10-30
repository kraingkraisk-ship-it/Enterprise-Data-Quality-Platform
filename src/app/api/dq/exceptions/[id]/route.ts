import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

type Body = { action?: string; operatorEmail?: string }

/**
 * PATCH /api/dq/exceptions/[id] — ยกเลิกข้อยกเว้น (v0.36.0 — RBAC ตามบทบาทล้วน)
 * - การขอใช้ข้อยกเว้น (POST) = ใช้งานทันทีจนถึงวันหมดอายุ ไม่มีคิวอนุมัติ
 * - จุดควบคุมเดียวที่เหลือคือ "ยกเลิกก่อนหมดอายุ" — ต้องมีสิทธิ์ MANAGE_ISSUES (เช่นเดียวกับ lifecycle ปัญหา)
 * - ทุกครั้งบันทึก Audit Trail (REVOKE_EXCEPTION) — ตรวจสอบย้อนหลังได้ครบ
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    // การยกเลิกข้อยกเว้นเป็นงานจัดการปัญหา DQ — สิทธิ์ MANAGE_ISSUES (deny-by-default)
    const op = await resolveOperator(body.operatorEmail, 'MANAGE_ISSUES')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const action = String(body.action ?? '').trim().toUpperCase()
    if (action !== 'REVOKE') {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (REVOKE)' }, { status: 400 })
    }

    const exception = await db.dqException.findUnique({
      where: { id },
      include: { dataset: { select: { name: true } } },
    })
    if (!exception) {
      return NextResponse.json({ error: 'ไม่พบข้อยกเว้นนี้ในระบบ' }, { status: 404 })
    }
    if (exception.status !== 'APPROVED') {
      return NextResponse.json({ error: 'ข้อยกเว้นนี้ถูกยกเลิกไปแล้ว' }, { status: 409 })
    }

    const updated = await db.dqException.update({
      where: { id },
      data: { status: 'REVOKED', revokedBy: op.ctx.email, revokedAt: new Date() },
    })

    await db.auditLog.create({
      data: {
        action: 'REVOKE_EXCEPTION',
        actor: op.ctx.email,
        target: exception.dataset.name,
        detail: `ยกเลิกข้อยกเว้นของ ${exception.requestedBy}: “${exception.reason.slice(0, 80)}${exception.reason.length > 80 ? '…' : ''}” — หยุดใช้ทันที (ผู้ยกเลิกบทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ exception: updated })
  } catch (e) {
    console.error('PATCH /api/dq/exceptions/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถยกเลิกข้อยกเว้นได้' }, { status: 500 })
  }
}
