import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { MAPPING_STATUSES, MAPPING_TEXT_MAX, MAPPING_TYPE_KEYS, isMappingType } from '@/lib/mappings'
import { MAPPING_INCLUDE, findDuplicatePair, loadDomainMap, mappingExpanded } from '@/lib/mappings-server'

/**
 * Data Mapping API — รายการเดียว (v0.21.0)
 *
 * PATCH /api/mappings/[id]
 * body: { operatorEmail, action, … }
 * - UPDATE           — แก้ไข (endpoint/ประเภท/รายละเอียดการแปลง แก้ได้เฉพาะสถานะ DRAFT · หมายเหตุแก้ได้เมื่อไม่รออนุมัติ) สิทธิ์ MANAGE_DATASETS
 * - DELETE           — ลบ mapping (ห้ามลบขณะรออนุมัติ) สิทธิ์ MANAGE_DATASETS
 * - SUBMIT_APPROVAL  — ส่งขออนุมัติ (เฉพาะ DRAFT/DEPRECATED) สิทธิ์ MANAGE_DATASETS
 * - APPROVE          — อนุมัติ → ACTIVE (บันทึกผู้อนุมัติ) สิทธิ์ APPROVE_EXCEPTIONS
 * - REJECT_APPROVAL  — ส่งกลับ (คงสถานะเดิมให้ผู้ดูแลแก้) สิทธิ์ APPROVE_EXCEPTIONS
 * - DEPRECATE        — เลิกใช้ (เฉพาะ ACTIVE) สิทธิ์ APPROVE_EXCEPTIONS
 *
 * กติกา workflow อนุมัติ (จริง บันทึกผู้อนุมัติ + Audit Trail ทุกครั้ง — แบบเดียวกับ Data Element v0.20.0):
 * - สร้าง = DRAFT เสมอ → ส่งขออนุมัติ → รออนุมัติ (ล็อกแก้ไข/ลบ) → อนุมัติ (ACTIVE) หรือส่งกลับ
 * - เลิกใช้ (DEPRECATED) และกลับมาใช้ใหม่ ทำผ่าน workflow เดียวกัน
 */
