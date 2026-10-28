import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

/**
 * GET /api/auth/session — ตรวจสถานะเข้าสู่ระบบ (v0.33.0)
 * คืน 200 เสมอ: { user: {...} } เมื่อมี session ที่ถูกต้อง / { user: null } เมื่อไม่มี
 * (middleware ยกเว้น route นี้เพื่อให้ client ตรวจได้ตั้งแต่ก่อนเข้าสู่ระบบ)
 */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ user: null })
  try {
    const user = await db.user.findUnique({ where: { email: session.e } })
    if (!user || user.status !== 'ACTIVE') return NextResponse.json({ user: null })
    return NextResponse.json({ user: { email: user.email, name: user.name, role: user.role, status: user.status } })
  } catch (e) {
    console.error('GET /api/auth/session', e)
    return NextResponse.json({ user: null })
  }
}
