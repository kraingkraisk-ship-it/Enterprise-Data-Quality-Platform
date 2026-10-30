import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  REFERENCE_NAME_MAX,
  REFERENCE_TEXT_MAX,
  REFERENCE_VALUES_CAP,
  parseValuesCsv,
  nextReferenceCode,
} from '@/lib/reference'
import { validateStewardshipEmails } from '@/lib/reference-server'

/**
 * Reference Data API (v0.31.0) — ทะเบียนค่าอ้างอิงศูนย์กลาง (DAMA-DMBOK: Reference Data Management)
 *
 * GET  /api/reference/sets — รายการทะเบียนทั้งหมด พร้อมจำนวนค่า + usage (กฎ/Element/Mapping)
 *      อ่านได้ทุกบทบาทตามหลักโปร่งใส (ใช้ใน picker ของ Rule Builder ด้วย)
 * POST /api/reference/sets — สร้างทะเบียนใหม่ (สถานะเริ่มต้น DRAFT เสมอ — ต้องผ่าน workflow อนุมัติจึงจะ ACTIVE)
 *      body: { operatorEmail, name, nameEn?, description?, subDomainId, ownerId?, stewardId?, initialCsv? }
 *      initialCsv = ข้อความ CSV รูปแบบ value,labelTh,labelEn,definition (ไม่บังคับ — ว่างไว้เพิ่มค่าทีหลังได้)
 *
 * สิทธิ์ (เฉพาะ POST): MANAGE_DATASETS — ทุกการสร้างบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - ทะเบียนต้องแขวนใต้ "โดเมนย่อย" เท่านั้น (parentId != null) — ชี้โดเมนหลักตรง ๆ = ปฏิเสธ
 * - ชื่อทะเบียนไม่ซ้ำกันทั้งระบบ (แสดงใน picker ของกฎ — ซ้ำจะสับสน)
 * - รหัส RD-#### สร้างอัตโนมัติเสมอ
 * - email owner/steward ต้องเป็นบัญชีผู้ใช้ ACTIVE ในระบบเท่านั้น
 * - ค่าเริ่มต้นจาก initialCsv ห้ามเกิน REFERENCE_VALUES_CAP ค่า
 */
