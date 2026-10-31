import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  buildRuleSentence,
  evaluateRule,
  CONDITIONS,
  DIMENSION_LABELS,
  isConditionKey,
  isDimensionKey,
  maskValueByRole,
  type DimensionKey,
  type Row,
} from '@/lib/dq'
import { buildRuleVerdict, DAMA_STANDARDS, ENGINE_FAILURE_REASONS, fixHintFor, gradeOf } from '@/lib/dama'
import { resolveOperator } from '@/lib/operator'
import { aggregateRollups, rollupByElement, type RollupRunInput } from '@/lib/elements'

/** จำกัดจำนวนแถวล้มเหลวที่เก็บ snapshot ต่อกฎต่อรอบ (เช่นเดียวกับ /api/dq/run) */
const MAX_FAILURE_ROWS_PER_RULE = 200

/** ประกอบ rollup จาก runs ที่มี dataElementId + ข้อมูล element — ใช้ทั้ง POST และ GET */
function buildRollup(
  runs: Array<RollupRunInput & { datasetId: string }>,
  elements: Array<{ id: string; code: string; nameTh: string; subDomainId: string; subDomainName: string }>,
) {
  const rollups = rollupByElement(runs)
  const byElement = elements.map((e) => {
    const r = rollups.get(e.id)
    return {
      elementId: e.id,
      code: e.code,
      nameTh: e.nameTh,
      subDomainId: e.subDomainId,
      subDomainName: e.subDomainName,
      score: r?.score ?? null,
      rulesCount: r?.rulesCount ?? 0,
      failedRules: r?.failedRules ?? 0,
      totalRows: r?.totalRows ?? 0,
    }
  })

  const bySubDomainMap = new Map<
    string,
    { subDomainId: string; subDomainName: string; parts: Array<{ score: number | null; totalRows: number }>; elements: number; elementsScored: number }
  >()
  for (const e of byElement) {
    const acc = bySubDomainMap.get(e.subDomainId) ?? {
      subDomainId: e.subDomainId,
      subDomainName: e.subDomainName,
      parts: [],
      elements: 0,
      elementsScored: 0,
    }
    acc.elements += 1
    if (e.score !== null) acc.elementsScored += 1
    if (e.rulesCount > 0) acc.parts.push({ score: e.score, totalRows: e.totalRows })
    bySubDomainMap.set(e.subDomainId, acc)
  }
  const bySubDomain = [...bySubDomainMap.values()]
    .map((s) => ({
      subDomainId: s.subDomainId,
      subDomainName: s.subDomainName,
      elements: s.elements,
      elementsScored: s.elementsScored,
      score: aggregateRollups(s.parts),
    }))
    .sort((a, b) => (a.score ?? 999) - (b.score ?? 999)) // แย่สุดก่อน

  const domainScore = aggregateRollups(byElement.map((e) => ({ score: e.score, totalRows: e.totalRows })))
  return { byElement, bySubDomain, domainScore }
}

/**
 * Domain-level validation run (v0.18.0) — "เลือก Data Domain ที่ต้องการตรวจ > เลือก DQ Rule ตรวจตาม Data Element"
 *
 * POST /api/dq/run-domain
 *   body: { operatorEmail, domainId, ruleIds?: string[] }  (ruleIds ไม่ระบุ = รันทุกกฎที่ผูก element ในโดเมน)
 *
 * GET /api/dq/run-domain?domainId=… — ผลรอบล่าสุดของโดเมน (rollup จาก groupRunId ล่าสุด)
 *
 * กลไก:
 * - รวมกฎที่ enabled + ผูก Data Element (ACTIVE) ใต้โดเมนย่อยทั้งหมดของโดเมนหลักนี้
 * - รันต่อชุดข้อมูล (batch ต่อ dataset) ด้วย groupRunId เดียวกัน — เข้ากันได้กับหน้าผล/แถวล้มเหลวเดิมทุกอย่าง
 * - คะแนน rollup: element (ถ่วงแถว) → sub-domain → domain แสดงในผลรันทันที
 * สิทธิ์: RUN_VALIDATION — บันทึก Audit Trail (RUN_DOMAIN_VALIDATION)
 */
