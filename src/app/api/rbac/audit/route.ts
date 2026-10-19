import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '60')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 60
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
    return NextResponse.json({ logs })
  } catch (e) {
    console.error('GET /api/rbac/audit', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดบันทึกการตรวจสอบได้' }, { status: 500 })
  }
}
