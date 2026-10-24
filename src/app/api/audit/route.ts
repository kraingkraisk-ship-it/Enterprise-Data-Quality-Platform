/**
 * GET /api/audit (v0.30.0) — รายการ Audit Log ศูนย์กลางของระบบ (ศูนย์บันทึกตรวจสอบ)
 * ตัวกรอง: groups / actions / actor / q / from / to (รายละเอียดใน src/lib/audit-query.ts)
 * แบ่งหน้า: limit (ค่าเริ่ม 50 สูงสุด 200) + offset
 *
 * คืน: logs (ตามตัวกรอง) · total (จำนวนทั้งหมดตามตัวกรอง)
 *      stats (ทั้งระบบ ไม่อิงตัวกรอง: total/today/last7/topActor)
 *      facets (ทั้งระบบ: actors top 12 · byGroup จำนวนต่อกลุ่ม)
 *      policy (นโยบายเก็บรักษาปัจจุบัน + จำนวนที่จะถูกลบถ้าลบตอนนี้)
 *
 * สิทธิ์: อ่านได้ทุกบทบาท (หลักความโปร่งใสเดียวกับ /api/rbac/audit เดิม — เกณฑ์ทุกตัวต้องเห็นได้บนจอ)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUDIT_ACTIONS, AUDIT_GROUPS } from '@/lib/audit-actions'
import { buildAuditWhere } from '@/lib/audit-query'

/** เที่ยงวันแรกของวันนี้ (เขตเวลาเซิร์ฟเวอร์) — ใช้นับการ์ดสรุป */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const { where } = buildAuditWhere(sp)

    const limitRaw = Number(sp.get('limit') ?? '50')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50
    const offsetRaw = Number(sp.get('offset') ?? '0')
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0

    const [logs, total, grandTotal, today, last7, actorFacets, actionFacets, policyRow] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      db.auditLog.count({ where }),
      db.auditLog.count(),
      db.auditLog.count({ where: { createdAt: { gte: startOfToday() } } }),
      db.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
      db.auditLog.groupBy({ by: ['actor'], _count: { actor: true }, orderBy: { _count: { actor: 'desc' } }, take: 12 }),
      db.auditLog.groupBy({ by: ['action'], _count: { action: true } }),
      db.auditPolicy.findUnique({ where: { id: 1 } }).catch(() => null),
    ])

    // จำนวนต่อกลุ่ม (ทั้งระบบ) — action นอกคลังนับรวมเป็น "อื่น ๆ"
    const byGroup: Record<string, number> = {}
    let unknown = 0
    for (const row of actionFacets) {
      const def = AUDIT_ACTIONS[row.action]
      if (def) byGroup[def.group] = (byGroup[def.group] ?? 0) + row._count.action
      else unknown += row._count.action
    }
    for (const g of Object.keys(AUDIT_GROUPS)) if (byGroup[g] === undefined) byGroup[g] = 0
    if (unknown > 0) byGroup.__unknown = unknown

    // นโยบายเก็บรักษา + ตัวเลขล่วงหน้า "ถ้าลบตอนนี้จะได้กี่แถว"
    const retentionDays = policyRow?.retentionDays ?? 365
    let willPrune = 0
    let oldestAt: string | null = null
    try {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000)
      const [pruneCount, oldest] = await Promise.all([
        db.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
        db.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ])
      willPrune = pruneCount
      oldestAt = oldest?.createdAt.toISOString() ?? null
    } catch (polErr) {
      console.error('GET /api/audit policy preview', polErr)
    }

    const topActor = actorFacets[0] ? { actor: actorFacets[0].actor, count: actorFacets[0]._count.actor } : null

    return NextResponse.json({
      logs,
      total,
      limit,
      offset,
      stats: { total: grandTotal, today, last7, topActor },
      facets: {
        actors: actorFacets.map((a) => ({ actor: a.actor, count: a._count.actor })),
        byGroup,
      },
      policy: {
        retentionDays,
        updatedAt: policyRow?.updatedAt.toISOString() ?? null,
        updatedBy: policyRow?.updatedBy ?? null,
        willPrune,
        oldestAt,
      },
    })
  } catch (e) {
    console.error('GET /api/audit', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดบันทึกการตรวจสอบได้' }, { status: 500 })
  }
}
