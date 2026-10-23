import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { MAPPING_INCLUDE, elementSummary, loadDomainMap } from '@/lib/mappings-server'

/**
 * Data Mapping Lineage API (v0.21.0) — แผนผังที่มา-ปลายทางแบบหลายขั้น (multi-hop)
 *
 * GET /api/mappings/lineage?elementId=…&depth=2
 * เดินกราฟทั้ง upstream (ฝั่งต้นทาง) และ downstream (ฝั่งปลายทาง) แบบ BFS
 * คืน nodes (element ทุกตัวที่เกี่ยว พร้อมเส้นทางเต็ม/ธง PII/CDE) และ edges (เส้น mapping พร้อมประเภท/สถานะ)
 * — READ-ONLY ไม่ต้องมีสิทธิ์พิเศษ (เหมือน GET /api/elements)
 */
export async function GET(req: NextRequest) {
  try {
    const elementId = req.nextUrl.searchParams.get('elementId')?.trim()
    if (!elementId) {
      return NextResponse.json({ error: 'กรุณาระบุ elementId ของจุดกึ่งกลางที่ต้องการดูแผนผัง' }, { status: 400 })
    }

    const depthRaw = Number(req.nextUrl.searchParams.get('depth') ?? '2')
    const depth = Math.min(3, Math.max(1, Number.isFinite(depthRaw) ? Math.floor(depthRaw) : 2))

    const [start, domainMap] = await Promise.all([
      db.dataElement.findUnique({
        where: { id: elementId },
        include: { subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } } },
      }),
      loadDomainMap(),
    ])
    if (!start) {
      return NextResponse.json({ error: 'ไม่พบ Data Element นี้ในระบบ' }, { status: 404 })
    }

    const nodes = new Map<string, ReturnType<typeof elementSummary>>()
    nodes.set(start.id, elementSummary(start, domainMap))
    const edges = new Map<string, { id: string; code: string; sourceId: string; targetId: string; mappingType: string; transformNote: string; status: string; pendingApproval: boolean }>()

    let frontier: string[] = [start.id]
    for (let level = 0; level < depth && frontier.length > 0; level++) {
      const rows = await db.dataMapping.findMany({
        where: {
          OR: [{ sourceElementId: { in: frontier } }, { targetElementId: { in: frontier } }],
        },
        include: MAPPING_INCLUDE,
      })
      const nextFrontier: string[] = []
      for (const m of rows) {
        if (!edges.has(m.id)) {
          edges.set(m.id, {
            id: m.id,
            code: m.code,
            sourceId: m.sourceElementId,
            targetId: m.targetElementId,
            mappingType: m.mappingType,
            transformNote: m.transformNote,
            status: m.status,
            pendingApproval: m.pendingApproval,
          })
        }
        for (const el of [m.source, m.target]) {
          if (!nodes.has(el.id)) {
            nodes.set(el.id, elementSummary(el, domainMap))
            nextFrontier.push(el.id)
          }
        }
      }
      frontier = nextFrontier
    }

    return NextResponse.json({
      rootId: start.id,
      depth,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      nodeCount: nodes.size,
      edgeCount: edges.size,
    })
  } catch (e) {
    console.error('GET /api/mappings/lineage', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดแผนผัง Data Mapping ได้' }, { status: 500 })
  }
}
