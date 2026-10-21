import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { ISSUE_TRANSITIONS, ISSUE_STATUS_META } from '@/lib/issues'

type Body = {
  action?: 'START' | 'RESOLVE' | 'CLOSE' | 'REOPEN' | 'ASSIGN'
  operatorEmail?: string
  note?: string
  assignedTo?: string
}

/**
 * PATCH /api/dq/issues/[id] — เปลี่ยนสถานะ/มอบหมายปัญหา (deny-by-default ตาม lifecycle + RBAC)
 * - START / RESOLVE / REOPEN → ต้องมีสิทธิ์ MANAGE_ISSUES
 * - CLOSE → ต้องมีสิทธิ์ APPROVE_EXCEPTIONS (ผู้ปิดต้องไม่ใช่สายแก้ไขโดยตรง — การกำกับดูแลที่ดี)
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body?.action) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const action = body.action
    if (action !== 'ASSIGN' && !ISSUE_TRANSITIONS[action]) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง' }, { status: 400 })
    }

    const permission = action === 'CLOSE' ? 'APPROVE_EXCEPTIONS' : 'MANAGE_ISSUES'
    const op = await resolveOperator(body.operatorEmail, permission)
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const issue = await db.dqIssue.findUnique({
      where: { id },
      include: { dataset: { select: { name: true } } },
    })
    if (!issue) {
      return NextResponse.json({ error: 'ไม่พบปัญหานี้ในระบบ' }, { status: 404 })
    }

    const now = new Date()
    let data: Record<string, unknown> = {}

    if (action === 'ASSIGN') {
      if (issue.status === 'CLOSED') {
        return NextResponse.json({ error: 'ปัญหาที่ปิดแล้วไม่สามารถมอบหมายได้' }, { status: 409 })
      }
      const assignee = String(body.assignedTo ?? '').trim().toLowerCase()
      if (!assignee) {
        return NextResponse.json({ error: 'กรุณาเลือกผู้รับผิดชอบ' }, { status: 400 })
      }
      const user = await db.user.findUnique({ where: { email: assignee }, select: { email: true, name: true, status: true } })
      if (!user || user.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'ไม่พบบัญชีผู้รับผิดชอบ หรือบัญชีถูกระงับ' }, { status: 400 })
      }
      data = { assignedTo: user.email }
      await db.auditLog.create({
        data: {
          action: 'ASSIGN_ISSUE',
          actor: op.ctx.email,
          target: `${issue.code} — ${issue.dataset.name}`,
          detail: `มอบหมายปัญหา ${issue.code} ให้ ${user.name} (${user.email}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
    } else {
      const t = ISSUE_TRANSITIONS[action]
      if (!t.from.includes(issue.status)) {
        const fromTh = ISSUE_STATUS_META[issue.status]?.th ?? issue.status
        return NextResponse.json(
          { error: `เปลี่ยนสถานะไม่ถูกต้อง — ปัญหาอยู่ในสถานะ "${fromTh}" ทำ "${action}" ไม่ได้ (ตาม lifecycle)` },
          { status: 409 },
        )
      }
      if (action === 'RESOLVE' && String(body.note ?? '').trim().length < 5) {
        return NextResponse.json({ error: 'กรุณาระบุวิธีแก้ไข (อย่างน้อย 5 ตัวอักษร) เพื่อการตรวจสอบย้อนหลัง' }, { status: 400 })
      }

      data = {
        status: t.to,
        ...(action === 'RESOLVE' ? { resolutionNote: String(body.note ?? '').trim(), resolvedAt: now } : {}),
        ...(action === 'CLOSE' ? { closedAt: now } : {}),
        ...(action === 'REOPEN' ? { resolvedAt: null, closedAt: null } : {}),
      }
      const toTh = ISSUE_STATUS_META[t.to]?.th ?? t.to
      await db.auditLog.create({
        data: {
          action: t.audit,
          actor: op.ctx.email,
          target: `${issue.code} — ${issue.dataset.name}`,
          detail: `เปลี่ยนสถานะปัญหา ${issue.code} → "${toTh}"${action === 'RESOLVE' ? ` (วิธีแก้: ${String(body.note ?? '').trim()})` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh}${action === 'CLOSE' ? ' — ผู้ปิดต้องมีสิทธิ์อนุมัติ' : ''})`,
        },
      })
    }

    const updated = await db.dqIssue.update({ where: { id }, data })
    return NextResponse.json({
      ok: true,
      issue: { id: updated.id, code: updated.code, status: updated.status, assignedTo: updated.assignedTo },
    })
  } catch (e) {
    console.error('PATCH /api/dq/issues/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถเปลี่ยนสถานะปัญหาได้' }, { status: 500 })
  }
}
