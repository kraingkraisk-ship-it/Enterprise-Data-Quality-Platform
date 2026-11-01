import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canSeePii, maskRowByRole, type Row } from '@/lib/dq'

/**
 * Data Dictionary → รายละเอียด Data Set API (v0.46.0)
 *
 * GET /api/elements/[id]/data-sets?role=ROLE
 *   — "หน้ารายละเอียด Data Set" ของ Data Dictionary 1 รายการ จัดกลุ่มตาม Data Asset ต้นทาง:
 *     (1) ข้อมูล Data Set: ชื่อ · Schema.Table · แหล่งที่มา · จำนวนแถว/คอลัมน์ทั้งหมด · สถานะ PII
 *     (2) เมทาดาทาคอลัมน์จริงที่อ้างอิง (ตรงกับ Zone C ข้อ 2 "คอลัมน์จริงที่อ้างอิงจาก Data Asset"):
 *         ประเภทกายภาพ (physicalType) · ชนิดที่ระบบอนุมาน (dataType) · ลำดับคอลัมน์ · หมายเหตุการแมป
 *     (3) ตัวอย่างข้อมูลจริง 5 แถวแรก (เฉพาะคอลัมน์ที่อ้างอิง — ปิดบัง PII ฝั่ง server ตามบทบาทเสมอ)
 *
 * อ่านอย่างเดียว (read-only) — ไม่เปลี่ยนสถานะ ไม่บันทึก Audit
 * role = บทบาทของผู้ใช้ปัจจุบันจากเซสชัน (frontend ส่ง sessionUser.role มาให้) — default BUSINESS_USER (ปิดบัง PII)
 * เพียง DATA_OWNER มองเห็นค่า PII จริง (canSeePii — กติกาเดียวกับ /api/assets/[id])
 */

const SAMPLE_ROWS = 5

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const role = req.nextUrl.searchParams.get('role')?.trim().toUpperCase() ?? 'BUSINESS_USER'

    const element = await db.dataElement.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        nameTh: true,
        columnMappings: {
          include: { asset: true },
          orderBy: [{ assetId: 'asc' }, { columnName: 'asc' }],
        },
      },
    })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Dictionary นี้ในระบบ' }, { status: 404 })

    // จัดกลุ่ม mapping ตาม Data Asset (ลำดับ assetId asc จาก orderBy เดิม — กลุ่มละ 1 Data Set)
    const groups = new Map<string, typeof element.columnMappings>()
    for (const m of element.columnMappings) {
      const list = groups.get(m.assetId)
      if (list) list.push(m)
      else groups.set(m.assetId, [m])
    }

    const dataSets = await Promise.all(
      [...groups.values()].map(async (mappings) => {
        const asset = mappings[0].asset
        const refNames = [...new Set(mappings.map((m) => m.columnName))]
        const noteByColumn = new Map(mappings.map((m) => [m.columnName, { note: m.note, mappedBy: m.mappedBy }]))

        // (2) เมทาดาทา — เฉพาะคอลัมน์ที่อ้างอิง เรียงตามลำดับคอลัมน์จริงในตารางต้นทาง
        const columns = await db.dataAssetColumn.findMany({
          where: { assetId: asset.id, name: { in: refNames } },
          orderBy: { position: 'asc' },
          select: { name: true, dataType: true, physicalType: true, position: true },
        })

        // (3) ตัวอย่างข้อมูลจริง 5 แถวแรก — ตัดเฉพาะคอลัมน์ที่อ้างอิง + ปิดบัง PII ตามบทบาท (ฝั่ง server เสมอ)
        const records = await db.dataAssetRecord.findMany({
          where: { assetId: asset.id },
          orderBy: { rowNo: 'asc' },
          take: SAMPLE_ROWS,
        })
        const sampleRows = records.map((r) => {
          let payload: Row = {}
          try {
            payload = JSON.parse(r.payload) as Row
          } catch {
            payload = {}
          }
          const picked: Row = {}
          for (const name of refNames) picked[name] = payload[name] ?? ''
          return { rowNo: r.rowNo, cells: maskRowByRole(picked, role, asset.piiEnabled) }
        })

        return {
          asset: {
            id: asset.id,
            name: asset.name,
            schemaName: asset.schemaName,
            tableName: asset.tableName,
            sourceType: asset.sourceType,
            rowCount: asset.rowCount,
            columnCount: asset.columnCount,
            piiEnabled: asset.piiEnabled,
            status: asset.status,
          },
          piiMasked: asset.piiEnabled && !canSeePii(role),
          columns: columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            physicalType: c.physicalType,
            position: c.position,
            note: noteByColumn.get(c.name)?.note ?? '',
            mappedBy: noteByColumn.get(c.name)?.mappedBy ?? '',
          })),
          sampleRows,
          sampleCount: sampleRows.length,
        }
      }),
    )

    return NextResponse.json({
      element: { id: element.id, code: element.code, nameTh: element.nameTh },
      dataSets,
      mappingCount: element.columnMappings.length,
    })
  } catch (e) {
    console.error('GET /api/elements/[id]/data-sets', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายละเอียด Data Set ได้' }, { status: 500 })
  }
}
