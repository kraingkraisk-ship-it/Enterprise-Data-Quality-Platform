import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

/** สถานะที่อนุญาตของ Failed Record */
const ALLOWED_STATUS = ['NEW', 'FIXED', 'IGNORED'] as const

/**
 * PATCH /api/dq/failures/[id] — เปลี่ยนสถานะแถวที่ล้มเหลว (NEW | FIXED | IGNORED)
 * body: { status, operatorEmail } — ต้องมีสิทธิ์ REVIEW_SIGNALS + บันทึก AuditLog ทุกครั้ง
 * (เป็นการทำเครื่องหมายการจัดการเท่านั้น — ระบบไม่แก้ไขข้อมูลต้นทางเสมอ)
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'REVIEW_SIGNALS')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const status = String(body.status ?? '').trim()
    if (!(ALLOWED_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'สถานะไม่ถูกต้อง (ต้องเป็น NEW, FIXED หรือ IGNORED)' }, { status: 400 })
    }

    const failure = await db.dqFailureRecord.findUnique({
      where: { id },
      include: { batch: { select: { dataset: { select: { name: true } } } } },
    })
    if (!failure) {
      return NextResponse.json({ error: 'ไม่พบรายการแถวที่ล้มเหลวนี้' }, { status: 404 })
    }

    const datasetName = failure.batch?.dataset?.name ?? '(ชุดข้อมูลถูกลบ)'

    const updated = await db.dqFailureRecord.update({
      where: { id },
      data: {
        status,
        statusBy: op.ctx.email,
        statusAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'UPDATE_FAILURE_STATUS',
        actor: op.ctx.email,
        target: `${datasetName} · แถว #${failure.rowNo}`,
        detail: `เปลี่ยนสถานะแถวที่ล้มเหลว ${failure.status} → ${status} (${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      ok: true,
      item: {
        id: updated.id,
        status: updated.status,
        statusBy: updated.statusBy,
        statusAt: updated.statusAt?.toISOString() ?? null,
      },
    })
  } catch (e) {
    console.error('PATCH /api/dq/failures/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถเปลี่ยนสถานะได้' }, { status: 500 })
  }
}
