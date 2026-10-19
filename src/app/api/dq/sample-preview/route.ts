import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isValidRole } from '@/lib/rbac'
import { canSeePii, maskRowByRole, type Row } from '@/lib/dq'

/**
 * ตัวอย่างแถวข้อมูลแบบ sandbox พร้อมปิดบัง PII **ฝั่ง backend** ตามบทบาท
 * หลักการ: ห้ามส่ง PII ให้บทบาทที่ไม่มีสิทธิ์เห็นออกจากเซิร์ฟเวอร์เด็ดขาด (PII masking by default)
 */
export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('datasetId')?.trim()
    const role = req.nextUrl.searchParams.get('role')?.trim().toUpperCase() ?? ''

    if (!datasetId) return NextResponse.json({ error: 'กรุณาระบุ datasetId' }, { status: 400 })
    if (!isValidRole(role)) return NextResponse.json({ error: 'บทบาทไม่ถูกต้อง' }, { status: 400 })

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
    })
  } catch (e) {
    console.error('GET /api/dq/sample-preview', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดตัวอย่างข้อมูลได้' }, { status: 500 })
  }
}
