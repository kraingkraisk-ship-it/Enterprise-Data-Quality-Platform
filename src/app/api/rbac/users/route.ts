import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isValidRole, ROLES } from '@/lib/rbac'

const ACTOR = 'sys.admin@company.co.th' // demo mode — ยังไม่มีระบบ login

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  try {
    const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ users })
  } catch (e) {
    console.error('GET /api/rbac/users', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }
    const name = String((body as Record<string, unknown>).name ?? '').trim()
    const email = String((body as Record<string, unknown>).email ?? '').trim().toLowerCase()
    const role = String((body as Record<string, unknown>).role ?? '').trim()

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อผู้ใช้ (อย่างน้อย 2 ตัวอักษร)' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 })
    }
    if (!isValidRole(role)) {
      return NextResponse.json({ error: 'บทบาทที่เลือกไม่ถูกต้อง' }, { status: 400 })
    }

    const exists = await db.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: 'อีเมลนี้มีอยู่ในระบบแล้ว' }, { status: 409 })
    }

    const user = await db.user.create({ data: { name, email, role, status: 'ACTIVE' } })
    await db.auditLog.create({
      data: {
        action: 'CREATE_USER',
        actor: ACTOR,
        target: email,
        detail: `สร้างบัญชีใหม่: ${name} บทบาท ${ROLES[role].th} (${role})`,
      },
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (e) {
    console.error('POST /api/rbac/users', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างผู้ใช้ได้' }, { status: 500 })
  }
}
