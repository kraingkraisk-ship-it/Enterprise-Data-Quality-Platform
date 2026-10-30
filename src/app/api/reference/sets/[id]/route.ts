import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { ROLES } from '@/lib/rbac'
import {
  REFERENCE_NAME_MAX,
  REFERENCE_TEXT_MAX,
  bumpReferenceVersion,
  compareValueRows,
} from '@/lib/reference'
import { referenceUsage, validateStewardshipEmails } from '@/lib/reference-server'

/**
 * Reference Set API — รายการเดี่ยว (v0.31.0 · v0.36.0 ไม่มีคิวอนุมัติ)
 *
 * GET   /api/reference/sets/[id] — รายละเอียดเต็ม:
 *         - metadata + ผู้รับผิดชอบ (resolve ชื่อ+บทบาทจากผู้ใช้จริง)
 *         - values ครบทั้ง ACTIVE/RETIRED (เรียง ACTIVE ก่อน → sortOrder → value)
 *         - usage (กฎโหมดทะเบียน · Element ที่ผูก · Mapping LOOKUP ที่อ้าง)
 *         - auditTrail (ประวัติการทำรายการของทะเบียนนี้จาก Audit Trail)
 * PATCH /api/reference/sets/[id] — body: { operatorEmail, action, … }
 *         action: 'UPDATE' | 'DELETE' | 'ACTIVATE' | 'DEPRECATE'
 *
 * สิทธิ์ (deny-by-default — RBAC ตามบทบาทล้วน): ทุก action ใช้สิทธิ์ MANAGE_DATASETS เดิม
 * กติกาสถานะ (v0.36.0 — ไม่มีคิวอนุมัติ ทุก action บันทึก Audit Trail):
 * - ทะเบียนใหม่ = DRAFT → ผู้มี MANAGE_DATASETS เปิดใช้งานเอง (ACTIVATE → ACTIVE — กฎโหมดทะเบียนใช้ค่าได้ทันที)
 * - แก้เนื้อหา (ชื่อ/คำอธิบาย/ค่าอ้างอิง) ขณะใช้งานอยู่ (ACTIVE) = เวอร์ชัน +0.1 อัตโนมัติ เพื่อคงประวัติสเปก
 * - DELETE ได้เฉพาะ DRAFT ที่ยังไม่มีการใช้งาน (กฎ/Element/Mapping = 0)
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const set = await db.referenceSet.findUnique({
      where: { id },
      include: {
        subDomain: { select: { id: true, name: true, nameEn: true, parentId: true, parent: { select: { id: true, name: true, color: true } } } },
        values: true,
      },
    })
    if (!set) return NextResponse.json({ error: 'ไม่พบทะเบียนข้อมูลอ้างอิงนี้ในระบบ' }, { status: 404 })

    const [usage, peopleEmails, auditEntries] = await Promise.all([
      referenceUsage(set.id),
      db.user.findMany({
        where: { email: { in: [set.ownerId, set.stewardId].filter((v): v is string => Boolean(v)) } },
        select: { email: true, name: true, role: true },
      }),
      db.auditLog.findMany({
        where: { target: { startsWith: `${set.code} ` } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, actor: true, target: true, detail: true, createdAt: true },
      }),
    ])

    const peopleMap = new Map(peopleEmails.map((u) => [u.email, u]))
    const personOf = (email: string | null) => {
      if (!email) return null
      const u = peopleMap.get(email)
      return { email, name: u?.name ?? email, roleTh: ROLES[u?.role as keyof typeof ROLES]?.th ?? u?.role ?? null }
    }

    const values = [...set.values].sort(compareValueRows)

    return NextResponse.json({
      set: {
        id: set.id,
        code: set.code,
        name: set.name,
        nameEn: set.nameEn,
        description: set.description,
        subDomainId: set.subDomainId,
        subDomainName: set.subDomain.name,
        parentDomainName: set.subDomain.parent?.name ?? null,
        ownerId: set.ownerId,
        stewardId: set.stewardId,
        status: set.status,
        version: set.version,
        createdBy: set.createdBy,
        createdAt: set.createdAt,
        updatedAt: set.updatedAt,
        valueCount: set.values.length,
        activeValueCount: set.values.filter((v) => v.status === 'ACTIVE').length,
      },
      values: values.map((v) => ({
        id: v.id,
        setId: v.setId,
        value: v.value,
        labelTh: v.labelTh,
        labelEn: v.labelEn,
        definition: v.definition,
        sortOrder: v.sortOrder,
        status: v.status,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })),
      stewardship: {
        owner: personOf(set.ownerId),
        steward: personOf(set.stewardId),
      },
      usage,
      auditTrail: auditEntries,
    })
  } catch (e) {
    console.error('GET /api/reference/sets/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายละเอียดทะเบียนข้อมูลอ้างอิงได้' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const action = String(body.action ?? 'UPDATE').trim().toUpperCase()
    const STATUS_ACTIONS = ['ACTIVATE', 'DEPRECATE']
    const permission = 'MANAGE_DATASETS' // v0.36.0 — ทุก action ใช้สิทธิ์เดียว (RBAC ตามบทบาทล้วน)

    const op = await resolveOperator(body.operatorEmail, permission)
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    if (!['UPDATE', 'DELETE', ...STATUS_ACTIONS].includes(action)) {
      return NextResponse.json({ error: `การดำเนินการไม่ถูกต้อง (UPDATE | DELETE | ${STATUS_ACTIONS.join(' | ')})` }, { status: 400 })
    }

    const set = await db.referenceSet.findUnique({
      where: { id },
      include: {
        subDomain: { select: { id: true, name: true } },
        _count: { select: { values: true, elements: true, lookupMappings: true } },
      },
    })
    if (!set) return NextResponse.json({ error: 'ไม่พบทะเบียนข้อมูลอ้างอิงนี้ในระบบ' }, { status: 404 })

    const label = `${set.code} ${set.name}`

    /* ---------------- เปิดใช้งาน (v0.36.0 — ตรงด้วยสิทธิ์ MANAGE_DATASETS) ---------------- */
    if (action === 'ACTIVATE') {
      if (!['DRAFT', 'DEPRECATED'].includes(set.status)) {
        return NextResponse.json({ error: 'เฉพาะทะเบียนสถานะ DRAFT หรือ DEPRECATED เท่านั้นที่เปิดใช้งานได้' }, { status: 400 })
      }
      if (set._count.values === 0) {
        return NextResponse.json({ error: 'ทะเบียนยังไม่มีค่าอ้างอิงเลย — เพิ่มหรือนำเข้าค่าก่อนเปิดใช้งาน' }, { status: 400 })
      }
      const updated = await db.referenceSet.update({ where: { id }, data: { status: 'ACTIVE' } })
      await db.auditLog.create({
        data: {
          action: 'ACTIVATE_REFERENCE_SET',
          actor: op.ctx.email,
          target: label,
          detail: `เปิดใช้งานทะเบียนข้อมูลอ้างอิง "${set.name}" (${set.code}) — สถานะเปลี่ยนจาก ${set.status} เป็น ACTIVE (กฎโหมดทะเบียนจะใช้ค่าของทะเบียนนี้ทันที) · ค่าอ้างอิง ${set._count.values} ค่า โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ set: updated, message: `เปิดใช้งาน "${set.name}" แล้ว — ใช้งานได้ (ACTIVE)` })
    }

    if (action === 'DEPRECATE') {
      if (set.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'เฉพาะทะเบียนที่ใช้งานอยู่ (ACTIVE) เท่านั้นที่เลิกใช้ได้' }, { status: 400 })
      }
      const note = String(body.note ?? '').trim().slice(0, REFERENCE_TEXT_MAX)
      const updated = await db.referenceSet.update({ where: { id }, data: { status: 'DEPRECATED' } })
      await db.auditLog.create({
        data: {
          action: 'DEPRECATE_REFERENCE_SET',
          actor: op.ctx.email,
          target: label,
          detail: `เลิกใช้ทะเบียนข้อมูลอ้างอิง "${set.name}" (${set.code}) — สถานะเปลี่ยนเป็น DEPRECATED (กฎโหมดทะเบียนที่ชี้มาจะไม่ถูกประเมินในรอบถัดไป — ปรากฏเป็นกฎถูกข้าม)${note ? ` · เหตุผล: ${note}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ set: updated, message: `เลิกใช้ "${set.name}" แล้ว (DEPRECATED)` })
    }

    if (action === 'DELETE') {
      if (set.status !== 'DRAFT') {
        return NextResponse.json(
          { error: `ลบได้เฉพาะทะเบียนสถานะ DRAFT เท่านั้น — ทะเบียนที่เคยใช้งานให้ใช้สถานะ "เลิกใช้ (DEPRECATED)" แทน เพื่อคงประวัติตรวจสอบย้อนหลัง` },
          { status: 409 },
        )
      }
      const usage = await referenceUsage(set.id)
      if (usage.rules.length > 0 || usage.elements.length > 0 || usage.mappings.length > 0) {
        return NextResponse.json(
          {
            error: `ลบไม่ได้ — ทะเบียนนี้ถูกใช้งานอยู่ (กฎ ${usage.rules.length} · Element ${usage.elements.length} · Mapping ${usage.mappings.length}) — ปลดการผูกทั้งหมดก่อนจึงจะลบได้`,
          },
          { status: 409 },
        )
      }
      await db.referenceSet.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: 'DELETE_REFERENCE_SET',
          actor: op.ctx.email,
          target: label,
          detail: `ลบทะเบียนข้อมูลอ้างอิง "${set.name}" (${set.code}) จากโดเมนย่อย "${set.subDomain.name}" (พร้อมค่าอ้างอิง ${set._count.values} ค่า) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ลบทะเบียน "${set.name}" เรียบร้อย` })
    }

    // ---------- UPDATE (metadata เท่านั้น — ค่าอ้างอิงจัดการที่ /values) ----------
    const name = String(body.name ?? set.name).trim()
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อทะเบียน' }, { status: 400 })
    if (name.length > REFERENCE_NAME_MAX) {
      return NextResponse.json({ error: `ชื่อทะเบียนยาวเกิน ${REFERENCE_NAME_MAX} ตัวอักษร` }, { status: 400 })
    }
    const movedSubDomainId = String(body.subDomainId ?? '').trim()
    if (movedSubDomainId && movedSubDomainId !== set.subDomainId) {
      return NextResponse.json(
        { error: 'ย้ายโดเมนย่อยของทะเบียนไม่ได้ (เพื่อคงประวัติการตรวจสอบ) — หากต้องการย้าย ให้ลบแล้วสร้างใหม่ที่โดเมนย่อยเป้าหมาย' },
        { status: 400 },
      )
    }
    if (name !== set.name) {
      const dup = await db.referenceSet.findFirst({ where: { name }, select: { id: true } })
      if (dup) {
        return NextResponse.json({ error: `มีทะเบียนชื่อ "${name}" อยู่แล้วในระบบ` }, { status: 409 })
      }
    }
    const peopleError = await validateStewardshipEmails([body.ownerId, body.stewardId])
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    const changed: string[] = []
    if (name !== set.name) changed.push('ชื่อ')
    if (String(body.nameEn ?? '').trim() !== set.nameEn) changed.push('ชื่ออังกฤษ')
    if (String(body.description ?? '').trim() !== set.description) changed.push('คำอธิบาย')
    if ((String(body.ownerId ?? '').trim().toLowerCase() || null) !== set.ownerId) changed.push('เจ้าของข้อมูล')
    if ((String(body.stewardId ?? '').trim().toLowerCase() || null) !== set.stewardId) changed.push('ผู้ดูแลข้อมูล')

    // v0.36.0 — แก้เนื้อหา (ชื่อ/คำอธิบาย) ขณะใช้งานอยู่ (ACTIVE) = เวอร์ชัน +0.1 อัตโนมัติ (คงประวัติสเปกที่เคยใช้)
    const contentChanged = changed.includes('ชื่อ') || changed.includes('ชื่ออังกฤษ') || changed.includes('คำอธิบาย')
    const nextVersion = contentChanged && set.status === 'ACTIVE' ? bumpReferenceVersion(set.version) : set.version

    const updated = await db.referenceSet.update({
      where: { id },
      data: {
        name,
        nameEn: String(body.nameEn ?? '').trim().slice(0, REFERENCE_NAME_MAX),
        description: String(body.description ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        ownerId: String(body.ownerId ?? '').trim().toLowerCase() || null,
        stewardId: String(body.stewardId ?? '').trim().toLowerCase() || null,
        version: nextVersion,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'UPDATE_REFERENCE_SET',
        actor: op.ctx.email,
        target: `${updated.code} ${updated.name}`,
        detail: `แก้ไขข้อมูลทะเบียนอ้างอิง "${updated.name}" (${updated.code})${changed.length > 0 ? ` — แก้: ${changed.join(', ')}` : ''}${nextVersion !== set.version ? ` · เวอร์ชันอัตโนมัติ ${set.version} → ${nextVersion} (แก้เนื้อหาขณะใช้งานอยู่)` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ set: updated, message: `บันทึกข้อมูลทะเบียน "${updated.name}" เรียบร้อย${nextVersion !== set.version ? ` · เวอร์ชัน ${nextVersion}` : ''}` })
  } catch (e) {
    console.error('PATCH /api/reference/sets/[id]', e)
    return NextResponse.json({ error: 'ดำเนินการกับทะเบียนข้อมูลอ้างอิงไม่สำเร็จ' }, { status: 500 })
  }
}
