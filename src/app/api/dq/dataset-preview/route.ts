import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isValidRole } from '@/lib/rbac'
import { canSeePii, maskRowByRole, type Row } from '@/lib/dq'

/**
 * ตัวอย่างข้อมูลแบบ sandbox สำหรับ Rule Builder — รองรับหลายชุดข้อมูลในครั้งเดียว
 * - แสดงแถวตัวอย่าง (ปิดบัง PII ฝั่ง backend ตามบทบาทเสมอ)
 * - สรุปคอลัมน์ทั้งหมด (union) พร้อมข้อมูลว่าคอลัมน์ใดมีในชุดข้อมูลใด
 *   เพื่อให้เลือกคอลัมน์สำหรับกฎที่ใช้ร่วมหลายชุดข้อมูลได้อย่างถูกต้อง
 */
export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get('datasetIds')?.trim() ?? ''
    const role = req.nextUrl.searchParams.get('role')?.trim().toUpperCase() ?? ''
    const rowsPerDataset = Math.min(Math.max(Number(req.nextUrl.searchParams.get('rows') ?? '5'), 1), 20)

    if (!idsParam) return NextResponse.json({ error: 'กรุณาระบุ datasetIds' }, { status: 400 })
    if (!isValidRole(role)) return NextResponse.json({ error: 'บทบาทไม่ถูกต้อง' }, { status: 400 })

    const datasetIds = [...new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 12)
    if (datasetIds.length === 0) return NextResponse.json({ error: 'กรุณาระบุ datasetIds' }, { status: 400 })

    const datasets = await db.dataset.findMany({ where: { id: { in: datasetIds } } })
    if (datasets.length === 0) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    const previews: Array<{
      datasetId: string
      datasetName: string
      columns: string[]
      rows: Row[]
      piiMasked: boolean
      hasSample: boolean
    }> = []

    // เก็บแผนที่ column → ชุดข้อมูลที่มีคอลัมน์นี้ (เฉพาะชุดข้อมูลที่มีข้อมูลตัวอย่าง)
    const columnPresence = new Map<string, string[]>()

    for (const dataset of datasets) {
      const sampleRows = await db.sampleRow.findMany({
        where: { datasetId: dataset.id },
        orderBy: { createdAt: 'asc' },
        take: rowsPerDataset,
      })
      const rows: Row[] = sampleRows.map((r) => {
        try {
          return JSON.parse(r.payload) as Row
        } catch {
          return {}
        }
      })
      const columns = rows.length > 0 ? [...new Set(rows.flatMap((r) => Object.keys(r)))] : []
      const piiMasked = dataset.piiEnabled && !canSeePii(role)
      const maskedRows = rows.map((row) => maskRowByRole(row, role, dataset.piiEnabled))

      for (const col of columns) {
        const arr = columnPresence.get(col) ?? []
        arr.push(dataset.id)
        columnPresence.set(col, arr)
      }

      previews.push({
        datasetId: dataset.id,
        datasetName: dataset.name,
        columns,
        rows: maskedRows,
        piiMasked,
        hasSample: rows.length > 0,
      })
    }

    // คอลัมน์ union เรียงตามลำดับที่พบครั้งแรก — พร้อม flag ว่ามีในชุดข้อมูลใดบ้าง
    const datasetsWithSample = previews.filter((p) => p.hasSample).map((p) => p.datasetId)
    const columns: Array<{ name: string; availableIn: string[]; missingIn: string[] }> = []
    for (const [col, presentIn] of columnPresence) {
      const presentSet = new Set(presentIn)
      columns.push({
        name: col,
        availableIn: presentIn,
        missingIn: datasetsWithSample.filter((id) => !presentSet.has(id)),
      })
    }

    return NextResponse.json({
      previews,
      columns,
      datasetsWithSampleCount: datasetsWithSample.length,
    })
  } catch (e) {
    console.error('GET /api/dq/dataset-preview', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดตัวอย่างข้อมูลได้' }, { status: 500 })
  }
}
