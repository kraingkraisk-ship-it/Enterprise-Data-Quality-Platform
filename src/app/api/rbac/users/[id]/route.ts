import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isValidRole, ROLES } from '@/lib/rbac'

const ACTOR = 'sys.admin@company.co.th' // demo mode

type UpdateBody = { role?: string; status?: string }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as UpdateBody | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' }, { status: 404 })
    }

    const data: { role?: string; status?: string } = {}
    const logs: Array<{ action: string; detail: string }> = []

    if (body.role !== undefined) {
      const role = String(body.role).trim()
      if (!isValidRole(role)) {
        return NextResponse.json({ error: 'บทบาทที่เลือกไม่ถูกต้อง' }, { status: 400 })
      }
      if (role !== user.role) {
        // กฎธุรกิจ: ต้องมีผู้ดูแลระบบ ACTIVE เหลืออย่างน้อย 1 คนเสมอ
        if (user.role === 'SYS_ADMIN' && user.status === 'ACTIVE') {
          const activeAdmins = await db.user.count({
            where: { role: 'SYS_ADMIN', status: 'ACTIVE', id: { not: user.id } },
          })
          if (activeAdmins === 0) {
            return NextResponse.json(
              { error: 'ต้องมีผู้ดูแลระบบ (ACTIVE) เหลืออย่างน้อย 1 บัญชี — ไม่สามารถเปลี่ยนบทบาทของบัญชีสุดท้ายได้' },
              { status: 409 },
            )
          }
        }
        data.role = role
        logs.push({
          action: 'ASSIGN_ROLE',
          detail: `เปลี่ยนบทบาทของ ${user.name} (${user.email}): ${ROLES[user.role as keyof typeof ROLES]?.th ?? user.role} → ${ROLES[role].th}`,
        })
      }
    }

    if (body.status !== undefined) {
      const status = String(body.status).trim().toUpperCase()
      if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
        return NextResponse.json({ error: 'สถานะไม่ถูกต้อง (ACTIVE | SUSPENDED)' }, { status: 400 })
      }
      if (status !== user.status) {
        if (user.role === 'SYS_ADMIN' && user.status === 'ACTIVE' && status === 'SUSPENDED') {
          const activeAdmins = await db.user.count({
            where: { role: 'SYS_ADMIN', status: 'ACTIVE', id: { not: user.id } },
          })
          if (activeAdmins === 0) {
            return NextResponse.json(
              { error: 'ต้องมีผู้ดูแลระบบ (ACTIVE) เหลืออย่างน้อย 1 บัญชี — ไม่สามารถระงับบัญชีสุดท้ายได้' },
              { status: 409 },
            )
          }
        }
        data.status = status
        logs.push({
          action: status === 'ACTIVE' ? 'ACTIVATE_USER' : 'SUSPEND_USER',
          detail:
            status === 'ACTIVE'
              ? `เปิดการใช้งานบัญชี ${user.name} (${user.email})`
              : `ระงับการใช้งานบัญชี ${user.name} (${user.email})`,
        })
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ user, unchanged: true })
    }

    const updated = await db.user.update({ where: { id }, data })
    for (const log of logs) {
      await db.auditLog.create({ data: { action: log.action, actor: ACTOR, target: user.email, detail: log.detail } })
    }
    return NextResponse.json({ user: updated })
  } catch (e) {
    console.error('PATCH /api/rbac/users/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถอัปเดตผู้ใช้ได้' }, { status: 500 })
  }
}
