import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from '@/lib/session'

/**
 * POST /api/auth/login — เข้าสู่ระบบ (v0.33.0)
 * รับ { email, password } → ตรวจบัญชี ACTIVE + รหัสผ่าน → ตั้ง httpOnly cookie
 * บันทึก Audit Log ทั้งสำเร็จและล้มเหลว (ความพยายามเข้าสู่ระบบตรวจสอบย้อนหลังได้)
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')

  if (!email || !password) {
    return NextResponse.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({ where: { email } })

    // ตรวจสิทธิ์พื้นฐาน — บัญชีต้องมีรหัสผ่าน + ACTIVE จึงเข้าได้
    let ok = false
    if (user && user.passwordHash && user.status === 'ACTIVE') {
      ok = verifyPassword(password, user.passwordHash)
    }

    if (!user) {
      await db.auditLog.create({
        data: { action: 'LOGIN_FAILED', actor: email, target: 'auth', detail: 'พยายามเข้าสู่ระบบด้วยอีเมลที่ไม่มีในระบบ' },
      }).catch(() => undefined)
    } else if (!ok && user.status !== 'ACTIVE') {
      await db.auditLog.create({
        data: { action: 'LOGIN_FAILED', actor: email, target: 'auth', detail: `บัญชีถูกระงับการใช้งาน (${user.name})` },
      }).catch(() => undefined)
    } else if (!ok) {
      await db.auditLog.create({
        data: { action: 'LOGIN_FAILED', actor: email, target: 'auth', detail: `รหัสผ่านไม่ถูกต้อง (${user.name})` },
      }).catch(() => undefined)
    }

    if (!user || !ok) {
      const message = !user
        ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
        : user.status !== 'ACTIVE'
          ? `บัญชี ${user.name} ถูกระงับการใช้งาน — กรุณาติดต่อผู้ดูแลระบบ`
          : !user.passwordHash
            ? 'บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน — กรุณาติดต่อผู้ดูแลระบบ'
            : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      return NextResponse.json({ error: message }, { status: 401 })
    }

    // สำเร็จ — ตั้ง cookie + audit
    const token = await signSession(user.email)
    const res = NextResponse.json({ user: { email: user.email, name: user.name, role: user.role, status: user.status } })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // sandbox/ภายในองค์กร (ไม่มี TLS) — ระบุ true เมื่อขึ้น production ที่มี HTTPS
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    })
    await db.auditLog.create({
      data: { action: 'LOGIN_SUCCESS', actor: user.email, target: 'auth', detail: `เข้าสู่ระบบสำเร็จ (${user.name}) บทบาท ${user.role}` },
    }).catch(() => undefined)
    return res
  } catch (e) {
    console.error('POST /api/auth/login', e)
    return NextResponse.json({ error: 'เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่' }, { status: 500 })
  }
}
