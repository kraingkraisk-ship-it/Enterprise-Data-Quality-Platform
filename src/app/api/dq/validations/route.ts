import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gradeOf } from '@/lib/dama'

/**
 * GET /api/dq/validations — รายการรอบการตรวจ (Validation Batches) ล่าสุด
 * query: datasetId? (กรอง), take? (default 25, สูงสุด 100)
 */
export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('datasetId')?.trim() ?? ''
    const takeRaw = Number(req.nextUrl.searchParams.get('take') ?? '25')
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.floor(takeRaw), 1), 100) : 25

    const [batches, total] = await Promise.all([
      db.dqValidationBatch.findMany({
        where: datasetId ? { datasetId } : undefined,
        orderBy: { createdAt: 'desc' },
        take,
        include: { dataset: { select: { name: true } } },
      }),
      db.dqValidationBatch.count({ where: datasetId ? { datasetId } : undefined }),
    ])

    return NextResponse.json({
      total,
      batches: batches.map((b) => {
        const grade = gradeOf(b.overallScore)
        return {
          id: b.id,
          datasetId: b.datasetId,
          datasetName: b.dataset.name,
          triggeredBy: b.triggeredBy,
          createdBy: b.createdBy,
          totalRules: b.totalRules,
          passedRules: b.passedRules,
          failedRules: b.failedRules,
          skippedRules: b.skippedRules,
          overallScore: b.overallScore,
          grade: grade
            ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass }
            : null,
          createdAt: b.createdAt.toISOString(),
        }
      }),
    })
  } catch (e) {
    console.error('GET /api/dq/validations', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการรอบการตรวจได้' }, { status: 500 })
  }
}
