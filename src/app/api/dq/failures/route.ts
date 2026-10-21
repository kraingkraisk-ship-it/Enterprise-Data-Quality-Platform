import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isDimensionKey, maskValueByRole, type Row } from '@/lib/dq'

/**
 * GET /api/dq/failures — รายการแถวข้อมูลที่ล้มเหลวรายแถว (Failed Records)
 * query: datasetId?, status? (NEW|FIXED|IGNORED), dimension?, severity?, search?, page?, operatorEmail?
 * - snapshot ของแถวถูกปิดบัง PII ตามบทบาทของผู้ชม (PDPA-first) — ไม่ระบุผู้ชม = ปิดบังเข้มสุด (BUSINESS_USER)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const datasetId = sp.get('datasetId')?.trim() ?? ''
    const status = sp.get('status')?.trim() ?? ''
    const dimension = sp.get('dimension')?.trim() ?? ''
    const severity = sp.get('severity')?.trim() ?? ''
    const search = sp.get('search')?.trim() ?? ''
    const pageRaw = Number(sp.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const perPage = 25
    const operatorEmail = sp.get('operatorEmail')?.trim() ?? ''

    // ผู้ชม — ใช้บทบาทจริงถ้าระบุอีเมล (ACTIVE เท่านั้น) ไม่งั้นใช้บทบาทเข้มสุดเพื่อ PDPA-first
    let role = 'BUSINESS_USER'
    let piiEnabled = true
    if (operatorEmail) {
      const user = await db.user.findUnique({ where: { email: operatorEmail }, select: { role: true, status: true } })
      if (user && user.status === 'ACTIVE') role = user.role
    }

    const where = {
      ...(datasetId ? { datasetId } : {}),
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(dimension && isDimensionKey(dimension) ? { dimension } : {}),
    }

    const [total, items] = await Promise.all([
      db.dqFailureRecord.count({ where }),
      db.dqFailureRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          run: { select: { batchId: true } },
        },
      }),
    ])

    // โหลดชื่อชุดข้อมูล/กฎ + การตั้งค่า PII แบบ batch
    const [datasetIds, ruleIds] = [items.map((f) => f.datasetId), items.map((f) => f.ruleId)]
    const [datasets, rules] = await Promise.all([
      db.dataset.findMany({
        where: { id: { in: [...new Set(datasetIds)] } },
        select: { id: true, name: true, piiEnabled: true },
      }),
      db.dqRule.findMany({
        where: { id: { in: [...new Set(ruleIds)] } },
        select: { id: true, column: true, condition: true },
      }),
    ])
    const datasetMap = new Map(datasets.map((d) => [d.id, d]))
    const ruleMap = new Map(rules.map((r) => [r.id, r]))
    const conditionNames = new Map(
      (await db.conditionTemplate.findMany({ select: { key: true, name: true } })).map((c) => [c.key, c.name]),
    )

    const filtered = search
      ? items.filter((f) => {
          try {
            const row = JSON.parse(f.rowData) as Row
            return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
          } catch {
            return false
          }
        })
      : items

    const mapped = filtered.map((f) => {
      const dataset = datasetMap.get(f.datasetId)
      const rule = ruleMap.get(f.ruleId)
      piiEnabled = dataset?.piiEnabled ?? true
      let data: Record<string, string> = {}
      try {
        const row = JSON.parse(f.rowData) as Row
        data = Object.fromEntries(
          Object.entries(row).map(([col, val]) => [col, maskValueByRole(col, val, role, piiEnabled)]),
        )
      } catch {
        data = {}
      }
      return {
        id: f.id,
        batchId: f.batchId,
        datasetId: f.datasetId,
        datasetName: dataset?.name ?? '(ชุดข้อมูลถูกลบ)',
        ruleId: f.ruleId,
        ruleColumn: rule?.column ?? '(กฎถูกลบ)',
        conditionName: rule ? (conditionNames.get(rule.condition) ?? rule.condition) : '(กฎถูกลบ)',
        dimension: f.dimension,
        severity: f.severity,
        rowNo: f.rowNo,
        reason: f.reason,
        status: f.status,
        statusBy: f.statusBy,
        statusAt: f.statusAt?.toISOString() ?? null,
        createdAt: f.createdAt.toISOString(),
        data,
        piiMasked: piiEnabled,
      }
    })

    const [statsNew, statsFixed, statsIgnored] = await Promise.all([
      db.dqFailureRecord.count({ where: { ...where, status: 'NEW' } }),
      db.dqFailureRecord.count({ where: { ...where, status: 'FIXED' } }),
      db.dqFailureRecord.count({ where: { ...where, status: 'IGNORED' } }),
    ])

    return NextResponse.json({
      items: mapped,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / perPage)),
      stats: { NEW: statsNew, FIXED: statsFixed, IGNORED: statsIgnored },
      viewerRole: role,
    })
  } catch (e) {
    console.error('GET /api/dq/failures', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการข้อมูลที่ล้มเหลวได้' }, { status: 500 })
  }
}
