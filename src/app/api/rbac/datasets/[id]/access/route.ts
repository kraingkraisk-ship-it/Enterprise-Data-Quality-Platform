import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isValidRole, ROLES } from '@/lib/rbac'

const ACTOR = 'sys.admin@company.co.th' // demo mode

type AccessBody = { roleId?: string; action?: string; level?: string }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as AccessBody | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const roleId = String(body.roleId ?? '').trim()
    const action = String(body.action ?? '').trim().toUpperCase()
    if (!isValidRole(roleId)) {
      return NextResponse.json({ error: 'บทบาทไม่ถูกต้อง' }, { status: 400 })
    }
    if (!['GRANT', 'REVOKE', 'SET_LEVEL'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (GRANT | REVOKE | SET_LEVEL)' }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({ where: { id }, include: { grants: true } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    const existing = dataset.grants.find((g) => g.roleId === roleId)
    const roleTh = ROLES[roleId].th

    if (action === 'GRANT') {
      const level = String(body.level ?? 'VIEW').toUpperCase()
      if (!['VIEW', 'MANAGE'].includes(level)) {
        return NextResponse.json({ error: 'ระดับสิทธิ์ไม่ถูกต้อง (VIEW | MANAGE)' }, { status: 400 })
      }
      if (existing) {
        const updated = await db.datasetAccess.update({
          where: { id: existing.id },
          data: { level },
        })
        await db.auditLog.create({
          data: {
            action: 'SET_ACCESS_LEVEL',
            actor: ACTOR,
            target: dataset.name,
            detail: `ปรับระดับสิทธิ์บทบาท ${roleTh} เป็น ${level}`,
          },
        })
        return NextResponse.json({ grant: updated })
      }
      const grant = await db.datasetAccess.create({
        data: { datasetId: dataset.id, roleId, level },
      })
      await db.auditLog.create({
        data: {
          action: 'GRANT_ACCESS',
          actor: ACTOR,
          target: dataset.name,
          detail: `มอบสิทธิ์เข้าถึงระดับ ${level} ให้บทบาท ${roleTh}`,
        },
      })
      return NextResponse.json({ grant }, { status: 201 })
    }

    if (action === 'SET_LEVEL') {
      if (!existing) {
        return NextResponse.json({ error: 'บทบาทนี้ยังไม่มีสิทธิ์เข้าถึงชุดข้อมูลนี้' }, { status: 404 })
      }
      const level = String(body.level ?? '').toUpperCase()
      if (!['VIEW', 'MANAGE'].includes(level)) {
        return NextResponse.json({ error: 'ระดับสิทธิ์ไม่ถูกต้อง (VIEW | MANAGE)' }, { status: 400 })
      }
      if (existing.level === level) {
        return NextResponse.json({ grant: existing, unchanged: true })
      }
      const updated = await db.datasetAccess.update({ where: { id: existing.id }, data: { level } })
      await db.auditLog.create({
        data: {
          action: 'SET_ACCESS_LEVEL',
          actor: ACTOR,
          target: dataset.name,
          detail: `ปรับระดับสิทธิ์บทบาท ${roleTh}: ${existing.level} → ${level}`,
        },
      })
      return NextResponse.json({ grant: updated })
    }

    // REVOKE
    if (!existing) {
      return NextResponse.json({ grant: null, unchanged: true })
    }
    await db.datasetAccess.delete({ where: { id: existing.id } })
    await db.auditLog.create({
      data: {
        action: 'REVOKE_ACCESS',
        actor: ACTOR,
        target: dataset.name,
        detail: `ยกเลิกสิทธิ์เข้าถึงของบทบาท ${roleTh}`,
      },
    })
    return NextResponse.json({ grant: null })
  } catch (e) {
    console.error('POST /api/rbac/datasets/[id]/access', e)
    return NextResponse.json({ error: 'ไม่สามารถบริหารสิทธิ์เข้าถึงได้' }, { status: 500 })
  }
}
