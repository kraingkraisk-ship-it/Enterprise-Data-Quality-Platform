import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  CONDITIONS,
  DIMENSION_LABELS,
  isConditionKey,
  isDimensionKey,
  type DimensionKey,
} from '@/lib/dq'
import { buildRuleVerdict, fixHintFor, gradeOf, type GradeBand } from '@/lib/dama'
import {
  DATA_CLASSIFICATIONS,
  impactsOf,
  likelihoodOf,
  riskBandOf,
  SEVERITY_WEIGHT,
  coverageStatusOf,
  type RiskBand,
} from '@/lib/regulation'

/** คะแนนรายมิติครบทั้ง 9 มิติ (score = null เมื่อไม่มีกฎ/ยังไม่ได้รันตรวจ) */
interface DimensionScoreView {
  dimension: DimensionKey
  th: string
  en: string
  clauseNo: number
  score: number | null
  grade: { band: GradeBand; label: string; badgeClass: string; textClass: string } | null
  rulesCount: number
  failedRules: number
}

interface LatestRun {
  runId: string
  at: string
  datasetId: string
  datasetName: string
  ruleId: string
  column: string
  condition: string
  conditionName: string
  engineType: string
  severity: string
  dimension: DimensionKey
  clauseNo: number
  status: 'PASSED' | 'FAILED'
  totalRows: number
  failedRows: number
  passRate: number
  /** คำตัดสินตามมาตรา DAMA-DMBOK (ภาษาไทยอ่านง่าย) */
  verdict: string
  /** คำแนะนำเมื่อล้มเหลว — เป็นข้อแนะนำ การแก้ไขเป็นของมนุษย์เสมอ */
  advice: string | null
  riskScore: number
  riskBand: RiskBand
  likelihood: { level: number; label: string }
}