const WORKFLOW_ACTIONS = ['SUBMIT_APPROVAL', 'APPROVE', 'REJECT_APPROVAL', 'DEPRECATE'] as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const [mapping, domainMap] = await Promise.all([
      db.dataMapping.findUnique({ where: { id }, include: MAPPING_INCLUDE }),
      loadDomainMap(),
    ])
    if (!mapping) return NextResponse.json({ error: 'ไม่พบ Data Mapping นี้ในระบบ' }, { status: 404 })
    return NextResponse.json({ mapping: mappingExpanded(mapping, domainMap) })
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
    const permission =
      action === 'UPDATE' || action === 'DELETE' || action === 'SUBMIT_APPROVAL'
        ? 'MANAGE_DATASETS'
        : 'APPROVE_EXCEPTIONS'

    const op = await resolveOperator(body.operatorEmail, permission)
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    if (!['UPDATE', 'DELETE', ...WORKFLOW_ACTIONS].includes(action)) {
      return NextResponse.json({ error: `การดำเนินการไม่ถูกต้อง (UPDATE | DELETE | ${WORKFLOW_ACTIONS.join(' | ')})` }, { status: 400 })
    }

    const mapping = await db.dataMapping.findUnique({
      where: { id },
      include: MAPPING_INCLUDE,
    })
    if (!mapping) return NextResponse.json({ error: 'ไม่พบ Data Mapping นี้ในระบบ' }, { status: 404 })

    const label = `${mapping.code} (${mapping.source.nameTh} → ${mapping.target.nameTh})`

    /* ---------------- workflow อนุมัติ (v0.21.0) ---------------- */
    if (action === 'SUBMIT_APPROVAL') {
      if (mapping.pendingApproval) {
        return NextResponse.json({ error: 'mapping นี้อยู่ในสถานะ "รออนุมัติ" อยู่แล้ว' }, { status: 409 })
      }
      if (!['DRAFT', 'DEPRECATED'].includes(mapping.status)) {
        return NextResponse.json({ error: 'เฉพาะ mapping สถานะ DRAFT หรือ DEPRECATED เท่านั้นที่ส่งขออนุมัติได้' }, { status: 400 })
      }
      await db.dataMapping.update({ where: { id }, data: { pendingApproval: true } })
      await db.auditLog.create({
        data: {
          action: 'SUBMIT_DATA_MAPPING_APPROVAL',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `ส่งขออนุมัติ Data Mapping ${label} — รอผู้มีสิทธิ์อนุมัติ (APPROVE_EXCEPTIONS) ตัดสิน โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ส่งขออนุมัติ ${mapping.code} แล้ว — รอผู้อนุมัติตัดสิน` })
    }

    if (action === 'APPROVE') {
      if (!mapping.pendingApproval) {
        return NextResponse.json({ error: 'mapping นี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 409 })
      }
      const updated = await db.dataMapping.update({
        where: { id },
        data: { status: 'ACTIVE', pendingApproval: false, approvedBy: op.ctx.email, approvedAt: new Date() },
      })
      await db.auditLog.create({
        data: {
          action: 'APPROVE_DATA_MAPPING',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `อนุมัติ Data Mapping ${label} — สถานะเปลี่ยนเป็น ACTIVE ใช้งานได้ โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ mapping: { id: updated.id, status: updated.status }, message: `อนุมัติ ${mapping.code} แล้ว — ใช้งานได้ (ACTIVE)` })
    }

    if (action === 'REJECT_APPROVAL') {
      if (!mapping.pendingApproval) {
        return NextResponse.json({ error: 'mapping นี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 409 })
      }
      const note = String(body.note ?? '').trim().slice(0, MAPPING_TEXT_MAX)
      await db.dataMapping.update({ where: { id }, data: { pendingApproval: false } })
      await db.auditLog.create({
        data: {
          action: 'REJECT_DATA_MAPPING_APPROVAL',
          actor: op.ctx.email,
          target: mapping.code,
          detail: `ส่งกลับ (ไม่อนุมัติ) Data Mapping ${label} — คงสถานะ ${mapping.status} ให้ผู้ดูแลแก้ไขแล้วส่งใหม่${note ? ` · เหตุผล: ${note}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ส่งกลับ ${mapping.code} แล้ว — คงสถานะ ${mapping.status === 'DRAFT' ? 'ร่าง (DRAFT)' : 'เลิกใช้ (DEPRECATED)'}` })
    }

    if (action === 'DEPRECATE') {
      if (mapping.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'เฉพาะ mapping ที่ใช้งานอยู่ (ACTIVE) เท่านั้นที่เลิกใช้ได้' }, { status: 400 })
      }
      const note = String(body.note ?? '').trim().slice(0, MAPPING_TEXT_MAX)
      const updated = await db.dataMapping.update({ where: { id }, data: { status: 'DEPRECATED', pendingApproval: false } })
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
      if (mapping.pendingApproval) {
        return NextResponse.json({ error: 'ลบไม่ได้ขณะ "รออนุมัติ" — อนุมัติหรือส่งกลับก่อนจึงจะลบได้' }, { status: 409 })
      }
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
    if (mapping.pendingApproval) {
      return NextResponse.json(
        { error: 'แก้ไขไม่ได้ขณะ "รออนุมัติ" — ผู้อนุมัติต้องอนุมัติหรือส่งกลับก่อนจึงจะแก้ไขได้ (กันเนื้อหาเปลี่ยนระหว่างพิจารณา)' },
        { status: 409 },
      )
    }

    const newSourceId = String(body.sourceElementId ?? mapping.sourceElementId).trim()
    const newTargetId = String(body.targetElementId ?? mapping.targetElementId).trim()
    const newType = String(body.mappingType ?? mapping.mappingType).trim().toUpperCase()
    const newTransformNote = String(body.transformNote ?? mapping.transformNote).trim().slice(0, MAPPING_TEXT_MAX)
    const newNote = body.note !== undefined ? String(body.note).trim().slice(0, MAPPING_TEXT_MAX) : mapping.note

    const endpointsChanged = newSourceId !== mapping.sourceElementId || newTargetId !== mapping.targetElementId
    const contentChanged = endpointsChanged || newType !== mapping.mappingType || newTransformNote !== mapping.transformNote

    // เนื้อหาที่ผ่านการอนุมัติ (เส้นทาง/ประเภท/รายละเอียดการแปลง) แก้ได้เฉพาะตอนยังเป็นร่าง — ACTIVE ต้องลบแล้วสร้างใหม่ผ่านอนุมัติ
    if (contentChanged && mapping.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'เส้นทาง/ประเภท/รายละเอียดการแปลง ผ่านการอนุมัติแล้ว — แก้ได้เฉพาะตอนสถานะ DRAFT (เลิกใช้แล้วสร้าง mapping ใหม่แทน)' },
        { status: 400 },
      )
    }

    if (!isMappingType(newType)) {
      return NextResponse.json({ error: `ประเภทการแมปไม่ถูกต้อง — ต้องเป็น: ${MAPPING_TYPE_KEYS.join(', ')}` }, { status: 400 })
    }
    const transformNote = newType === 'DIRECT' ? '' : newTransformNote
    if (newType !== 'DIRECT' && !transformNote) {
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
            { error: `element "${el.nameTh}" (${el.code}) ไม่ใช่สถานะ ACTIVE — เฉพาะ element ที่อนุมัติแล้วจึงนำมาแมปได้` },
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

    const updated = await db.dataMapping.update({
      where: { id },
      data: {
        sourceElementId: newSourceId,
        targetElementId: newTargetId,
        mappingType: newType,
        transformNote,
        note: newNote,
      },
    })
    await db.auditLog.create({
      data: {
        action: 'UPDATE_DATA_MAPPING',
        actor: op.ctx.email,
        target: mapping.code,
        detail: `แก้ไข Data Mapping ${label}${endpointsChanged ? ' (เปลี่ยนเส้นทาง)' : ''}${newType !== mapping.mappingType ? ` (ประเภท ${mapping.mappingType} → ${newType})` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    const [fresh, domainMap] = await Promise.all([
      db.dataMapping.findUnique({ where: { id: updated.id }, include: MAPPING_INCLUDE }),
      loadDomainMap(),
    ])
    return NextResponse.json({
      mapping: fresh ? mappingExpanded(fresh, domainMap) : null,
      message: `แก้ไข Data Mapping ${mapping.code} เรียบร้อย`,
    })
  } catch (e) {
    console.error('PATCH /api/mappings/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถดำเนินการกับ Data Mapping ได้' }, { status: 500 })
  }
}
