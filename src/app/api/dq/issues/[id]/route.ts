import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { ISSUE_TRANSITIONS, ISSUE_STATUS_META } from '@/lib/issues'

type Body = {
  action?: 'START' | 'RESOLVE' | 'CLOSE' | 'REOPEN' | 'ASSIGN' | 'SET_DUE'
  operatorEmail?: string
  note?: string
  assignedTo?: string
  dueAt?: string
}

/**
 * PATCH /api/dq/issues/[id] — เปลี่ยนสถานะ/มอบหมาย/ตั้งวันครบกำหนด (deny-by-default ตาม lifecycle + RBAC)
 * - ทุกสถานะ (START / RESOLVE / CLOSE / REOPEN) ใช้สิทธิ์ MANAGE_ISSUES เดียว (v0.36.0 — ไม่มีสิทธิ์อนุมัติแยก)
 * - SET_DUE (v0.17.0): ตั้งวันครบกำหนด (dueAt) รายปัญหา — ใช้ตรวจ "เกิน SLA" บนแดชบอร์ดผู้บริหาร · ส่งค่าว่าง = ล้างวันครบกำหนด
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body?.action) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const action = body.action
    if (action !== 'ASSIGN' && action !== 'SET_DUE' && !ISSUE_TRANSITIONS[action]) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง' }, { status: 400 })
    }

    const permission = 'MANAGE_ISSUES' // v0.36.0 — ทุกสถานะใช้สิทธิ์เดียว (RBAC ตามบทบาทล้วน)
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
    } else if (action === 'SET_DUE') {
      if (issue.status === 'RESOLVED' || issue.status === 'CLOSED') {
        const fromTh = ISSUE_STATUS_META[issue.status]?.th ?? issue.status
        return NextResponse.json({ error: `ปัญหาอยู่ในสถานะ "${fromTh}" แล้ว — ไม่ต้องตั้งวันครบกำหนด` }, { status: 409 })
      }
      const raw = String(body.dueAt ?? '').trim()
      let dueAt: Date | null = null
      if (raw) {
        const d = new Date(raw)
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'รูปแบบวันครบกำหนดไม่ถูกต้อง' }, { status: 400 })
        }
        dueAt = d
      }
      data = { dueAt }
      await db.auditLog.create({
        data: {
          action: 'SET_ISSUE_DUE',
          actor: op.ctx.email,
          target: `${issue.code} — ${issue.dataset.name}`,
          detail: dueAt
            ? `ตั้งวันครบกำหนดปัญหา ${issue.code} → ${dueAt.toISOString().slice(0, 10)} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`
            : `ล้างวันครบกำหนดปัญหา ${issue.code} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
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
          detail: `เปลี่ยนสถานะปัญหา ${issue.code} → "${toTh}"${action === 'RESOLVE' ? ` (วิธีแก้: ${String(body.note ?? '').trim()})` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
    }

    const updated = await db.dqIssue.update({ where: { id }, data })
    return NextResponse.json({
      ok: true,
      issue: { id: updated.id, code: updated.code, status: updated.status, assignedTo: updated.assignedTo, dueAt: updated.dueAt },
      ...(action === 'SET_DUE' ? { message: updated.dueAt ? `ตั้งวันครบกำหนด ${updated.dueAt.toISOString().slice(0, 10)} เรียบร้อย` : 'ล้างวันครบกำหนดแล้ว' } : {}),
    })
  } catch (e) {
    console.error('PATCH /api/dq/issues/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถเปลี่ยนสถานะปัญหาได้' }, { status: 500 })
  }
}
