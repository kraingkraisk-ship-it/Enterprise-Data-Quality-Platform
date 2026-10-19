import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildRuleSentence, isSeverityKey } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

/** โหลดแผนที่เงื่อนไขส่วนกลางทั้งหมด (key → template) — ใช้ทั้ง GET และ POST */
async function loadTemplateMap() {
  const templates = await db.conditionTemplate.findMany()
  return new Map(templates.map((t) => [t.key, t]))
}

export async function GET() {
  try {
    const [rules, templateMap] = await Promise.all([
      db.dqRule.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          datasets: { include: { dataset: { select: { id: true, name: true, piiEnabled: true } } }, orderBy: { datasetId: 'asc' } },
          runs: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      loadTemplateMap(),
    ])

    return NextResponse.json({
      rules: rules.map((r) => {
        const datasets = r.datasets.map((rd) => ({ id: rd.dataset.id, name: rd.dataset.name }))
        const template = templateMap.get(r.condition)
        const datasetNames = datasets.map((d) => d.name)
        const primaryDataset = datasets[0]
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
          enabled: r.enabled,
          createdAt: r.createdAt,
          sentence: buildRuleSentence({
            datasetNames,
            column: r.column,
            condition: r.condition,
            conditionSentence: template?.sentence,
            engineType: template?.engineType,
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

/** ตรวจพารามิเตอร์ตามชนิดเอนจิน — ใช้กับทั้งเงื่อนไขระบบและเงื่อนไขส่วนกลาง */
function validateParamsForTemplate(engineType: string, parameters: string): string | null {
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
      const values = String(p.values ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (values.length === 0) return 'กรุณาระบุค่าที่อนุญาตอย่างน้อย 1 ค่า'
      return null
    }
    case 'MAX_AGE_DAYS': {
      const days = Number(p.days)
      if (!Number.isFinite(days) || days <= 0) return 'กรุณาระบุจำนวนวันเป็นตัวเลขมากกว่า 0'
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

    if (datasetIds.length === 0) return NextResponse.json({ error: 'กรุณาเลือกชุดข้อมูลอย่างน้อย 1 ชุด' }, { status: 400 })
    if (!COLUMN_RE.test(column)) {
      return NextResponse.json({ error: 'ชื่อคอลัมน์ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ เท่านั้น' }, { status: 400 })
    }
    if (!isSeverityKey(severity)) {
      return NextResponse.json({ error: 'ระดับความรุนแรงไม่ถูกต้อง' }, { status: 400 })
    }
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
    const paramError = validateParamsForTemplate(template.engineType, parameters)
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
        filter: filter || null,
        enabled: true,
        datasets: {
          create: datasetIds.map((datasetId) => ({ datasetId })),
        },
      },
      include: { datasets: { include: { dataset: { select: { name: true } } } } },
    })

    const datasetNames = created.datasets.map((rd) => rd.dataset.name)
    await db.auditLog.create({
      data: {
        action: 'CREATE_RULE',
        actor: op.ctx.email,
        target: datasetNames.join(', '),
        detail: `สร้างกฎใหม่ (ใช้ร่วม ${datasetNames.length} ชุดข้อมูล): ${buildRuleSentence({
          datasetNames,
          column,
          condition,
          conditionSentence: template.sentence,
          engineType: template.engineType,
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
