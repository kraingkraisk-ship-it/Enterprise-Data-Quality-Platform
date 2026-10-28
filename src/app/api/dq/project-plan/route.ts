import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { ROLES, isValidRole } from '@/lib/rbac'

/**
 * API แผนงาน DQ (DQ Project Plan — v0.34.0)
 * ─ GET    /api/dq/project-plan            รายการ Task + Progress ถ่วงน้ำหนัก (สิทธิ์: VIEW_DASHBOARDS)
 * ─ POST   /api/dq/project-plan            เพิ่ม Task (สิทธิ์: MANAGE_PROJECT_PLAN)
 * ─ PATCH  /api/dq/project-plan            แก้ไข Task (progress/น้ำหนัก/ชื่อ ฯลฯ — สิทธิ์: MANAGE_PROJECT_PLAN)
 * ─ DELETE /api/dq/project-plan?id=...     ลบ Task (สิทธิ์: MANAGE_PROJECT_PLAN)
 * ทุก mutation ใช้ resolveOperator (session จริง + RBAC) และเขียน AuditLog ทุกครั้ง
 *
 * Progress ถ่วงน้ำหนัก = Σ(weight×progress)/Σ(weight) — คำนวณทั้งระบบ รายปี และราย Data Domain
 * สถานะ derive จาก progress: 0 = วางแผน · 1–99 = กำลังดำเนินการ · 100 = เสร็จสิ้น
 */

const PLAN_YEARS = [2026, 2027, 2028, 2029, 2030] as const

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** สถานะจาก progress (derive — เก็บแค่ progress เดียวเพื่อไม่ให้สองค่าขัดกัน) */
function statusOf(progress: number): 'PLANNED' | 'IN_PROGRESS' | 'DONE' {
  if (progress >= 100) return 'DONE'
  if (progress > 0) return 'IN_PROGRESS'
  return 'PLANNED'
}

/* --------------------------------- GET ----------------------------------- */