export async function GET(req: NextRequest) {
  try {
    const domainId = req.nextUrl.searchParams.get('domainId')?.trim()
    if (!domainId) return NextResponse.json({ error: 'กรุณาระบุ domainId' }, { status: 400 })

    const domain = await db.dataDomain.findUnique({ where: { id: domainId }, select: { id: true, name: true, parentId: true } })
    if (!domain) return NextResponse.json({ error: 'ไม่พบโดเมนนี้ในระบบ' }, { status: 404 })

    const subs = await db.dataDomain.findMany({ where: { parentId: domain.id }, select: { id: true } })
    const domainScopeIds = [domain.id, ...subs.map((s) => s.id)]

    const latestGroup = await db.dqValidationBatch.findFirst({
      where: { groupRunId: { not: '' }, dataset: { domainId: { in: domainScopeIds } } },
      orderBy: { createdAt: 'desc' },
      select: { groupRunId: true, createdAt: true },
    })
    if (!latestGroup) return NextResponse.json({ exists: false })

    const groupRunId = latestGroup.groupRunId
    const [groupBatches, groupBatchIds, elements] = await Promise.all([
      db.dqValidationBatch.findMany({
        where: { groupRunId },
        include: { dataset: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.dqValidationBatch.findMany({ where: { groupRunId }, select: { id: true } }),
      db.dataElement.findMany({
        where: { status: 'ACTIVE', subDomain: { parentId: domain.id } },
        include: { subDomain: { select: { id: true, name: true } } },
        orderBy: [{ position: 'asc' }, { nameTh: 'asc' }],
      }),
    ])
    // runs ของ group นี้ (query แยกเพราะต้องรอ batchIds ก่อน)
    const runsInGroup = await db.dqRun.findMany({
      where: { batchId: { in: groupBatchIds.map((b) => b.id) }, dataElementId: { not: '' } },
      include: { rule: { select: { id: true, column: true, condition: true, severity: true, threshold: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const templates = await db.conditionTemplate.findMany()
    const templateMap = new Map(templates.map((t) => [t.key, t]))
    const elementMap = new Map(elements.map((e) => [e.id, e]))

    const rollupRuns = runsInGroup.map((r) => ({
      dataElementId: r.dataElementId,
      totalRows: r.totalRows,
      passRate: r.passRate,
      status: r.status,
      datasetId: r.datasetId,
    }))
    const rollup = buildRollup(
      rollupRuns,
      elements.map((e) => ({ id: e.id, code: e.code, nameTh: e.nameTh, subDomainId: e.subDomainId, subDomainName: e.subDomain.name })),
    )

    return NextResponse.json({
      exists: true,
      groupRunId,
      ranAt: runsInGroup[runsInGroup.length - 1]?.createdAt ?? latestGroup.createdAt,
      domain: { id: domain.id, name: domain.name },
      batches: groupBatches.map((b) => ({
        batchId: b.id,
        datasetId: b.dataset.id,
        datasetName: b.dataset.name,
        totalRules: b.totalRules,
        passedRules: b.passedRules,
        failedRules: b.failedRules,
        overallScore: b.overallScore,
      })),
      results: runsInGroup.map((r) => {
        const el = elementMap.get(r.dataElementId)
        const template = templateMap.get(r.rule.condition)
        return {
          runId: r.id,
          batchId: r.batchId,
          ruleId: r.rule.id,
          column: r.rule.column,
          condition: r.rule.condition,
          conditionName: template?.name ?? r.rule.condition,
          severity: r.rule.severity,
          threshold: r.rule.threshold,
          dimension: r.dimension,
          dimensionTh: isDimensionKey(r.dimension) ? DIMENSION_LABELS[r.dimension].th : r.dimension,
          status: r.status,
          totalRows: r.totalRows,
          failedRows: r.failedRows,
          passRate: r.passRate,
          elementId: r.dataElementId,
          elementName: el?.nameTh ?? '(element ถูกลบ)',
          subDomainName: el?.subDomain.name ?? '',
        }
      }),
      ...rollup,
    })
  } catch (e) {
    console.error('GET /api/dq/run-domain', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดผลรันระดับโดเมนได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'RUN_VALIDATION')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const domainId = String(body.domainId ?? '').trim()
    if (!domainId) return NextResponse.json({ error: 'กรุณาเลือก Data Domain ที่ต้องการตรวจ' }, { status: 400 })

    // ---------- ต้องเป็นโดเมนหลักเท่านั้น ----------
    const domain = await db.dataDomain.findUnique({ where: { id: domainId }, select: { id: true, name: true, parentId: true } })
    if (!domain) return NextResponse.json({ error: 'ไม่พบโดเมนนี้ในระบบ' }, { status: 404 })
    if (domain.parentId !== null) {
      return NextResponse.json(
        { error: `กรุณาเลือก "โดเมนหลัก" — "${domain.name}" เป็นโดเมนย่อย (ระบบจะรวมทุกโดเมนย่อยให้อัตโนมัติ)` },
        { status: 400 },
      )
    }

    // ---------- รวม element (ACTIVE) + กฎที่ผูก ----------
    const elements = await db.dataElement.findMany({
      where: { status: 'ACTIVE', subDomain: { parentId: domain.id } },
      include: { subDomain: { select: { id: true, name: true } } },
      orderBy: [{ position: 'asc' }, { nameTh: 'asc' }],
    })
    const elementIds = elements.map((e) => e.id)
    if (elementIds.length === 0) {
      return NextResponse.json(
        { error: `โดเมน "${domain.name}" ยังไม่มี Data Element — เริ่มจากจัดโครงสร้างในหน้า Data Domain ก่อน` },
        { status: 400 },
      )
    }

    const requestedRuleIds = Array.isArray(body.ruleIds)
      ? (body.ruleIds as unknown[]).map((v) => String(v).trim()).filter(Boolean)
      : null

    const [allRules, allTemplates] = await Promise.all([
      db.dqRule.findMany({
        where: { enabled: true, dataElementId: { in: elementIds } },
        include: {
          datasets: { select: { datasetId: true } },
          element: { select: { id: true, code: true, nameTh: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.conditionTemplate.findMany(),
    ])
    const rules = requestedRuleIds ? allRules.filter((r) => requestedRuleIds.includes(r.id)) : allRules
    if (rules.length === 0) {
      return NextResponse.json(
        { error: 'ไม่มีกฎที่ผูกกับ Data Element ในโดเมนนี้ — ผูกกฎกับ element ในคลังกฎก่อน (หรือเลือกกฎอย่างน้อย 1 ข้อ)' },
        { status: 400 },
      )
    }

    const templateMap = new Map(allTemplates.map((t) => [t.key, t]))
    const elementMap = new Map(elements.map((e) => [e.id, e]))

    // ---------- จัดกลุ่มกฎรายชุดข้อมูล (ผ่าน RuleDataset) ----------
    const rulesByDataset = new Map<string, typeof rules>()
    for (const r of rules) {
      for (const rd of r.datasets) {
        const arr = rulesByDataset.get(rd.datasetId) ?? []
        arr.push(r)
        rulesByDataset.set(rd.datasetId, arr)
      }
    }
    const datasetIds = [...rulesByDataset.keys()]
    if (datasetIds.length === 0) {
      return NextResponse.json({ error: 'กฎที่เลือกยังไม่ผูกกับชุดข้อมูลใด — เพิ่มชุดข้อมูลให้กฎก่อนจึงจะรันได้' }, { status: 400 })
    }
    const datasets = await db.dataset.findMany({ where: { id: { in: datasetIds } } })
    const datasetMap = new Map(datasets.map((d) => [d.id, d]))

    const groupRunId = crypto.randomUUID()
    interface DetailResult {
      runId: string
      batchId: string
      datasetId: string
      datasetName: string
      ruleId: string
      column: string
      condition: string
      conditionName: string
      severity: string
      threshold: number
      dimension: string
      dimensionTh: string
      sentence: string
      verdict: string
      status: 'PASSED' | 'FAILED' | 'NO_DATA'
      totalRows: number
      failedRows: number
      passRate: number
      elementId: string
      elementName: string
      subDomainName: string
    }
    const results: DetailResult[] = []
    const rollupRuns: Array<RollupRunInput & { datasetId: string }> = []
    let skipped = 0
    let newSignals = 0
    const batchesOut: Array<{ batchId: string; datasetId: string; datasetName: string }> = []

    // cache ค่าอ้างอิงเอนจิน EXISTS_IN_DATASET
    const refValuesCache = new Map<string, Set<string>>()
    const refDatasetNameCache = new Map<string, string | null>()
    // cache ค่าของทะเบียนอ้างอิง (โหมดทะเบียน IN_LIST/REFERENCE_MATCH — v0.31.0)
    const refSetValuesCache = new Map<string, Set<string>>()
    const refSetNameCache = new Map<string, string | null>()

    for (const datasetId of datasetIds) {
      const dataset = datasetMap.get(datasetId)
      if (!dataset) continue
      const datasetRules = rulesByDataset.get(datasetId) ?? []

      const sampleRows = await db.sampleRow.findMany({ where: { datasetId }, orderBy: { createdAt: 'asc' } })
      const rows: Row[] = sampleRows.map((r) => {
        try {
          return JSON.parse(r.payload) as Row
        } catch {
          return {}
        }
      })

      const batch = await db.dqValidationBatch.create({
        data: { datasetId, triggeredBy: 'MANUAL', createdBy: op.ctx.email, groupRunId, note: `รันระดับโดเมน: ${domain.name}` },
      })
      batchesOut.push({ batchId: batch.id, datasetId, datasetName: dataset.name })

      const pendingTitles = new Set(
        (
          await db.dqSignal.findMany({
            where: { datasetId, status: 'PENDING_REVIEW' },
            select: { kind: true, title: true },
          })
        ).map((s) => `${s.kind}|${s.title}`),
      )

      let passedCount = 0
      let batchResultCount = 0

      for (const rule of datasetRules) {
        const el = rule.element ? elementMap.get(rule.element.id) : undefined
        if (!el) {
          skipped += 1
          continue
        }
        const template = templateMap.get(rule.condition)
        const engineType = template?.engineType ?? (isConditionKey(rule.condition) ? rule.condition : null)
        if (!engineType) {
          skipped += 1
          continue
        }
        const dimensionKey: DimensionKey =
          template && isDimensionKey(template.dimension)
            ? template.dimension
            : isConditionKey(engineType)
              ? CONDITIONS[engineType].dimension
              : 'VALIDITY'

        // เอนจิน EXISTS_IN_DATASET — โหลดค่าอ้างอิง (cache ร่วมทั้งรอบ)
        let evalContext: { refValues?: Set<string>; refSetValues?: Set<string> } | undefined
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
            skipped += 1
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

        // โหมดทะเบียน (v0.31.0) — IN_LIST/REFERENCE_MATCH ที่ params.referenceSetId ชี้ทะเบียนข้อมูลอ้างอิง:
        // โหลดค่า ACTIVE ของทะเบียนมาใช้ประเมิน (cache ร่วมทั้งรอบ) · ทะเบียนไม่พบ/ไม่ ACTIVE = ข้ามกฎชัดเจน
        let refSetName: string | undefined
        if (engineType === 'IN_LIST' || engineType === 'REFERENCE_MATCH') {
          let referenceSetId = ''
          try {
            const p = JSON.parse(rule.parameters || '{}') as Record<string, unknown>
            referenceSetId = String(p.referenceSetId ?? '').trim()
          } catch {
            referenceSetId = ''
          }
          if (referenceSetId) {
            let setStatus = refSetNameCache.get(`status|${referenceSetId}`) ?? null
            if (setStatus === null) {
              const rs = await db.referenceSet.findUnique({ where: { id: referenceSetId }, select: { code: true, name: true, status: true } })
              setStatus = rs ? `${rs.status}|${rs.name} (${rs.code})` : 'MISSING|'
              refSetNameCache.set(`status|${referenceSetId}`, setStatus)
            }
            const [status, ...nameParts] = setStatus.split('|')
            if (status === 'MISSING' || status !== 'ACTIVE') {
              // ทะเบียนไม่พบหรือยังไม่เปิดใช้งาน — ประเมินไม่ได้ ข้ามและนับใน skipped (แบบเดียวกับ EXISTS_IN_DATASET)
              skipped += 1
              continue
            }
            let refSetValues = refSetValuesCache.get(referenceSetId)
            if (!refSetValues) {
              const vals = await db.referenceValue.findMany({
                where: { setId: referenceSetId, status: 'ACTIVE' },
                select: { value: true },
              })
              refSetValues = new Set(vals.map((v) => v.value.trim()).filter(Boolean))
              refSetValuesCache.set(referenceSetId, refSetValues)
            }
            evalContext = { refSetValues }
            refSetName = nameParts.join('|') || undefined
          }
        }

        const evaluation = evaluateRule({ column: rule.column, engineType, parameters: rule.parameters }, rows, evalContext)
        // v0.32.0 — 0 แถว = NO_DATA (ไม่ผ่านโดยปริยาย) · passRate คงเป็น 1 เพื่อไม่กระทบเกณฑ์ threshold เดิม
        const status = evaluation.totalRows === 0 ? 'NO_DATA' : evaluation.failedRows === 0 ? 'PASSED' : 'FAILED'
        const passRate = evaluation.totalRows > 0 ? (evaluation.totalRows - evaluation.failedRows) / evaluation.totalRows : 1
        if (status === 'PASSED') passedCount += 1

        const verdict = buildRuleVerdict({ status, totalRows: evaluation.totalRows, failedRows: evaluation.failedRows, dimension: dimensionKey, engineType })

        const createdRun = await db.dqRun.create({
          data: {
            ruleId: rule.id,
            datasetId,
            batchId: batch.id,
            dataElementId: el.id,
            status,
            totalRows: evaluation.totalRows,
            failedRows: evaluation.failedRows,
            passRate,
            dimension: dimensionKey,
          },
        })

        if (evaluation.failedRows > 0) {
          const reasonBase = ENGINE_FAILURE_REASONS[engineType] ?? `ไม่ผ่านเงื่อนไข ${template?.name ?? rule.condition}`
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
          // คำแนะนำที่เปิดอยู่ (อ่านเพื่อพิจารณา — กันซ้ำด้วยชื่อเดิม)
          const title = `กฎล้มเหลว: ${rule.column} — ${template?.name ?? rule.condition}`
          if (!pendingTitles.has(`RULE_VIOLATION|${title}`)) {
            const failedSample = evaluation.failedIndexes.slice(0, 3).map((idx) => {
              const v = rows[idx]?.[rule.column]
              const shown = maskValueByRole(rule.column, v, op.ctx.role, dataset.piiEnabled)
              return `แถว #${idx + 1}${shown !== '' ? `: ${shown}` : ' (ค่าว่าง)'}`
            })
            await db.dqSignal.create({
              data: {
                datasetId,
                kind: 'RULE_VIOLATION',
                dimension: dimensionKey,
                title,
                detail: `${buildRuleSentence({
                  datasetName: dataset.name,
                  column: rule.column,
                  condition: rule.condition,
                  conditionSentence: template?.sentence,
                  engineType,
                  refDatasetName,
                  refSetName,
                  parameters: rule.parameters,
                  severity: rule.severity,
                  filter: rule.filter,
                })} — ล้มเหลว ${evaluation.failedRows}/${evaluation.totalRows} แถว (${failedSample.join('; ')}) ผูกกับ Data Element "${el.nameTh}" — โปรดทบทวนและดำเนินการโดยมนุษย์ (ระบบไม่แก้ไขข้อมูลต้นทาง)`,
                severity: rule.severity,
                status: 'PENDING_REVIEW',
              },
            })
            pendingTitles.add(`RULE_VIOLATION|${title}`)
            newSignals++
          }
        }

        results.push({
          runId: createdRun.id,
          batchId: batch.id,
          datasetId,
          datasetName: dataset.name,
          ruleId: rule.id,
          column: rule.column,
          condition: rule.condition,
          conditionName: template?.name ?? rule.condition,
          severity: rule.severity,
          threshold: rule.threshold,
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
          verdict,
          status,
          totalRows: evaluation.totalRows,
          failedRows: evaluation.failedRows,
          passRate,
          elementId: el.id,
          elementName: el.nameTh,
          subDomainName: el.subDomain.name,
        })
        // v0.32.0 — NO_DATA (0 แถว) ไม่เข้า rollup (ไม่มีหลักฐานให้ถ่วงน้ำหนัก)
        if (status !== 'NO_DATA') {
          rollupRuns.push({ dataElementId: el.id, totalRows: evaluation.totalRows, passRate, status, datasetId })
        }
        batchResultCount += 1
      }

      await db.dqValidationBatch.update({
        where: { id: batch.id },
        data: {
          totalRules: batchResultCount,
          passedRules: passedCount,
          failedRules: batchResultCount - passedCount - results.filter((r) => r.batchId === batch.id && r.status === 'NO_DATA').length,
          skippedRules: skipped,
        },
      })

      // v0.37.0 — ผล ML ย้ายไป ML Studio (เทรนจาก Data Asset + กฎ DQ + คนสอน) — ไม่ประเมิน anomaly/forecast อัตโนมัติที่นี่อีก
    }

    const rollup = buildRollup(
      rollupRuns,
      elements.map((e) => ({ id: e.id, code: e.code, nameTh: e.nameTh, subDomainId: e.subDomainId, subDomainName: e.subDomain.name })),
    )
    const grade = gradeOf(rollup.domainScore)

    await db.auditLog.create({
      data: {
        action: 'RUN_DOMAIN_VALIDATION',
        actor: op.ctx.email,
        target: domain.name,
        detail: `รันตรวจระดับโดเมน "${domain.name}" — ${rules.length} กฎ ครอบ ${elements.length} Data Element บน ${datasetIds.length} ชุดข้อมูล — คะแนนรวม ${rollup.domainScore !== null ? rollup.domainScore.toFixed(1) : '—'} · คำแนะนำใหม่ ${newSignals} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      groupRunId,
      domain: { id: domain.id, name: domain.name },
      batches: batchesOut,
      runsCount: results.length,
      skipped,
      newSignals,
      results,
      ...rollup,
      domainGrade: grade
        ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass }
        : null,
    })
  } catch (e) {
    console.error('POST /api/dq/run-domain', e)
    return NextResponse.json({ error: 'ไม่สามารถรันตรวจระดับโดเมนได้' }, { status: 500 })
  }
}
