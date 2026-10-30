import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  REFERENCE_TEXT_MAX,
  REFERENCE_VALUE_MAX,
  REFERENCE_VALUES_CAP,
  bumpReferenceVersion,
} from '@/lib/reference'

/** v0.36.0 — แก้เนื้อหาค่าขณะทะเบียนใช้งานอยู่ (ACTIVE) = เวอร์ชัน +0.1 อัตโนมัติ (คงประวัติสเปกที่เคยใช้) */
async function bumpSetVersionIfActive(setId: string) {
  const s = await db.referenceSet.findUnique({ where: { id: setId }, select: { status: true, version: true } })
  if (s?.status === 'ACTIVE') {
    await db.referenceSet.update({ where: { id: setId }, data: { version: bumpReferenceVersion(s.version) } })
  }
}

/**
 * Reference Values API (v0.31.0) — จัดการค่าอ้างอิงรายทะเบียน
 *
 * POST  /api/reference/sets/[id]/values — เพิ่มค่าใหม่ 1 ค่า
 *       body: { operatorEmail, value, labelTh?, labelEn?, definition?, sortOrder? }
 * PATCH /api/reference/sets/[id]/values — แก้ไข/เลิกใช้/เปิดใช้ซ้ำ
 *       body: { operatorEmail, valueId, action: 'UPDATE' | 'RETIRE' | 'REACTIVATE', labelTh?, labelEn?, definition?, sortOrder? }
 *
 * สิทธิ์: MANAGE_DATASETS (เหมือนสร้างทะเบียน) — ทุกการเปลี่ยนแปลงบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - แก้ค่าขณะทะเบียนใช้งานอยู่ (ACTIVE) ได้ตรง — เวอร์ชันทะเบียน +0.1 อัตโนมัติ (v0.36.0 ไม่มีคิวอนุมัติ)
 * - ค่าห้ามซ้ำในทะเบียนเดียวกัน (RETIRED ก็นับ — จะกลับมาใช้ใหม่ต้อง REACTIVATE ไม่ใช่สร้างซ้ำ)
 * - จำนวนค่าสูงสุดต่อทะเบียน = REFERENCE_VALUES_CAP
 * - RETIRED ไม่ใช่การลบ — คงประวัติตรวจสอบย้อนหลัง · เอนจินกฎใช้เฉพาะค่า ACTIVE เสมอ
 */
