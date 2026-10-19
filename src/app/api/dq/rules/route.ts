import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildRuleSentence, isConditionKey, isSeverityKey } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

export async function GET() {
  try {
    const rules = await db.dqRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        dataset: { select: { name: true, piiEnabled: true } },
        runs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    return NextResponse.json({
      rules: rules.map((r) => ({
        id: r.id,
        datasetId: r.datasetId,
        datasetName: r.dataset.name,
        column: r.column,
        condition: r.condition,
        parameters: r.parameters,
        filter: r.filter,
        severity: r.severity,
        enabled: r.enabled,
        createdAt: r.createdAt,
        sentence: buildRuleSentence(r),
        lastRun: r.runs[0]
          ? {
              status: r.runs[0].status,
              passRate: r.runs[0].passRate,
              totalRows: r.runs[0].totalRows,
              failedRows: r.runs[0].failedRows,
              at: r.runs[0].createdAt,
            }
          : null,
      })),
    })
  } catch (e) {
    console.error('GET /api/dq/rules', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการกฎได้' }, { status: 500 })
  }
}

const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function validateParams(condition: string, parameters: string): string | null {
  let p: Record<string, unknown> = {}
  try {
    p = JSON.parse(parameters || '{}') as Record<string, unknown>
  } catch {
    return 'พารามิเตอร์ไม่อยู่ในรูปแบบ JSON ที่ถูกต้อง'
  }
  switch (condition) {
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

    const datasetId = String(body.datasetId ?? '').trim()
    const column = String(body.column ?? '').trim()
    const condition = String(body.condition ?? '').trim()
    const severity = String(body.severity ?? 'MEDIUM').trim().toUpperCase()
    const filter = String(body.filter ?? '').trim()
    const parameters = typeof body.parameters === 'string' ? body.parameters : JSON.stringify(body.parameters ?? {})

    if (!datasetId) return NextResponse.json({ error: 'กรุณาเลือกชุดข้อมูล' }, { status: 400 })
    if (!COLUMN_RE.test(column)) {
      return NextResponse.json({ error: 'ชื่อคอลัมน์ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ เท่านั้น' }, { status: 400 })
    }
    if (!isConditionKey(condition)) {
      return NextResponse.json({ error: 'เงื่อนไขที่เลือกไม่ถูกต้อง' }, { status: 400 })
    }
    if (!isSeverityKey(severity)) {
      return NextResponse.json({ error: 'ระดับความรุนแรงไม่ถูกต้อง' }, { status: 400 })
    }
    const paramError = validateParams(condition, parameters)
    if (paramError) return NextResponse.json({ error: paramError }, { status: 400 })

    const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    const created = await db.dqRule.create({
      data: {
        datasetId,
        column,
        condition,
        parameters,
        severity,
        filter: filter || null,
        enabled: true,
      },
      include: { dataset: { select: { name: true } } },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_RULE',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `สร้างกฎใหม่: ${buildRuleSentence(created)} (ผู้ดำเนินการบทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json(
      { rule: { ...created, sentence: buildRuleSentence(created), datasetName: dataset.name } },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/dq/rules', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างกฎได้' }, { status: 500 })
  }
}
