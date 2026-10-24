import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CONDITIONS, isConditionKey, isDimensionKey, type DimensionKey } from '@/lib/dq'
import { FRAMEWORKS, likelihoodOf, SEVERITY_WEIGHT } from '@/lib/regulation'

/* ------------------------------------------------------------------------
 * Compliance Assessment API (v0.24.0) — "Risk-first Compliance Assessment"
 * แปลงข้อกำหนด (clause = domain) ของมาตรฐาน 5 กรอบเป็นสถานะรายชุดข้อมูลจริง:
 *   - ข้อกำหนดแมปกับมิติ DQ (clause.dimensions) → กฎ DQ ที่ตรวจมิตินั้นคือ "เกณฑ์ตรวจ" ของข้อ
 *   - สถานะรายชุดข้อมูลตัดสินด้วย threshold ของกฎแต่ละตัว (มติผู้ใช้ v0.24.0)
 *   - ความเสี่ยง: Inherent = โอกาสเกิดสูงสุด 5 × น้ำหนักความรุนแรง (ก่อนมีกฎ)
 *                 Residual = likelihoodOf(failRate ล่าสุดจริง) × น้ำหนักความรุนแรง
 *   - สูตรคะแนน/ความเสี่ยงใช้ตรรกะเดียวกับ /api/dq/analytics (v0.23.0) เพื่อให้ตัวเลขสอดคล้องกัน
 * ---------------------------------------------------------------------- */

type ClauseStatus = 'PASS' | 'FAIL' | 'NOT_ASSESSED'

interface ComplianceDatasetRow {
  id: string
  name: string
  classification: string | null
}

/** กฎ 1 ตัวในขอบเขตข้อกำหนด × ชุดข้อมูล (รวมกฎที่ยังไม่เคยรัน — ค่า null = ยังไม่มีผลตรวจ) */
interface ClauseRuleView {
  ruleId: string
  label: string
  column: string
  conditionName: string
  severity: string
  threshold: number
  latestPassRate: number | null
  latestRunAt: string | null
  failRate: number | null
  meetsThreshold: boolean | null
  inherent: number | null
  residual: number | null
}

/** สถานะข้อกำหนด 1 ข้อ ในชุดข้อมูล 1 ชุด (ครบทุกชุด ACTIVE เสมอ) */
interface ClauseDatasetView {
  datasetId: string
  datasetName: string
  status: ClauseStatus
  score: number | null
  rulesCount: number
  measuredRules: number
  inherentAvg: number | null
  residualAvg: number | null
  reductionPct: number | null
  rules: ClauseRuleView[]
}

interface ClauseView {
  id: string
  th: string
  en: string
  detail: string
  category: string | null
  dimensions: string[]
  weight: number
  measurable: boolean
  assessed: boolean
  status: ClauseStatus
  score: number | null
  passDatasets: number
  failDatasets: number
  notAssessedDatasets: number
  inherentAvg: number | null
  residualAvg: number | null
  reductionPct: number | null
  perDataset: ClauseDatasetView[]
}

interface FrameworkView {
  id: string
  no: string
  name: string
  fullName: string
  groupTh: string
  description: string
  rulesCount: number
  inherentAvg: number
  residualAvg: number
  reductionPct: number
  totalClauses: number
  measurableClauses: number
  assessedClauses: number
  weightedScore: number | null
  clauses: ClauseView[]
}

/** ประวัติผลรันของกฎที่วัดได้ (drill-down กราฟ) — เรียงเวลาเก่า → ใหม่ */
interface RuleHistoryRow {
  ruleId: string
  label: string
  severity: string
  points: Array<{ at: string; passRate: number }>
}

