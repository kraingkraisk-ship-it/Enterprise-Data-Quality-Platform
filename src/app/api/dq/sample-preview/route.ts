import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveViewerRole } from '@/lib/operator'
import { canSeePii, maskRowByRole, type Row } from '@/lib/dq'

/**
 * ตัวอย่างแถวข้อมูลแบบ sandbox พร้อมปิดบัง PII **ฝั่ง backend** ตามบทบาท (v0.34.0)
 * บทบาทผู้ชมอ่านจาก **session ผู้เข้าสู่ระบบจริง** เท่านั้น — เดิมรับ role จาก query param (ปลอมได้)
 * นโยบาย v0.34.0: เห็น PII แบบไม่ปิดบังได้เฉพาะ "เจ้าของข้อมูล" (DATA_OWNER) เท่านั้น
 * หลักการ: ห้ามส่ง PII ให้บทบาทที่ไม่มีสิทธิ์เห็นออกจากเซิร์ฟเวอร์เด็ดขาด (PII masking by default)
 */
export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('datasetId')?.trim()
    if (!datasetId) return NextResponse.json({ error: 'กรุณาระบุ datasetId' }, { status: 400 })

    const role = await resolveViewerRole()

    const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    const sampleRows = await db.sampleRow.findMany({ where: { datasetId }, orderBy: { createdAt: 'asc' }, take: 5 })
    const rows: Row[] = sampleRows.map((r) => {
      try {
        return JSON.parse(r.payload) as Row
      } catch {
        return {}
      }
    })

    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    const piiMasked = dataset.piiEnabled && !canSeePii(role)
    const maskedRows = rows.map((row) => maskRowByRole(row, role, dataset.piiEnabled))

    return NextResponse.json({
      datasetName: dataset.name,
      columns,
      rows: maskedRows,
      piiMasked,
      piiEnabled: dataset.piiEnabled,
      viewerRole: role,
    })
  } catch (e) {
    console.error('GET /api/dq/sample-preview', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดตัวอย่างข้อมูลได้' }, { status: 500 })
  }
}
