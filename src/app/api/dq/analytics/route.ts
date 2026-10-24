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
  CLASSIFICATION_KEYS,
  DATA_CLASSIFICATIONS,
  FRAMEWORKS,
  UNCLASSIFIED,
  classificationLabel,
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

    // ---------- มาตรฐานข้อมูล (Regulation — v0.23.0) ----------
    // คะแนน = ค่าที่วัดได้จากกฎ DQ ล่าสุด ("ข้อมูลเดิมไม่มีกฎ = 0" ให้ frontend ใช้เป็นจุดเทียบ)
    // คะแนนส่วนย่อย (domain) = เฉลี่ยคะแนนมิติใน domain นั้น (ข้ามมิติที่ยังไม่มีผลตรวจ)
    // คะแนนกรอบ = Σ(คะแนนส่วนย่อย × น้ำหนัก) / Σ(น้ำหนัก) เฉพาะส่วนย่อยที่วัดได้
    const globalScoreByDimension = new Map<DimensionKey, number | null>(dimensions.map((d) => [d.dimension, d.score]))
    const dimensionOfRule = new Map<string, DimensionKey>()
    for (const rule of rulesEnabled) {
      dimensionOfRule.set(rule.id, dimensionOf(rule.condition, engineOf(rule.condition)))
    }

    function avgOf(nums: number[]): number | null {
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null
    }

    function dimensionScoresForDataset(p: (typeof perDataset)[number], dims: DimensionKey[]): number[] {
      const out: number[] = []
      for (const dim of dims) {
        const s = p.dimensionScores.find((x) => x.dimension === dim)?.score
        if (typeof s === 'number') out.push(s)
      }
      return out
    }

    function gradeView(score: number | null) {
      const g = gradeOf(score)
      return g ? { band: g.band, label: g.label, badgeClass: g.badgeClass, textClass: g.textClass } : null
    }

    const regulationFrameworks = FRAMEWORKS.map((fw) => {
      const fwDimSet = new Set<DimensionKey>()
      for (const dom of fw.domains) for (const dim of dom.dimensions) fwDimSet.add(dim)

      const domains = fw.domains.map((dom) => {
        const globalScores = dom.dimensions
          .map((dim) => globalScoreByDimension.get(dim))
          .filter((s): s is number => typeof s === 'number')
        const rulesCount = [...dimensionOfRule.entries()].filter(([, dim]) => dom.dimensions.includes(dim)).length
        const perDatasetView = perDataset.map((p) => {
          const byDim = rulesByDatasetByDimension.get(p.id)
          const dsRulesCount = byDim ? dom.dimensions.reduce((s, dim) => s + (byDim.get(dim) ?? 0), 0) : 0
          return { datasetId: p.id, score: avgOf(dimensionScoresForDataset(p, dom.dimensions)), rulesCount: dsRulesCount }
        })
        return {
          id: dom.id,
          th: dom.th,
          en: dom.en,
          detail: dom.detail,
          category: dom.category ?? null,
          weight: dom.weight,
          dimensions: [...dom.dimensions],
          score: avgOf(globalScores),
          rulesCount,
          perDataset: perDatasetView,
        }
      })

      let wSum = 0
      let wTotal = 0
      for (const dom of domains) {
        if (dom.score !== null) {
          wSum += dom.score * dom.weight
          wTotal += dom.weight
        }
      }

      const fwDatasets = perDataset.map((p) => {
        let sum = 0
        let w = 0
        for (const dom of fw.domains) {
          if (dom.dimensions.length === 0) continue
          const dsScore = avgOf(dimensionScoresForDataset(p, dom.dimensions))
          if (dsScore === null) continue
          sum += dsScore * dom.weight
          w += dom.weight
        }
        const score = w > 0 ? sum / w : null
        const byDim = rulesByDatasetByDimension.get(p.id)
        const rulesCount = byDim ? [...fwDimSet].reduce((s, dim) => s + (byDim.get(dim) ?? 0), 0) : 0
        return { datasetId: p.id, name: p.name, rulesCount, score, lastRunAt: p.lastRunAt, grade: gradeView(score) }
      })

      return {
        id: fw.id,
        no: fw.no,
        groupTh: fw.groupTh,
        name: fw.name,
        fullName: fw.fullName,
        description: fw.description,
        totalDomains: fw.domains.length,
        measuredDomains: fw.domains.filter((d) => d.dimensions.length > 0).length,
        weightedScore: wTotal > 0 ? wSum / wTotal : null,
        domains,
        datasets: fwDatasets,
      }
    })

    // ---------- ความเสี่ยง Inherent vs Residual (v0.23.0) ----------
    // Inherent = สมมติยังไม่มีกฎ DQ รองรับ → โอกาสเกิดระดับ 5 (สูงมาก) × น้ำหนักความรุนแรงของกฎ
    // Residual = ความเสี่ยงคงเหลือจากผลตรวจจริงล่าสุด — ใช้ latestRuns ทั้ง PASSED และ FAILED
    //           (PASSED → อัตราล้มเหลว 0 → โอกาสเกิดระดับ 1)
    interface InherentPair {
      ruleId: string
      datasetId: string
      dimension: DimensionKey
      severity: string
      failRate: number
      classification: string
    }

    const severityWOf = (severity: string) => SEVERITY_WEIGHT[severity] ?? 3

    const inherentPairs: InherentPair[] = latestRuns.map((r) => ({
      ruleId: r.ruleId,
      datasetId: r.datasetId,
      dimension: r.dimension,
      severity: r.severity,
      failRate: r.totalRows > 0 ? r.failedRows / r.totalRows : 0,
      classification: classificationByDataset.get(r.datasetId) ?? UNCLASSIFIED,
    }))

    const inherentPairsByRule = new Map<string, InherentPair[]>()
    for (const p of inherentPairs) {
      const arr = inherentPairsByRule.get(p.ruleId) ?? []
      arr.push(p)
      inherentPairsByRule.set(p.ruleId, arr)
    }

    // กฎ enabled ที่ผูกชุดข้อมูล (unique ruleId) — แยกวัดแล้ว (มี latest run) / ยังไม่วัด
    const enabledLinkedRuleIds = new Set<string>()
    for (const rule of rulesEnabled) {
      if (rule.datasets.length > 0) enabledLinkedRuleIds.add(rule.id)
    }
    const measuredRuleIds = new Set(inherentPairsByRule.keys())
    const unmeasuredRules = [...enabledLinkedRuleIds].filter((id) => !measuredRuleIds.has(id)).length

    function inherentStatsOf(ruleIds: Iterable<string>) {
      let inherentSum = 0
      let residualSum = 0
      let n = 0
      for (const ruleId of ruleIds) {
        const pairs = inherentPairsByRule.get(ruleId)
        if (!pairs || pairs.length === 0) continue
        const sevW = severityWOf(pairs[0].severity)
        inherentSum += 5 * sevW
        // กฎที่ใช้กับหลายชุดข้อมูล — เฉลี่ยความเสี่ยงคงเหลือของคู่ที่อยู่ในขอบเขตนั้นก่อน (1 กฎ = 1 คะแนน)
        const residual = avgOf(pairs.map((p) => likelihoodOf(p.failRate).level * sevW)) ?? 0
        residualSum += residual
        n++
      }
      const inherentAvg = n > 0 ? inherentSum / n : 0
      const residualAvg = n > 0 ? residualSum / n : 0
      return {
        inherentAvg,
        residualAvg,
        reductionPct: inherentAvg > 0 ? Math.max(0, (1 - residualAvg / inherentAvg) * 100) : 0,
      }
    }

    const overallInherent = inherentStatsOf(measuredRuleIds)

    const inherentByDimension = dimensionKeys.map((k) => {
      const ruleIds = new Set(inherentPairs.filter((p) => p.dimension === k).map((p) => p.ruleId))
      const rulesCount = [...dimensionOfRule.entries()].filter(([, dim]) => dim === k).length
      return { dimension: k, th: DIMENSION_LABELS[k].th, en: DIMENSION_LABELS[k].en, ...inherentStatsOf(ruleIds), rulesCount }
    })

    const inherentByFramework = FRAMEWORKS.map((fw) => {
      const dimSet = new Set<DimensionKey>()
      for (const dom of fw.domains) for (const dim of dom.dimensions) dimSet.add(dim)
      const ruleIds = new Set(inherentPairs.filter((p) => dimSet.has(p.dimension)).map((p) => p.ruleId))
      const rulesCount = [...dimensionOfRule.entries()].filter(([, dim]) => dimSet.has(dim)).length
      return { frameworkId: fw.id, name: fw.name, no: fw.no, ...inherentStatsOf(ruleIds), rulesCount }
    })

    // ผ่านการจำแนกประเภทของชุดข้อมูลที่กฎผูก (กฎหนึ่งอาจปรากฏหลายประเภท — นับ unique ต่อประเภท)
    const classificationRuleIds = new Map<string, Set<string>>()
    for (const p of inherentPairs) {
      const s = classificationRuleIds.get(p.classification) ?? new Set<string>()
      s.add(p.ruleId)
      classificationRuleIds.set(p.classification, s)
    }
    const inherentByClassification = CLASSIFICATION_KEYS.filter((id) => (classificationRuleIds.get(id)?.size ?? 0) > 0).map((id) => {
      const ruleIds = classificationRuleIds.get(id)!
      const datasetIdsOfClass = new Set(datasets.filter((d) => (d.classification ?? UNCLASSIFIED) === id).map((d) => d.id))
      let rulesCount = 0
      for (const rule of rulesEnabled) {
        if (rule.datasets.some((link) => datasetIdsOfClass.has(link.datasetId))) rulesCount++
      }
      const label = classificationLabel(id)
      return { id, th: label.th, en: label.en, no: label.no, ...inherentStatsOf(ruleIds), rulesCount }
    })

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
      regulation: {
        frameworks: regulationFrameworks,
      },
      risks: {
        items: riskItems,
        counts: riskCounts,
        byDimension: riskByDimension,
        inherent: {
          measuredRules: measuredRuleIds.size,
          unmeasuredRules,
          inherentAvg: overallInherent.inherentAvg,
          residualAvg: overallInherent.residualAvg,
          reductionPct: overallInherent.reductionPct,
          byDimension: inherentByDimension,
          byFramework: inherentByFramework,
          byClassification: inherentByClassification,
        },
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
