import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { MAPPING_STATUSES, MAPPING_TEXT_MAX, MAPPING_TYPE_KEYS, isMappingType } from '@/lib/mappings'
import {
  MAPPING_INCLUDE,
  findDuplicatePair,
  generateMappingCode,
  loadDomainMap,
  mappingExpanded,
} from '@/lib/mappings-server'
import type { Prisma } from '@prisma/client'

/**
 * Data Mapping API (v0.21.0) — เส้นเชื่อม Data Element ต้นทาง → ปลายทาง เพื่อระบุว่าเป็นข้อมูลชนิดเดียวกัน
 *
 * GET  /api/mappings?elementId=…&status=…&type=…
 *      รายการ mapping ทั้งหมด (กรองตาม element ฝั่งใดฝั่งหนึ่ง / สถานะ / ประเภท)
 *      คืน expanded: source/target พร้อมเส้นทางเต็ม โดเมนหลัก.โดเมนย่อย.ชื่อ element
 * POST /api/mappings — สร้าง mapping ใหม่ (สถานะเริ่มต้น DRAFT เสมอ — เปิดใช้งานด้วยสิทธิ์ MANAGE_DATASETS เมื่อพร้อม)
 *      body: { operatorEmail, sourceElementId, targetElementId, mappingType, transformNote?, note?, lookupSetId? (v0.31.0 — เฉพาะ LOOKUP) }
 *
 * สิทธิ์ (เฉพาะ POST): MANAGE_DATASETS — ทุกการสร้างบันทึก Audit Trail
 * กติกา (deny-by-default):
 * - ปลายทางต้องเป็น Data Element ที่ลงทะเบียนในระบบและใช้งานอยู่ (ACTIVE) เท่านั้น
 * - ห้ามแมปตัวเอง (source = target)
 * - ห้ามแมปคู่เดิมซ้ำ ทั้งทิศตรง (A→B) และทิศกลับ (B→A) — เพราะ mapping หมายถึงข้อมูลชนิดเดียวกัน
 * - แมปข้าม Data Domain ได้ (ออกแบบตามผู้ใช้กำหนด v0.21.0)
 * - ประเภท TRANSFORM/DERIVED/AGGREGATE/LOOKUP ต้องระบุรายละเอียดการแปลง (transformNote) เสมอ
 */
