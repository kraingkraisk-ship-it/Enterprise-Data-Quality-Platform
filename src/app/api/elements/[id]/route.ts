import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { ROLES } from '@/lib/rbac'
import {
  ELEMENT_DATA_TYPES,
  ELEMENT_NAME_MAX,
  ELEMENT_TEXT_MAX,
  isElementDataType,
  isOpUpdateFrequency,
  rollupByElement,
} from '@/lib/elements'

/**
 * Data Element API — รายการเดี่ยว (v0.18.0 · Meta Data 4 กลุ่ม + workflow อนุมัติ ใน v0.20.0)
 *
 * GET   /api/elements/[id] — รายละเอียดเต็ม:
 *         - Meta Data ครบทั้ง 4 กลุ่ม (Business / Technical / Operational / Governance)
 *         - stewardship (owner/steward/custodian — resolve ชื่อ+บทบาทจากผู้ใช้จริง)
 *         - operational actual (ค่าจริงจากระบบ: จำนวนแมป/กฎ/ชุดข้อมูล, รอบรันล่าสุด, คะแนน element ถ่วงแถว)
 *         - auditTrail (ประวัติการทำรายการของ element นี้จาก Audit Trail)
 * PATCH /api/elements/[id] — body: { operatorEmail, action, … }
 *         action: 'UPDATE' | 'DELETE' | 'SUBMIT_APPROVAL' | 'APPROVE' | 'REJECT_APPROVAL' | 'DEPRECATE'
 *
 * สิทธิ์ (deny-by-default):
 * - UPDATE / DELETE / SUBMIT_APPROVAL → MANAGE_DATASETS (สิทธิ์เดิม)
 * - APPROVE / REJECT_APPROVAL / DEPRECATE → APPROVE_EXCEPTIONS (สิทธิ์อนุมัติเดิม — ไม่เพิ่มสิทธิ์ใหม่)
 * กติกา workflow อนุมัติ (v0.20.0 — workflow จริง บันทึกผู้อนุมัติ + Audit Trail ทุกครั้ง):
 * - element ใหม่ = DRAFT → ผู้มี MANAGE_DATASETS ส่งขออนุมัติ (SUBMIT_APPROVAL)
 *   → ผู้มี APPROVE_EXCEPTIONS อนุมัติ (status=ACTIVE + approvedBy/approvedAt) หรือส่งกลับ (คง DRAFT)
 * - เลิกใช้ (DEPRECATED) และกลับมาใช้ใหม่ ทำผ่าน workflow เดียวกัน
 * - ขณะ "รออนุมัติ" ห้ามแก้ meta/ลบ (ต้องอนุมัติหรือส่งกลับก่อน — กันเนื้อหาเปลี่ยนระหว่างพิจารณา)
 * - DELETE ปฏิเสธเมื่อยังมีกฎผูกอยู่ · ห้ามย้ายโดเมนย่อย (ย้าย = ลบแล้วสร้างใหม่ เพื่อคงประวัติ audit)
 */

/** ตรวจรูปแบบฟิลด์ meta — คืนข้อความ error หรือ null (สถานะเปลี่ยนผ่าน workflow อนุมัติเท่านั้น) */
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