export async function GET() {
  try {
    // สิทธิ์ดู — ทุกบทบาทที่เข้าสู่ระบบและมี VIEW_DASHBOARDS
    const op = await resolveOperator(null, 'VIEW_DASHBOARDS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const [tasks, domains] = await Promise.all([
      db.projectTask.findMany({ orderBy: [{ year: 'asc' }, { quarter: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      db.dataDomain.findMany({ where: { parentId: null }, orderBy: { position: 'asc' }, select: { name: true } }),
    ])

    const withStatus = tasks.map((t) => ({ ...t, status: statusOf(t.progress) }))

    const wsum = withStatus.reduce((s, t) => s + t.weight, 0)
    const weighted = withStatus.reduce((s, t) => s + t.weight * t.progress, 0)
    const overall = wsum > 0 ? weighted / wsum : 0

    // รายปี — ใช้สำหรับแถบ progress 2026–2030 + สรุป "ทวนสอบปีนี้"
    const byYear = PLAN_YEARS.map((year) => {
      const rows = withStatus.filter((t) => t.year === year)
      const w = rows.reduce((s, t) => s + t.weight, 0)
      const p = rows.reduce((s, t) => s + t.weight * t.progress, 0)
      return {
        year,
        tasks: rows.length,
        done: rows.filter((t) => t.status === 'DONE').length,
        inProgress: rows.filter((t) => t.status === 'IN_PROGRESS').length,
        planned: rows.filter((t) => t.status === 'PLANNED').length,
        progressPct: w > 0 ? p / w : 0,
      }
    })

    // ราย Data Domain — แถวของแผนที่ Gantt (โดเมนเรียงตามปีเริ่มต้นในแผน)
    const domainMap = new Map<string, { tasks: typeof withStatus; years: number[] }>()
    for (const t of withStatus) {
      const g = domainMap.get(t.domainLabel)
      if (g) {
        g.tasks.push(t)
        if (!g.years.includes(t.year)) g.years.push(t.year)
      } else {
        domainMap.set(t.domainLabel, { tasks: [t], years: [t.year] })
      }
    }
    const byDomain = [...domainMap.entries()]
      .map(([domainLabel, g]) => {
        const w = g.tasks.reduce((s, t) => s + t.weight, 0)
        const p = g.tasks.reduce((s, t) => s + t.weight * t.progress, 0)
        return { domainLabel, tasks: g.tasks, progressPct: w > 0 ? p / w : 0, years: [...g.years].sort((a, b) => a - b) }
      })
      .sort((a, b) => (a.years[0] ?? 9999) - (b.years[0] ?? 9999) || a.domainLabel.localeCompare(b.domainLabel, 'th'))

    // สรุป "ทวนสอบปีปัจจุบัน" — ปีจากเซิร์ฟเวอร์ (เช่น 2026)
    const currentYear = new Date().getFullYear()
    const currentRows = byYear.find((y) => y.year === currentYear) ?? null
    // โดเมนทั้งหมดในแผน (รวมทุกปี) และโดเมนที่ยังไม่ถูกทวนสอบภายในปีปัจจุบัน
    const plannedDomains = [...domainMap.keys()].sort((a, b) => a.localeCompare(b, 'th'))
    const currentDomains = new Set(withStatus.filter((t) => t.year <= currentYear).map((t) => t.domainLabel))
    const remainingDomains = plannedDomains.filter((d) => !currentDomains.has(d))

    return NextResponse.json({
      currentYear,
      planYears: PLAN_YEARS,
      tasks: withStatus,
      overall: { progressPct: overall, tasks: withStatus.length, weighted: true },
      byYear,
      byDomain,
      currentYearSummary: {
        year: currentYear,
        progressPct: currentRows?.progressPct ?? 0,
        tasks: currentRows?.tasks ?? 0,
        done: currentRows?.done ?? 0,
        inProgress: currentRows?.inProgress ?? 0,
        planned: currentRows?.planned ?? 0,
        domainsCovered: plannedDomains.length - remainingDomains.length,
        domainsRemaining: remainingDomains,
      },
      domainSuggestions: domains.map((d) => d.name),
      canManage: op.ctx.role ? (ROLES[op.ctx.role as keyof typeof ROLES]?.permissions ?? []).includes('MANAGE_PROJECT_PLAN') : false,
      viewer: op.ctx,
    })
  } catch (e) {
    console.error('GET /api/dq/project-plan', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดแผนงาน DQ ได้' }, { status: 500 })
  }
}

/* --------------------------------- POST ---------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const op = await resolveOperator(body.operatorEmail, 'MANAGE_PROJECT_PLAN')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const title = String(body.title ?? '').trim()
    const domainLabel = String(body.domainLabel ?? '').trim()
    if (!title) return NextResponse.json({ error: 'กรุณาระบุชื่อ Task' }, { status: 400 })
    if (title.length > 200) return NextResponse.json({ error: 'ชื่อ Task ยาวเกิน 200 ตัวอักษร' }, { status: 400 })
    if (!domainLabel) return NextResponse.json({ error: 'กรุณาระบุ Data Domain ของ Task' }, { status: 400 })

    const year = clampInt(body.year, 2026, 2040, new Date().getFullYear())
    const quarter = clampInt(body.quarter, 1, 4, 1)
    const weight = clampInt(body.weight, 1, 5, 1)
    const progress = clampInt(body.progress, 0, 100, 0)
    const detail = String(body.detail ?? '').trim().slice(0, 500)
    const ownerRole = String(body.ownerRole ?? 'DATA_STEWARD')
    if (!isValidRole(ownerRole)) return NextResponse.json({ error: 'บทบาทผู้รับผิดชอบไม่ถูกต้อง' }, { status: 400 })

    const created = await db.projectTask.create({
      data: {
        title,
        detail,
        domainLabel,
        year,
        quarter,
        weight,
        progress,
        ownerRole,
        createdBy: op.ctx.email,
        updatedBy: op.ctx.email,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_PROJECT_TASK',
        actor: op.ctx.email,
        target: `${created.title} (${created.domainLabel} · ${created.year})`,
        detail: `เพิ่ม Task แผนงาน DQ: "${created.title}" โดเมน ${created.domainLabel} ปี ${created.year} Q${created.quarter} น้ำหนัก ×${created.weight} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ task: { ...created, status: statusOf(created.progress) }, message: `เพิ่ม Task "${created.title}" เรียบร้อย` })
  } catch (e) {
    console.error('POST /api/dq/project-plan', e)
    return NextResponse.json({ error: 'ไม่สามารถเพิ่ม Task ได้' }, { status: 500 })
  }
}

/* --------------------------------- PATCH --------------------------------- */

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const op = await resolveOperator(body.operatorEmail, 'MANAGE_PROJECT_PLAN')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const id = String(body.id ?? '').trim()
    if (!id) return NextResponse.json({ error: 'กรุณาระบุ id ของ Task' }, { status: 400 })

    const existing = await db.projectTask.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'ไม่พบ Task นี้ในแผนงาน' }, { status: 404 })

    const data: Record<string, unknown> = { updatedBy: op.ctx.email }
    const changes: string[] = []

    if (body.progress !== undefined) {
      const progress = clampInt(body.progress, 0, 100, existing.progress)
      if (progress !== existing.progress) {
        changes.push(`progress ${existing.progress}% → ${progress}%`)
        data.progress = progress
      }
    }
    if (body.weight !== undefined) {
      const weight = clampInt(body.weight, 1, 5, existing.weight)
      if (weight !== existing.weight) {
        changes.push(`น้ำหนัก ×${existing.weight} → ×${weight}`)
        data.weight = weight
      }
    }
    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title) return NextResponse.json({ error: 'ชื่อ Task ห้ามว่าง' }, { status: 400 })
      if (title !== existing.title) {
        changes.push(`ชื่อ "${existing.title}" → "${title}"`)
        data.title = title.slice(0, 200)
      }
    }
    if (body.detail !== undefined) {
      const detail = String(body.detail).trim().slice(0, 500)
      if (detail !== existing.detail) {
        changes.push('รายละเอียด')
        data.detail = detail
      }
    }
    if (body.year !== undefined) {
      const year = clampInt(body.year, 2026, 2040, existing.year)
      if (year !== existing.year) {
        changes.push(`ปี ${existing.year} → ${year}`)
        data.year = year
      }
    }
    if (body.quarter !== undefined) {
      const quarter = clampInt(body.quarter, 1, 4, existing.quarter)
      if (quarter !== existing.quarter) {
        changes.push(`ไตรมาส Q${existing.quarter} → Q${quarter}`)
        data.quarter = quarter
      }
    }
    if (body.domainLabel !== undefined) {
      const domainLabel = String(body.domainLabel).trim()
      if (!domainLabel) return NextResponse.json({ error: 'Data Domain ห้ามว่าง' }, { status: 400 })
      if (domainLabel !== existing.domainLabel) {
        changes.push(`โดเมน ${existing.domainLabel} → ${domainLabel}`)
        data.domainLabel = domainLabel
      }
    }
    if (body.ownerRole !== undefined) {
      const ownerRole = String(body.ownerRole)
      if (!isValidRole(ownerRole)) return NextResponse.json({ error: 'บทบาทผู้รับผิดชอบไม่ถูกต้อง' }, { status: 400 })
      if (ownerRole !== existing.ownerRole) {
        changes.push(`ผู้รับผิดชอบ ${existing.ownerRole} → ${ownerRole}`)
        data.ownerRole = ownerRole
      }
    }

    if (Object.keys(data).length === 1) {
      return NextResponse.json({ task: { ...existing, status: statusOf(existing.progress) }, message: 'ไม่มีการเปลี่ยนแปลง' })
    }

    const updated = await db.projectTask.update({ where: { id }, data })

    await db.auditLog.create({
      data: {
        action: 'UPDATE_PROJECT_TASK',
        actor: op.ctx.email,
        target: `${updated.title} (${updated.domainLabel} · ${updated.year})`,
        detail: `แก้ไข Task แผนงาน DQ: "${updated.title}" — ${changes.join(' · ')} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ task: { ...updated, status: statusOf(updated.progress) }, message: `บันทึก "${updated.title}" เรียบร้อย` })
  } catch (e) {
    console.error('PATCH /api/dq/project-plan', e)
    return NextResponse.json({ error: 'ไม่สามารถบันทึก Task ได้' }, { status: 500 })
  }
}

/* -------------------------------- DELETE --------------------------------- */

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')?.trim() ?? ''
    const op = await resolveOperator(null, 'MANAGE_PROJECT_PLAN')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    if (!id) return NextResponse.json({ error: 'กรุณาระบุ id ของ Task' }, { status: 400 })

    const existing = await db.projectTask.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'ไม่พบ Task นี้ในแผนงาน' }, { status: 404 })

    await db.projectTask.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        action: 'DELETE_PROJECT_TASK',
        actor: op.ctx.email,
        target: `${existing.title} (${existing.domainLabel} · ${existing.year})`,
        detail: `ลบ Task แผนงาน DQ: "${existing.title}" โดเมน ${existing.domainLabel} ปี ${existing.year} (progress ${existing.progress}% น้ำหนัก ×${existing.weight}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({ message: `ลบ Task "${existing.title}" เรียบร้อย` })
  } catch (e) {
    console.error('DELETE /api/dq/project-plan', e)
    return NextResponse.json({ error: 'ไม่สามารถลบ Task ได้' }, { status: 500 })
  }
}