export async function GET() {
  try {
    const [sets, valueGroups, ruleUsages, elementGroups, mappingGroups] = await Promise.all([
      db.referenceSet.findMany({
        orderBy: [{ code: 'asc' }],
        include: {
          subDomain: { select: { id: true, name: true, nameEn: true, parentId: true, parent: { select: { name: true } } } },
        },
      }),
      db.referenceValue.groupBy({ by: ['setId', 'status'], _count: { _all: true } }),
      // usage รายกฎ — สแกนกฎเอนจินโหมดทะเบียนแล้ว parse params (จำนวนกฎน้อย — ทำได้เบา)
      db.dqRule.findMany({
        where: { condition: { in: ['IN_LIST', 'REFERENCE_MATCH'] } },
        select: { id: true, parameters: true },
      }),
      db.dataElement.groupBy({ by: ['referenceSetId'], _count: { _all: true } }),
      db.dataMapping.groupBy({ by: ['lookupSetId'], _count: { _all: true } }),
    ])

    // นับกฎต่อทะเบียน
    const rulesBySet = new Map<string, number>()
    for (const r of ruleUsages) {
      try {
        const p = JSON.parse(r.parameters || '{}') as Record<string, unknown>
        const setId = String(p.referenceSetId ?? '').trim()
        if (setId) rulesBySet.set(setId, (rulesBySet.get(setId) ?? 0) + 1)
      } catch {
        // parameters พัง — ข้าม
      }
    }
    const allBySet = new Map<string, number>()
    const activeBySet = new Map<string, number>()
    for (const g of valueGroups) {
      allBySet.set(g.setId, (allBySet.get(g.setId) ?? 0) + g._count._all)
      if (g.status === 'ACTIVE') activeBySet.set(g.setId, g._count._all)
    }
    const elementsBySet = new Map<string, number>()
    for (const g of elementGroups) {
      if (g.referenceSetId) elementsBySet.set(g.referenceSetId, g._count._all)
    }
    const mappingsBySet = new Map<string, number>()
    for (const g of mappingGroups) {
      if (g.lookupSetId) mappingsBySet.set(g.lookupSetId, g._count._all)
    }

    const stats = {
      total: sets.length,
      active: sets.filter((s) => s.status === 'ACTIVE').length,
      draft: sets.filter((s) => s.status === 'DRAFT').length,
      valuesTotal: [...allBySet.values()].reduce((a, b) => a + b, 0),
    }

    return NextResponse.json({
      sets: sets.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        nameEn: s.nameEn,
        description: s.description,
        subDomainId: s.subDomainId,
        subDomainName: s.subDomain.name,
        parentDomainName: s.subDomain.parent?.name ?? null,
        ownerId: s.ownerId,
        stewardId: s.stewardId,
        status: s.status,
        version: s.version,
        valueCount: allBySet.get(s.id) ?? 0,
        activeValueCount: activeBySet.get(s.id) ?? 0,
        ruleCount: rulesBySet.get(s.id) ?? 0,
        elementCount: elementsBySet.get(s.id) ?? 0,
        mappingCount: mappingsBySet.get(s.id) ?? 0,
        createdBy: s.createdBy,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      stats,
      count: sets.length,
    })
  } catch (e) {
    console.error('GET /api/reference/sets', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการทะเบียนข้อมูลอ้างอิงได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const subDomainId = String(body.subDomainId ?? '').trim()
    const name = String(body.name ?? '').trim()

    if (!subDomainId) return NextResponse.json({ error: 'กรุณาเลือกโดเมนย่อยที่ทะเบียนสังกัด' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อทะเบียน' }, { status: 400 })
    if (name.length > REFERENCE_NAME_MAX) {
      return NextResponse.json({ error: `ชื่อทะเบียนยาวเกิน ${REFERENCE_NAME_MAX} ตัวอักษร` }, { status: 400 })
    }

    // ---------- deny-by-default: ทะเบียนต้องอยู่ใต้โดเมนย่อยเสมอ (แบบเดียวกับ Data Element) ----------
    const subDomain = await db.dataDomain.findUnique({ where: { id: subDomainId } })
    if (!subDomain) {
      return NextResponse.json({ error: 'ไม่พบโดเมนย่อยที่ระบุ' }, { status: 404 })
    }
    if (subDomain.parentId === null) {
      return NextResponse.json(
        { error: `ทะเบียนอ้างอิงต้องแขวนใต้ "โดเมนย่อย" เท่านั้น — "${subDomain.name}" เป็นโดเมนหลัก กรุณาเลือกหรือสร้างโดเมนย่อยก่อน` },
        { status: 400 },
      )
    }

    // ---------- กันชื่อซ้ำทั้งระบบ ----------
    const dup = await db.referenceSet.findFirst({ where: { name }, select: { id: true } })
    if (dup) {
      return NextResponse.json({ error: `มีทะเบียนชื่อ "${name}" อยู่แล้วในระบบ` }, { status: 409 })
    }

    // ---------- ผู้รับผิดชอบต้องเป็นผู้ใช้ ACTIVE ----------
    const peopleError = await validateStewardshipEmails([body.ownerId, body.stewardId])
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    // ---------- ค่าเริ่มต้นจาก CSV (ไม่บังคับ) ----------
    const csvRaw = typeof body.initialCsv === 'string' ? body.initialCsv : ''
    let initialRows: ReturnType<typeof parseValuesCsv>['rows'] = []
    if (csvRaw.trim() !== '') {
      const parsed = parseValuesCsv(csvRaw)
      // กันค่าซ้ำภายในไฟล์ (นับครั้งเดียว)
      const seen = new Set<string>()
      initialRows = []
      for (const r of parsed.rows) {
        if (seen.has(r.value)) continue
        seen.add(r.value)
        initialRows.push(r)
      }
      if (initialRows.length > REFERENCE_VALUES_CAP) {
        return NextResponse.json({ error: `ค่าเริ่มต้นเกินจำนวนสูงสุดต่อทะเบียน (${REFERENCE_VALUES_CAP} ค่า)` }, { status: 400 })
      }
    }

    const created = await db.referenceSet.create({
      data: {
        code: await nextReferenceCode(db),
        name,
        nameEn: String(body.nameEn ?? '').trim().slice(0, REFERENCE_NAME_MAX),
        description: String(body.description ?? '').trim().slice(0, REFERENCE_TEXT_MAX),
        subDomainId,
        ownerId: String(body.ownerId ?? '').trim().toLowerCase() || null,
        stewardId: String(body.stewardId ?? '').trim().toLowerCase() || null,
        createdBy: op.ctx.email,
        status: 'DRAFT', // workflow อนุมัติ — ทะเบียนใหม่เริ่มที่ DRAFT เสมอ
        values: {
          create: initialRows.map((r, i) => ({
            value: r.value,
            labelTh: r.labelTh,
            labelEn: r.labelEn,
            definition: r.definition,
            sortOrder: i + 1,
          })),
        },
      },
      include: { subDomain: { select: { name: true } } },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_REFERENCE_SET',
        actor: op.ctx.email,
        target: `${created.code} ${created.name}`,
        detail: `สร้างทะเบียนข้อมูลอ้างอิง "${created.name}" (${created.code}) ภายใต้โดเมนย่อย "${created.subDomain.name}"${initialRows.length > 0 ? ` พร้อมค่าเริ่มต้น ${initialRows.length} ค่า` : ''} — สถานะเริ่มต้น DRAFT (รอส่งขออนุมัติ) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ set: created, message: `สร้างทะเบียน "${created.name}" เรียบร้อย` }, { status: 201 })
  } catch (e) {
    console.error('POST /api/reference/sets', e)
    return NextResponse.json({ error: 'สร้างทะเบียนข้อมูลอ้างอิงไม่สำเร็จ' }, { status: 500 })
  }
}
