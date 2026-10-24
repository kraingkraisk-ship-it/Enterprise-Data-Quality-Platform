import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  buildRuleSentence,
  evaluateRule,
  generateMlSignals,
  CONDITIONS,
  DIMENSION_LABELS,
  isConditionKey,
  isDimensionKey,
  maskValueByRole,
  type DimensionKey,
  type Row,
} from '@/lib/dq'
import {
  buildRuleVerdict,
  buildRunSummary,
  DAMA_STANDARDS,
  ENGINE_FAILURE_REASONS,
  fixHintFor,
  gradeOf,
  type DimensionResultView,
} from '@/lib/dama'
import { resolveOperator } from '@/lib/operator'
import { evaluateBatch } from '@/lib/ml-engine'
import { evaluateForecastBatch } from '@/lib/forecast-engine'

/** จำกัดจำนวนแถวล้มเหลวที่เก็บ snapshot ต่อกฎต่อรอบ (คุมขนาดฐานข้อมูล — เกินนี้นับเฉพาะสรุปรวม) */
const MAX_FAILURE_ROWS_PER_RULE = 200

export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('datasetId')?.trim()
    if (!datasetId) {
      return NextResponse.json({ error: 'กรุณาระบุ datasetId' }, { status: 400 })
    }
    const runs = await db.dqRun.findMany({
      where: { datasetId },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { rule: { select: { column: true, condition: true, severity: true } } },
    })
    return NextResponse.json({ runs })
  } catch (e) {
    console.error('GET /api/dq/run', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดประวัติการตรวจสอบได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'RUN_VALIDATION')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const datasetId = String(body.datasetId ?? '').trim()
    if (!datasetId) return NextResponse.json({ error: 'กรุณาเลือกชุดข้อมูล' }, { status: 400 })

    const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    // กฎที่ใช้ร่วมกับชุดข้อมูลนี้ (many-to-many ผ่าน RuleDataset)
    const [rulesForDataset, allTemplates] = await Promise.all([
      db.dqRule.findMany({
        where: { enabled: true, datasets: { some: { datasetId } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.conditionTemplate.findMany(),
    ])
    const templateMap = new Map(allTemplates.map((t) => [t.key, t]))

    const sampleRows = await db.sampleRow.findMany({ where: { datasetId }, orderBy: { createdAt: 'asc' } })
    const rows: Row[] = sampleRows.map((r) => {
      try {
        return JSON.parse(r.payload) as Row
      } catch {
        return {}
      }
    })

    // ---------- รันกฎทุกข้อ (enabled) — ประเมินภายใต้มาตราของมิติที่กฎสังกัด ----------
    interface RunResult {
      ruleId: string
      column: string
      condition: string
      conditionName: string
      severity: string
      dimension: DimensionKey
      dimensionTh: string
      dimensionEn: string
      clauseNo: number
      sentence: string
      /** คำตัดสินตามมาตรา (ภาษาไทยอ่านง่าย) — ผ่าน/ไม่ผ่านมาตราใด เพราะอะไร */
      verdict: string
      /** คำแนะนำการแก้ไข (เฉพาะเมื่อล้มเหลว) — เป็นข้อแนะนำ ไม่ใช่การแก้ข้อมูลแทนผู้ใช้ */
      advice: string | null
      status: 'PASSED' | 'FAILED'
      totalRows: number
      failedRows: number
      passRate: number
      failedSamples: string[]
    }
    // ---------- สร้างรอบการตรวจ (batch) — กดรัน 1 ครั้ง = 1 รอบ ครอบผลทุกกฎ ----------
    const batch = await db.dqValidationBatch.create({
      data: { datasetId, triggeredBy: 'MANUAL', createdBy: op.ctx.email },
    })

    const results: RunResult[] = []
    // สะสมผลรายมิติ: อัตราผ่านของกฎแต่ละข้อ + จำนวนกฎ + จำนวนกฎที่ล้มเหลว (เพื่อจัดเกรดตามมาตรา)
    const byDimension = new Map<DimensionKey, number[]>()
    const rulesCountByDimension = new Map<DimensionKey, number>()
    const failedRulesByDimension = new Map<DimensionKey, number>()
    let skipped = 0

    // cache ค่าอ้างอิงของเอนจิน EXISTS_IN_DATASET (INTEGRITY) — กันโหลดซ้ำในกฎที่อ้างชุดข้อมูลเดียวกัน
    const refValuesCache = new Map<string, Set<string>>()
    const refDatasetNameCache = new Map<string, string | null>()

    for (const rule of rulesForDataset) {
      // เงื่อนไขของกฎต้องมาจากคลังเงื่อนไข (หรือเป็นคีย์ระบบเดิม) — ถ้าไม่พบให้ข้ามกฎนี้อย่างชัดเจน
      const template = templateMap.get(rule.condition)
      const engineType = template?.engineType ?? (isConditionKey(rule.condition) ? rule.condition : null)
      if (!engineType) {
        skipped++
        continue
      }
      const dimensionKey: DimensionKey =
        template && isDimensionKey(template.dimension)
          ? template.dimension
          : isConditionKey(engineType)
            ? CONDITIONS[engineType].dimension
            : 'VALIDITY'

      // เอนจิน EXISTS_IN_DATASET — โหลดค่าอ้างอิงจากชุดข้อมูลอ้างอิงที่กำหนดในพารามิเตอร์ของกฎ
      let evalContext: { refValues?: Set<string> } | undefined
      let refDatasetName: string | undefined
      if (engineType === 'EXISTS_IN_DATASET') {
        let refDatasetId = ''
        let refColumn = ''
        try {
          const p = JSON.parse(rule.parameters || '{}') as Record<string, unknown>
          refDatasetId = String(p.refDatasetId ?? '').trim()
          refColumn = String(p.refColumn ?? '').trim()
        } catch {
          refDatasetId = ''
          refColumn = ''
        }
        if (!refDatasetId || !refColumn) {
          // พารามิเตอร์อ้างอิงไม่ครบ — ประเมินไม่ได้ ข้ามและนับใน skipped
          skipped++
          continue
        }
        const cacheKey = `${refDatasetId}|${refColumn}`
        let refValues = refValuesCache.get(cacheKey)
        if (!refValues) {
          const refRows = await db.sampleRow.findMany({ where: { datasetId: refDatasetId }, orderBy: { createdAt: 'asc' } })
          refValues = new Set(
            refRows
              .map((r) => {
                try {
                  const row = JSON.parse(r.payload) as Row
                  const v = row[refColumn]
                  return v === null || v === undefined ? '' : String(v).trim()
                } catch {
                  return ''
                }
              })
              .filter((v) => v !== ''),
          )
          refValuesCache.set(cacheKey, refValues)
        }
        evalContext = { refValues }
        if (!refDatasetNameCache.has(refDatasetId)) {
          const refDataset = await db.dataset.findUnique({ where: { id: refDatasetId }, select: { name: true } })
          refDatasetNameCache.set(refDatasetId, refDataset?.name ?? null)
        }
        refDatasetName = refDatasetNameCache.get(refDatasetId) ?? undefined
      }

      const evaluation = evaluateRule({ column: rule.column, engineType, parameters: rule.parameters }, rows, evalContext)
      const status = evaluation.failedRows === 0 ? 'PASSED' : 'FAILED'
      const passRate = evaluation.totalRows > 0 ? (evaluation.totalRows - evaluation.failedRows) / evaluation.totalRows : 1

      // คำตัดสินตามมาตรา — อ่านง่าย: ผ่าน/ไม่ผ่านมาตราใด เพราะอะไร
      const verdict = buildRuleVerdict({ status, totalRows: evaluation.totalRows, failedRows: evaluation.failedRows, dimension: dimensionKey, engineType })
      const advice = status === 'FAILED' ? fixHintFor(engineType, dimensionKey) : null

      const createdRun = await db.dqRun.create({
        data: {
          ruleId: rule.id,
          datasetId,
          batchId: batch.id,
          status,
          totalRows: evaluation.totalRows,
          failedRows: evaluation.failedRows,
          passRate,
          dimension: dimensionKey,
        },
      })

      // ---------- บันทึกแถวที่ล้มเหลวรายแถว (snapshot — mask ตอนอ่านตามบทบาท, cap 200 แถว/กฎ/รอบ) ----------
      if (evaluation.failedRows > 0) {
        const reasonBase =
          ENGINE_FAILURE_REASONS[engineType] ?? `ไม่ผ่านเงื่อนไข ${template?.name ?? rule.condition}`
        await db.dqFailureRecord.createMany({
          data: evaluation.failedIndexes.slice(0, MAX_FAILURE_ROWS_PER_RULE).map((idx) => ({
            batchId: batch.id,
            runId: createdRun.id,
            datasetId,
            ruleId: rule.id,
            dimension: dimensionKey,
            severity: rule.severity,
            rowNo: idx + 1,
            rowData: JSON.stringify(rows[idx] ?? {}),
            reason: reasonBase,
          })),
        })
      }

      // failed samples — แสดงค่าที่ล้มเหลว (ปิดบัง PII ตามบทบาทผู้รัน)
      const failedSamples = evaluation.failedIndexes.slice(0, 3).map((idx) => {
        const v = rows[idx]?.[rule.column]
        const shown = maskValueByRole(rule.column, v, op.ctx.role, dataset.piiEnabled)
        return `แถว #${idx + 1}${shown !== '' ? `: ${shown}` : ' (ค่าว่าง)'}`
      })

      const arr = byDimension.get(dimensionKey) ?? []
      arr.push(passRate * 100)
      byDimension.set(dimensionKey, arr)
      rulesCountByDimension.set(dimensionKey, (rulesCountByDimension.get(dimensionKey) ?? 0) + 1)
      if (status === 'FAILED') {
        failedRulesByDimension.set(dimensionKey, (failedRulesByDimension.get(dimensionKey) ?? 0) + 1)
      }

      results.push({
        ruleId: rule.id,
        column: rule.column,
        condition: rule.condition,
        conditionName: template?.name ?? rule.condition,
        severity: rule.severity,
        dimension: dimensionKey,
        dimensionTh: DIMENSION_LABELS[dimensionKey].th,
        dimensionEn: DIMENSION_LABELS[dimensionKey].en,
        clauseNo: DAMA_STANDARDS[dimensionKey].clauseNo,
        sentence: buildRuleSentence({
          datasetName: dataset.name,
          column: rule.column,
          condition: rule.condition,
          conditionSentence: template?.sentence,
          engineType,
          refDatasetName,
          parameters: rule.parameters,
          severity: rule.severity,
          filter: rule.filter,
        }),
        verdict,
        advice,
        status,
        totalRows: evaluation.totalRows,
        failedRows: evaluation.failedRows,
        passRate,
        failedSamples,
      })
    }

    // ---------- สัญญาณจากกฎที่ล้มเหลว (ต้องมนุษย์ทบทวน) ----------
    const pendingTitles = new Set(
      (
        await db.dqSignal.findMany({
          where: { datasetId, status: 'PENDING_REVIEW' },
          select: { kind: true, title: true },
        })
      ).map((s) => `${s.kind}|${s.title}`),
    )
    let newSignals = 0

    for (const r of results) {
      if (r.status !== 'FAILED') continue
      const title = `กฎล้มเหลว: ${r.column} — ${r.conditionName}`
      if (pendingTitles.has(`RULE_VIOLATION|${title}`)) continue
      await db.dqSignal.create({
        data: {
          datasetId,
          kind: 'RULE_VIOLATION',
          dimension: r.dimension,
          title,
          detail: `${r.sentence} — ล้มเหลว ${r.failedRows}/${r.totalRows} แถว (${r.failedSamples.join('; ')}) โปรดทบทวนและดำเนินการโดยมนุษย์ (ระบบไม่แก้ไขข้อมูลต้นทาง)`,
          severity: r.severity,
          status: 'PENDING_REVIEW',
        },
      })
      pendingTitles.add(`RULE_VIOLATION|${title}`)
      newSignals++
    }

    // ---------- สัญญาณ ML (outlier / near-duplicate / schema / volume) ----------
    for (const draft of generateMlSignals(rows)) {
      if (pendingTitles.has(`ML_ANOMALY|${draft.title}`)) continue
      await db.dqSignal.create({
        data: {
          datasetId,
          kind: 'ML_ANOMALY',
          dimension: draft.dimension,
          title: draft.title,
          detail: draft.detail,
          severity: draft.severity,
          status: 'PENDING_REVIEW',
        },
      })
      pendingTitles.add(`ML_ANOMALY|${draft.title}`)
      newSignals++
    }

    // ---------- สรุปคะแนนรายมาตรา (ครบทั้ง 9 มาตรา — score = null เมื่อไม่มีกฎในมิตินั้น) ----------
    const dimensionScores: DimensionResultView[] = (
      Object.keys(DIMENSION_LABELS) as DimensionKey[]
    ).map((k) => {
      const arr = byDimension.get(k)
      const score = arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
      const grade = gradeOf(score)
      const rulesCount = rulesCountByDimension.get(k) ?? 0
      const failedRules = failedRulesByDimension.get(k) ?? 0
      return {
        dimension: k,
        th: DIMENSION_LABELS[k].th,
        en: DIMENSION_LABELS[k].en,
        clauseNo: DAMA_STANDARDS[k].clauseNo,
        statement: DAMA_STANDARDS[k].statement,
        measure: DAMA_STANDARDS[k].measure,
        formula: DAMA_STANDARDS[k].formula,
        score,
        grade: grade
          ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, barClass: grade.barClass, textClass: grade.textClass }
          : null,
        rulesCount,
        failedRules,
        advice: grade && (grade.band === 'FAIR' || grade.band === 'POOR') ? DAMA_STANDARDS[k].advice : null,
      }
    })
    const scored = dimensionScores.filter((d) => d.score !== null) as Array<{ score: number }>
    const overallScore = scored.length > 0 ? scored.reduce((a, b) => a + b.score, 0) / scored.length : null

    const passedCount = results.filter((r) => r.status === 'PASSED').length
    const failedCount = results.length - passedCount
    const summary = buildRunSummary({
      rowsCount: rows.length,
      rulesCount: rulesForDataset.length,
      passedRules: passedCount,
      failedRules: failedCount,
      overallScore,
    })
    const overallGrade = gradeOf(overallScore)

    // ---------- สรุปผลรอบการตรวจ (batch) ----------
    await db.dqValidationBatch.update({
      where: { id: batch.id },
      data: {
        totalRules: results.length,
        passedRules: passedCount,
        failedRules: failedCount,
        skippedRules: skipped,
        overallScore,
      },
    })

    // ---------- ML ประเมินอัตโนมัติหลังรันจบ (v0.25.0 — ① anomaly + ④ cluster) ----------
    // ห่อ try/catch แยก: ML ล้มเหลว = การรัน validation ยังสำเร็จปกติ (บันทึก ml ผลเป็น null)
    let ml: { anomalies: number; clusters: number } | null = null
    try {
      const mlResult = await evaluateBatch(batch.id)
      ml = { anomalies: mlResult.anomalies.length, clusters: mlResult.clusters.length }
    } catch (mlErr) {
      console.error('ML evaluation failed (non-blocking)', mlErr)
    }

    // ---------- พยากรณ์แนวโน้มอัตโนมัติหลังรันจบ (v0.27.0 — ③ forecast) — try/catch แยกเช่นเดียวกับ ML ----------
    let forecastCount = 0
    try {
      const fcResult = await evaluateForecastBatch(batch.id)
      forecastCount = fcResult.forecasts.length
    } catch (fcErr) {
      console.error('Forecast evaluation failed (non-blocking)', fcErr)
    }

    await db.auditLog.create({
      data: {
        action: 'RUN_VALIDATION',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `รันตรวจสอบ ${rulesForDataset.length} กฎ บน ${rows.length} แถว (sandbox) — ผ่าน ${passedCount}, ล้มเหลว ${results.length - passedCount}, สัญญาณใหม่ ${newSignals} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      batchId: batch.id,
      datasetName: dataset.name,
      rowsCount: rows.length,
      rulesCount: rulesForDataset.length,
      skipped,
      results,
      newSignals,
      ml,
      overallScore,
      overallGrade: overallGrade
        ? { band: overallGrade.band, label: overallGrade.label, badgeClass: overallGrade.badgeClass, textClass: overallGrade.textClass }
        : null,
      summary,
      // ครบทั้ง 9 มาตรา — มิติที่ไม่มีกฎจะมี score = null (แสดงว่า "ยังไม่ได้ประเมิน")
      dimensionScores,
    })
  } catch (e) {
    console.error('POST /api/dq/run', e)
    return NextResponse.json({ error: 'ไม่สามารถรันการตรวจสอบได้' }, { status: 500 })
  }
}
