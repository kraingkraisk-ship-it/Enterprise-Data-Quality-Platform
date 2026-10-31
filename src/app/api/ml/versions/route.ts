/**
 * API /api/ml/versions (v0.37.0) — รายการเวอร์ชันโมเดล ML Studio
 * GET — สิทธิ์: REVIEW_SIGNALS (ดูผล ML)
 * ?domainId= — กรองรายโดเมน (ไม่ระบุ = ทั้งหมด) · คืนพร้อมชื่อโดเมน
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export async function GET(req: NextRequest) {
  try {
    const op = await resolveOperator(null, 'REVIEW_SIGNALS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const domainId = req.nextUrl.searchParams.get('domainId')?.trim() ?? ''
    const versions = await db.mlModelVersion.findMany({
      where: domainId ? { domainId } : {},
      orderBy: [{ domainId: 'asc' }, { version: 'desc' }],
      take: 60,
      select: {
        id: true,
        version: true,
        domainId: true,
        status: true,
        trainPct: true,
        accuracy: true,
        precision: true,
        recall: true,
        f1: true,
        trainRows: true,
        testRows: true,
        assetCount: true,
        ruleCount: true,
        labelCount: true,
        trainedBy: true,
        note: true,
        activatedAt: true,
        createdAt: true,
      },
    })
    const domains = await db.dataDomain.findMany({ select: { id: true, name: true } })
    const domainNames = new Map(domains.map((d) => [d.id, d.name]))
    return NextResponse.json({
      versions: versions.map((v) => ({
        ...v,
        domainName: v.domainId ? domainNames.get(v.domainId) ?? v.domainId : 'ทุกโดเมน (รวม)',
      })),
    })
  } catch (e) {
    console.error('GET /api/ml/versions', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการเวอร์ชันโมเดลได้' }, { status: 500 })
  }
}
