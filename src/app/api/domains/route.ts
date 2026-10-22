import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { DOMAIN_DESC_MAX, DOMAIN_NAME_MAX, isValidDomainColor } from '@/lib/domains'

/**
 * GET  /api/domains — รายการโดเมนข้อมูลทั้งหมด (flat + assetCount + datasetCount รายโดเมน — client ประกอบต้นไม้เอง)
 * POST /api/domains — สร้างโดเมนหลักหรือโดเมนย่อย
 *   body: { operatorEmail, name, nameEn?, description?, parentId?, color? }
 * สิทธิ์ (เฉพาะ POST): MANAGE_DATASETS — ทุกการสร้างบันทึก Audit Trail
 * กติกา (deny-by-default): ลึกสุด 2 ระดับ · ชื่อซ้ำในระดับเดียวกันไม่ได้ · พ่อต้องเป็นโดเมนหลักเท่านั้น
 */
export async function GET() {
  try {
    const [domains, groups, columnGroups, datasetGroups] = await Promise.all([
      db.dataDomain.findMany({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          nameEn: true,
          description: true,
          parentId: true,
          color: true,
          position: true,
          createdAt: true,
        },
      }),
      db.dataAsset.groupBy({ by: ['domainId'], _count: { _all: true } }),
      db.dataDomainColumnAssignment.groupBy({ by: ['domainId'], _count: { _all: true } }),
      db.dataset.groupBy({ by: ['domainId'], _count: { _all: true } }),
    ])

    const countByDomain = new Map<string, number>()
    for (const g of groups) {
      if (g.domainId) countByDomain.set(g.domainId, g._count._all)
    }
    const columnsByDomain = new Map<string, number>()
    for (const g of columnGroups) {
      columnsByDomain.set(g.domainId, g._count._all)
    }
    const datasetsByDomain = new Map<string, number>()
    for (const g of datasetGroups) {
      if (g.domainId) datasetsByDomain.set(g.domainId, g._count._all)
    }

    return NextResponse.json({
      domains: domains.map((d) => ({
        ...d,
        assetCount: countByDomain.get(d.id) ?? 0,
        columnCount: columnsByDomain.get(d.id) ?? 0,
        datasetCount: datasetsByDomain.get(d.id) ?? 0,
      })),
      count: domains.length,
    })
  } catch (e) {
    console.error('GET /api/domains', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการโดเมนข้อมูลได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const name = String(body.name ?? '').trim()
    const nameEn = String(body.nameEn ?? '').trim().slice(0, DOMAIN_NAME_MAX)
    const description = String(body.description ?? '').trim().slice(0, DOMAIN_DESC_MAX)
    const parentIdRaw = String(body.parentId ?? '').trim()
    const color = String(body.color ?? 'emerald').trim()

    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อโดเมน' }, { status: 400 })
    if (name.length > DOMAIN_NAME_MAX) return NextResponse.json({ error: `ชื่อโดเมนยาวเกิน ${DOMAIN_NAME_MAX} ตัวอักษร` }, { status: 400 })
    if (!isValidDomainColor(color)) return NextResponse.json({ error: 'สีที่เลือกไม่ถูกต้อง' }, { status: 400 })

    // ---------- โดเมนย่อย: ตรวจพ่อ (ต้องเป็นโดเมนหลักเท่านั้น — ห้ามลึกกว่า 2 ระดับ) ----------
    let parentId: string | null = null
    if (parentIdRaw) {
      const parent = await db.dataDomain.findUnique({ where: { id: parentIdRaw } })
      if (!parent) return NextResponse.json({ error: 'ไม่พบโดเมนหลักที่ระบุ' }, { status: 404 })
      if (parent.parentId !== null) {
        return NextResponse.json({ error: 'โดเมนย่อยไม่สามารถมีโดเมนย่อยของตัวเองได้ — รองรับสูงสุด 2 ระดับ' }, { status: 400 })
      }
      parentId = parent.id
    }

    // ---------- กันชื่อซ้ำในระดับเดียวกัน ----------
    const dup = await db.dataDomain.findFirst({
      where: { name: { equals: name }, parentId: parentId },
      select: { id: true },
    })
    if (dup) {
      return NextResponse.json(
        { error: parentId ? `มีโดเมนย่อยชื่อ "${name}" อยู่แล้วในโดเมนหลักนี้` : `มีโดเมนหลักชื่อ "${name}" อยู่แล้ว` },
        { status: 409 },
      )
    }

    const position = await db.dataDomain.count({ where: { parentId: parentId } })
    const created = await db.dataDomain.create({
      data: { name, nameEn, description, parentId, color, position, createdBy: op.ctx.email },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_DATA_DOMAIN',
        actor: op.ctx.email,
        target: created.name,
        detail: parentId
          ? `สร้างโดเมนย่อย "${created.name}" ภายใต้โดเมนหลักที่ระบุ โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`
          : `สร้างโดเมนหลัก "${created.name}" โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ domain: created, message: `สร้างโดเมน "${created.name}" เรียบร้อย` }, { status: 201 })
  } catch (e) {
    console.error('POST /api/domains', e)
    return NextResponse.json({ error: 'สร้างโดเมนข้อมูลไม่สำเร็จ' }, { status: 500 })
  }
}
