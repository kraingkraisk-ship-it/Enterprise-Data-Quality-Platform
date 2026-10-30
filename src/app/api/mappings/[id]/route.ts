import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  MAPPING_STATUSES,
  MAPPING_TEXT_MAX,
  MAPPING_TYPE_KEYS,
  bumpMappingVersion,
  isMappingType,
  isValidMappingVersion,
} from '@/lib/mappings'
import {
  MAPPING_INCLUDE,
  buildEndpointDetail,
  findDuplicatePair,
  loadDomainMap,
  mappingExpanded,
} from '@/lib/mappings-server'

/**
 * Data Mapping API — รายการเดียว (v0.21.0 · v0.36.0 ไม่มีคิวอนุมัติ)
 *
 * PATCH /api/mappings/[id]
 * body: { operatorEmail, action, … }
 * - UPDATE     — แก้ไข (แก้ได้ทุกสถานะ · แก้เนื้อหาขณะ ACTIVE = เวอร์ชัน +0.1 อัตโนมัติ) สิทธิ์ MANAGE_DATASETS
 * - DELETE     — ลบ mapping สิทธิ์ MANAGE_DATASETS
 * - ACTIVATE   — เปิดใช้งาน (เฉพาะ DRAFT/DEPRECATED → ACTIVE) สิทธิ์ MANAGE_DATASETS
 * - SET_VERSION — ปรับเวอร์ชันด้วยมือ สิทธิ์ MANAGE_DATASETS
 * - DEPRECATE  — เลิกใช้ (เฉพาะ ACTIVE) สิทธิ์ MANAGE_DATASETS
 *
 * กติกาสถานะ (v0.36.0 — RBAC ตามบทบาทล้วน ทุก action บันทึก Audit Trail):
 * - สร้าง = DRAFT เสมอ → ผู้มี MANAGE_DATASETS เปิดใช้งานเอง (ACTIVATE → ACTIVE)
 * - แก้เนื้อหา (เส้นทาง/ประเภท/กฎการแปลง) ขณะใช้งานอยู่ (ACTIVE) = เวอร์ชัน +0.1 อัตโนมัติ เพื่อคงประวัติสเปก
 */