export async function GET(req: NextRequest) {
  try {
    const datasetFilter = req.nextUrl.searchParams.get('datasetId')?.trim() ?? ''

    const [datasets, rulesEnabled, templates, runsWindow, pendingSignals, pendingExceptions, totalRuns, conditionsCount] =
      await Promise.all([
        db.dataset.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: {
            rules: { where: { rule: { enabled: true } }, include: { rule: true } },
            _count: { select: { signals: { where: { status: 'PENDING_REVIEW' } } } },
          },
        }),
        db.dqRule.findMany({ where: { enabled: true }, include: { datasets: { select: { datasetId: true } } } }),
        db.conditionTemplate.findMany(),
        db.dqRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: 4000,
          include: { rule: { select: { column: true, condition: true, severity: true } } },
        }),
        db.dqSignal.count({ where: { status: 'PENDING_REVIEW' } }),
        db.dqException.count({ where: { status: 'PENDING' } }),
        db.dqRun.count(),
        db.conditionTemplate.count({ where: { enabled: true } }),
      ])

    const templateMap = new Map(templates.map((t) => [t.key, t]))

    function engineOf(condition: string): string {
      const t = templateMap.get(condition)
      if (t) return t.engineType
      return isConditionKey(condition) ? condition : 'UNKNOWN'
    }

    function nameOf(condition: string): string {
      return templateMap.get(condition)?.name ?? (isConditionKey(condition) ? CONDITIONS[condition].th : condition)
    }

    function dimensionOf(condition: string, engineType: string): DimensionKey {
      const t = templateMap.get(condition)
      if (t && isDimensionKey(t.dimension)) return t.dimension
      return isConditionKey(engineType) ? CONDITIONS[engineType].dimension : 'VALIDITY'
    }

    const dimensionKeys = Object.keys(DIMENSION_LABELS) as DimensionKey[]
    function clauseNoOf(dimension: DimensionKey): number {
      return dimensionKeys.indexOf(dimension) + 1
    }

    // ---------- ผลรันล่าสุดของแต่ละคู่ (กฎ × ชุดข้อมูล) ----------
    const latestMap = new Map<string, (typeof runsWindow)[number]>()
    for (const run of runsWindow) {
      const key = `${run.ruleId}|${run.datasetId}`
      if (!latestMap.has(key)) latestMap.set(key, run)
    }

    const datasetNameById = new Map(datasets.map((d) => [d.id, d.name]))

    // ---------- รายการผลรันล่าสุด + คำตัดสิน + ความเสี่ยง ----------
    const latestRuns: LatestRun[] = []
    for (const run of latestMap.values()) {
      if (datasetFilter && run.datasetId !== datasetFilter) continue
      const dimension = isDimensionKey(run.dimension) ? run.dimension : 'VALIDITY'
      const engineType = engineOf(run.rule.condition)
      const status = run.status === 'PASSED' ? 'PASSED' : 'FAILED'
      const failRate = run.totalRows > 0 ? run.failedRows / run.totalRows : 0
      const verdict = buildRuleVerdict({ status, totalRows: run.totalRows, failedRows: run.failedRows, dimension, engineType })
      const likelihood = likelihoodOf(failRate)
      const riskScore = (SEVERITY_WEIGHT[run.rule.severity] ?? 3) * likelihood.level
      const { band } = riskBandOf(riskScore)
      latestRuns.push({
        runId: run.id,
        at: run.createdAt.toISOString(),
        datasetId: run.datasetId,
        datasetName: datasetNameById.get(run.datasetId) ?? '(ชุดข้อมูลถูกลบ)',
        ruleId: run.ruleId,
        column: run.rule.column,
        condition: run.rule.condition,
        conditionName: nameOf(run.rule.condition),
        engineType,
        severity: run.rule.severity,
        dimension,
        clauseNo: clauseNoOf(dimension),
        status,
        totalRows: run.totalRows,
        failedRows: run.failedRows,
        passRate: run.passRate,
        verdict,
        advice: status === 'FAILED' ? fixHintFor(engineType, dimension) : null,
        riskScore,
        riskBand: band,
        likelihood,
      })
    }
    latestRuns.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

    // ---------- คะแนนรายมิติ (รวมทั้งระบบ) ----------
    function dimensionScoresOf(
      entries: Iterable<{ dimension: DimensionKey; passRate: number; status: string }>,
    ): DimensionScoreView[] {
      const arrs = new Map<DimensionKey, number[]>()
      const counts = new Map<DimensionKey, number>()
      const fails = new Map<DimensionKey, number>()
      for (const e of entries) {
        const arr = arrs.get(e.dimension) ?? []
        arr.push(e.passRate * 100)
        arrs.set(e.dimension, arr)
        counts.set(e.dimension, (counts.get(e.dimension) ?? 0) + 1)
        if (e.status === 'FAILED') fails.set(e.dimension, (fails.get(e.dimension) ?? 0) + 1)
      }
      return dimensionKeys.map((k) => {
        const arr = arrs.get(k)
        const score = arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
        const grade = gradeOf(score)
        return {
          dimension: k,
          th: DIMENSION_LABELS[k].th,
          en: DIMENSION_LABELS[k].en,
          clauseNo: clauseNoOf(k),
          score,
          grade: grade
            ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass }
            : null,
          rulesCount: counts.get(k) ?? 0,
          failedRules: fails.get(k) ?? 0,
        }
      })
    }

    const globalEntries = [...latestMap.values()].map((run) => ({
      dimension: (isDimensionKey(run.dimension) ? run.dimension : 'VALIDITY') as DimensionKey,
      passRate: run.passRate,
      status: run.status,
    }))
    const dimensions = dimensionScoresOf(globalEntries)
    const scored = dimensions.filter((d) => d.score !== null) as Array<{ score: number }>
    const overallScore = scored.length > 0 ? scored.reduce((a, b) => a + b.score, 0) / scored.length : null
    const overallGrade = gradeOf(overallScore)

    // ---------- ต่อชุดข้อมูล ----------
    const perDataset = datasets.map((d) => {
      const runs = [...latestMap.values()].filter((run) => run.datasetId === d.id)
      const entries = runs.map((run) => ({
        dimension: (isDimensionKey(run.dimension) ? run.dimension : 'VALIDITY') as DimensionKey,
        passRate: run.passRate,
        status: run.status,
      }))
      const dimScores = dimensionScoresOf(entries)
      const measured = dimScores.filter((x) => x.score !== null) as Array<{ score: number }>
      const score = measured.length > 0 ? measured.reduce((a, b) => a + b.score, 0) / measured.length : null
      const grade = gradeOf(score)
      const lastRunAt = runs.map((run) => run.createdAt.toISOString()).sort().reverse()[0] ?? null
      return {
        id: d.id,
        name: d.name,
        sourceType: d.sourceType,
        piiEnabled: d.piiEnabled,
        classification: d.classification,
        ruleCount: d.rules.length,
        lastRunAt,
        score,
        grade: grade ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass } : null,
        pendingSignals: d._count.signals,
        dimensionScores: dimScores,
      }
    })

    // ---------- ความเสี่ยง (Risk — DQ Impact) ----------
    const failedRuns = latestRuns.filter((r) => r.status === 'FAILED')
    const riskCounts: Record<RiskBand, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    const classificationByDataset = new Map(datasets.map((d) => [d.id, d.classification]))
    const riskItems = failedRuns
      .map((r) => {
        const classification = classificationByDataset.get(r.datasetId) ?? null
        const { band, label, className } = riskBandOf(r.riskScore)
        riskCounts[band]++
        return {
          datasetId: r.datasetId,
          datasetName: r.datasetName,
          classification,
          ruleId: r.ruleId,
          column: r.column,
          conditionName: r.conditionName,
          dimension: r.dimension,
          clauseNo: r.clauseNo,
          severity: r.severity,
          failRate: r.totalRows > 0 ? r.failedRows / r.totalRows : 0,
          failedRows: r.failedRows,
          totalRows: r.totalRows,
          riskScore: r.riskScore,
          likelihood: r.likelihood,
          level: { band, label, className },
          impacts: impactsOf(r.dimension, classification),
          advice: r.advice,
          at: r.at,
        }
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.failRate - a.failRate)
      .slice(0, 100)

    const riskByDimension = dimensionKeys.map((k) => {
      const items = riskItems.filter((r) => r.dimension === k)
      return {
        dimension: k,
        th: DIMENSION_LABELS[k].th,
        en: DIMENSION_LABELS[k].en,
        count: items.length,
        maxRiskScore: items.length > 0 ? Math.max(...items.map((r) => r.riskScore)) : 0,
      }
    })

    // ---------- การจำแนกประเภทข้อมูล (Data Classification) ----------
    // นับกฎที่เปิดใช้งานต่อชุดข้อมูลต่อมิติ (จากความสัมพันธ์กฎ ↔ ชุดข้อมูล + มิติของเงื่อนไข)
    const rulesByDatasetByDimension = new Map<string, Map<DimensionKey, number>>()
    for (const rule of rulesEnabled) {
      const dim = dimensionOf(rule.condition, engineOf(rule.condition))
      for (const link of rule.datasets) {
        const byDim = rulesByDatasetByDimension.get(link.datasetId) ?? new Map<DimensionKey, number>()
        byDim.set(dim, (byDim.get(dim) ?? 0) + 1)
        rulesByDatasetByDimension.set(link.datasetId, byDim)
      }
    }

    function dimsScoreOf(datasetIds: string[], dims: DimensionKey[]): { score: number | null; rulesCount: number } {
      let sum = 0
      let n = 0
      let rulesCount = 0
      for (const dsId of datasetIds) {
        const byDim = rulesByDatasetByDimension.get(dsId)
        if (byDim) for (const dim of dims) rulesCount += byDim.get(dim) ?? 0
        const ds = perDataset.find((p) => p.id === dsId)
        if (!ds) continue
        for (const dim of dims) {
          const s = ds.dimensionScores.find((x) => x.dimension === dim)?.score
          if (s !== null && s !== undefined) {
            sum += s
            n++
          }
        }
      }
      return { score: n > 0 ? sum / n : null, rulesCount }
    }

    const classificationCategories = DATA_CLASSIFICATIONS.map((def) => {
      const dsList = perDataset.filter((p) => p.classification === def.id)
      const datasetIds = dsList.map((p) => p.id)
      const withScore = dsList.filter((p) => p.score !== null) as Array<{ score: number }>
      const avgScore = withScore.length > 0 ? withScore.reduce((a, b) => a + b.score, 0) / withScore.length : null
      const focus = dimsScoreOf(datasetIds, def.focusDimensions)
      return {
        id: def.id,
        no: def.no,
        th: def.th,
        en: def.en,
        description: def.description,
        focusDimensions: def.focusDimensions,
        impacts: def.impacts,
        datasetCount: dsList.length,
        avgScore,
        focusScore: focus.score,
        focusRulesCount: focus.rulesCount,
        datasets: dsList.map((p) => ({ id: p.id, name: p.name, score: p.score, lastRunAt: p.lastRunAt, pendingSignals: p.pendingSignals })),
        standards: def.standards.map((s) => {
          const st = dimsScoreOf(datasetIds, s.dims)
          const cov = coverageStatusOf(st.score, st.rulesCount)
          return { name: s.name, dimensions: s.dims, rulesCount: st.rulesCount, score: st.score, ...cov }
        }),
      }
    })

    const unclassified = perDataset
      .filter((p) => p.classification === 'UNCLASSIFIED')
      .map((p) => ({ id: p.id, name: p.name, sourceType: p.sourceType, score: p.score }))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      filterDatasetId: datasetFilter || null,
      overall: {
        score: overallScore,
        grade: overallGrade
          ? {
              band: overallGrade.band,
              label: overallGrade.label,
              badgeClass: overallGrade.badgeClass,
              textClass: overallGrade.textClass,
            }
          : null,
        totals: {
          datasetsTotal: datasets.length,
          datasetsWithRun: perDataset.filter((p) => p.lastRunAt).length,
          rulesEnabled: rulesEnabled.length,
          conditionsEnabled: conditionsCount,
          totalRuns,
          pendingSignals,
          pendingExceptions,
          failedRulesLatest: latestRuns.filter((r) => r.status === 'FAILED').length,
          measuredRulesLatest: latestRuns.length,
        },
        dimensions,
      },
      perDataset,
      latestRuns: latestRuns.slice(0, 60),
      risks: {
        items: riskItems,
        counts: riskCounts,
        byDimension: riskByDimension,
      },
      classification: {
        categories: classificationCategories,
        unclassified,
      },
    })
  } catch (e) {
    console.error('GET /api/dq/analytics', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดข้อมูลแดชบอร์ดได้' }, { status: 500 })
  }
}