async function loadSetForManage(id: string, operatorEmail: unknown) {
  const op = await resolveOperator(operatorEmail, 'MANAGE_DATASETS')
  if (!op.ok) return { ok: false as const, status: op.status, message: op.message }
  const set = await db.referenceSet.findUnique({ where: { id }, select: { id: true, code: true, name: true, status: true } })
  if (!set) return { ok: false as const, status: 404, message: 'ไม่พบทะเบียนข้อมูลอ้างอิงนี้ในระบบ' }
  return { ok: true as const, op, set }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const loaded = await loadSetForManage(id, body.operatorEmail)
    if (!loaded.ok) return NextResponse.json({ error: loaded.message }, { status: loaded.status })
    const { op, set } = loaded

    const value = String(body.value ?? '').trim()
    if (!value) return NextResponse.json({ error: 'กรุณาระบุค่า (value)' }, { status: 400 })
    if (value.length > REFERENCE_VALUE_MAX) {
      return NextResponse.json({ error: `ค่ายาวเกิน ${REFERENCE_VALUE_MAX} ตัวอักษร` }, { status: 400 })
    }

    const dup = await db.referenceValue.findUnique({ where: { setId_value: { setId: id, value } }, select: { id: true, status: true } })
    if (dup) {
      return NextResponse.json(
        {
          error:
            dup.status === 'RETIRED'
              ? `ค่า "${value}" เคยมีในทะเบียนนี้แล้ว (สถานะเลิกใช้) — กด "เปิดใช้ซ้ำ" ที่ค่านั้นแทนการสร้างใหม่`
              : `ค่า "${value}" มีอยู่แล้วในทะเบียนนี้`,
        },
        { status: 409 },
      )
    }

    const total = await db.referenceValue.count({ where: { setId: id } })
    if (total >= REFERENCE_VALUES_CAP) {
      return NextResponse.json({ error: `ทะเบียนมีค่าครบจำนวนสูงสุดแล้ว (${REFERENCE_VALUES_CAP} ค่า)` }, { status: 409 })
    }

    const maxSort = await db.referenceValue.aggregate({ where: { setId: id }, _max: { sortOrder: true } })
    const sortOrderRaw = body.sortOrder
    const sortOrder =
      sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== ''
        ? Math.max(0, Math.floor(Number(sortOrderRaw) || 0))
        : (maxSort._max.sortOrder ?? 0) + 1

    const created = await db.referenceValue.create({
      data: {
        setId: id,
        value,
        labelTh: String(body.labelTh ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        labelEn: String(body.labelEn ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        definition: String(body.definition ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        sortOrder,
      },
    })

    await bumpSetVersionIfActive(id)

    await db.auditLog.create({
      data: {
        action: 'CREATE_REFERENCE_VALUE',
        actor: op.ctx.email,
        target: `${set.code} ${set.name}`,
        detail: `เพิ่มค่าอ้างอิง "${created.value}"${created.labelTh ? ` (${created.labelTh})` : ''} ในทะเบียน "${set.name}" (${set.code}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ value: created, message: `เพิ่มค่า "${created.value}" เรียบร้อย` }, { status: 201 })
  } catch (e) {
    console.error('POST /api/reference/sets/[id]/values', e)
    return NextResponse.json({ error: 'เพิ่มค่าอ้างอิงไม่สำเร็จ' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const loaded = await loadSetForManage(id, body.operatorEmail)
    if (!loaded.ok) return NextResponse.json({ error: loaded.message }, { status: loaded.status })
    const { op, set } = loaded

    const action = String(body.action ?? 'UPDATE').trim().toUpperCase()
    if (!['UPDATE', 'RETIRE', 'REACTIVATE'].includes(action)) {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (UPDATE | RETIRE | REACTIVATE)' }, { status: 400 })
    }

    const valueId = String(body.valueId ?? '').trim()
    if (!valueId) return NextResponse.json({ error: 'กรุณาระบุ valueId ของค่าที่ต้องการแก้ไข' }, { status: 400 })
    const row = await db.referenceValue.findUnique({ where: { id: valueId } })
    if (!row || row.setId !== id) return NextResponse.json({ error: 'ไม่พบค่าอ้างอิงนี้ในทะเบียน' }, { status: 404 })

    if (action === 'RETIRE') {
      if (row.status !== 'ACTIVE') return NextResponse.json({ error: `ค่า "${row.value}" เลิกใช้อยู่แล้ว` }, { status: 409 })
      await db.referenceValue.update({ where: { id: row.id }, data: { status: 'RETIRED' } })
      await bumpSetVersionIfActive(id)
      await db.auditLog.create({
        data: {
          action: 'RETIRE_REFERENCE_VALUE',
          actor: op.ctx.email,
          target: `${set.code} ${set.name}`,
          detail: `เลิกใช้ค่าอ้างอิง "${row.value}" ในทะเบียน "${set.name}" (${set.code}) — กฎที่ใช้โหมดทะเบียนจะไม่รับค่านี้ตั้งแต่รอบตรวจถัดไป โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `เลิกใช้ค่า "${row.value}" แล้ว (RETIRED)` })
    }

    if (action === 'REACTIVATE') {
      if (row.status !== 'RETIRED') return NextResponse.json({ error: `ค่า "${row.value}" ใช้งานอยู่แล้ว` }, { status: 409 })
      await db.referenceValue.update({ where: { id: row.id }, data: { status: 'ACTIVE' } })
      await bumpSetVersionIfActive(id)
      await db.auditLog.create({
        data: {
          action: 'REACTIVATE_REFERENCE_VALUE',
          actor: op.ctx.email,
          target: `${set.code} ${set.name}`,
          detail: `เปิดใช้ค่าอ้างอิง "${row.value}" ซ้ำในทะเบียน "${set.name}" (${set.code}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `เปิดใช้ค่า "${row.value}" ซ้ำแล้ว (ACTIVE)` })
    }

    // ---------- UPDATE ----------
    const value = String(body.value ?? row.value).trim()
    if (!value) return NextResponse.json({ error: 'กรุณาระบุค่า (value)' }, { status: 400 })
    if (value.length > REFERENCE_VALUE_MAX) {
      return NextResponse.json({ error: `ค่ายาวเกิน ${REFERENCE_VALUE_MAX} ตัวอักษร` }, { status: 400 })
    }
    if (value !== row.value) {
      const dup = await db.referenceValue.findUnique({ where: { setId_value: { setId: id, value } }, select: { id: true } })
      if (dup) return NextResponse.json({ error: `ค่า "${value}" มีอยู่แล้วในทะเบียนนี้` }, { status: 409 })
    }
    const updated = await db.referenceValue.update({
      where: { id: row.id },
      data: {
        value,
        labelTh: String(body.labelTh ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        labelEn: String(body.labelEn ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        definition: String(body.definition ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        ...(body.sortOrder !== undefined && body.sortOrder !== null && String(body.sortOrder).trim() !== ''
          ? { sortOrder: Math.max(0, Math.floor(Number(body.sortOrder) || 0)) }
          : {}),
      },
    })
    await bumpSetVersionIfActive(id)

    await db.auditLog.create({
      data: {
        action: 'UPDATE_REFERENCE_VALUE',
        actor: op.ctx.email,
        target: `${set.code} ${set.name}`,
        detail: `แก้ไขค่าอ้างอิง "${row.value}"${row.value !== updated.value ? ` → "${updated.value}"` : ''} ในทะเบียน "${set.name}" (${set.code}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })
    return NextResponse.json({ value: updated, message: `บันทึกค่า "${updated.value}" เรียบร้อย` })
  } catch (e) {
    console.error('PATCH /api/reference/sets/[id]/values', e)
    return NextResponse.json({ error: 'ดำเนินการกับค่าอ้างอิงไม่สำเร็จ' }, { status: 500 })
  }
}