const STATUS_ACTIONS = ['ACTIVATE', 'DEPRECATE'] as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const mapping = await db.dataMapping.findUnique({ where: { id }, include: MAPPING_INCLUDE })
    if (!mapping) return NextResponse.json({ error: 'ไม่พบ Data Mapping นี้ในระบบ' }, { status: 404 })

    // v0.22.0 — รายละเอียดเต็มสำหรับ Mapping Detail Dialog: endpoint detail ทั้งสองฝั่ง
    // (meta + ข้อมูลกายภาพจากการแมปคอลัมน์ + กฎ DQ ที่ผูก + ธรรมาภิบาล) + สรุป exception action + audit
    const [domainMap, source, target, auditEntries] = await Promise.all([
      loadDomainMap(),
      buildEndpointDetail(mapping.sourceElementId),
      buildEndpointDetail(mapping.targetElementId),
      db.auditLog.findMany({
        where: { target: mapping.code },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, actor: true, target: true, detail: true, createdAt: true },
      }),
    ])

    // สรุป Exception Action จากกฎที่ผูกกับ element ทั้งสองฝั่ง (v0.22.0 — action อยู่ที่กฎ)
    const actionCounts = new Map<string, number>()
    for (const side of [source, target]) {
      for (const rule of side?.rules ?? []) {
        if (rule.exceptionAction) {
          actionCounts.set(rule.exceptionAction, (actionCounts.get(rule.exceptionAction) ?? 0) + 1)
        }
      }
    }

    return NextResponse.json({
      mapping: mappingExpanded(mapping, domainMap),
      source,
      target,
      exceptionActions: [...actionCounts.entries()].map(([key, count]) => ({ key, count })),
      audit: auditEntries,
    })
  } catch (e) {
    console.error('GET /api/mappings/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลด Data Mapping ได้' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const action = String(body.action ?? 'UPDATE').trim().toUpperCase()
    const permission = 'MANAGE_DATASETS' // v0.36.0 — ทุก action ใช้สิทธิ์เดียว (RBAC ตามบทบาทล้วน)

    const op = await resolveOperator(body.operatorEmail, permission)
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    if (!['UPDATE', 'DELETE', 'SET_VERSION', ...STATUS_ACTIONS].includes(action)) {
      return NextResponse.json({ error: `การดำเนินการไม่ถูกต้อง (UPDATE | DELETE | SET_VERSION | ${STATUS_ACTIONS.join(' | ')})` }, { status: 400 })
    }

    const mapping = await db.dataMapping.findUnique({
      where: { id },
      include: MAPPING_INCLUDE,
    })
    if (!mapping) return NextResponse.json({ error: 'ไม่พบ Data Mapping นี้ในระบบ' }, { status: 404 })

    const label = `${mapping.code} (${mapping.source.nameTh} → ${mapping.target.nameTh})`

    /* ---------------- เปิดใช้งาน (v0.36.0 — ตรงด้วยสิทธิ์ MANAGE_DATASETS) ---------------- */
    if (action === 'ACTIVATE') {
      if (!['DRAFT', 'DEPRECATED'].includes(mapping.status)) {
        return NextResponse.json({ error: 'เฉพาะ mapping สถานะ DRAFT หรือ DEPRECATED เท่านั้นที่เปิดใช้งานได้' }, { status: 400 })
      }
      const updated = await db.dataMapping.update({
        where: { id },
        data: { status: 'ACTIVE' },
      })
      await db.auditLog.create({
        data: {
          action: 'ACTIVATE_DATA_MAPPING',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `เปิดใช้งาน Data Mapping ${label} — สถานะเปลี่ยนจาก ${mapping.status} เป็น ACTIVE ใช้งานได้ · เวอร์ชัน ${mapping.version} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({
        mapping: { id: updated.id, status: updated.status, version: updated.version },
        message: `เปิดใช้งาน ${mapping.code} แล้ว — ใช้งานได้ (ACTIVE)`,
      })
    }

    if (action === 'SET_VERSION') {
      // v0.36.0 — ปรับเวอร์ชันด้วยมือ (สิทธิ์ MANAGE_DATASETS) พร้อม Audit Trail
      const version = String(body.version ?? '').trim()
      if (!isValidMappingVersion(version)) {
        return NextResponse.json({ error: 'รูปแบบเวอร์ชันไม่ถูกต้อง — ใช้ตัวเลขรูปแบบ X.Y เช่น 1.0, 1.5 หรือ 2.0' }, { status: 400 })
      }
      if (version === mapping.version) {
        return NextResponse.json({ error: `เวอร์ชันเป็น ${version} อยู่แล้ว` }, { status: 409 })
      }
      await db.dataMapping.update({ where: { id }, data: { version } })
      await db.auditLog.create({
        data: {
          action: 'SET_MAPPING_VERSION',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `ปรับเวอร์ชัน Data Mapping ${label} ด้วยมือ: ${mapping.version} → ${version} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ mapping: { id, version }, message: `ปรับเวอร์ชัน ${mapping.code} เป็น ${version} แล้ว` })
    }

    if (action === 'DEPRECATE') {
      if (mapping.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'เฉพาะ mapping ที่ใช้งานอยู่ (ACTIVE) เท่านั้นที่เลิกใช้ได้' }, { status: 400 })
      }
      const note = String(body.note ?? '').trim().slice(0, MAPPING_TEXT_MAX)
      const updated = await db.dataMapping.update({ where: { id }, data: { status: 'DEPRECATED' } })
      await db.auditLog.create({
        data: {
          action: 'DEPRECATE_DATA_MAPPING',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `เลิกใช้ Data Mapping ${label} — สถานะเปลี่ยนเป็น DEPRECATED${note ? ` · เหตุผล: ${note}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ mapping: { id: updated.id, status: updated.status }, message: `เลิกใช้ ${mapping.code} แล้ว (DEPRECATED)` })
    }

    if (action === 'DELETE') {
      await db.dataMapping.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: 'DELETE_DATA_MAPPING',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `ลบ Data Mapping ${label} (ประเภท ${mapping.mappingType}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ลบ Data Mapping ${mapping.code} เรียบร้อย` })
    }

    // ---------- UPDATE ----------
    const newSourceId = String(body.sourceElementId ?? mapping.sourceElementId).trim()
    const newTargetId = String(body.targetElementId ?? mapping.targetElementId).trim()
    const newType = String(body.mappingType ?? mapping.mappingType).trim().toUpperCase()
    const newTransformNote = String(body.transformNote ?? mapping.transformNote).trim().slice(0, MAPPING_TEXT_MAX)
    const newNote = body.note !== undefined ? String(body.note).trim().slice(0, MAPPING_TEXT_MAX) : mapping.note

    const endpointsChanged = newSourceId !== mapping.sourceElementId || newTargetId !== mapping.targetElementId
    const contentChanged = endpointsChanged || newType !== mapping.mappingType || newTransformNote !== mapping.transformNote

    // เนื้อหาแก้ได้ทุกสถานะ (v0.36.0 — ไม่มีคิวอนุมัติ):
    // ขณะใช้งานอยู่ (ACTIVE) แก้เนื้อหา = เวอร์ชัน +0.1 อัตโนมัติ เพื่อคงประวัติสเปกที่เคยใช้งาน (Audit Trail บันทึกครบ)

    if (!isMappingType(newType)) {
      return NextResponse.json({ error: `ประเภทการแมปไม่ถูกต้อง — ต้องเป็น: ${MAPPING_TYPE_KEYS.join(', ')}` }, { status: 400 })
    }
    // v0.22.0 — RENAME ไม่บังคับกฎการแปลง (แต่กรอกได้ เช่น TRIM) · เฉพาะ DIRECT เท่านั้นที่ล้างค่า
    const transformNote = newType === 'DIRECT' ? '' : newTransformNote
    if (!['DIRECT', 'RENAME'].includes(newType) && !transformNote) {
      return NextResponse.json({ error: 'ประเภทการแมปนี้ต้องระบุรายละเอียดการแปลง/สูตร/ตารางอ้างอิง (transformNote)' }, { status: 400 })
    }
    if (newSourceId === newTargetId) {
      return NextResponse.json({ error: 'ห้ามแมป element กับตัวเอง — ต้นทางและปลายทางต้องเป็นคนละ element' }, { status: 400 })
    }

    if (endpointsChanged) {
      const elements = await db.dataElement.findMany({
        where: { id: { in: [newSourceId, newTargetId] } },
        select: { id: true, code: true, nameTh: true, status: true },
      })
      if (elements.length !== 2) {
        return NextResponse.json({ error: 'ไม่พบ Data Element ต้นทางหรือปลายทางในระบบ — ต้องเลือกจาก element ที่ลงทะเบียนแล้วเท่านั้น' }, { status: 404 })
      }
      for (const el of elements) {
        if (el.status !== 'ACTIVE') {
          return NextResponse.json(
            { error: `element "${el.nameTh}" (${el.code}) ไม่ใช่สถานะ ACTIVE — เปิดใช้งาน element ก่อนจึงนำมาแมปได้ (หน้า Data Domain)` },
            { status: 409 },
          )
        }
      }
      const dup = await findDuplicatePair(newSourceId, newTargetId, id)
      if (dup) {
        const reversed = dup.sourceElementId === newTargetId
        return NextResponse.json(
          {
            error: reversed
              ? `แมปทิศกลับไม่ได้ — มี mapping ${dup.code} (${dup.source.nameTh} → ${dup.target.nameTh}) อยู่แล้ว เพราะการแมปหมายถึงข้อมูลชนิดเดียวกัน`
              : `มี mapping ${dup.code} ของคู่ element นี้อยู่แล้ว (${dup.source.nameTh} → ${dup.target.nameTh})`,
          },
          { status: 409 },
        )
      }
    }

    if (!(MAPPING_STATUSES as readonly string[]).includes(mapping.status)) {
      return NextResponse.json({ error: 'สถานะของ mapping ไม่ถูกต้องในระบบ' }, { status: 409 })
    }

    // v0.36.0 — แก้เนื้อหาขณะใช้งานอยู่ (ACTIVE) = เวอร์ชัน +0.1 อัตโนมัติ (คงประวัติสเปกที่เคยใช้)
    const nextVersion = contentChanged && mapping.status === 'ACTIVE' ? bumpMappingVersion(mapping.version) : mapping.version

    const updated = await db.dataMapping.update({
      where: { id },
      data: {
        sourceElementId: newSourceId,
        targetElementId: newTargetId,
        mappingType: newType,
        transformNote,
        note: newNote,
        version: nextVersion,
      },
    })
    await db.auditLog.create({
      data: {
        action: 'UPDATE_DATA_MAPPING',
        actor: op.ctx.email,
        target: mapping.code,
        detail: `แก้ไข Data Mapping ${label}${endpointsChanged ? ' (เปลี่ยนเส้นทาง)' : ''}${newType !== mapping.mappingType ? ` (ประเภท ${mapping.mappingType} → ${newType})` : ''}${nextVersion !== mapping.version ? ` · เวอร์ชันอัตโนมัติ ${mapping.version} → ${nextVersion} (แก้เนื้อหาขณะใช้งานอยู่)` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    const [fresh, domainMap] = await Promise.all([
      db.dataMapping.findUnique({ where: { id: updated.id }, include: MAPPING_INCLUDE }),
      loadDomainMap(),
    ])
    return NextResponse.json({
      mapping: fresh ? mappingExpanded(fresh, domainMap) : null,
      message: `แก้ไข Data Mapping ${mapping.code} เรียบร้อย${nextVersion !== mapping.version ? ` · เวอร์ชัน ${nextVersion}` : ''}`,
    })
  } catch (e) {
    console.error('PATCH /api/mappings/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถดำเนินการกับ Data Mapping ได้' }, { status: 500 })
  }
}
