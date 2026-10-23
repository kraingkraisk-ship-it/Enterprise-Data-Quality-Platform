import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { ELEMENT_DATA_TYPES, ELEMENT_NAME_MAX, ELEMENT_STATUSES, ELEMENT_TEXT_MAX, isElementDataType, isElementStatus } from '@/lib/elements'

/**
 * Data Element API — รายการเดี่ยว (v0.18.0)
 *
 * GET   /api/elements/[id] — รายละเอียดเต็ม (Meta Data ครบ + mapping รายคอลัมน์ + กฎที่ผูก)
 * PATCH /api/elements/[id] — body: { operatorEmail, action: 'UPDATE' | 'DELETE', …metaFields }
 *
 * สิทธิ์ (เฉพาะ PATCH): MANAGE_DATASETS — ทุกการเปลี่ยนแปลงบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - DELETE ปฏิเสธเมื่อยังมีกฎผูกอยู่ (ต้องปลดกฎก่อน — กันกฎกลายเป็นกฎไร้บริบท)
 * - แก้ชื่อซ้ำในโดเมนย่อยเดียวกันไม่ได้ · ห้ามย้ายโดเมนย่อย (ย้าย = ลบแล้วสร้างใหม่ เพื่อคงประวัติ audit)
 */

/** ตรวจรูปแบบฟิลด์ meta — คืนข้อความ error หรือ null */
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

/** ประกอบ object ของฟิลด์ meta จาก body */
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
      // ไม่ใช่ JSON — ใช้ค่าเริ่มต้น
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const element = await db.dataElement.findUnique({
      where: { id },
      include: {
        subDomain: { select: { id: true, name: true, nameEn: true, parentId: true, parent: { select: { id: true, name: true, color: true } } } },
        columnMappings: {
          include: { asset: { select: { id: true, name: true } } },
          orderBy: [{ assetId: 'asc' }, { columnName: 'asc' }],
        },
        rules: {
          where: { enabled: true },
          select: { id: true, column: true, condition: true, severity: true, threshold: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })

    const conditionKeys = [...new Set(element.rules.map((r) => r.condition))]
    const templates = await db.conditionTemplate.findMany({
      where: { key: { in: conditionKeys } },
      select: { key: true, name: true, dimension: true },
    })
    const templateMap = new Map(templates.map((t) => [t.key, t]))

    return NextResponse.json({
      element: {
        ...element,
        rules: element.rules.map((r) => ({
          ...r,
          conditionName: templateMap.get(r.condition)?.name ?? r.condition,
          dimension: templateMap.get(r.condition)?.dimension ?? 'VALIDITY',
        })),
      },
    })
  } catch (e) {
    console.error('GET /api/elements/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายละเอียด Data Element ได้' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const action = String(body.action ?? 'UPDATE').trim().toUpperCase()
    if (!['UPDATE', 'DELETE'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (UPDATE | DELETE)' }, { status: 400 })
    }

    const element = await db.dataElement.findUnique({
      where: { id },
      include: {
        subDomain: { select: { id: true, name: true } },
        _count: { select: { rules: true, columnMappings: true } },
      },
    })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })

    if (action === 'DELETE') {
      if (element._count.rules > 0) {
        return NextResponse.json(
          {
            error: `ลบไม่ได้ — "${element.nameTh}" ยังมีกฎตรวจสอบ ${element._count.rules} ข้อผูกอยู่ (ปลดการผูกกฎในคลังกฎก่อน จึงจะลบได้)`,
          },
          { status: 409 },
        )
      }
      await db.dataElement.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: 'DELETE_DATA_ELEMENT',
          actor: op.ctx.email,
          target: `${element.code} ${element.nameTh}`,
          detail: `ลบ Data Element "${element.nameTh}" (${element.code}) จากโดเมนย่อย "${element.subDomain.name}" (พร้อม mapping ${element._count.columnMappings} รายการ) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ลบ Data Element "${element.nameTh}" เรียบร้อย` })
    }

    // ---------- UPDATE ----------
    const nameTh = String(body.nameTh ?? element.nameTh).trim()
    if (!nameTh) return NextResponse.json({ error: 'กรุณาระบุชื่อ Data Element' }, { status: 400 })
    if (nameTh.length > ELEMENT_NAME_MAX) {
      return NextResponse.json({ error: `ชื่อ Data Element ยาวเกิน ${ELEMENT_NAME_MAX} ตัวอักษร` }, { status: 400 })
    }
    const movedSubDomainId = String(body.subDomainId ?? '').trim()
    if (movedSubDomainId && movedSubDomainId !== element.subDomainId) {
      return NextResponse.json(
        { error: 'ย้ายโดเมนย่อยของ element ไม่ได้ (เพื่อคงประวัติการตรวจสอบ) — หากต้องการย้าย ให้ลบแล้วสร้างใหม่ที่โดเมนย่อยเป้าหมาย' },
        { status: 400 },
      )
    }
    const metaError = validateMetaFields(body)
    if (metaError) return NextResponse.json({ error: metaError }, { status: 400 })

    if (nameTh !== element.nameTh) {
      const dup = await db.dataElement.findFirst({ where: { subDomainId: element.subDomainId, nameTh }, select: { id: true } })
      if (dup) {
        return NextResponse.json({ error: `มี Data Element ชื่อ "${nameTh}" อยู่แล้วในโดเมนย่อย "${element.subDomain.name}"` }, { status: 409 })
      }
    }

    const changed: string[] = []
    if (nameTh !== element.nameTh) changed.push('ชื่อ')
    if (String(body.definition ?? '') !== element.definition) changed.push('นิยาม')
    if (String(body.dataType ?? 'TEXT') !== element.dataType) changed.push('ประเภทข้อมูล')
    if (Boolean(body.pii) !== element.pii) changed.push('PII')
    if (String(body.status ?? 'ACTIVE') !== element.status) changed.push('สถานะ')

    const updated = await db.dataElement.update({
      where: { id },
      data: { nameTh, ...metaFieldsFrom(body) },
    })

    await db.auditLog.create({
      data: {
        action: 'UPDATE_DATA_ELEMENT',
        actor: op.ctx.email,
        target: `${updated.code} ${updated.nameTh}`,
        detail: `แก้ไข Meta Data ของ Data Element "${updated.nameTh}" (${updated.code})${changed.length > 0 ? ` — แก้: ${changed.join(', ')}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ element: updated, message: `บันทึก Meta Data ของ "${updated.nameTh}" เรียบร้อย` })
  } catch (e) {
    console.error('PATCH /api/elements/[id]', e)
    return NextResponse.json({ error: 'ดำเนินการกับ Data Element ไม่สำเร็จ' }, { status: 500 })
  }
}
