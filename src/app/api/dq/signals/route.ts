import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status')?.trim().toUpperCase()
    const where = status && ['PENDING_REVIEW', 'CONFIRMED', 'DISMISSED'].includes(status) ? { status } : {}

    const [signals, pending, confirmed, dismissed] = await Promise.all([
      db.dqSignal.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 100,
        include: { dataset: { select: { name: true, piiEnabled: true } } },
      }),
      db.dqSignal.count({ where: { status: 'PENDING_REVIEW' } }),
      db.dqSignal.count({ where: { status: 'CONFIRMED' } }),
      db.dqSignal.count({ where: { status: 'DISMISSED' } }),
    ])

    return NextResponse.json({
      signals: signals.map((s) => ({
        id: s.id,
        datasetId: s.datasetId,
        datasetName: s.dataset.name,
        kind: s.kind,
        dimension: s.dimension,
        title: s.title,
        detail: s.detail,
        severity: s.severity,
        status: s.status,
        reviewedBy: s.reviewedBy,
        reviewedAt: s.reviewedAt,
        createdAt: s.createdAt,
      })),
      stats: { pending, confirmed, dismissed },
    })
  } catch (e) {
    console.error('GET /api/dq/signals', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดสัญญาณได้' }, { status: 500 })
  }
}
