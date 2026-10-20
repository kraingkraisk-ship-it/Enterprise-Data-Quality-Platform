import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ENGINE_REQUIRED_PARAM_KEYS,
  CONDITIONS,
  DIMENSION_LABELS,
  generateTemplateKey,
  isConditionKey,
  isDimensionKey,
  parseTemplateParams,
  TEMPLATE_PARAM_TYPES,
  type TemplateParamDef,
} from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'

/**
 * คลังเงื่อนไข (must) ส่วนกลาง — เงื่อนไขทุกตัวในระบบถูกจัดเก็บและใช้ร่วมกันที่นี่
 * - GET: รายการเงื่อนไขทั้งหมด (ของระบบ + ที่ผู้ใช้สร้าง) พร้อมจำนวนกฎที่ใช้อ้างอิง
 * - POST: สร้างเงื่อนไขส่วนกลางใหม่ (ต้องมีสิทธิ์ MANAGE_RULES)
 */
export async function GET() {
  try {
    const [templates, ruleCounts] = await Promise.all([
      db.conditionTemplate.findMany({
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      }),
      db.dqRule.groupBy({ by: ['condition'], _count: { _all: true } }),
    ])
    const countMap = new Map(ruleCounts.map((c) => [c.condition, c._count._all]))

    return NextResponse.json({
      conditions: templates.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        nameEn: t.nameEn,
        sentence: t.sentence,
        dimension: t.dimension,
        dimensionTh: isDimensionKey(t.dimension) ? DIMENSION_LABELS[t.dimension].th : t.dimension,
        engineType: t.engineType,
        engineLabel: isConditionKey(t.engineType) ? CONDITIONS[t.engineType].th : t.engineType,
        params: parseTemplateParams(t.params),
        isSystem: t.isSystem,
        enabled: t.enabled,
        createdBy: t.createdBy,
        createdAt: t.createdAt,
        usageCount: countMap.get(t.key) ?? 0,
      })),
    })
  } catch (e) {
    console.error('GET /api/dq/conditions', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดคลังเงื่อนไขได้' }, { status: 500 })
  }
}

const MAX_PARAMS = 6

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

    const name = String(body.name ?? '').trim()
    const nameEn = String(body.nameEn ?? '').trim()
    const sentence = String(body.sentence ?? '').trim()
    const dimension = String(body.dimension ?? '').trim()
    const engineType = String(body.engineType ?? '').trim()

    if (name.length < 2) return NextResponse.json({ error: 'กรุณาตั้งชื่อเงื่อนไขอย่างน้อย 2 ตัวอักษร' }, { status: 400 })
    if (name.length > 80) return NextResponse.json({ error: 'ชื่อเงื่อนไขต้องไม่เกิน 80 ตัวอักษร' }, { status: 400 })
    if (sentence.length < 3) {
      return NextResponse.json(
        { error: 'กรุณาระบุประโยค "must ..." (ภาษาอังกฤษ) อย่างน้อย 3 ตัวอักษร เช่น match the Thai citizen ID pattern' },
        { status: 400 },
      )
    }
    if (sentence.length > 160) return NextResponse.json({ error: 'ประโยค must ต้องไม่เกิน 160 ตัวอักษร' }, { status: 400 })
    if (!isDimensionKey(dimension)) return NextResponse.json({ error: 'กรุณาเลือกมิติคุณภาพข้อมูล' }, { status: 400 })
    if (!isConditionKey(engineType)) {
      return NextResponse.json({ error: 'เอนจินประเมินผลไม่ถูกต้อง' }, { status: 400 })
    }

    // ตรวจนิยามพารามิเตอร์ — ต้องครอบคลุมคีย์ที่เอนจินบังคับ เพื่อให้กฎที่ใช้เงื่อนไขนี้ประเมินผลได้จริง
    const rawParams = Array.isArray(body.params) ? (body.params as unknown[]) : []
    if (rawParams.length > MAX_PARAMS) {
      return NextResponse.json({ error: `พารามิเตอร์ต้องไม่เกิน ${MAX_PARAMS} รายการ` }, { status: 400 })
    }
    const paramDefs: TemplateParamDef[] = []
    for (const raw of rawParams) {
      const p = (raw ?? {}) as Record<string, unknown>
      const key = String(p.key ?? '').trim()
      const label = String(p.label ?? '').trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        return NextResponse.json({ error: `คีย์พารามิเตอร์ "${key || '(ว่าง)'}" ต้องเป็นตัวอักษรอังกฤษ ตัวเลข หรือ _` }, { status: 400 })
      }
      if (!label) return NextResponse.json({ error: `กรุณาระบุป้ายชื่อของพารามิเตอร์ "${key}"` }, { status: 400 })
      if (paramDefs.some((d) => d.key === key)) {
        return NextResponse.json({ error: `คีย์พารามิเตอร์ "${key}" ซ้ำกัน` }, { status: 400 })
      }
      paramDefs.push({
        key,
        label: label.slice(0, 80),
        type: (TEMPLATE_PARAM_TYPES as string[]).includes(String(p.type))
          ? (String(p.type) as TemplateParamDef['type'])
          : 'text',
        placeholder: typeof p.placeholder === 'string' && p.placeholder.trim() ? p.placeholder.trim().slice(0, 80) : undefined,
      })
    }
    const requiredKeys = ENGINE_REQUIRED_PARAM_KEYS[engineType]
    const missing = requiredKeys.filter((k) => !paramDefs.some((d) => d.key === k))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `เอนจิน ${engineType} ต้องมีพารามิเตอร์: ${missing.join(', ')} (เพิ่มพารามิเตอร์ที่ขาดก่อนบันทึก)` },
        { status: 400 },
      )
    }

    const created = await db.conditionTemplate.create({
      data: {
        key: generateTemplateKey(),
        name,
        nameEn,
        sentence,
        dimension,
        engineType,
        params: JSON.stringify(paramDefs),
        isSystem: false,
        enabled: true,
        createdBy: op.ctx.email,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_CONDITION',
        actor: op.ctx.email,
        target: created.name,
        detail: `สร้างเงื่อนไขส่วนกลางใหม่ "${created.name}" (รหัส ${created.key}) — must ${created.sentence}, มิติ ${DIMENSION_LABELS[dimension].th}, เอนจิน ${created.engineType} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ condition: { ...created, params: paramDefs } }, { status: 201 })
  } catch (e) {
    console.error('POST /api/dq/conditions', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างเงื่อนไขส่วนกลางได้' }, { status: 500 })
  }
}
