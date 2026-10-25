import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  CONDITIONS,
  DIMENSION_LABELS,
  isConditionKey,
  isDimensionKey,
  type DimensionKey,
} from '@/lib/dq'
import { gradeOf, type GradeBand } from '@/lib/dama'

/**
 * GET /api/dq/scorecard — บัตรคะแนนคุณภาพข้อมูลรายชุดข้อมูล
 * - ตารางเมทริกซ์: ชุดข้อมูล × 9 มิติ (DAMA-DMBOK) จากผลรันล่าสุดของแต่ละกฎ
 * - แนวโน้มรายวัน (30 วันล่าสุด) ต่อชุดข้อมูล — จากประวัติ DqRun ทั้งหมดในหน้าต่าง
 * อ่านอย่างเดียว — ไม่ต้องมีสิทธิ์พิเศษ (คะแนนไม่มี PII)
 */

interface DimensionScoreCell {
  dimension: DimensionKey
  th: string
  en: string
  clauseNo: number
  score: number | null
  grade: { band: GradeBand; label: string; badgeClass: string; textClass: string } | null
  rulesCount: number
  failedRules: number
}

export async function GET(req: NextRequest) {
  try {
    const [datasets, templates, runsWindow] = await Promise.all([
      db.dataset.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: { rules: { where: { rule: { enabled: true } } } },
      }),
      db.conditionTemplate.findMany(),
      db.dqRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4000,
      }),
    ])

    const templateMap = new Map(templates.map((t) => [t.key, t]))
    const dimensionKeys = Object.keys(DIMENSION_LABELS) as DimensionKey[]

    // ---------- ผลรันล่าสุดของแต่ละคู่ (กฎ × ชุดข้อมูล) ----------
    const latestMap = new Map<string, (typeof runsWindow)[number]>()
    for (const run of runsWindow) {
      const key = `${run.ruleId}|${run.datasetId}`
      if (!latestMap.has(key)) latestMap.set(key, run)
    }

    // ---------- แนวโน้มรายวัน (จากทุกผลรันในหน้าต่าง — เฉลี่ยอัตราผ่านต่อวัน) ----------
    const trendByDataset = new Map<string, Map<string, { sum: number; n: number }>>()
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    for (const run of runsWindow) {
      const t = new Date(run.createdAt).getTime()
      if (t < cutoff) continue
      const dayKey = new Date(t).toISOString().slice(0, 10)
      const byDay = trendByDataset.get(run.datasetId) ?? new Map<string, { sum: number; n: number }>()
      const cell = byDay.get(dayKey) ?? { sum: 0, n: 0 }
      cell.sum += run.passRate * 100
      cell.n += 1
      byDay.set(dayKey, cell)
      trendByDataset.set(run.datasetId, byDay)
    }

    const rows = datasets.map((d) => {
      const latestRuns = [...latestMap.values()].filter((r) => r.datasetId === d.id)
      // v0.32.0 — ผลรันที่ชุดข้อมูลว่าง (NO_DATA) ไม่ถูกนับเป็นคะแนน/กฎล้มเหลว
      const scoredRuns = latestRuns.filter((r) => r.status !== 'NO_DATA')
      const byDim = new Map<DimensionKey, { rates: number[]; rules: number; fails: number }>()
      for (const run of scoredRuns) {
        const dim = isDimensionKey(run.dimension) ? run.dimension : 'VALIDITY'
        const cell = byDim.get(dim) ?? { rates: [], rules: 0, fails: 0 }
        cell.rates.push(run.passRate * 100)
        cell.rules += 1
        if (run.status === 'FAILED') cell.fails += 1
        byDim.set(dim, cell)
      }

      const dimensions: DimensionScoreCell[] = dimensionKeys.map((k, i) => {
        const cell = byDim.get(k)
        const score = cell && cell.rates.length > 0 ? cell.rates.reduce((a, b) => a + b, 0) / cell.rates.length : null
        const grade = gradeOf(score)
        return {
          dimension: k,
          th: DIMENSION_LABELS[k].th,
          en: DIMENSION_LABELS[k].en,
          clauseNo: i + 1,
          score,
          grade: grade
            ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass }
            : null,
          rulesCount: cell?.rules ?? 0,
          failedRules: cell?.fails ?? 0,
        }
      })

      const measured = dimensions.filter((x) => x.score !== null) as Array<{ score: number }>
      const score = measured.length > 0 ? measured.reduce((a, b) => a + b.score, 0) / measured.length : null
      const grade = gradeOf(score)
      const lastRunAt = latestRuns.map((r) => r.createdAt.toISOString()).sort().reverse()[0] ?? null

      const trend = [...(trendByDataset.get(d.id)?.entries() ?? [])]
        .map(([date, cell]) => ({ date, score: cell.sum / cell.n, runs: cell.n }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))

      return {
        id: d.id,
        name: d.name,
        sourceType: d.sourceType,
        rulesCount: d.rules.length,
        score,
        grade: grade
          ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass }
          : null,
        lastRunAt,
        dimensions,
        trend,
      }
    })

    const withScore = rows.filter((r) => r.score !== null) as Array<{ score: number }>
    const avgScore = withScore.length > 0 ? withScore.reduce((a, b) => a + b.score, 0) / withScore.length : null

    // มิติที่อ่อน/แข็งที่สุดของระบบ (เฉลี่ยจากชุดข้อมูลที่วัดได้)
    const dimAvgs = dimensionKeys
      .map((k, i) => {
        const scores = rows
          .map((r) => r.dimensions[i].score)
          .filter((s): s is number => s !== null)
        return {
          dimension: k,
          th: DIMENSION_LABELS[k].th,
          en: DIMENSION_LABELS[k].en,
          avg: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        }
      })
      .filter((d) => d.avg !== null)
      .sort((a, b) => (a.avg as number) - (b.avg as number))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      kpis: {
        datasetsTotal: datasets.length,
        datasetsWithRun: rows.filter((r) => r.lastRunAt).length,
        avgScore,
        avgGrade: gradeOf(avgScore)
          ? {
              band: gradeOf(avgScore)!.band,
              label: gradeOf(avgScore)!.label,
              badgeClass: gradeOf(avgScore)!.badgeClass,
              textClass: gradeOf(avgScore)!.textClass,
            }
          : null,
        weakest: dimAvgs[0] ?? null,
        strongest: dimAvgs.length > 0 ? dimAvgs[dimAvgs.length - 1] : null,
      },
      datasets: rows,
    })
  } catch (e) {
    console.error('GET /api/dq/scorecard', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดบัตรคะแนนได้' }, { status: 500 })
  }
}
