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
import { resolveOperator } from '@/lib/operator'

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

    // ---------- รันกฎทุกข้อ (enabled) ----------
    interface RunResult {
      ruleId: string
      column: string
      condition: string
      conditionName: string
      severity: string
      dimension: DimensionKey
      dimensionTh: string
      sentence: string
      status: 'PASSED' | 'FAILED'
      totalRows: number
      failedRows: number
      passRate: number
      failedSamples: string[]
    }
    const results: RunResult[] = []
    const byDimension = new Map<DimensionKey, number[]>()
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

      await db.dqRun.create({
        data: {
          ruleId: rule.id,
          datasetId,
          status,
          totalRows: evaluation.totalRows,
          failedRows: evaluation.failedRows,
          passRate,
          dimension: dimensionKey,
        },
      })

      // failed samples — แสดงค่าที่ล้มเหลว (ปิดบัง PII ตามบทบาทผู้รัน)
      const failedSamples = evaluation.failedIndexes.slice(0, 3).map((idx) => {
        const v = rows[idx]?.[rule.column]
        const shown = maskValueByRole(rule.column, v, op.ctx.role, dataset.piiEnabled)
        return `แถว #${idx + 1}${shown !== '' ? `: ${shown}` : ' (ค่าว่าง)'}`
      })

      const arr = byDimension.get(dimensionKey) ?? []
      arr.push(passRate * 100)
      byDimension.set(dimensionKey, arr)

      results.push({
        ruleId: rule.id,
        column: rule.column,
        condition: rule.condition,
        conditionName: template?.name ?? rule.condition,
        severity: rule.severity,
        dimension: dimensionKey,
        dimensionTh: DIMENSION_LABELS[dimensionKey].th,
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

    // ---------- สรุปคะแนน ----------
    const dimensionScores: Array<{ dimension: DimensionKey; th: string; en: string; score: number | null }> = (
      Object.keys(DIMENSION_LABELS) as DimensionKey[]
    ).map((k) => {
      const arr = byDimension.get(k)
      const score = arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null
      return { dimension: k, th: DIMENSION_LABELS[k].th, en: DIMENSION_LABELS[k].en, score }
    })
    const scored = dimensionScores.filter((d) => d.score !== null) as Array<{ score: number }>
    const overallScore = scored.length > 0 ? scored.reduce((a, b) => a + b.score, 0) / scored.length : null

    const passedCount = results.filter((r) => r.status === 'PASSED').length

    await db.auditLog.create({
      data: {
        action: 'RUN_VALIDATION',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `รันตรวจสอบ ${rulesForDataset.length} กฎ บน ${rows.length} แถว (sandbox) — ผ่าน ${passedCount}, ล้มเหลว ${results.length - passedCount}, สัญญาณใหม่ ${newSignals} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      datasetName: dataset.name,
      rowsCount: rows.length,
      rulesCount: rulesForDataset.length,
      skipped,
      results,
      newSignals,
      overallScore,
      dimensionScores: dimensionScores.filter((d) => d.score !== null),
    })
  } catch (e) {
    console.error('POST /api/dq/run', e)
    return NextResponse.json({ error: 'ไม่สามารถรันการตรวจสอบได้' }, { status: 500 })
  }
}
