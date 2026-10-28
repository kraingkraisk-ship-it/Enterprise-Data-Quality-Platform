import { NextRequest, NextResponse } from 'next/server'
import { verifySessionFromHeaders } from '@/lib/session'

/**
 * Auth Gate (v0.33.0) — ทุกคำขอ API ต้องมี session ที่ถูกต้อง
 * ยกเว้น: /api/auth/login (จุดเข้าสู่ระบบ) และ /api/auth/session (ตรวจสถานะ — คืน user: null ได้)
 * ไม่ผ่าน → 401 พร้อมข้อความไทยชัดเจน (deny-by-default ให้ตรงหลักระบบ)
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/api/auth/login' || pathname === '/api/auth/session') {
    return NextResponse.next()
  }
  const session = await verifySessionFromHeaders(req.headers)
  if (!session) {
    return NextResponse.json(
      { error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (session หมดอายุหรือยังไม่ได้เข้าสู่ระบบ)' },
      { status: 401 },
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