export async function GET() {
  try {
    const [datasets, rulesEnabled, templates, runsWindow] = await Promise.all([
      db.dataset.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
      db.dqRule.findMany({ where: { enabled: true }, include: { datasets: { select: { datasetId: true } } } }),
      db.conditionTemplate.findMany(),
      db.dqRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4000,
        include: { rule: { select: { column: true, condition: true, severity: true } } },
      }),
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

    // มิติของกฎ/เงื่อนไข — อ้างจากคลังเงื่อนไข (เทมเพลต) เสมอ ไม่ใช้ snapshot ของ DqRun (เหมือน analytics)
    function dimensionOf(condition: string, engineType: string): DimensionKey {
      const t = templateMap.get(condition)
      if (t && isDimensionKey(t.dimension)) return t.dimension
      return isConditionKey(engineType) ? CONDITIONS[engineType].dimension : 'VALIDITY'
    }

    const severityWOf = (severity: string) => SEVERITY_WEIGHT[severity] ?? 3
    const failRateOf = (run: { totalRows: number; failedRows: number }) =>
      run.totalRows > 0 ? run.failedRows / run.totalRows : 0

    function avgOf(nums: number[]): number | null {
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null
    }

    type RunRow = (typeof runsWindow)[number]

    // ---------- ผลรันล่าสุดของแต่ละคู่ (กฎ × ชุดข้อมูล) ----------
    const latestMap = new Map<string, RunRow>()
    for (const run of runsWindow) {
      const key = `${run.ruleId}|${run.datasetId}`
      if (!latestMap.has(key)) latestMap.set(key, run)
    }

    // มิติของกฎที่เปิดใช้งาน (จากเทมเพลต) — fallback จากผลรันสำหรับกฎที่ปิดไปแล้วแต่มีประวัติ
    const dimensionOfRule = new Map<string, DimensionKey>()
    for (const rule of rulesEnabled) {
      dimensionOfRule.set(rule.id, dimensionOf(rule.condition, engineOf(rule.condition)))
    }
    function dimOfRun(run: RunRow): DimensionKey {
      return dimensionOfRule.get(run.ruleId) ?? dimensionOf(run.rule.condition, engineOf(run.rule.condition))
    }

    // จัดกลุ่มคู่ล่าสุดตามกฎ — ใช้คำนวณความเสี่ยงระดับ "กฎ" (1 กฎ = 1 คะแนน)
    const pairsByRule = new Map<string, RunRow[]>()
    for (const run of latestMap.values()) {
      const arr = pairsByRule.get(run.ruleId) ?? []
      arr.push(run)
      pairsByRule.set(run.ruleId, arr)
    }

    // ---------- คะแนนรายมิติ (สูตร v0.23.0: เฉลี่ย passRate×100 ของกฎในมิตินั้น) ----------
    const dimScoresGlobal = new Map<DimensionKey, number[]>()
    const dimScoresByDataset = new Map<string, Map<DimensionKey, number[]>>()
    for (const run of latestMap.values()) {
      const dim = dimOfRun(run)
      const g = dimScoresGlobal.get(dim) ?? []
      g.push(run.passRate * 100)
      dimScoresGlobal.set(dim, g)
      const byDim = dimScoresByDataset.get(run.datasetId) ?? new Map<DimensionKey, number[]>()
      const arr = byDim.get(dim) ?? []
      arr.push(run.passRate * 100)
      byDim.set(dim, arr)
      dimScoresByDataset.set(run.datasetId, byDim)
    }
    const globalScoreByDim = new Map<DimensionKey, number | null>()
    for (const [dim, arr] of dimScoresGlobal) globalScoreByDim.set(dim, avgOf(arr))

    // ---------- กฎที่เปิดใช้งาน จัดกลุ่มตามชุดข้อมูล (RuleDataset) ----------
    const rulesByDataset = new Map<string, typeof rulesEnabled>()
    for (const rule of rulesEnabled) {
      for (const link of rule.datasets) {
        const arr = rulesByDataset.get(link.datasetId) ?? []
        arr.push(rule)
        rulesByDataset.set(link.datasetId, arr)
      }
    }

    // ---------- ความเสี่ยงระดับกฎ (เหมือน inherentStatsOf ของ analytics) ----------
    // 1 กฎ = 1 คะแนน — residual ของกฎ = เฉลี่ยคู่ชุดข้อมูลที่วัดได้ก่อน แล้วเฉลี่ยข้ามกฎ
    function inherentStatsOf(ruleIds: Iterable<string>): { inherentAvg: number; residualAvg: number; reductionPct: number } {
      let inherentSum = 0
      let residualSum = 0
      let n = 0
      for (const ruleId of ruleIds) {
        const pairs = pairsByRule.get(ruleId)
        if (!pairs || pairs.length === 0) continue
        const sevW = severityWOf(pairs[0].rule.severity)
        inherentSum += 5 * sevW
        residualSum += pairs.reduce((s, run) => s + likelihoodOf(failRateOf(run)).level * sevW, 0) / pairs.length
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

    // กฎที่วัดได้ (มีผลรันล่าสุด) ในขอบเขตมิติที่กำหนด
    function measuredRuleIdsInDims(dims: ReadonlySet<DimensionKey>): string[] {
      const ids = new Set<string>()
      for (const run of latestMap.values()) {
        if (dims.has(dimOfRun(run))) ids.add(run.ruleId)
      }
      return [...ids]
    }

    function riskOrNull(ruleIds: string[]): {
      inherentAvg: number | null
      residualAvg: number | null
      reductionPct: number | null
    } {
      if (ruleIds.length === 0) return { inherentAvg: null, residualAvg: null, reductionPct: null }
      return inherentStatsOf(ruleIds)
    }

    // ---------- เรียงมาตรฐาน 5 กรอบ ----------
    const complianceFrameworks: FrameworkView[] = FRAMEWORKS.map((fw) => {
      const fwDimSet = new Set<DimensionKey>()
      for (const dom of fw.domains) for (const dim of dom.dimensions) fwDimSet.add(dim)

      // HERO ระดับกรอบ — สูตรระดับ "กฎ" 1 กฎ = 1 คะแนน (นับเฉพาะกฎที่วัดได้ มีผลรันล่าสุดจริง)
      const fwMeasuredRuleIds = measuredRuleIdsInDims(fwDimSet)
      const fwRisk = inherentStatsOf(fwMeasuredRuleIds)

      const clauses: ClauseView[] = fw.domains.map((dom) => {
        const dimSet = new Set<DimensionKey>(dom.dimensions)
        const measurable = dom.dimensions.length > 0
        const dimOfRule = (rule: (typeof rulesEnabled)[number]): DimensionKey =>
          dimensionOfRule.get(rule.id) ?? dimensionOf(rule.condition, engineOf(rule.condition))

        const perDataset: ClauseDatasetView[] = datasets.map((d) => {
          // กฎในขอบเขตข้อ = กฎ enabled ที่ผูกชุดข้อมูลนี้ (RuleDataset) และมิติตรงกับข้อ
          // ข้อระดับกระบวนการ (dimensions []) → ไม่มีเกณฑ์ตรวจ → NOT_ASSESSED ทุกชุดข้อมูล
          const scoped = measurable ? (rulesByDataset.get(d.id) ?? []).filter((rule) => dimSet.has(dimOfRule(rule))) : []
          const measuredPairs = scoped
            .map((rule) => ({ rule, latest: latestMap.get(`${rule.id}|${d.id}`) ?? null }))
            .filter((x): x is { rule: (typeof rulesEnabled)[number]; latest: RunRow } => x.latest !== null)

          const rules: ClauseRuleView[] = scoped.map((rule) => {
            const latest = latestMap.get(`${rule.id}|${d.id}`) ?? null
            const sevW = severityWOf(rule.severity)
            return {
              ruleId: rule.id,
              label: `${rule.column} · ${nameOf(rule.condition)}`,
              column: rule.column,
              conditionName: nameOf(rule.condition),
              severity: rule.severity,
              threshold: rule.threshold,
              latestPassRate: latest ? latest.passRate : null,
              latestRunAt: latest ? latest.createdAt.toISOString() : null,
              failRate: latest ? failRateOf(latest) : null,
              meetsThreshold: latest ? latest.passRate * 100 >= rule.threshold : null,
              // Inherent มีค่าเสมอเมื่อกฎแมปอยู่ (แม้ยังไม่เคยรัน) — Residual ต้องมีผลรันจริง
              inherent: 5 * sevW,
              residual: latest ? likelihoodOf(failRateOf(latest)).level * sevW : null,
            }
          })

          // สถานะรายชุดข้อมูล — ตัดสินด้วย threshold ของกฎแต่ละตัว (มติผู้ใช้ v0.24.0)
          const status: ClauseStatus =
            measuredPairs.length === 0
              ? 'NOT_ASSESSED'
              : measuredPairs.some(({ rule, latest }) => latest.passRate * 100 < rule.threshold)
                ? 'FAIL'
                : 'PASS'

          // คะแนนรายชุดข้อมูล = เฉลี่ยคะแนนมิติในข้อ (ระดับมิติก่อน แล้วเฉลี่ยข้ามมิติ)
          const byDim = dimScoresByDataset.get(d.id)
          const dimScores = dom.dimensions
            .map((dim) => (byDim ? avgOf(byDim.get(dim) ?? []) : null))
            .filter((s): s is number => s !== null)
          const score = dimScores.length > 0 ? avgOf(dimScores) : null

          const inherentAvg =
            measuredPairs.length > 0 ? avgOf(measuredPairs.map(({ rule }) => 5 * severityWOf(rule.severity))) : null
          const residualAvg =
            measuredPairs.length > 0
              ? avgOf(measuredPairs.map(({ rule, latest }) => likelihoodOf(failRateOf(latest)).level * severityWOf(rule.severity)))
              : null
          const reductionPct =
            inherentAvg !== null && residualAvg !== null && inherentAvg > 0
              ? Math.max(0, (1 - residualAvg / inherentAvg) * 100)
              : null

          return {
            datasetId: d.id,
            datasetName: d.name,
            status,
            score,
            rulesCount: scoped.length,
            measuredRules: measuredPairs.length,
            inherentAvg,
            residualAvg,
            reductionPct,
            rules,
          }
        })

        const passDatasets = perDataset.filter((p) => p.status === 'PASS').length
        const failDatasets = perDataset.filter((p) => p.status === 'FAIL').length
        const notAssessedDatasets = perDataset.length - passDatasets - failDatasets
        const assessed = passDatasets + failDatasets > 0

        // สถานะรวมทุกชุดข้อมูล: FAIL ชนะเสมอ → PASS → NOT_ASSESSED
        const status: ClauseStatus = failDatasets > 0 ? 'FAIL' : passDatasets > 0 ? 'PASS' : 'NOT_ASSESSED'

        // คะแนนข้อ = เฉลี่ยคะแนนมิติของข้อข้ามชุดข้อมูล (สูตรเดียวกับ v0.23.0)
        const clauseDimScores = dom.dimensions
          .map((dim) => globalScoreByDim.get(dim))
          .filter((s): s is number => typeof s === 'number')
        const score = clauseDimScores.length > 0 ? avgOf(clauseDimScores) : null

        const risk = riskOrNull(measuredRuleIdsInDims(dimSet))

        return {
          id: dom.id,
          th: dom.th,
          en: dom.en,
          detail: dom.detail,
          category: dom.category ?? null,
          dimensions: [...dom.dimensions],
          weight: dom.weight,
          measurable,
          assessed,
          status,
          score,
          passDatasets,
          failDatasets,
          notAssessedDatasets,
          inherentAvg: risk.inherentAvg,
          residualAvg: risk.residualAvg,
          reductionPct: risk.reductionPct,
          perDataset,
        }
      })

      // คะแนนกรอบ = Σ(คะแนนข้อ × น้ำหนัก) / Σ(น้ำหนัก) เฉพาะข้อที่วัดได้และมี score
      let wSum = 0
      let wTotal = 0
      for (const clause of clauses) {
        if (clause.score !== null) {
          wSum += clause.score * clause.weight
          wTotal += clause.weight
        }
      }

      return {
        id: fw.id,
        no: fw.no,
        name: fw.name,
        fullName: fw.fullName,
        groupTh: fw.groupTh,
        description: fw.description,
        rulesCount: fwMeasuredRuleIds.length,
        inherentAvg: fwRisk.inherentAvg,
        residualAvg: fwRisk.residualAvg,
        reductionPct: fwRisk.reductionPct,
        totalClauses: fw.domains.length,
        measurableClauses: fw.domains.filter((dom) => dom.dimensions.length > 0).length,
        assessedClauses: clauses.filter((c) => c.assessed).length,
        weightedScore: wTotal > 0 ? wSum / wTotal : null,
        clauses,
      }
    })

    // ---------- ประวัติผลรันทั้งหมดของกฎที่วัดได้ (กราฟ drill-down ~14 รอบ) ----------
    const historyByRule = new Map<string, RunRow[]>()
    for (const run of runsWindow) {
      if (!pairsByRule.has(run.ruleId)) continue // เฉพาะกฎที่มีผลรันล่าสุด ("กฎที่วัดได้")
      const arr = historyByRule.get(run.ruleId) ?? []
      arr.push(run)
      historyByRule.set(run.ruleId, arr)
    }
    const ruleHistory: RuleHistoryRow[] = [...historyByRule.entries()]
      .map(([ruleId, runs]) => ({
        ruleId,
        label: `${runs[0].rule.column} · ${nameOf(runs[0].rule.condition)}`,
        severity: runs[0].rule.severity,
        points: runs
          .map((r) => ({ at: r.createdAt.toISOString(), passRate: r.passRate }))
          .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)), // เก่า → ใหม่
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      datasets: datasets.map((d) => ({ id: d.id, name: d.name, classification: d.classification })),
      frameworks: complianceFrameworks,
      ruleHistory,
    })
  } catch (e) {
    console.error('GET /api/dq/compliance', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดข้อมูลการประเมินความสอดคล้องได้' }, { status: 500 })
  }
}
