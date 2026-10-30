import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildRuleSentence, isSeverityKey } from '@/lib/dq'
import { EXCEPTION_ACTION_KEYS, isExceptionAction } from '@/lib/mappings'
import { resolveOperator } from '@/lib/operator'

/** โหลดแผนที่เงื่อนไขส่วนกลางทั้งหมด (key → template) — ใช้ทั้ง GET และ POST */
async function loadTemplateMap() {
  const templates = await db.conditionTemplate.findMany()
  return new Map(templates.map((t) => [t.key, t]))
}

export async function GET() {
  try {
    const [rules, templateMap, allDatasets, refSetsForName] = await Promise.all([
      db.dqRule.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          datasets: { include: { dataset: { select: { id: true, name: true, piiEnabled: true } } }, orderBy: { datasetId: 'asc' } },
          runs: { orderBy: { createdAt: 'desc' }, take: 1 },
          element: { select: { id: true, code: true, nameTh: true, subDomain: { select: { name: true, parent: { select: { name: true } } } } } },
        },
      }),
      loadTemplateMap(),
      db.dataset.findMany({ select: { id: true, name: true } }),
      // ทะเบียนอ้างอิง (v0.31.0) — ชื่อทะเบียนสำหรับประโยคกฎโหมดทะเบียนแทน id
      db.referenceSet.findMany({ select: { id: true, code: true, name: true } }),
    ])
    const datasetNameMap = new Map(allDatasets.map((d) => [d.id, d.name]))
    const refSetNameMap = new Map(refSetsForName.map((s) => [s.id, `${s.name} (${s.code})`]))

    return NextResponse.json({
      rules: rules.map((r) => {
        const datasets = r.datasets.map((rd) => ({ id: rd.dataset.id, name: rd.dataset.name }))
        const template = templateMap.get(r.condition)
        const datasetNames = datasets.map((d) => d.name)
        const primaryDataset = datasets[0]
        // เอนจิน EXISTS_IN_DATASET — แสดงชื่อชุดข้อมูลอ้างอิงในประโยคกฎแทน id
        let refDatasetName: string | undefined
        // โหมดทะเบียน (v0.31.0) — IN_LIST/REFERENCE_MATCH ที่ชี้ทะเบียน: แสดงชื่อทะเบียนแทน id
        let refSetName: string | undefined
        try {
          const p = JSON.parse(r.parameters || '{}') as Record<string, unknown>
          if (template?.engineType === 'EXISTS_IN_DATASET') {
            refDatasetName = datasetNameMap.get(String(p.refDatasetId ?? ''))
          }
          if ((template?.engineType === 'IN_LIST' || template?.engineType === 'REFERENCE_MATCH') && String(p.referenceSetId ?? '').trim()) {
            refSetName = refSetNameMap.get(String(p.referenceSetId).trim())
          }
        } catch {
          refDatasetName = undefined
        }
        return {
          id: r.id,
          datasetIds: datasets.map((d) => d.id),
          datasetNames,
          datasetName: primaryDataset?.name ?? '(ไม่มีชุดข้อมูล)',
          column: r.column,
          condition: r.condition,
          conditionName: template?.name ?? r.condition,
          isSystemCondition: template?.isSystem ?? false,
          conditionSentence: template?.sentence ?? null,
          engineType: template?.engineType ?? null,
          dimension: template?.dimension ?? null,
          parameters: r.parameters,
          filter: r.filter,
          severity: r.severity,
          threshold: r.threshold,
          exceptionAction: r.exceptionAction,
          exceptionActionNote: r.exceptionActionNote,
          enabled: r.enabled,
          createdAt: r.createdAt,
          // Data Element ที่กฎผูกอยู่ (v0.18.0) — null = กฎแบบเดิมยังไม่ผูก
          dataElement: r.element
            ? {
                id: r.element.id,
                code: r.element.code,
                nameTh: r.element.nameTh,
                path: r.element.subDomain.parent ? `${r.element.subDomain.parent.name} / ${r.element.subDomain.name} / ${r.element.nameTh}` : r.element.nameTh,
              }
            : null,
          sentence: buildRuleSentence({
            datasetNames,
            column: r.column,
            condition: r.condition,
            conditionSentence: template?.sentence,
            engineType: template?.engineType,
            refDatasetName,
            refSetName,
            parameters: r.parameters,
            severity: r.severity,
            filter: r.filter,
          }),
          lastRun: r.runs[0]
            ? {
                status: r.runs[0].status,
                passRate: r.runs[0].passRate,
                totalRows: r.runs[0].totalRows,
                failedRows: r.runs[0].failedRows,
                at: r.runs[0].createdAt,
              }
            : null,
        }
      }),
    })
  } catch (e) {
    console.error('GET /api/dq/rules', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการกฎได้' }, { status: 500 })
  }
}

