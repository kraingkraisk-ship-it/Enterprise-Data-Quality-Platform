/**
 * /api/audit/retention (v0.30.0) — นโยบายการเก็บรักษา Audit Log
 *
 * GET — อ่านนโยบายปัจจุบัน (สร้างแถวค่าเริ่มต้น 365 วันถ้ายังไม่มี)
 *       พร้อมตัวเลขล่วงหน้า: จะลบกี่รายการถ้าลบตามนโยบายตอนนี้ + บันทึกเก่าสุดเมื่อไร
 *
 * POST { operatorEmail, retentionDays?, apply? }
 * - ต้องมีสิทธิ์ MANAGE_USERS ตาม RBAC (การลบบันทึกตรวจสอบ = การกำกับดูแลระดับสูงสุด)
 * - retentionDays → ตั้งนโยบายใหม่ (30–3650 วัน) — บันทึก AuditLog: SET_AUDIT_RETENTION
 * - apply: true → ลบบันทึกที่เก่ากว่านโยบายจริง — บันทึก AuditLog: AUDIT_LOG_PRUNE (meta-audit:
 *   รายการ "การลบ" ถูกเขียนหลังลบเสร็จ จึงไม่ลบตัวเอง และบอกได้ว่าใครลบ ลบกี่รายการ เมื่อไร)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export const RETENTION_MIN = 30
export const RETENTION_MAX = 3650
export const RETENTION_DEFAULT = 365

/** อ่านนโยบาย (สร้างค่าเริ่มต้นถ้ายังไม่มีแถว) */
async function ensurePolicy() {
  const existing = await db.auditPolicy.findUnique({ where: { id: 1 } })
  if (existing) return existing
  try {
    return await db.auditPolicy.create({ data: { id: 1, retentionDays: RETENTION_DEFAULT } })
  } catch {
    // ชนกับ request อื่นที่สร้างพร้อมกัน — อ่านซ้ำ
    const again = await db.auditPolicy.findUnique({ where: { id: 1 } })
    if (!again) throw new Error('สร้างนโยบายเก็บรักษาไม่สำเร็จ')
    return again
  }
}

function policyPayload(policy: { retentionDays: number; updatedBy: string | null; updatedAt: Date }) {
  const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000)
  return {
    retentionDays: policy.retentionDays,
    updatedBy: policy.updatedBy,
    updatedAt: policy.updatedAt.toISOString(),
    cutoffISO: cutoff.toISOString(),
  }
}

export async function GET() {
  try {
    const policy = await ensurePolicy()
    const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000)
    const [willPrune, oldest, total] = await Promise.all([
      db.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
      db.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      db.auditLog.count(),
    ])
    return NextResponse.json({
      ...policyPayload(policy),
      willPrune,
      total,
      oldestAt: oldest?.createdAt.toISOString() ?? null,
    })
  } catch (e) {
    console.error('GET /api/audit/retention', e)
    return NextResponse.json({ error: 'ไม่สามารถอ่านนโยบายเก็บรักษาได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    // RBAC — จัดการบันทึกตรวจสอบ = สิทธิ์ระดับผู้ดูแลระบบ (จัดการผู้ใช้และสิทธิ์)
    const op = await resolveOperator(body.operatorEmail, 'MANAGE_USERS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const policy = await ensurePolicy()
    const wantsApply = body.apply === true
    const wantsSet = body.retentionDays !== undefined && body.retentionDays !== null

    if (!wantsApply && !wantsSet) {
      return NextResponse.json({ error: 'ไม่มีสิ่งที่ต้องทำ — ระบุ retentionDays หรือ apply' }, { status: 400 })
    }

    let pruned: number | null = null
    let setDetail: string | null = null

    if (wantsSet) {
      const days = Number(body.retentionDays)
      if (!Number.isFinite(days) || !Number.isInteger(days) || days < RETENTION_MIN || days > RETENTION_MAX) {
        return NextResponse.json(
          { error: `จำนวนวันต้องเป็นเลขจำนวนเต็ม ${RETENTION_MIN}–${RETENTION_MAX} วัน` },
          { status: 400 },
        )
      }
      const oldDays = policy.retentionDays
      const updated = await db.auditPolicy.update({ where: { id: 1 }, data: { retentionDays: days, updatedBy: op.ctx.email } })
      setDetail =
        days === oldDays
          ? `ตั้งนโยบายเก็บรักษา Audit Log ที่ ${days} วัน (ค่าเดิม ${oldDays} วัน — ไม่เปลี่ยน)`
          : `ตั้งนโยบายเก็บรักษา Audit Log จาก ${oldDays} → ${days} วัน`
    }

    if (wantsApply) {
      const days = wantsSet ? Number(body.retentionDays) : policy.retentionDays
      const cutoff = new Date(Date.now() - days * 86_400_000)
      const res = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
      pruned = res.count
      // meta-audit — เขียน "หลัง" ลบเสร็จ รายการนี้จึงอยู่รอดและตรวจสอบได้ว่าใครลบ
      await db.auditLog.create({
        data: {
          action: 'AUDIT_LOG_PRUNE',
          actor: op.ctx.email,
          target: 'Audit Log',
          detail: `ลบบันทึกการตรวจสอบที่เก่ากว่า ${days} วัน (ก่อน ${cutoff.toISOString().slice(0, 10)}) จำนวน ${pruned} รายการ ตามนโยบายเก็บรักษา`,
        },
      })
    }

    // บันทึกการตั้งค่า (ถ้ามี) — หลังการลบ เพื่อให้เรียงเวลาถูกต้อง (ลบก่อน ตั้งทีหลัง)
    if (setDetail) {
      await db.auditLog.create({
        data: {
          action: 'SET_AUDIT_RETENTION',
          actor: op.ctx.email,
          target: 'นโยบายเก็บรักษา Audit Log',
          detail: setDetail,
        },
      })
    }

    const fresh = await db.auditPolicy.findUnique({ where: { id: 1 } })
    const p = fresh ?? policy
    const cutoff = new Date(Date.now() - p.retentionDays * 86_400_000)
    const willPrune = await db.auditLog.count({ where: { createdAt: { lt: cutoff } } })

    return NextResponse.json({
      ok: true,
      retentionDays: p.retentionDays,
      updatedBy: p.updatedBy,
      updatedAt: p.updatedAt.toISOString(),
      willPrune,
      pruned,
    })
  } catch (e) {
    console.error('POST /api/audit/retention', e)
    return NextResponse.json({ error: 'ไม่สามารถดำเนินการนโยบายเก็บรักษาได้' }, { status: 500 })
  }
}
