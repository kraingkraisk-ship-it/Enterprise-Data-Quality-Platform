import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const datasets = await db.dataset.findMany({
      orderBy: { createdAt: 'asc' },
      include: { grants: { orderBy: { roleId: 'asc' } } },
    })
    return NextResponse.json({ datasets })
  } catch (e) {
    console.error('GET /api/rbac/datasets', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดชุดข้อมูลได้' }, { status: 500 })
  }
}
