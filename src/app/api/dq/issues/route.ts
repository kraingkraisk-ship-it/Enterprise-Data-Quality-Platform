import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isDimensionKey, DIMENSION_LABELS, type DimensionKey } from '@/lib/dq'
import { resolveOperator } from '@/lib/operator'
import { nextIssueCode, ISSUE_SOURCE_LABELS } from '@/lib/issues'

/**
 * GET /api/dq/issues — รายการปัญหาคุณภาพข้อมูล
 * query: status? (OPEN|IN_PROGRESS|RESOLVED|CLOSED), severity?, datasetId?, dimension?, source?, q?, page?
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')?.trim().toUpperCase() ?? ''
    const severity = sp.get('severity')?.trim().toUpperCase() ?? ''
    const datasetId = sp.get('datasetId')?.trim() ?? ''
    const dimension = sp.get('dimension')?.trim().toUpperCase() ?? ''
    const source = sp.get('source')?.trim().toUpperCase() ?? ''
    const q = sp.get('q')?.trim() ?? ''
    const pageRaw = Number(sp.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const perPage = 20

    const where = {
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(datasetId ? { datasetId } : {}),
      ...(dimension && isDimensionKey(dimension) ? { dimension } : {}),
      ...(source ? { source } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }, { code: { contains: q } }] } : {}),
    }

    const [total, items] = await Promise.all([
      db.dqIssue.count({ where }),
      db.dqIssue.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ])

    const datasetIds = [...new Set(items.map((i) => i.datasetId))]
    const datasets = await db.dataset.findMany({
      where: { id: { in: datasetIds } },
      select: { id: true, name: true },
    })
    const datasetMap = new Map(datasets.map((d) => [d.id, d.name]))

    const [open, inProgress, resolved, closed] = await Promise.all([
      db.dqIssue.count({ where: { status: 'OPEN' } }),
      db.dqIssue.count({ where: { status: 'IN_PROGRESS' } }),
      db.dqIssue.count({ where: { status: 'RESOLVED' } }),
      db.dqIssue.count({ where: { status: 'CLOSED' } }),
    ])
    const [critical, high, medium, low] = await Promise.all([
      db.dqIssue.count({ where: { severity: 'CRITICAL', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      db.dqIssue.count({ where: { severity: 'HIGH', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      db.dqIssue.count({ where: { severity: 'MEDIUM', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      db.dqIssue.count({ where: { severity: 'LOW', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ])

    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        code: i.code,
        datasetId: i.datasetId,
        datasetName: datasetMap.get(i.datasetId) ?? '(ชุดข้อมูลถูกลบ)',
        title: i.title,
        description: i.description,
        source: i.source,
        sourceId: i.sourceId,
        dimension: i.dimension,
        severity: i.severity,
        status: i.status,
        reportedBy: i.reportedBy,
        assignedTo: i.assignedTo,
        dueAt: i.dueAt?.toISOString() ?? null,
        resolutionNote: i.resolutionNote,
        detectedAt: i.detectedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
        closedAt: i.closedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / perPage)),
      stats: {
        OPEN: open,
        IN_PROGRESS: inProgress,
        RESOLVED: resolved,
        CLOSED: closed,
        bySeverity: { CRITICAL: critical, HIGH: high, MEDIUM: medium, LOW: low },
      },
    })
  } catch (e) {
    console.error('GET /api/dq/issues', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการปัญหาได้' }, { status: 500 })
  }
}

/**
 * POST /api/dq/issues — สร้างปัญหาใหม่ (MANUAL หรือจากต้นทาง SIGNAL/FAILURE/EXCEPTION)
 * body: { datasetId, title, description?, dimension, severity?, source?, sourceId?, reportedByEmail }
 * - ต้องมีสิทธิ์ MANAGE_ISSUES
 * - ถ้าระบุ source+sourceId และมีปัญหาที่ยังไม่ปิดจากต้นทางเดียวกันอยู่แล้ว → คืนปัญหาเดิม (กันสร้างซ้ำ)
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          datasetId?: string
          title?: string
          description?: string
          dimension?: string
          severity?: string
          source?: string
          sourceId?: string
          reportedByEmail?: string
        }
      | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.reportedByEmail, 'MANAGE_ISSUES')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const datasetId = String(body.datasetId ?? '').trim()
    const title = String(body.title ?? '').trim()
    const dimension = String(body.dimension ?? '').trim().toUpperCase()
    const severity = (String(body.severity ?? 'MEDIUM').trim().toUpperCase() || 'MEDIUM')
    const source = String(body.source ?? 'MANUAL').trim().toUpperCase()
    const sourceId = String(body.sourceId ?? '').trim()

    if (!datasetId || title.length < 8 || !isDimensionKey(dimension)) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบ — ต้องระบุชุดข้อมูล หัวข้อ (อย่างน้อย 8 ตัวอักษร) และมิติคุณภาพ' },
        { status: 400 },
      )
    }
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity)) {
      return NextResponse.json({ error: 'ระดับความรุนแรงไม่ถูกต้อง' }, { status: 400 })
    }
    if (!['MANUAL', 'SIGNAL', 'FAILURE', 'EXCEPTION'].includes(source)) {
      return NextResponse.json({ error: 'ที่มาของปัญหาไม่ถูกต้อง' }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({ where: { id: datasetId }, select: { id: true, name: true } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    // กันสร้างซ้ำจากต้นทางเดียวกัน (ถ้าระบุ sourceId)
    if (source !== 'MANUAL' && sourceId) {
      const existing = await db.dqIssue.findFirst({
        where: { source, sourceId, status: { not: 'CLOSED' } },
      })
      if (existing) {
        return NextResponse.json({ ok: true, existing: true, issue: { id: existing.id, code: existing.code } })
      }
    }

    const code = await nextIssueCode(db)
    const dimTh = DIMENSION_LABELS[dimension as DimensionKey]?.th ?? dimension
    const issue = await db.dqIssue.create({
      data: {
        code,
        datasetId,
        title,
        description: String(body.description ?? '').trim(),
        source,
        sourceId,
        dimension,
        severity,
        reportedBy: op.ctx.email,
      },
    })

    const sourceTh = ISSUE_SOURCE_LABELS[source]?.th ?? source
    await db.auditLog.create({
      data: {
        action: 'CREATE_ISSUE',
        actor: op.ctx.email,
        target: `${issue.code} — ${dataset.name}`,
        detail: `เปิดปัญหาคุณภาพข้อมูล ${issue.code} (ที่มา: ${sourceTh}) [${dimTh}/${severity}]: ${title} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ ok: true, issue: { id: issue.id, code: issue.code } })
  } catch (e) {
    console.error('POST /api/dq/issues', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างปัญหาได้' }, { status: 500 })
  }
}
