import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  ELEMENT_DATA_TYPES,
  ELEMENT_NAME_MAX,
  ELEMENT_TEXT_MAX,
  isElementDataType,
  isOpUpdateFrequency,
  nextElementCode,
} from '@/lib/elements'

/**
 * Data Element API (v0.18.0 · meta 4 กลุ่ม + workflow อนุมัติ ใน v0.20.0) — องค์ประกอบข้อมูลเชิงตรรกะภายใต้โดเมนย่อย (ISO/IEC 11179)
 *
 * GET  /api/elements?subDomainId=… — รายการ element ทั้งหมด (หรือกรองตามโดเมนย่อย)
 *      คืน flat list พร้อม ruleCount/mappingCount ธง CDE/Financial + สถานะ workflow และข้อมูลโดเมนย่อย+โดเมนหลัก (client ประกอบ path เอง)
 * POST /api/elements — สร้าง element ใหม่ (สถานะเริ่มต้น DRAFT เสมอ — ต้องผ่าน workflow อนุมัติจึงจะ ACTIVE ใช้งานได้)
 *      body: { operatorEmail, subDomainId, nameTh, nameEn?, definition?, examples?, dataType?,
 *              formatPattern?, valueDomain?, maxLength?, unit?, ownerId?, stewardId?, custodianId?,
 *              pii?, classification?, isCde?, isFinancial?, opUpdateFrequency?, opNotes?, customFields?,
 *              referenceSetId? (v0.31.0 — ผูกทะเบียนข้อมูลอ้างอิงกับ valueDomain — เฉพาะทะเบียน ACTIVE) }
 *
 * สิทธิ์ (เฉพาะ POST): MANAGE_DATASETS — ทุกการสร้างบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - element ต้องแขวนใต้ "โดเมนย่อย" เท่านั้น (parentId != null) — ชี้โดเมนหลักตรง ๆ = ปฏิเสธ
 * - ชื่อ (nameTh) ซ้ำในโดเมนย่อยเดียวกันไม่ได้
 * - รหัส EL-#### สร้างอัตโนมัติเสมอ
 * - email ผู้รับผิดชอบ (owner/steward/custodian) ต้องเป็นบัญชีผู้ใช้ ACTIVE ในระบบเท่านั้น
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
          referenceSet: { select: { id: true, code: true, name: true, status: true } }, // v0.31.0
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
        referenceSetId: e.referenceSetId, // v0.31.0 — ทะเบียนข้อมูลอ้างอิงที่ valueDomain ผูกไว้
        referenceSet: e.referenceSet
          ? { id: e.referenceSet.id, code: e.referenceSet.code, name: e.referenceSet.name, status: e.referenceSet.status }
          : null,
        maxLength: e.maxLength,
        unit: e.unit,
        ownerId: e.ownerId,
        pii: e.pii,
        classification: e.classification,
        isCde: e.isCde,
        isFinancial: e.isFinancial,
        pendingApproval: e.pendingApproval,
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

/** ตรวจรูปแบบฟิลด์ meta ร่วมของ POST/PATCH — คืนข้อความ error หรือ null (สถานะเปลี่ยนผ่าน workflow อนุมัติเท่านั้น — ไม่รับจากฟอร์ม) */
function validateMetaFields(body: Record<string, unknown>): string | null {
  const dataType = String(body.dataType ?? 'TEXT').trim()
  if (!isElementDataType(dataType)) {
    return `ประเภทข้อมูลไม่ถูกต้อง — ต้องเป็น: ${ELEMENT_DATA_TYPES.join(', ')}`
  }
  const maxLength = body.maxLength
  if (maxLength !== null && maxLength !== undefined && maxLength !== '' && (Number.isNaN(Number(maxLength)) || Number(maxLength) < 0)) {
    return 'ความยาวสูงสุดต้องเป็นตัวเลขที่ไม่ติดลบ'
  }
  const freq = String(body.opUpdateFrequency ?? '').trim().toUpperCase()
  if (freq && !isOpUpdateFrequency(freq)) {
    return 'ความถี่การปรับปรุงไม่ถูกต้อง'
  }
  return null
}

