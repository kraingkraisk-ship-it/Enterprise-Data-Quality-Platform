/**
 * GET /api/reference/sets/[id]/export (v0.31.0) — ส่งออกค่าอ้างอิงทั้งทะเบียนเป็นไฟล์ CSV
 * รวมทั้ง ACTIVE และ RETIRED (มีคอลัมน์ status) — วนกลับเข้า import ได้ทันที (header เดียวกัน)
 * CSV เข้ารหัส UTF-8 + BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง
 * อ่านอย่างเดียว (GET) — ไม่เขียน audit row ตามขนบ GET ของระบบ
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { compareValueRows, exportFileName, toValuesCsv } from '@/lib/reference'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const set = await db.referenceSet.findUnique({
      where: { id },
      select: { code: true, name: true, values: true },
    })
    if (!set) return NextResponse.json({ error: 'ไม่พบทะเบียนข้อมูลอ้างอิงนี้ในระบบ' }, { status: 404 })

    const sorted = [...set.values].sort(compareValueRows)
    const csv = `\uFEFF${toValuesCsv(sorted).split('\n').join('\r\n')}`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName(set.code)}"`,
        'Cache-Control': 'no-store',
        'X-Reference-Rows': String(sorted.length),
      },
    })
  } catch (e) {
    console.error('GET /api/reference/sets/[id]/export', e)
    return NextResponse.json({ error: 'ไม่สามารถส่งออกค่าอ้างอิงได้' }, { status: 500 })
  }
}
