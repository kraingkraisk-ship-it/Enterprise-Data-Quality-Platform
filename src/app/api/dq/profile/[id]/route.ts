import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { maskValueByRole } from '@/lib/dq'
import type { ProfileTopValue } from '@/lib/profiling'

/**
 * GET /api/dq/profile/[id] — ผลโปรไฟล์รายคอลัมน์ของรอบนั้น
 * query: operatorEmail? — ปิดบัง PII ตามบทบาทผู้ชม (PDPA) — ไม่ระบุ = ปิดบังเข้มสุด
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const operatorEmail = req.nextUrl.searchParams.get('operatorEmail')?.trim() ?? ''

    // ผู้ชม — ใช้บทบาทจริงถ้าระบุอีเมล (ACTIVE เท่านั้น) ไม่งั้นใช้บทบาทเข้มสุดเพื่อ PDPA-first
    let role = 'BUSINESS_USER'
    if (operatorEmail) {
      const user = await db.user.findUnique({ where: { email: operatorEmail }, select: { role: true, status: true } })
      if (user && user.status === 'ACTIVE') role = user.role
    }

    const run = await db.dqProfileRun.findUnique({
      where: { id },
      include: {
        dataset: { select: { id: true, name: true, piiEnabled: true } },
        columns: { orderBy: { columnName: 'asc' } },
      },
    })
    if (!run) {
      return NextResponse.json({ error: 'ไม่พบผลโปรไฟล์นี้ในระบบ' }, { status: 404 })
    }

    const piiEnabled = run.dataset.piiEnabled
    const columns = run.columns.map((c) => {
      let topValues: Array<{ value: string; count: number }> = []
      try {
        topValues = (JSON.parse(c.topValues) as ProfileTopValue[]) ?? []
      } catch {
        topValues = []
      }
      // ปิดบัง PII ตอน "อ่าน" ตามบทบาทผู้ชม — ข้อมูลดิบในฐานข้อมูลไม่เคยถูกแก้
      const maskedTop = topValues.map((t) => ({
        value: maskValueByRole(c.columnName, t.value, role, piiEnabled),
        count: t.count,
      }))
      return {
        id: c.id,
        columnName: c.columnName,
        dataType: c.dataType,
        totalRows: c.totalRows,
        nullCount: c.nullCount,
        nullPct: c.nullPct,
        distinctCount: c.distinctCount,
        distinctPct: c.distinctPct,
        // สถิติช่วงค่าก็อาจมี PII (เช่น อีเมลแรก/สุดท้ายแบบเรียงตามตัวอักษร) — ปิดบังเช่นเดียวกับ topValues
        minValue: c.minValue === null ? null : maskValueByRole(c.columnName, c.minValue, role, piiEnabled),
        maxValue: c.maxValue === null ? null : maskValueByRole(c.columnName, c.maxValue, role, piiEnabled),
        meanValue: c.meanValue === null ? null : maskValueByRole(c.columnName, c.meanValue, role, piiEnabled),
        minLength: c.minLength,
        maxLength: c.maxLength,
        topValues: maskedTop,
        piiSuspected: c.piiSuspected,
      }
    })

    return NextResponse.json({
      run: {
        id: run.id,
        datasetId: run.datasetId,
        datasetName: run.dataset.name,
        totalRows: run.totalRows,
        totalColumns: run.totalColumns,
        avgCompleteness: run.avgCompleteness,
        avgUniqueness: run.avgUniqueness,
        piiColumnCount: run.piiColumnCount,
        durationMs: run.durationMs,
        createdBy: run.createdBy,
        createdAt: run.createdAt.toISOString(),
      },
      columns,
      viewerRole: role,
      piiMasked: piiEnabled,
    })
  } catch (e) {
    console.error('GET /api/dq/profile/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดผลโปรไฟล์ได้' }, { status: 500 })
  }
}