/** ประกอบ object ของฟิลด์ meta จาก body (ไม่รวม status — workflow เป็นเจ้าของสถานะ) */
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
      // ไม่ใช่ JSON — ใช้ค่าเริ่มต้น
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
    const templateKeys = conditionKeys
    const [templates, ruleDatasets, recentRuns, peopleEmails, auditEntries] = await Promise.all([
      db.conditionTemplate.findMany({
        where: { key: { in: templateKeys } },
        select: { key: true, name: true, dimension: true },
      }),
      db.ruleDataset.findMany({
        where: { ruleId: { in: element.rules.map((r) => r.id) } },
        include: { dataset: { select: { id: true, name: true } } },
      }),
      // ผลรันล่าสุดของกฎที่ผูก element นี้ (ทุกชุดข้อมูล) — หยิบมากพอสำหรับหา "ล่าสุดรายคู่ (กฎ × ชุดข้อมูล)"
      db.dqRun.findMany({
        where: { ruleId: { in: element.rules.map((r) => r.id) } },
        orderBy: { createdAt: 'desc' },
        take: 3000,
        select: { id: true, ruleId: true, datasetId: true, dataElementId: true, totalRows: true, passRate: true, status: true, createdAt: true },
      }),
      db.user.findMany({
        where: { email: { in: [element.ownerId, element.stewardId, element.custodianId].filter((v): v is string => Boolean(v)) } },
        select: { email: true, name: true, role: true },
      }),
      db.auditLog.findMany({
        where: { target: { startsWith: `${element.code} ` } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, actor: true, target: true, detail: true, createdAt: true },
      }),
    ])
    const templateMap = new Map(templates.map((t) => [t.key, t]))

    /* ---------------- เชิงปฏิบัติการ — ค่าจริงจากระบบ (อ่านอย่างเดียว) ---------------- */
    const latestByPair = new Map<string, (typeof recentRuns)[number]>()
    for (const run of recentRuns) {
      const key = `${run.ruleId}|${run.datasetId}`
      if (!latestByPair.has(key)) latestByPair.set(key, run)
    }
    const rollupInputs = [...latestByPair.values()].map((run) => ({
      dataElementId: element.id,
      totalRows: run.totalRows,
      passRate: run.passRate,
      status: run.status,
    }))
    const rollup = rollupByElement(rollupInputs).get(element.id) ?? null
    const lastRunAt = latestByPair.size > 0 ? [...latestByPair.values()].map((r) => r.createdAt).sort().at(-1) ?? null : null
    const datasetIds = [...new Set(ruleDatasets.map((rd) => rd.datasetId))]

    const peopleMap = new Map(peopleEmails.map((u) => [u.email, u]))
    const personOf = (email: string | null) => {
      if (!email) return null
      const u = peopleMap.get(email)
      return { email, name: u?.name ?? email, roleTh: ROLES[u?.role as keyof typeof ROLES]?.th ?? u?.role ?? null }
    }

    return NextResponse.json({
      element: {
        ...element,
        rules: element.rules.map((r) => ({
          ...r,
          conditionName: templateMap.get(r.condition)?.name ?? r.condition,
          dimension: templateMap.get(r.condition)?.dimension ?? 'VALIDITY',
        })),
      },
      stewardship: {
        owner: personOf(element.ownerId),
        steward: personOf(element.stewardId),
        custodian: personOf(element.custodianId),
      },
      operational: {
        mappingCount: element.columnMappings.length,
        assetCount: new Set(element.columnMappings.map((m) => m.assetId)).size,
        ruleCount: element.rules.length,
        datasetCount: datasetIds.length,
        datasetNames: ruleDatasets.map((rd) => rd.dataset.name),
        lastRunAt,
        lastScore: rollup?.score ?? null, // คะแนน element ถ่วงน้ำหนักแถวจากผลรันล่าสุดราย (กฎ × ชุดข้อมูล)
        lastRows: rollup?.totalRows ?? 0,
        lastFailedRules: rollup?.failedRules ?? 0,
      },
      auditTrail: auditEntries,
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

    const action = String(body.action ?? 'UPDATE').trim().toUpperCase()
    const WORKFLOW_ACTIONS = ['SUBMIT_APPROVAL', 'APPROVE', 'REJECT_APPROVAL', 'DEPRECATE']
    const permission = action === 'UPDATE' || action === 'DELETE' || action === 'SUBMIT_APPROVAL' ? 'MANAGE_DATASETS' : 'APPROVE_EXCEPTIONS'

    const op = await resolveOperator(body.operatorEmail, permission)
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    if (!['UPDATE', 'DELETE', ...WORKFLOW_ACTIONS].includes(action)) {
      return NextResponse.json({ error: `การดำเนินการไม่ถูกต้อง (UPDATE | DELETE | ${WORKFLOW_ACTIONS.join(' | ')})` }, { status: 400 })
    }

    const element = await db.dataElement.findUnique({
      where: { id },
      include: {
        subDomain: { select: { id: true, name: true } },
        _count: { select: { rules: true, columnMappings: true, mappingsAsSource: true, mappingsAsTarget: true } },
      },
    })
    if (!element) return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })

    /* ---------------- workflow อนุมัติ (v0.20.0) ---------------- */
    if (action === 'SUBMIT_APPROVAL') {
      if (element.pendingApproval) {
        return NextResponse.json({ error: 'element นี้อยู่ในสถานะ "รออนุมัติ" อยู่แล้ว' }, { status: 409 })
      }
      if (!['DRAFT', 'DEPRECATED'].includes(element.status)) {
        return NextResponse.json({ error: 'เฉพาะ element สถานะ DRAFT หรือ DEPRECATED เท่านั้นที่ส่งขออนุมัติได้' }, { status: 400 })
      }
      await db.dataElement.update({ where: { id }, data: { pendingApproval: true } })
      await db.auditLog.create({
        data: {
          action: 'SUBMIT_DATA_ELEMENT_APPROVAL',
          actor: op.ctx.email,
          target: `${element.code} ${element.nameTh}`,
          detail: `ส่งขออนุมัติ Data Element "${element.nameTh}" (${element.code}) — รอผู้มีสิทธิ์อนุมัติ (APPROVE_EXCEPTIONS) ตัดสิน โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ส่งขออนุมัติ "${element.nameTh}" แล้ว — รอผู้อนุมัติตัดสิน` })
    }

    if (action === 'APPROVE') {
      if (!element.pendingApproval) {
        return NextResponse.json({ error: 'element นี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 409 })
      }
      const updated = await db.dataElement.update({
        where: { id },
        data: { status: 'ACTIVE', pendingApproval: false, approvedBy: op.ctx.email, approvedAt: new Date() },
      })
      await db.auditLog.create({
        data: {
          action: 'APPROVE_DATA_ELEMENT',
          actor: op.ctx.email,
          target: `${element.code} ${element.nameTh}`,
          detail: `อนุมัติ Data Element "${element.nameTh}" (${element.code}) — สถานะเปลี่ยนเป็น ACTIVE ใช้งานได้ โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ element: updated, message: `อนุมัติ "${element.nameTh}" แล้ว — ใช้งานได้ (ACTIVE)` })
    }

    if (action === 'REJECT_APPROVAL') {
      if (!element.pendingApproval) {
        return NextResponse.json({ error: 'element นี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 409 })
      }
      const note = String(body.note ?? '').trim().slice(0, ELEMENT_TEXT_MAX)
      await db.dataElement.update({ where: { id }, data: { pendingApproval: false } })
      await db.auditLog.create({
        data: {
          action: 'REJECT_DATA_ELEMENT_APPROVAL',
          actor: op.ctx.email,
          target: `${element.code} ${element.nameTh}`,
          detail: `ส่งกลับ (ไม่อนุมัติ) Data Element "${element.nameTh}" (${element.code}) — คงสถานะ ${element.status} ให้ผู้ดูแลแก้ไขแล้วส่งใหม่${note ? ` · เหตุผล: ${note}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ message: `ส่งกลับ "${element.nameTh}" แล้ว — คงสถานะ ${element.status === 'DRAFT' ? 'ร่าง (DRAFT)' : 'เลิกใช้ (DEPRECATED)'}` })
    }

    if (action === 'DEPRECATE') {
      if (element.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'เฉพาะ element ที่ใช้งานอยู่ (ACTIVE) เท่านั้นที่เลิกใช้ได้' }, { status: 400 })
      }
      const note = String(body.note ?? '').trim().slice(0, ELEMENT_TEXT_MAX)
      const updated = await db.dataElement.update({ where: { id }, data: { status: 'DEPRECATED', pendingApproval: false } })
      await db.auditLog.create({
        data: {
          action: 'DEPRECATE_DATA_ELEMENT',
          actor: op.ctx.email,
          target: `${element.code} ${element.nameTh}`,
          detail: `เลิกใช้ Data Element "${element.nameTh}" (${element.code}) — สถานะเปลี่ยนเป็น DEPRECATED (กฎที่ผูกจะไม่ถูกรันในรอบโดเมนถัดไป)${note ? ` · เหตุผล: ${note}` : ''} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
        },
      })
      return NextResponse.json({ element: updated, message: `เลิกใช้ "${element.nameTh}" แล้ว (DEPRECATED)` })
    }

    if (action === 'DELETE') {
      if (element.pendingApproval) {
        return NextResponse.json({ error: 'ลบไม่ได้ขณะ "รออนุมัติ" — อนุมัติหรือส่งกลับก่อนจึงจะลบได้' }, { status: 409 })
      }
      if (element._count.rules > 0) {
        return NextResponse.json(
          {
            error: `ลบไม่ได้ — "${element.nameTh}" ยังมีกฎตรวจสอบ ${element._count.rules} ข้อผูกอยู่ (ปลดการผูกกฎในคลังกฎก่อน จึงจะลบได้)`,
          },
          { status: 409 },
        )
      }
      const dataMappingCount = element._count.mappingsAsSource + element._count.mappingsAsTarget
      if (dataMappingCount > 0) {
        return NextResponse.json(
          {
            error: `ลบไม่ได้ — "${element.nameTh}" ยังมี Data Mapping ${dataMappingCount} เส้นผูกอยู่ (ลบ/ตัด mapping ในหน้า Data Mapping ก่อน จึงจะลบ element ได้)`,
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
    if (element.pendingApproval) {
      return NextResponse.json(
        { error: 'แก้ไขไม่ได้ขณะ "รออนุมัติ" — ผู้อนุมัติต้องอนุมัติหรือส่งกลับก่อนจึงจะแก้ Meta Data ได้ (กันเนื้อหาเปลี่ยนระหว่างพิจารณา)' },
        { status: 409 },
      )
    }
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

    // deny-by-default: ผู้รับผิดชอบต้องเป็นผู้ใช้ ACTIVE ในระบบ
    const peopleError = await (async () => {
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
    })()
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    const changed: string[] = []
    if (nameTh !== element.nameTh) changed.push('ชื่อ')
    if (String(body.definition ?? '') !== element.definition) changed.push('นิยาม')
    if (String(body.dataType ?? 'TEXT') !== element.dataType) changed.push('ประเภทข้อมูล')
    if (Boolean(body.pii) !== element.pii) changed.push('PII')
    if (Boolean(body.isCde) !== element.isCde) changed.push('ธง CDE')
    if (Boolean(body.isFinancial) !== element.isFinancial) changed.push('ธงการเงิน')
    if ((String(body.opUpdateFrequency ?? '').trim().toUpperCase() || '') !== element.opUpdateFrequency) changed.push('ความถี่การปรับปรุง')

    const updated = await db.dataElement.update({
      where: { id },
      data: { nameTh, ...metaFieldsFrom(body) }, // หมายเหตุ: status ไม่รับจากฟอร์ม — เปลี่ยนผ่าน workflow อนุมัติเท่านั้น
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
