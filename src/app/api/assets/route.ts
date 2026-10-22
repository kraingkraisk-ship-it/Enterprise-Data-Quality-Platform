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
      include: { domain: { include: { parent: { select: { name: true } } } } },
    })
    return NextResponse.json({
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        sourceType: a.sourceType,
        sourceInfo: a.sourceInfo,
        piiEnabled: a.piiEnabled,
        domain: a.domain ? { id: a.domain.id, name: a.domain.name, color: a.domain.color, parentId: a.domain.parentId, parentName: a.domain.parent?.name ?? null } : null,
        rowCount: a.rowCount,
        columnCount: a.columnCount,
        status: a.status,
        importedBy: a.importedBy,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      count: assets.length,
    })
  } catch (e) {
    console.error('GET /api/assets', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการ Data Asset ได้' }, { status: 500 })
  }
}
