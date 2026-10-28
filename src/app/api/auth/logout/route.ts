import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

/**
 * POST /api/auth/logout — ออกจากระบบ (v0.33.0)
 * ลบ cookie ทันที + บันทึก audit LOGOUT (ถ้า session ยังอ่านได้)
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySession(token)
  if (session) {
    await db.auditLog.create({
      data: { action: 'LOGOUT', actor: session.e, target: 'auth', detail: 'ออกจากระบบ' },
    }).catch(() => undefined)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 0 })
  return res
}
