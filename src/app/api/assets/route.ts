import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/assets — รายการ Data Asset ทั้งหมด (สำหรับหน้า Data Inventory)
 * คืน metadata ของ asset (ไม่รวมแถวข้อมูล) เรียงใหม่ล่าสุดก่อน
 */
export async function GET() {
  try {
    const assets = await db.dataAsset.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        sourceType: true,
        sourceInfo: true,
        piiEnabled: true,
        rowCount: true,
        columnCount: true,
        status: true,
        importedBy: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ assets, count: assets.length })
  } catch (e) {
    console.error('GET /api/assets', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการ Data Asset ได้' }, { status: 500 })
  }
}
