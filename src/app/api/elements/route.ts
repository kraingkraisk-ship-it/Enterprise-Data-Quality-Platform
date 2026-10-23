import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  ELEMENT_DATA_TYPES,
  ELEMENT_NAME_MAX,
  ELEMENT_STATUSES,
  ELEMENT_TEXT_MAX,
  isElementDataType,
  isElementStatus,
} from '@/lib/elements'

/**
 * Data Element API (v0.18.0) — องค์ประกอบข้อมูลเชิงตรรกะภายใต้โดเมนย่อย (ISO/IEC 11179)
 *
 * GET  /api/elements?subDomainId=… — รายการ element ทั้งหมด (หรือกรองตามโดเมนย่อย)
 *      คืน flat list พร้อม ruleCount/mappingCount และข้อมูลโดเมนย่อย+โดเมนหลัก (client ประกอบ path เอง)
 * POST /api/elements — สร้าง element ใหม่
 *      body: { operatorEmail, subDomainId, nameTh, nameEn?, definition?, examples?, dataType?,
 *              formatPattern?, valueDomain?, maxLength?, unit?, ownerId?, pii?, classification?,
 *              status?, customFields? }
 *
 * สิทธิ์ (เฉพาะ POST): MANAGE_DATASETS — ทุกการสร้างบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - element ต้องแขวนใต้ "โดเมนย่อย" เท่านั้น (parentId != null) — ชี้โดเมนหลักตรง ๆ = ปฏิเสธ
 * - ชื่อ (nameTh) ซ้ำในโดเมนย่อยเดียวกันไม่ได้
 * - รหัส EL-#### สร้างอัตโนมัติเสมอ
 */
