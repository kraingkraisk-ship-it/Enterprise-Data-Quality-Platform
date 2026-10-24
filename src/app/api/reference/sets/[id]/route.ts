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
 * Reference Set API — รายการเดี่ยว (v0.31.0) — workflow อนุมัติแบบเดียวกับ Data Element
 *
 * GET   /api/reference/sets/[id] — รายละเอียดเต็ม:
 *         - metadata + ผู้รับผิดชอบ (resolve ชื่อ+บทบาทจากผู้ใช้จริง)
 *         - values ครบทั้ง ACTIVE/RETIRED (เรียง ACTIVE ก่อน → sortOrder → value)
 *         - usage (กฎโหมดทะเบียน · Element ที่ผูก · Mapping LOOKUP ที่อ้าง)
 *         - auditTrail (ประวัติการทำรายการของทะเบียนนี้จาก Audit Trail)
 * PATCH /api/reference/sets/[id] — body: { operatorEmail, action, … }
 *         action: 'UPDATE' | 'DELETE' | 'SUBMIT_APPROVAL' | 'APPROVE' | 'REJECT_APPROVAL' | 'DEPRECATE'
 *
 * สิทธิ์ (deny-by-default — แบบเดียวกับ Data Element):
 * - UPDATE / DELETE / SUBMIT_APPROVAL → MANAGE_DATASETS
 * - APPROVE / REJECT_APPROVAL / DEPRECATE → APPROVE_EXCEPTIONS
 * กติกา workflow:
 * - ทะเบียนใหม่ = DRAFT → ผู้มี MANAGE_DATASETS ส่งขออนุมัติ (SUBMIT_APPROVAL)
 *   → ผู้มี APPROVE_EXCEPTIONS อนุมัติ (status=ACTIVE + approvedBy/approvedAt) หรือส่งกลับ (คง DRAFT)
 * - เลิกใช้ (DEPRECATED) ทำผ่าน workflow เดียวกัน · ส่งขออนุมัติใหม่เพื่อกลับมาใช้
 * - ขณะ "รออนุมัติ" ห้ามแก้ metadata/ลบ/แตะค่า (กันเนื้อหาเปลี่ยนระหว่างพิจารณา)
 * - APPROVE จะ bump version +0.1 เมื่อเนื้อหาค่า/ชื่อถูกแก้หลังอนุมัติครั้งก่อน (เทียบ updatedAt vs approvedAt)
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
        where: { email: { in: [set.ownerId, set.stewardId, set.approvedBy].filter((v): v is string => Boolean(v)) } },
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
        pendingApproval: set.pendingApproval,
        approvedBy: set.approvedBy,
        approvedAt: set.approvedAt,
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
        approvedBy: personOf(set.approvedBy),
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
    const WORKFLOW_ACTIONS = ['SUBMIT_APPROVAL', 'APPROVE', 'REJECT_APPROVAL', 'DEPRECATE']
    const permission = action === 'UPDATE' || action === 'DELETE' || action === 'SUBMIT_APPROVAL' ? 'MANAGE_DATASETS' : 'APPROVE_EXCEPTIONS'

    const op = await resolveOperator(body.operatorEmail, permission)
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    if (!['UPDATE', 'DELETE', ...WORKFLOW_ACTIONS].includes(action)) {
      return NextResponse.json({ error: `การดำเนินการไม่ถูกต้อง (UPDATE | DELETE | ${WORKFLOW_ACTIONS.join(' | ')})` }, { status: 400 })
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

    /* ---------------- workflow อนุมัติ (แบบเดียวกับ Data Element) ---------------- */
    if (action === 'SUBMIT_APPROVAL') {
      if (set.pendingApproval) {
        return NextResponse.json({ error: 'ทะเบียนนี้อยู่ในสถานะ "รออนุมัติ" อยู่แล้ว' }, { status: 409 })
      }
      if (!['DRAFT', 'DEPRECATED'].includes(set.status)) {
        return NextResponse.json({ error: 'เฉพาะทะเบียนสถานะ DRAFT หรือ DEPRECATED เท่านั้นที่ส่งขออนุมัติได้' }, { status: 400 })
      }
      if (set._count.values === 0) {
        return NextResponse.json({ error: 'ทะเบียนยังไม่มีค่าอ้างอิงเลย — เพิ่มหรือนำเข้าค่าก่อนส่งขออนุมัติ' }, { status: 400 })
      }
      await db.referenceSet.update({ where: { id }, data: { pendingApproval: true } })
      await db.auditLog.create({
        data: {
          action: 'SUBMIT_REFERENCE_APPROVAL',
          actor: op.ctx.email,
          target: label,
          detail: `ส่งขออนุมัติทะเบียนข้อมูลอ้างอิง "${set.name}" (${set.code}) — ค่าอ้างอิง ${set._count.values} ค่า · รอผู้มีสิทธิ์อนุมัติ (APPROVE_EXCEPTIONS) ตัดสิน โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ส่งขออนุมัติ "${set.name}" แล้ว — รอผู้อนุมัติตัดสิน` })
    }

    if (action === 'APPROVE') {
      if (!set.pendingApproval) {
        return NextResponse.json({ error: 'ทะเบียนนี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 409 })
      }
      // bump version +0.1 เมื่อเนื้อหาถูกแก้หลังอนุมัติครั้งก่อน (เหมือน Data Mapping v0.22.0)
      // ตรวจจาก Audit Trail (action เนื้อหาหลัง approvedAt) — ไม่นับการส่ง/ส่งกลับเป็นการแก้เนื้อหา (anti-drift)
      const approvedBefore = set.approvedAt ?? null
      let bumped = false
      if (approvedBefore) {
        const CONTENT_ACTIONS = [
          'UPDATE_REFERENCE_SET',
          'CREATE_REFERENCE_VALUE',
          'UPDATE_REFERENCE_VALUE',
          'RETIRE_REFERENCE_VALUE',
          'REACTIVATE_REFERENCE_VALUE',
          'IMPORT_REFERENCE_VALUES',
        ]
        const editedSinceApproval = await db.auditLog.findFirst({
          where: { target: { startsWith: `${set.code} ` }, action: { in: CONTENT_ACTIONS }, createdAt: { gt: approvedBefore } },
          select: { id: true },
        })
        bumped = editedSinceApproval !== null
      }
      const updated = await db.referenceSet.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          pendingApproval: false,
          approvedBy: op.ctx.email,
          approvedAt: new Date(),
          version: bumped ? bumpReferenceVersion(set.version) : set.version,
        },
      })
      await db.auditLog.create({
        data: {
          action: 'APPROVE_REFERENCE_SET',
          actor: op.ctx.email,
          target: label,
          detail: `อนุมัติทะเบียนข้อมูลอ้างอิง "${set.name}" (${set.code}) — สถานะเปลี่ยนเป็น ACTIVE ใช้งานได้ (กฎโหมดทะเบียนจะใช้ค่าของทะเบียนนี้ทันที)${bumped ? ` · เวอร์ชัน ${set.version} → ${updated.version} (เนื้อหาแก้ไขหลังอนุมัติก่อน)` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ set: updated, message: `อนุมัติ "${set.name}" แล้ว — ใช้งานได้ (ACTIVE)` })
    }

    if (action === 'REJECT_APPROVAL') {
      if (!set.pendingApproval) {
        return NextResponse.json({ error: 'ทะเบียนนี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 409 })
      }
      const note = String(body.note ?? '').trim().slice(0, REFERENCE_TEXT_MAX)
      await db.referenceSet.update({ where: { id }, data: { pendingApproval: false } })
      await db.auditLog.create({
        data: {
          action: 'REJECT_REFERENCE_APPROVAL',
          actor: op.ctx.email,
          target: label,
          detail: `ส่งกลับ (ไม่อนุมัติ) ทะเบียนข้อมูลอ้างอิง "${set.name}" (${set.code}) — คงสถานะ ${set.status} ให้ผู้ดูแลแก้ไขแล้วส่งใหม่${note ? ` · เหตุผล: ${note}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ส่งกลับ "${set.name}" แล้ว — คงสถานะ ${set.status === 'DRAFT' ? 'ร่าง (DRAFT)' : 'เลิกใช้ (DEPRECATED)'}` })
    }

    if (action === 'DEPRECATE') {
      if (set.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'เฉพาะทะเบียนที่ใช้งานอยู่ (ACTIVE) เท่านั้นที่เลิกใช้ได้' }, { status: 400 })
      }
      const note = String(body.note ?? '').trim().slice(0, REFERENCE_TEXT_MAX)
      const updated = await db.referenceSet.update({ where: { id }, data: { status: 'DEPRECATED', pendingApproval: false } })
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
      if (set.pendingApproval) {
        return NextResponse.json({ error: 'ลบไม่ได้ขณะ "รออนุมัติ" — อนุมัติหรือส่งกลับก่อนจึงจะลบได้' }, { status: 409 })
      }
      if (set.status !== 'DRAFT') {
        return NextResponse.json(
          { error: `ลบได้เฉพาะทะเบียนสถานะ DRAFT เท่านั้น — ทะเบียนที่เคยอนุมัติให้ใช้สถานะ "เลิกใช้ (DEPRECATED)" แทน เพื่อคงประวัติตรวจสอบย้อนหลัง` },
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
    if (set.pendingApproval) {
      return NextResponse.json(
        { error: 'แก้ไขไม่ได้ขณะ "รออนุมัติ" — ผู้อนุมัติต้องอนุมัติหรือส่งกลับก่อนจึงจะแก้ได้ (กันเนื้อหาเปลี่ยนระหว่างพิจารณา)' },
        { status: 409 },
      )
    }
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

    const updated = await db.referenceSet.update({
      where: { id },
      data: {
        name,
        nameEn: String(body.nameEn ?? '').trim().slice(0, REFERENCE_NAME_MAX),
        description: String(body.description ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        ownerId: String(body.ownerId ?? '').trim().toLowerCase() || null,
        stewardId: String(body.stewardId ?? '').trim().toLowerCase() || null,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'UPDATE_REFERENCE_SET',
        actor: op.ctx.email,
        target: `${updated.code} ${updated.name}`,
        detail: `แก้ไขข้อมูลทะเบียนอ้างอิง "${updated.name}" (${updated.code})${changed.length > 0 ? ` — แก้: ${changed.join(', ')}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ set: updated, message: `บันทึกข้อมูลทะเบียน "${updated.name}" เรียบร้อย` })
  } catch (e) {
    console.error('PATCH /api/reference/sets/[id]', e)
    return NextResponse.json({ error: 'ดำเนินการกับทะเบียนข้อมูลอ้างอิงไม่สำเร็จ' }, { status: 500 })
  }
}
