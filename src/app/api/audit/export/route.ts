/**
 * GET /api/audit/export (v0.30.0) — ส่งออก Audit Log เป็นไฟล์ CSV
 * ใช้ตัวกรองชุดเดียวกับ GET /api/audit (builder เดียวกัน) — ไฟล์ที่ได้ตรงกับมุมมองบนจอเสมอ
 * ข้อจำกัดความปลอดภัย: สูงสุด 5,000 แถวต่อไฟล์ (orderBy ใหม่ → เก่า)
 * CSV เข้ารหัส UTF-8 + BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUDIT_GROUPS, auditBadge, type AuditGroupKey } from '@/lib/audit-actions'
import { buildAuditWhere } from '@/lib/audit-query'

const MAX_ROWS = 5000

const AUDIT_GROUP_TH: Record<AuditGroupKey, string> = Object.fromEntries(
  Object.values(AUDIT_GROUPS).map((g) => [g.key, g.th]),
) as Record<AuditGroupKey, string>

/** escape ค่า CSV — ครอบด้วยเครื่องหมายคำพูดเมื่อมี , " หรือขึ้นบรรทัด */
function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replaceAll('"', '""')}"`
  return v
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const { where, summary } = buildAuditWhere(sp)

    const rows = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    })

    const header = ['เวลา (ISO)', 'เวลา (th-TH)', 'action', 'กลุ่ม', 'รายการ', 'ผู้กระทำ', 'เป้าหมาย', 'รายละเอียด']
    const lines: string[] = [header.map(csvCell).join(',')]

    for (const r of rows) {
      const badge = auditBadge(r.action)
      const groupTh = badge.group ? AUDIT_GROUP_TH[badge.group] : 'อื่น ๆ'
      const thTime = new Date(r.createdAt).toLocaleString('th-TH', { hour12: false })
      lines.push(
        [
          r.createdAt.toISOString(),
          thTime,
          r.action,
          groupTh,
          badge.th,
          r.actor,
          r.target,
          r.detail,
        ]
          .map(csvCell)
          .join(','),
      )
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const csv = `\uFEFF${lines.join('\r\n')}`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${stamp}.csv"`,
        'Cache-Control': 'no-store',
        // header เป็น ByteString (Latin-1) — ข้อความไทยต้อง encode ก่อน (informational เท่านั้น)
        'X-Audit-Filter': encodeURIComponent(summary),
        'X-Audit-Rows': String(rows.length),
      },
    })
  } catch (e) {
    console.error('GET /api/audit/export', e)
    return NextResponse.json({ error: 'ไม่สามารถส่งออกบันทึกการตรวจสอบได้' }, { status: 500 })
  }
}