export async function GET(req: NextRequest) {
  try {
    const subDomainId = req.nextUrl.searchParams.get('subDomainId')?.trim()

    const [elements, ruleGroups, mappingGroups] = await Promise.all([
      db.dataElement.findMany({
        where: subDomainId ? { subDomainId } : undefined,
        orderBy: [{ position: 'asc' }, { nameTh: 'asc' }],
        include: {
          subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } },
        },
      }),
      db.dqRule.groupBy({ by: ['dataElementId'], _count: { _all: true }, where: { dataElementId: { not: null } } }),
      db.dataElementColumnMapping.groupBy({ by: ['elementId'], _count: { _all: true } }),
    ])

    const rulesByElement = new Map<string, number>()
    for (const g of ruleGroups) {
      if (g.dataElementId) rulesByElement.set(g.dataElementId, g._count._all)
    }
    const mappingsByElement = new Map<string, number>()
    for (const g of mappingGroups) {
      mappingsByElement.set(g.elementId, g._count._all)
    }

    return NextResponse.json({
      elements: elements.map((e) => ({
        id: e.id,
        code: e.code,
        subDomainId: e.subDomainId,
        subDomainName: e.subDomain.name,
        subDomainNameEn: e.subDomain.nameEn,
        parentDomainId: e.subDomain.parentId,
        nameTh: e.nameTh,
        nameEn: e.nameEn,
        definition: e.definition,
        examples: e.examples,
        dataType: e.dataType,
        formatPattern: e.formatPattern,
        valueDomain: e.valueDomain,
        maxLength: e.maxLength,
        unit: e.unit,
        ownerId: e.ownerId,
        pii: e.pii,
        classification: e.classification,
        status: e.status,
        position: e.position,
        ruleCount: rulesByElement.get(e.id) ?? 0,
        mappingCount: mappingsByElement.get(e.id) ?? 0,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      count: elements.length,
    })
  } catch (e) {
    console.error('GET /api/elements', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการ Data Element ได้' }, { status: 500 })
  }
}

/** ตรวจรูปแบบฟิลด์ meta ร่วมของ POST/PATCH — คืนข้อความ error หรือ null */
function validateMetaFields(body: Record<string, unknown>): string | null {
  const dataType = String(body.dataType ?? 'TEXT').trim()
  if (!isElementDataType(dataType)) {
    return `ประเภทข้อมูลไม่ถูกต้อง — ต้องเป็น: ${ELEMENT_DATA_TYPES.join(', ')}`
  }
  const status = String(body.status ?? 'ACTIVE').trim()
  if (!isElementStatus(status)) {
    return `สถานะไม่ถูกต้อง — ต้องเป็น: ${ELEMENT_STATUSES.join(', ')}`
  }
  const maxLength = body.maxLength
  if (maxLength !== null && maxLength !== undefined && maxLength !== '' && (Number.isNaN(Number(maxLength)) || Number(maxLength) < 0)) {
    return 'ความยาวสูงสุดต้องเป็นตัวเลขที่ไม่ติดลบ'
  }
  return null
}

/** ประกอบ object ของฟิลด์ meta จาก body (ตัดช่องว่าง/จำกัดความยาว) */
function metaFieldsFrom(body: Record<string, unknown>) {
  const dataType = String(body.dataType ?? 'TEXT').trim()
  const status = String(body.status ?? 'ACTIVE').trim()
  const maxLengthRaw = body.maxLength
  const maxLength =
    maxLengthRaw === null || maxLengthRaw === undefined || maxLengthRaw === '' ? null : Math.max(0, Math.floor(Number(maxLengthRaw)))
  let customFields = '{}'
  if (body.customFields !== undefined && body.customFields !== null && String(body.customFields).trim() !== '') {
    try {
      const parsed = JSON.parse(String(body.customFields))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        customFields = JSON.stringify(parsed)
      }
    } catch {
      // ไม่ใช่ JSON — ใช้ค่าเริ่มต้น (deny-by-default: ไม่เก็บข้อมูลที่ตรวจไม่ได้)
    }
  }
  return {
    nameEn: String(body.nameEn ?? '').trim().slice(0, ELEMENT_NAME_MAX),
    definition: String(body.definition ?? '').trim().slice(0, ELEMENT_TEXT_MAX),
    examples: String(body.examples ?? '').trim().slice(0, ELEMENT_TEXT_MAX),
    dataType: isElementDataType(dataType) ? dataType : 'TEXT',
    formatPattern: String(body.formatPattern ?? '').trim().slice(0, ELEMENT_TEXT_MAX),
    valueDomain: String(body.valueDomain ?? '').trim().slice(0, ELEMENT_TEXT_MAX),
    maxLength,
    unit: String(body.unit ?? '').trim().slice(0, 40),
    ownerId: String(body.ownerId ?? '').trim().toLowerCase() || null,
    pii: Boolean(body.pii),
    classification: String(body.classification ?? 'UNCLASSIFIED').trim() || 'UNCLASSIFIED',
    status: isElementStatus(status) ? status : 'ACTIVE',
    customFields,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const subDomainId = String(body.subDomainId ?? '').trim()
    const nameTh = String(body.nameTh ?? '').trim()

    if (!subDomainId) return NextResponse.json({ error: 'กรุณาเลือกโดเมนย่อยที่ element สังกัด' }, { status: 400 })
    if (!nameTh) return NextResponse.json({ error: 'กรุณาระบุชื่อ Data Element' }, { status: 400 })
    if (nameTh.length > ELEMENT_NAME_MAX) {
      return NextResponse.json({ error: `ชื่อ Data Element ยาวเกิน ${ELEMENT_NAME_MAX} ตัวอักษร` }, { status: 400 })
    }

    // ---------- deny-by-default: element ต้องอยู่ใต้โดเมนย่อยเสมอ ----------
    const subDomain = await db.dataDomain.findUnique({ where: { id: subDomainId } })
    if (!subDomain) {
      return NextResponse.json({ error: 'ไม่พบโดเมนย่อยที่ระบุ' }, { status: 404 })
    }
    if (subDomain.parentId === null) {
      return NextResponse.json(
        { error: `Data Element ต้องแขวนใต้ "โดเมนย่อย" เท่านั้น — "${subDomain.name}" เป็นโดเมนหลัก กรุณาเลือกหรือสร้างโดเมนย่อยก่อน` },
        { status: 400 },
      )
    }

    const metaError = validateMetaFields(body)
    if (metaError) return NextResponse.json({ error: metaError }, { status: 400 })

    // ---------- กันชื่อซ้ำในโดเมนย่อยเดียวกัน ----------
    const dup = await db.dataElement.findFirst({ where: { subDomainId, nameTh }, select: { id: true } })
    if (dup) {
      return NextResponse.json({ error: `มี Data Element ชื่อ "${nameTh}" อยู่แล้วในโดเมนย่อย "${subDomain.name}"` }, { status: 409 })
    }

    const position = await db.dataElement.count({ where: { subDomainId } })
    const created = await db.dataElement.create({
      data: {
        code: await nextElementCode(db),
        subDomainId,
        nameTh,
        position,
        createdBy: op.ctx.email,
        ...metaFieldsFrom(body),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_DATA_ELEMENT',
        actor: op.ctx.email,
        target: `${created.code} ${created.nameTh}`,
        detail: `สร้าง Data Element "${created.nameTh}" (${created.code}) ภายใต้โดเมนย่อย "${subDomain.name}" โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ element: created, message: `สร้าง Data Element "${created.nameTh}" เรียบร้อย` }, { status: 201 })
  } catch (e) {
    console.error('POST /api/elements', e)
    return NextResponse.json({ error: 'สร้าง Data Element ไม่สำเร็จ' }, { status: 500 })
  }
}
