import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

/**
 * PATCH /api/access-requests/[id] — ตัดสินคำขอดูค่าจริง (v0.47.0)
 *
 * เฉพาะบทบาทที่มีสิทธิ์ APPROVE_PII_ACCESS (Data Owner) เท่านั้น — ตรวจฝั่ง server จาก session เสมอ
 * การเปลี่ยนสถานะที่อนุญาต (deny-by-default):
 *   APPROVE : PENDING → APPROVED  (expiresAt = เวลาอนุมัติ + อายุที่ขอ)
 *   REJECT  : PENDING → REJECTED
 *   REVOKE  : APPROVED (ยังไม่หมดอายุ) → REVOKED
 * ห้ามตัดสินคำขอของตนเอง · ทุกการตัดสินบันทึก AuditLog (APPROVE/REJECT/REVOKE_COLUMN_ACCESS)
 */

const DECISIONS = ['APPROVE', 'REJECT', 'REVOKE'] as const
type Decision = (typeof DECISIONS)[number]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as
      | { decision?: string; note?: string; operatorEmail?: string }
      | null
    if (!body) return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })

    // ผู้ตัดสิน = Data Owner เท่านั้น (สิทธิ์ APPROVE_PII_ACCESS — ตรวจจาก session)
    const gate = await resolveOperator(body.operatorEmail, 'APPROVE_PII_ACCESS')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
    const { email, name } = gate.ctx

    const decision = String(body.decision ?? '').trim().toUpperCase() as Decision
    if (!DECISIONS.includes(decision)) {
      return NextResponse.json({ error: 'การตัดสินต้องเป็น APPROVE, REJECT หรือ REVOKE เท่านั้น' }, { status: 400 })
    }
    const note = String(body.note ?? '').trim()
    if (note.length > 500) return NextResponse.json({ error: 'หมายเหตุยาวเกิน 500 ตัวอักษร' }, { status: 400 })

    const request = await db.columnAccessRequest.findUnique({
      where: { id },
      include: { asset: { select: { name: true } } },
    })
    if (!request) return NextResponse.json({ error: 'ไม่พบคำขอนี้ในระบบ' }, { status: 404 })
    if (request.requestedBy === email) {
      return NextResponse.json({ error: 'ไม่สามารถตัดสินคำขอของตนเองได้' }, { status: 403 })
    }

    const now = new Date()
    const target = `${request.asset.name} · ${request.columnName}`

    if (decision === 'APPROVE') {
      if (request.status !== 'PENDING') {
        return NextResponse.json({ error: 'อนุมัติได้เฉพาะคำขอสถานะ "รออนุมัติ" เท่านั้น' }, { status: 409 })
      }
      const expiresAt = new Date(now.getTime() + request.durationHours * 60 * 60 * 1000)
      await db.columnAccessRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedBy: email, decidedAt: now, decisionNote: note, expiresAt },
      })
      await db.auditLog.create({
        data: {
          action: 'APPROVE_COLUMN_ACCESS',
          actor: email,
          target,
          detail: `อนุมัติให้ ${request.requestedBy} ดูค่าจริงคอลัมน์ "${request.columnName}" ถึง ${expiresAt.toLocaleString('th-TH')} (${request.durationHours} ชม.)${note ? ` · หมายเหตุ: ${note}` : ''}`,
        },
      })
      return NextResponse.json({ message: `อนุมัติแล้ว — ${request.requestedBy} เห็นค่าจริงของคอลัมน์นี้ถึง ${expiresAt.toLocaleString('th-TH')}` })
    }

    if (decision === 'REJECT') {
      if (request.status !== 'PENDING') {
        return NextResponse.json({ error: 'ไม่อนุมัติได้เฉพาะคำขอสถานะ "รออนุมัติ" เท่านั้น' }, { status: 409 })
      }
      await db.columnAccessRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedBy: email, decidedAt: now, decisionNote: note },
      })
      await db.auditLog.create({
        data: {
          action: 'REJECT_COLUMN_ACCESS',
          actor: email,
          target,
          detail: `ไม่อนุมัติคำขอของ ${request.requestedBy} ดูค่าจริงคอลัมน์ "${request.columnName}"${note ? ` · เหตุผล: ${note}` : ''}`,
        },
      })
      return NextResponse.json({ message: 'ปฏิเสธคำขอแล้ว — บันทึกหลักฐานใน Audit Trail แล้ว' })
    }

    // REVOKE
    if (request.status !== 'APPROVED' || request.expiresAt.getTime() <= now.getTime()) {
      return NextResponse.json(
        { error: 'ยกเลิกได้เฉพาะสิทธิ์ที่ "อนุมัติแล้วและยังไม่หมดอายุ" เท่านั้น' },
        { status: 409 },
      )
    }
    await db.columnAccessRequest.update({
      where: { id },
      data: { status: 'REVOKED', revokedBy: email, revokedAt: now },
    })
    await db.auditLog.create({
      data: {
        action: 'REVOKE_COLUMN_ACCESS',
        actor: email,
        target,
        detail: `ยกเลิกสิทธิ์ดูค่าจริงของ ${request.requestedBy} คอลัมน์ "${request.columnName}" (เดิมหมดอายุ ${request.expiresAt.toLocaleString('th-TH')})${note ? ` · เหตุผล: ${note}` : ''}`,
      },
    })
    return NextResponse.json({ message: 'ยกเลิกสิทธิ์แล้ว — ค่าจริงกลับไปถูกปิดบังทันที' })
  } catch (e) {
    console.error('PATCH /api/access-requests/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถตัดสินคำขอดูค่าจริงได้' }, { status: 500 })
  }
}
