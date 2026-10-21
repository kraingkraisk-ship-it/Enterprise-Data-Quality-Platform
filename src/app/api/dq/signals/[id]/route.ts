import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DIMENSION_LABELS, type DimensionKey } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'
import { nextIssueCode } from '@/lib/issues'

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

    // Atomic: ทบทวนสัญญาณ + Audit Trail + เปิดปัญหา (ถ้ายืนยัน) ใน transaction เดียว
    // — กันสถานะค้างเมื่อขั้นตอนใดขัดจังหวะกลางทาง
    const { updated, issueCode } = await db.$transaction(async (tx) => {
      const sig = await tx.dqSignal.update({
        where: { id },
        data: { status: newStatus, reviewedBy: op.ctx.email, reviewedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          action: action === 'CONFIRM' ? 'CONFIRM_SIGNAL' : 'DISMISS_SIGNAL',
          actor: op.ctx.email,
          target: signal.dataset.name,
          detail: `${action === 'CONFIRM' ? 'ยืนยัน' : 'ปลด'}สัญญาณ AI [${dimTh}]: ${signal.title} (บทบาท ${op.ctx.roleTh} — การทบทวนโดยมนุษย์)`,
        },
      })

      // ยืนยันสัญญาณ → เปิดปัญหาคุณภาพข้อมูล (DQ Issue) ให้อัตโนมัติ (กันสร้างซ้ำด้วย sourceId)
      let code: string | null = null
      if (action === 'CONFIRM') {
        const existingIssue = await tx.dqIssue.findFirst({
          where: { source: 'SIGNAL', sourceId: signal.id, status: { not: 'CLOSED' } },
        })
        if (!existingIssue) {
          const created = await tx.dqIssue.create({
            data: {
              code: await nextIssueCode(tx as unknown as typeof db),
              datasetId: signal.datasetId,
              title: signal.title,
              description: `เปิดอัตโนมัติจากการยืนยันสัญญาณ AI — ${signal.detail}`,
              source: 'SIGNAL',
              sourceId: signal.id,
              dimension: signal.dimension,
              severity: signal.severity,
              reportedBy: op.ctx.email,
            },
          })
          code = created.code
          await tx.auditLog.create({
            data: {
              action: 'CREATE_ISSUE',
              actor: op.ctx.email,
              target: `${created.code} — ${signal.dataset.name}`,
              detail: `เปิดปัญหาคุณภาพข้อมูลอัตโนมัติ ${created.code} (ที่มา: จากสัญญาณ AI) [${dimTh}/${signal.severity}]: ${signal.title} — หลังการทบทวนโดย ${op.ctx.name}`,
            },
          })
        }
      }

      return { updated: sig, issueCode: code }
    })

    return NextResponse.json({ signal: updated, issueCode })
  } catch (e) {
    console.error('PATCH /api/dq/signals/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถทบทวนสัญญาณได้' }, { status: 500 })
  }
}