export async function GET(req: NextRequest) {
  try {
    const elementId = req.nextUrl.searchParams.get('elementId')?.trim()
    const status = req.nextUrl.searchParams.get('status')?.trim()
    const type = req.nextUrl.searchParams.get('type')?.trim()

    const where: Prisma.DataMappingWhereInput = {}
    if (elementId) where.OR = [{ sourceElementId: elementId }, { targetElementId: elementId }]
    if (status) {
      if (!(MAPPING_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: `สถานะไม่ถูกต้อง — ต้องเป็น: ${MAPPING_STATUSES.join(', ')}` }, { status: 400 })
      }
      where.status = status
    }
    if (type) {
      if (!isMappingType(type)) {
        return NextResponse.json({ error: `ประเภทการแมปไม่ถูกต้อง — ต้องเป็น: ${MAPPING_TYPE_KEYS.join(', ')}` }, { status: 400 })
      }
      where.mappingType = type
    }

    const [rows, domainMap] = await Promise.all([
      db.dataMapping.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: { createdAt: 'desc' },
        include: MAPPING_INCLUDE,
      }),
      loadDomainMap(),
    ])

    return NextResponse.json({
      mappings: rows.map((m) => mappingExpanded(m, domainMap)),
      count: rows.length,
    })
  } catch (e) {
    console.error('GET /api/mappings', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการ Data Mapping ได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const sourceElementId = String(body.sourceElementId ?? '').trim()
    const targetElementId = String(body.targetElementId ?? '').trim()
    if (!sourceElementId || !targetElementId) {
      return NextResponse.json({ error: 'กรุณาเลือก Data Element ต้นทางและปลายทางให้ครบ' }, { status: 400 })
    }
    if (sourceElementId === targetElementId) {
      return NextResponse.json({ error: 'ห้ามแมป element กับตัวเอง — ต้นทางและปลายทางต้องเป็นคนละ element' }, { status: 400 })
    }

    const mappingType = String(body.mappingType ?? 'DIRECT').trim().toUpperCase()
    if (!isMappingType(mappingType)) {
      return NextResponse.json(
        { error: `ประเภทการแมปไม่ถูกต้อง — ต้องเป็น: ${MAPPING_TYPE_KEYS.join(', ')}` },
        { status: 400 },
      )
    }

    const transformNote =
      mappingType === 'DIRECT' ? '' : String(body.transformNote ?? '').trim().slice(0, MAPPING_TEXT_MAX)
    // v0.22.0 — RENAME ไม่บังคับกฎการแปลง (แต่กรอกได้ เช่น TRIM) · TRANSFORM/DERIVED/AGGREGATE/LOOKUP บังคับ
    if (!['DIRECT', 'RENAME'].includes(mappingType) && !transformNote) {
      return NextResponse.json(
        { error: 'ประเภทการแมปนี้ต้องระบุรายละเอียดการแปลง/สูตร/ตารางอ้างอิง (transformNote)' },
        { status: 400 },
      )
    }
    const note = String(body.note ?? '').trim().slice(0, MAPPING_TEXT_MAX)

    // ทะเบียนข้อมูลอ้างอิงของ LOOKUP (v0.31.0) — ระบุได้เฉพาะ mappingType = LOOKUP · ต้องเป็นทะเบียน ACTIVE
    let lookupSetId: string | null = null
    const lookupSetRaw = String(body.lookupSetId ?? '').trim()
    if (lookupSetRaw) {
      if (mappingType !== 'LOOKUP') {
        return NextResponse.json({ error: 'ทะเบียนข้อมูลอ้างอิง (lookupSetId) ระบุได้เฉพาะการแมปประเภท LOOKUP เท่านั้น' }, { status: 400 })
      }
      const rs = await db.referenceSet.findUnique({ where: { id: lookupSetRaw }, select: { id: true, code: true, name: true, status: true } })
      if (!rs) return NextResponse.json({ error: 'ไม่พบทะเบียนข้อมูลอ้างอิงที่เลือกในระบบ' }, { status: 404 })
      if (rs.status !== 'ACTIVE') {
        return NextResponse.json({ error: `ทะเบียน "${rs.name}" ยังไม่ใช้งาน (สถานะ ${rs.status}) — อ้างได้เฉพาะทะเบียนที่เปิดใช้งานแล้ว (ACTIVE)` }, { status: 400 })
      }
      lookupSetId = rs.id
    }

    // deny-by-default: ทั้งสองฝั่งต้องเป็น element จริงและใช้งานอยู่ (ACTIVE)
    const elements = await db.dataElement.findMany({
      where: { id: { in: [sourceElementId, targetElementId] } },
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

    // ห้ามคู่ซ้ำทั้งทิศตรงและทิศกลับ
    const dup = await findDuplicatePair(sourceElementId, targetElementId)
    if (dup) {
      const reversed = dup.sourceElementId === targetElementId
      return NextResponse.json(
        {
          error: reversed
            ? `แมปทิศกลับไม่ได้ — มี mapping ${dup.code} (${dup.source.nameTh} → ${dup.target.nameTh}) อยู่แล้ว เพราะการแมปหมายถึงข้อมูลชนิดเดียวกัน`
            : `มี mapping ${dup.code} ของคู่ element นี้อยู่แล้ว (${dup.source.nameTh} → ${dup.target.nameTh})`,
        },
        { status: 409 },
      )
    }

    // v0.22.0 — รหัสรายใหม่ = MAP-{DOMAIN}-{seq} (จากโดเมนหลักฝั่งปลายทาง) เช่น MAP-CUST-001 · รายเดิม MP-#### คงเดิม
    const code = await generateMappingCode(targetElementId)
    const created = await db.dataMapping.create({
      data: {
        code,
        sourceElementId,
        targetElementId,
        mappingType,
        transformNote,
        note,
        lookupSetId,
        createdBy: op.ctx.email,
      },
    })
    await db.auditLog.create({
      data: {
        action: 'CREATE_DATA_MAPPING',
        actor: op.ctx.email,
        target: created.code,
        detail: `สร้าง Data Mapping ${created.code} (${mappingType})${lookupSetId ? ' · อ้างทะเบียนอ้างอิง' : ''} — สถานะเริ่มต้น DRAFT (เปิดใช้งานเมื่อพร้อม) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    const [fresh, domainMap] = await Promise.all([
      db.dataMapping.findUnique({ where: { id: created.id }, include: MAPPING_INCLUDE }),
      loadDomainMap(),
    ])
    return NextResponse.json(
      { mapping: fresh ? mappingExpanded(fresh, domainMap) : null, message: `สร้าง Data Mapping ${created.code} แล้ว — สถานะเริ่มต้น DRAFT (เปิดใช้งานเมื่อพร้อม)` },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/mappings', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้าง Data Mapping ได้' }, { status: 500 })
  }
}
