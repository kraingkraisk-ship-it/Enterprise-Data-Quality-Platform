import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export async function GET() {
  try {
    const exceptions = await db.dqException.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        dataset: { select: { name: true } },
        rule: { select: { column: true, condition: true } },
      },
    })
    return NextResponse.json({
      exceptions: exceptions.map((x) => ({
        id: x.id,
        datasetId: x.datasetId,
        datasetName: x.dataset.name,
        ruleId: x.ruleId,
        ruleLabel: x.rule ? `${x.rule.column} (${x.rule.condition})` : null,
        reason: x.reason,
        requestedBy: x.requestedBy,
        status: x.status,
        expiresAt: x.expiresAt,
        decidedBy: x.decidedBy,
        decidedAt: x.decidedAt,
        createdAt: x.createdAt,
      })),
    })
  } catch (e) {
    console.error('GET /api/dq/exceptions', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดคำขอข้อยกเว้นได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    // การขอข้อยกเว้นเป็นหน้าที่ระดับกฎ/ข้อมูล — ใช้สิทธิ์ MANAGE_RULES
    const op = await resolveOperator(body.requestedByEmail, 'MANAGE_RULES')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const datasetId = String(body.datasetId ?? '').trim()
    const ruleId = String(body.ruleId ?? '').trim()
    const reason = String(body.reason ?? '').trim()
    const expiresAtRaw = String(body.expiresAt ?? '').trim()

    if (!datasetId) return NextResponse.json({ error: 'กรุณาเลือกชุดข้อมูล' }, { status: 400 })
    if (reason.length < 10) {
      return NextResponse.json({ error: 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร (จำเป็นเพื่อการตรวจสอบย้อนหลัง)' }, { status: 400 })
    }
    if (!expiresAtRaw) return NextResponse.json({ error: 'กรุณาระบุวันหมดอายุของข้อยกเว้น' }, { status: 400 })
    const expiresAt = new Date(expiresAtRaw)
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: 'รูปแบบวันหมดอายุไม่ถูกต้อง' }, { status: 400 })
    }
    if (expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'วันหมดอายุต้องเป็นวันในอนาคต' }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    if (ruleId) {
      const rule = await db.dqRule.findUnique({ where: { id: ruleId } })
      if (!rule || rule.datasetId !== datasetId) {
        return NextResponse.json({ error: 'กฎที่เลือกไม่อยู่ในชุดข้อมูลนี้' }, { status: 400 })
      }
    }

    const created = await db.dqException.create({
      data: {
        datasetId,
        ruleId: ruleId || null,
        reason,
        requestedBy: op.ctx.email,
        status: 'PENDING',
        expiresAt,
      },
      include: { dataset: { select: { name: true } }, rule: { select: { column: true, condition: true } } },
    })

    await db.auditLog.create({
      data: {
        action: 'REQUEST_EXCEPTION',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `ขอข้อยกเว้น: “${reason.slice(0, 80)}${reason.length > 80 ? '…' : ''}” หมดอายุ ${expiresAt.toLocaleDateString('th-TH')} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ exception: created }, { status: 201 })
  } catch (e) {
    console.error('POST /api/dq/exceptions', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างคำขอข้อยกเว้นได้' }, { status: 500 })
  }
}
