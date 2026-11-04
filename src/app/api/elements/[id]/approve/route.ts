import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { isElementApprovalStatus } from '@/lib/elements'

/**
 * Data Element Approval API (v0.20.0) — workflow อนุมัติ Meta Data ที่ "บันทึกผู้อนุมัติจริง"
 *
 * POST /api/elements/[id]/approve — body: { operatorEmail, decision: 'APPROVED' | 'REJECTED', note? }
 *
 * สิทธิ์: MANAGE_DATASETS (สิทธิ์เดิมที่ใช้จัดการ element — ตามการตัดสินใจของเจ้าของระบบ "ใช้สิทธิ์เดิมอนุมัติได้เลย")
 * ทุกการตัดสินใจบันทึก:
 * - approvedBy = อีเมลผู้อนุมัติจริง + approvedAt = เวลาที่ตัดสินใจ + approvalNote
 * - Audit Trail (APPROVE_DATA_ELEMENT / REJECT_DATA_ELEMENT)
 * กติกา (deny-by-default):
 * - element ต้องมีอยู่จริง
 * - การอนุมัติซ้ำเมื่อสถานะเดิมเป็น APPROVED = ปฏิเสธ (ไม่มีอะไรให้อนุมัติ)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const decision = String(body.decision ?? '').trim().toUpperCase()
    if (!isElementApprovalStatus(decision) || decision === 'PENDING') {
      return NextResponse.json({ error: 'การตัดสินใจไม่ถูกต้อง (ต้องเป็น APPROVED หรือ REJECTED)' }, { status: 400 })
    }

    const element = await db.dataElement.findUnique({
      where: { id },
      include: { subDomain: { select: { name: true } } },
    })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })

    if (element.approvalStatus === 'APPROVED') {
      return NextResponse.json(
        { error: `"${element.nameTh}" ได้รับการอนุมัติแล้ว — แก้ไข Meta Data เพื่อยื่นขออนุมัติใหม่ก่อน` },
        { status: 409 },
      )
    }

    const note = String(body.note ?? '').trim().slice(0, 300)
    const updated = await db.dataElement.update({
      where: { id },
      data: {
        approvalStatus: decision,
        approvedBy: op.ctx.email,
        approvedAt: new Date(),
        approvalNote: note,
      },
    })

    await db.auditLog.create({
      data: {
        action: decision === 'APPROVED' ? 'APPROVE_DATA_ELEMENT' : 'REJECT_DATA_ELEMENT',
        actor: op.ctx.email,
        target: `${updated.code} ${updated.nameTh}`,
        detail: `${decision === 'APPROVED' ? 'อนุมัติ' : 'ไม่อนุมัติ'} Meta Data ของ Data Element "${updated.nameTh}" (${updated.code} · โดเมนย่อย ${element.subDomain.name})${
          note ? ` — หมายเหตุ: ${note}` : ''
        } โดย ${op.ctx.name} (${op.ctx.email} · บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      element: {
        id: updated.id,
        code: updated.code,
        approvalStatus: updated.approvalStatus,
        approvedBy: updated.approvedBy,
        approvedAt: updated.approvedAt,
        approvalNote: updated.approvalNote,
      },
      message:
        decision === 'APPROVED'
          ? `อนุมัติ Meta Data ของ "${updated.nameTh}" เรียบร้อย (บันทึกผู้อนุมัติ: ${op.ctx.name})`
          : `บันทึกผล "ไม่อนุมัติ" ของ "${updated.nameTh}" เรียบร้อย`,
    })
  } catch (e) {
    console.error('POST /api/elements/[id]/approve', e)
    return NextResponse.json({ error: 'ดำเนินการอนุมัติไม่สำเร็จ' }, { status: 500 })
  }
}