const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function validateParams(parameters: string): string | null {
  let p: Record<string, unknown> = {}
  try {
    p = JSON.parse(parameters || '{}') as Record<string, unknown>
  } catch {
    return 'พารามิเตอร์ไม่อยู่ในรูปแบบ JSON ที่ถูกต้อง'
  }
  // พารามิเตอร์รายเงื่อนไขถูกตรวจอีกชั้นที่ validateParamsForTemplate (ด้านล่าง)
  void p
  return null
}

/** ตรวจพารามิเตอร์ตามชนิดเอนจิน — ใช้กับทั้งเงื่อนไขระบบและเงื่อนไขส่วนกลาง (async — ตรวจทะเบียนอ้างอิงใน DB ด้วย v0.31.0) */
async function validateParamsForTemplate(engineType: string, parameters: string): Promise<string | null> {
  let p: Record<string, unknown> = {}
  try {
    p = JSON.parse(parameters || '{}') as Record<string, unknown>
  } catch {
    return 'พารามิเตอร์ไม่อยู่ในรูปแบบ JSON ที่ถูกต้อง'
  }
  switch (engineType) {
    case 'REGEX': {
      const pattern = String(p.pattern ?? '').trim()
      if (!pattern) return 'กรุณาระบุรูปแบบ (Regular Expression)'
      try {
        new RegExp(pattern)
      } catch {
        return 'รูปแบบ Regular Expression ไม่ถูกต้อง'
      }
      return null
    }
    case 'RANGE': {
      const min = Number(p.min)
      const max = Number(p.max)
      if (Number.isNaN(min) || Number.isNaN(max)) return 'กรุณาระบุค่าต่ำสุดและสูงสุดเป็นตัวเลข'
      if (min > max) return 'ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด'
      return null
    }
    case 'IN_LIST': {
      // โหมดทะเบียน (v0.31.0) — ถ้าระบุ referenceSetId ให้ใช้โหมดทะเบียน (ตรวจว่าทะเบียนมีจริงและ ACTIVE)
      const setId = String(p.referenceSetId ?? '').trim()
      if (setId) {
        const rs = await db.referenceSet.findUnique({ where: { id: setId }, select: { id: true, code: true, name: true, status: true } })
        if (!rs) return 'ไม่พบทะเบียนข้อมูลอ้างอิงที่เลือกในระบบ'
        if (rs.status !== 'ACTIVE') return `ทะเบียน "${rs.name}" ยังไม่ใช้งาน (สถานะ ${rs.status}) — เลือกได้เฉพาะทะเบียนที่เปิดใช้งานแล้ว (ACTIVE)`
        return null
      }
      const values = String(p.values ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (values.length === 0) return 'กรุณาระบุค่าที่อนุญาตอย่างน้อย 1 ค่า หรือเลือกทะเบียนข้อมูลอ้างอิง'
      return null
    }
    case 'MAX_AGE_DAYS': {
      const days = Number(p.days)
      if (!Number.isFinite(days) || days <= 0) return 'กรุณาระบุจำนวนวันเป็นตัวเลขมากกว่า 0'
      return null
    }
    case 'REFERENCE_MATCH': {
      // โหมดทะเบียน (v0.31.0) — ถ้าระบุ referenceSetId ให้ใช้โหมดทะเบียน (ตรวจว่าทะเบียนมีจริงและ ACTIVE)
      const setId = String(p.referenceSetId ?? '').trim()
      if (setId) {
        const rs = await db.referenceSet.findUnique({ where: { id: setId }, select: { id: true, code: true, name: true, status: true } })
        if (!rs) return 'ไม่พบทะเบียนข้อมูลอ้างอิงที่เลือกในระบบ'
        if (rs.status !== 'ACTIVE') return `ทะเบียน "${rs.name}" ยังไม่ใช้งาน (สถานะ ${rs.status}) — เลือกได้เฉพาะทะเบียนที่เปิดใช้งานแล้ว (ACTIVE)`
        return null
      }
      const values = String(p.values ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (values.length === 0) return 'กรุณาระบุค่ามาตรฐานจากระบบต้นทางอย่างน้อย 1 ค่า หรือเลือกทะเบียนข้อมูลอ้างอิง'
      return null
    }
    case 'MAX_AGE_HOURS': {
      const hours = Number(p.hours)
      if (!Number.isFinite(hours) || hours <= 0) return 'กรุณาระบุจำนวนชั่วโมงเป็นตัวเลขมากกว่า 0'
      return null
    }
    case 'EXISTS_IN_DATASET': {
      if (!String(p.refDatasetId ?? '').trim() || !String(p.refColumn ?? '').trim()) {
        return 'กรุณาเลือกชุดข้อมูลอ้างอิงและคอลัมน์อ้างอิงให้ครบถ้วน'
      }
      return null
    }
    default:
      return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_RULES')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const datasetIds = Array.isArray(body.datasetIds)
      ? [...new Set((body.datasetIds as unknown[]).map((v) => String(v).trim()).filter(Boolean))].slice(0, 12)
      : String(body.datasetId ?? '')
          .trim()
          ? [String(body.datasetId).trim()]
          : []
    const column = String(body.column ?? '').trim()
    const condition = String(body.condition ?? '').trim()
    const severity = String(body.severity ?? 'MEDIUM').trim().toUpperCase()
    const filter = String(body.filter ?? '').trim()
    const parameters = typeof body.parameters === 'string' ? body.parameters : JSON.stringify(body.parameters ?? {})
    const thresholdRaw = Number(body.threshold ?? 95)
    // Data Element ที่กฎนี้ตรวจ (ไม่บังคับ — ช่วงเปลี่ยนผ่านรองรับกฎเดิมที่ยังไม่ผูก)
    const dataElementIdRaw = String(body.dataElementId ?? '').trim()
    // v0.22.0 — Exception Action อยู่ที่กฎ (แสดงสรุปในหน้ารายละเอียด Mapping)
    const exceptionActionRaw = String(body.exceptionAction ?? '').trim().toUpperCase()
    if (exceptionActionRaw && !isExceptionAction(exceptionActionRaw)) {
      return NextResponse.json({ error: `การดำเนินการเมื่อกฎ fail ไม่ถูกต้อง — ต้องเป็น: ${EXCEPTION_ACTION_KEYS.join(', ')}` }, { status: 400 })
    }
    const exceptionAction = exceptionActionRaw || ''
    const exceptionActionNote = String(body.exceptionActionNote ?? '').trim().slice(0, 500)
    let dataElementId: string | null = null
    let elementPath = ''
    if (dataElementIdRaw) {
      const el = await db.dataElement.findUnique({
        where: { id: dataElementIdRaw },
        select: { id: true, code: true, nameTh: true, subDomain: { select: { name: true, parent: { select: { name: true } } } } },
      })
      if (!el) {
        return NextResponse.json({ error: 'ไม่พบ Data Element ที่ระบุในระบบ' }, { status: 404 })
      }
      dataElementId = el.id
      elementPath = el.subDomain.parent ? `${el.subDomain.parent.name} / ${el.subDomain.name} / ${el.nameTh}` : el.nameTh
    }

    if (datasetIds.length === 0) return NextResponse.json({ error: 'กรุณาเลือกชุดข้อมูลอย่างน้อย 1 ชุด' }, { status: 400 })
    if (!COLUMN_RE.test(column)) {
      return NextResponse.json({ error: 'ชื่อคอลัมน์ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ เท่านั้น' }, { status: 400 })
    }
    if (!isSeverityKey(severity)) {
      return NextResponse.json({ error: 'ระดับความรุนแรงไม่ถูกต้อง' }, { status: 400 })
    }
    if (!Number.isFinite(thresholdRaw) || thresholdRaw < 0 || thresholdRaw > 100) {
      return NextResponse.json({ error: 'ค่าผ่านขั้นต่ำ (threshold) ต้องเป็นตัวเลข 0–100' }, { status: 400 })
    }
    const threshold = Math.round(thresholdRaw * 10) / 10
    const jsonError = validateParams(parameters)
    if (jsonError) return NextResponse.json({ error: jsonError }, { status: 400 })

    // เงื่อนไขต้องมาจากคลังเงื่อนไขส่วนกลางเท่านั้น (system หรือ custom ที่เปิดใช้งาน)
    const template = await db.conditionTemplate.findUnique({ where: { key: condition } })
    if (!template) {
      return NextResponse.json({ error: 'ไม่พบเงื่อนไขนี้ในคลังเงื่อนไขส่วนกลาง' }, { status: 400 })
    }
    if (!template.enabled) {
      return NextResponse.json({ error: `เงื่อนไข "${template.name}" ถูกปิดใช้งานอยู่` }, { status: 400 })
    }
    const paramError = await validateParamsForTemplate(template.engineType, parameters)
    if (paramError) return NextResponse.json({ error: paramError }, { status: 400 })

    const datasets = await db.dataset.findMany({ where: { id: { in: datasetIds } } })
    if (datasets.length !== datasetIds.length) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลบางชุดในระบบ' }, { status: 404 })
    }

    // ตรวจว่าคอลัมน์มีอยู่จริงในข้อมูลตัวอย่างของทุกชุดข้อมูลที่มี sample (กันพิมพ์ผิด)
    for (const dataset of datasets) {
      const sample = await db.sampleRow.findFirst({ where: { datasetId: dataset.id } })
      if (!sample) continue // ไม่มีข้อมูลตัวอย่าง — ข้ามการตรวจ (ระบบอื่นอาจยังไม่นำเข้า)
      let row: Record<string, unknown> = {}
      try {
        row = JSON.parse(sample.payload) as Record<string, unknown>
      } catch {
        continue
      }
      if (!(column in row)) {
        return NextResponse.json(
          { error: `คอลัมน์ "${column}" ไม่พบในชุดข้อมูล "${dataset.name}" — ตรวจสอบจากตัวอย่างข้อมูลอีกครั้ง` },
          { status: 400 },
        )
      }
    }

    const created = await db.dqRule.create({
      data: {
        column,
        condition,
        parameters,
        severity,
        threshold,
        filter: filter || null,
        dataElementId,
        exceptionAction,
        exceptionActionNote,
        enabled: true,
        datasets: {
          create: datasetIds.map((datasetId) => ({ datasetId })),
        },
      },
      include: { datasets: { include: { dataset: { select: { name: true } } } } },
    })

    const datasetNames = created.datasets.map((rd) => rd.dataset.name)
    // ชื่อชุดข้อมูลอ้างอิง (สำหรับเอนจิน EXISTS_IN_DATASET)
    let refDatasetName: string | undefined
    if (template.engineType === 'EXISTS_IN_DATASET') {
      try {
        const p = JSON.parse(parameters || '{}') as Record<string, unknown>
        const refId = String(p.refDatasetId ?? '').trim()
        if (refId) {
          const refDataset = await db.dataset.findUnique({ where: { id: refId }, select: { name: true } })
          refDatasetName = refDataset?.name ?? undefined
        }
      } catch {
        refDatasetName = undefined
      }
    }
    await db.auditLog.create({
      data: {
        action: 'CREATE_RULE',
        actor: op.ctx.email,
        target: datasetNames.join(', '),
        detail: `สร้างกฎใหม่ (ใช้ร่วม ${datasetNames.length} ชุดข้อมูล)${elementPath ? ` ผูกกับ Data Element "${elementPath}"` : ''}: ${buildRuleSentence({
          datasetNames,
          column,
          condition,
          conditionSentence: template.sentence,
          engineType: template.engineType,
          refDatasetName,
          parameters,
          severity,
          filter: filter || null,
        })} (ผู้ดำเนินการบทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json(
      {
        rule: {
          ...created,
          sentence: buildRuleSentence({
            datasetNames,
            column,
            condition,
            conditionSentence: template.sentence,
            engineType: template.engineType,
            refDatasetName,
            parameters,
            severity,
            filter: filter || null,
          }),
        },
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/dq/rules', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างกฎได้' }, { status: 500 })
  }
}
