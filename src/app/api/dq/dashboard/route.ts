import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DIMENSION_LABELS, type DimensionKey } from '@/lib/dq'

export async function GET() {
  try {
    const [datasets, pendingSignals, activeExceptions, rulesEnabled] = await Promise.all([
      db.dataset.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: {
          rules: {
            where: { rule: { enabled: true } },
            include: { rule: { include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
            orderBy: { ruleId: 'asc' },
          },
          _count: { select: { signals: { where: { status: 'PENDING_REVIEW' } } } },
        },
      }),
      db.dqSignal.count({ where: { status: 'PENDING_REVIEW' } }),
      // v0.36.0 — นับข้อยกเว้นที่ใช้งานอยู่ (ขอ = ใช้ทันที ไม่มีคิวอนุมัติ) — ยกเว้นที่ถูกยกเลิก/หมดอายุไม่นับ
      db.dqException.count({ where: { status: 'APPROVED', expiresAt: { gt: new Date() } } }),
      db.dqRule.count({ where: { enabled: true } }),
    ])

    const dimensionAverages = new Map<DimensionKey, number[]>()

    const perDataset = datasets.map((d) => {
      const byDimension = new Map<DimensionKey, number[]>()
      let lastRunAt: string | null = null

      for (const rd of d.rules) {
        const rule = rd.rule
        const run = rule.runs[0]
        if (!run) continue
        if (!lastRunAt || run.createdAt > new Date(lastRunAt)) lastRunAt = run.createdAt.toISOString()
        const arr = byDimension.get(run.dimension as DimensionKey) ?? []
        arr.push(run.passRate * 100)
        byDimension.set(run.dimension as DimensionKey, arr)
      }

      const scores: Array<{ dimension: DimensionKey; th: string; score: number }> = []
      for (const [k, arr] of byDimension) {
        const score = arr.reduce((a, b) => a + b, 0) / arr.length
        scores.push({ dimension: k, th: DIMENSION_LABELS[k].th, score })
        const globalArr = dimensionAverages.get(k) ?? []
        globalArr.push(score)
        dimensionAverages.set(k, globalArr)
      }

      const overall = scores.length > 0 ? scores.reduce((a, b) => a + b.score, 0) / scores.length : null
      const weakest = scores.length > 0 ? scores.reduce((a, b) => (a.score <= b.score ? a : b)) : null

      return {
        id: d.id,
        name: d.name,
        sourceType: d.sourceType,
        piiEnabled: d.piiEnabled,
        ruleCount: d.rules.length,
        lastRunAt,
        overallScore: overall,
        weakestDimension: weakest ? { th: weakest.th, score: weakest.score } : null,
        pendingSignals: d._count.signals,
        dimensionScores: scores.sort((a, b) => a.score - b.score),
      }
    })

    const dimensions = [...dimensionAverages.entries()]
      .map(([k, arr]) => ({
        dimension: k,
        th: DIMENSION_LABELS[k].th,
        en: DIMENSION_LABELS[k].en,
        score: arr.reduce((a, b) => a + b, 0) / arr.length,
      }))
      .sort((a, b) => a.score - b.score)

    return NextResponse.json({
      totals: {
        pendingSignals,
        activeExceptions,
        rulesEnabled,
        datasetsWithRun: perDataset.filter((d) => d.lastRunAt).length,
        datasetsTotal: perDataset.length,
      },
      perDataset,
      dimensions,
    })
  } catch (e) {
    console.error('GET /api/dq/dashboard', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดแดชบอร์ดได้' }, { status: 500 })
  }
}
