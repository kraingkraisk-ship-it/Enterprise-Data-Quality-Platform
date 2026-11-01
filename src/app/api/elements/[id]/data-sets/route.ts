import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { resolveViewerRole } from '@/lib/operator'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { canSeePii, maskRowByRoleWithGrants, PII_FIELD_HINTS, type Row } from '@/lib/dq'

/**
 * Data Dictionary → รายละเอียด Data Set API (v0.46.0 · v0.47.0 เพิ่มสิทธิ์ชั่วคราวจาก Data Owner)
 *
 * GET /api/elements/[id]/data-sets
 *   — "หน้ารายละเอียด Data Set" ของ Data Dictionary 1 รายการ จัดกลุ่มตาม Data Asset ต้นทาง:
 *     (1) ข้อมูล Data Set: ชื่อ · Schema.Table · แหล่งที่มา · จำนวนแถว/คอลัมน์ทั้งหมด · สถานะ PII
 *     (2) เมทาดาทาคอลัมน์จริงที่อ้างอิง (ตรงกับ Zone C ข้อ 2 "คอลัมน์จริงที่อ้างอิงจาก Data Asset"):
 *         ประเภทกายภาพ (physicalType) · ชนิดที่ระบบอนุมาน (dataType) · ลำดับคอลัมน์ · หมายเหตุการแมป
 *     (3) ตัวอย่างข้อมูลจริง 5 แถวแรก (เฉพาะคอลัมน์ที่อ้างอิง — ปิดบัง PII ฝั่ง server ตามบทบาทเสมอ)
 *
 * v0.47.0 — บทบาทผู้ชมอ่านจาก session cookie เท่านั้น (ไม่รับ role จาก query อีกต่อไป — ปลอมไม่ได้)
 *   + คอลัมน์ที่ได้รับสิทธิ์ชั่วคราว (ColumnAccessRequest APPROVED ยังไม่หมดอายุ ของผู้ชมคนนี้)
 *     จะถูกปลดบังเฉพาะ (ผู้ใช้ × คอลัมน์) นั้น — คอลัมน์อื่นยังปิดบังตามเดิม (deny-by-default)
 *   + คืน maskedColumns (คอลัมน์ที่ถูกปิดบัง — จุดยื่นคำขอ) และ grantedColumns (สิทธิ์ชั่วคราวที่ใช้งานอยู่ พร้อมเวลาหมดอายุ)
 *
 * อ่านอย่างเดียว — ไม่เปลี่ยนสถานะ ไม่บันทึก Audit
 * เพียง DATA_OWNER มองเห็นค่า PII จริงโดย default (canSeePii)
 */

const SAMPLE_ROWS = 5

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params

    // บทบาทผู้ชมจาก session (v0.34.0 deny-by-default) + อีเมลผู้ชมสำหรับเช็คสิทธิ์ชั่วคราว
    const role = await resolveViewerRole()
    const store = await cookies()
    const session = await verifySession(store.get(SESSION_COOKIE)?.value)
    const viewerEmail = session?.e ?? ''

    // สิทธิ์ชั่วคราวที่ยังใช้งานอยู่ของผู้ชมคนนี้ (assetId → Map(column → expiresAt))
    const grantMap = new Map<string, Map<string, string>>()
    if (viewerEmail && !canSeePii(role)) {
      const grants = await db.columnAccessRequest.findMany({
        where: { requestedBy: viewerEmail, status: 'APPROVED', expiresAt: { gt: new Date() } },
        select: { assetId: true, columnName: true, expiresAt: true },
      })
      for (const g of grants) {
        const perAsset = grantMap.get(g.assetId) ?? new Map<string, string>()
        const prev = perAsset.get(g.columnName)
        // เก็บสิทธิ์ที่หมดอายุช้ากว่า (ยาวที่สุด)
        if (!prev || new Date(prev).getTime() < g.expiresAt.getTime()) perAsset.set(g.columnName, g.expiresAt.toISOString())
        grantMap.set(g.assetId, perAsset)
      }
    }

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

    const viewerCanSeePii = canSeePii(role)
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

        // สิทธิ์ชั่วคราวของ asset นี้ (คอลัมน์ → เวลาหมดอายุ)
        const assetGrants = grantMap.get(asset.id)
        const grantedColumns = refNames.filter((n) => assetGrants?.has(n)).map((n) => ({ column: n, expiresAt: assetGrants!.get(n)! }))
        const grantedSet = new Set(grantedColumns.map((g) => g.column))

        // (3) ตัวอย่างข้อมูลจริง 5 แถวแรก — ตัดเฉพาะคอลัมน์ที่อ้างอิง + ปิดบัง PII ตามบทบาท (ฝั่ง server เสมอ)
        //     ยกเว้นคอลัมน์ที่ได้รับสิทธิ์ชั่วคราวจาก Data Owner (ยังไม่หมดอายุ)
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
          return { rowNo: r.rowNo, cells: maskRowByRoleWithGrants(picked, role, asset.piiEnabled, grantedSet) }
        })

        // คอลัมน์ที่ถูกปิดบังจริงสำหรับผู้ชมนี้ (จุดที่ยื่นคำขอได้) — เฉพาะคอลัมน์ PII ที่ยังไม่ได้รับสิทธิ์
        const maskedColumns =
          asset.piiEnabled && !viewerCanSeePii ? refNames.filter((n) => n in PII_FIELD_HINTS && !grantedSet.has(n)) : []

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
          piiMasked: asset.piiEnabled && !viewerCanSeePii,
          maskedColumns,
          grantedColumns,
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