/** ตรวจว่า email ผู้รับผิดชอบ (owner/steward/custodian) มีจริงในระบบและ ACTIVE — deny-by-default (v0.20.0) */
async function validateStewardshipEmails(body: Record<string, unknown>): Promise<string | null> {
  const emails = [body.ownerId, body.stewardId, body.custodianId]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
  if (emails.length === 0) return null
  const unique = [...new Set(emails)]
  const users = await db.user.findMany({ where: { email: { in: unique } }, select: { email: true, status: true, name: true } })
  const found = new Map(users.map((u) => [u.email, u]))
  for (const e of unique) {
    const u = found.get(e)
    if (!u) return `ไม่พบบัญชีผู้รับผิดชอบ "${e}" ในระบบ — ต้องเลือกจากผู้ใช้ที่มีอยู่เท่านั้น`
    if (u.status !== 'ACTIVE') return `บัญชี "${u.name}" ถูกระงับการใช้งาน — เลือกผู้ใช้ที่ ACTIVE เท่านั้น`
  }
  return null
}

/** ประกอบ object ของฟิลด์ meta จาก body (ตัดช่องว่าง/จำกัดความยาว) — ไม่รวม status (workflow เป็นเจ้าของ) */
function metaFieldsFrom(body: Record<string, unknown>) {
  const dataType = String(body.dataType ?? 'TEXT').trim()
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
  const freq = String(body.opUpdateFrequency ?? '').trim().toUpperCase()
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
    stewardId: String(body.stewardId ?? '').trim().toLowerCase() || null,
    custodianId: String(body.custodianId ?? '').trim().toLowerCase() || null,
    pii: Boolean(body.pii),
    classification: String(body.classification ?? 'UNCLASSIFIED').trim() || 'UNCLASSIFIED',
    isCde: Boolean(body.isCde),
    isFinancial: Boolean(body.isFinancial),
    opUpdateFrequency: isOpUpdateFrequency(freq) ? freq : '',
    opNotes: String(body.opNotes ?? '').trim().slice(0, ELEMENT_TEXT_MAX),
    customFields,
  }
}

/** ตรวจ + resolve referenceSetId (v0.31.0) — คืน null (ไม่ผูก) / id (ผูกได้) หรือ error message */
async function resolveReferenceSetId(raw: unknown): Promise<{ id: string | null; error: string | null }> {
  const rawId = String(raw ?? '').trim()
  if (!rawId) return { id: null, error: null }
  const rs = await db.referenceSet.findUnique({ where: { id: rawId }, select: { id: true, code: true, name: true, status: true } })
  if (!rs) return { id: null, error: 'ไม่พบทะเบียนข้อมูลอ้างอิงที่เลือกในระบบ' }
  if (rs.status !== 'ACTIVE') {
    return { id: null, error: `ทะเบียน "${rs.name}" ยังไม่ใช้งาน (สถานะ ${rs.status}) — ผูก valueDomain ได้เฉพาะทะเบียนที่อนุมัติแล้ว (ACTIVE)` }
  }
  return { id: rs.id, error: null }
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

    // ---------- deny-by-default: ผู้รับผิดชอบต้องเป็นผู้ใช้ ACTIVE ในระบบ ----------
    const peopleError = await validateStewardshipEmails(body)
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    // ---------- ผูกทะเบียนข้อมูลอ้างอิง (v0.31.0 — เฉพาะทะเบียน ACTIVE) ----------
    const refSet = await resolveReferenceSetId(body.referenceSetId)
    if (refSet.error) return NextResponse.json({ error: refSet.error }, { status: 400 })

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
        status: 'DRAFT', // v0.20.0: workflow อนุมัติ — element ใหม่เริ่มที่ DRAFT เสมอ ต้องผ่านการอนุมัติจึงจะ ACTIVE
        referenceSetId: refSet.id,
        ...metaFieldsFrom(body),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_DATA_ELEMENT',
        actor: op.ctx.email,
        target: `${created.code} ${created.nameTh}`,
        detail: `สร้าง Data Element "${created.nameTh}" (${created.code}) ภายใต้โดเมนย่อย "${subDomain.name}" — สถานะเริ่มต้น DRAFT (รอส่งขออนุมัติ)${created.isCde ? ' · CDE' : ''}${created.isFinancial ? ' · การเงิน' : ''}${refSet.id ? ' · ผูกทะเบียนอ้างอิง' : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ element: created, message: `สร้าง Data Element "${created.nameTh}" เรียบร้อย` }, { status: 201 })
  } catch (e) {
    console.error('POST /api/elements', e)
    return NextResponse.json({ error: 'สร้าง Data Element ไม่สำเร็จ' }, { status: 500 })
  }
}
