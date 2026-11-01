import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { canSeePii } from '@/lib/dq'

/**
 * คำขอดูค่าจริงรายคอลัมน์ (v0.47.0) — กลไกขอสิทธิ์ชั่วคราวจาก Data Owner
 *
 * GET /api/access-requests
 *   — DATA_OWNER (มีสิทธิ์ APPROVE_PII_ACCESS) เห็นคำขอทั้งระบบ (คิวรออนุมัตินำหน้า)
 *   — บทบาทอื่นเห็นเฉพาะ "คำขอของตนเอง" (deny-by-default — ไม่เผยแพร่คำขอคนอื่น)
 *
 * POST /api/access-requests
 *   — ผู้ขอต้องเป็นผู้เข้าสู่ระบบจริง (session) + ACTIVE + ไม่ใช่ DATA_OWNER (เห็นค่าจริงอยู่แล้ว)
 *   — คอลัมน์ต้องมีจริงใน Data Asset (deny-by-default) · เหตุผลบังคับ · อายุ 8/24/72 ชม.
 *   — กันซ้ำ: ยังมีคำขอค้าง PENDING หรือสิทธิ์ APPROVED ที่ยังไม่หมดอายุของคอลัมน์เดิม → 409
 *   — ทุกการขอบันทึก AuditLog (REQUEST_COLUMN_ACCESS — หลักฐานใน audit ตามข้อกำหนด)
 */

const ALLOWED_DURATIONS = [8, 24, 72]
const REASON_MAX = 500

/** รูปแบบคำขอที่ส่งกลับ (ผู้ขอ/ผู้ตัดสิน resolve ชื่อแล้ว) */
function serializeRequest(
  r: {
    id: string
    assetId: string
    columnName: string
    requestedBy: string
    reason: string
    durationHours: number
    status: string
    decidedBy: string | null
    decidedAt: Date | null
    decisionNote: string
    expiresAt: Date
    revokedBy: string | null
    revokedAt: Date | null
    createdAt: Date
  },
  assetName: string,
  namesByEmail: Map<string, string>,
) {
  const now = Date.now()
  return {
    id: r.id,
    assetId: r.assetId,
    assetName,
    columnName: r.columnName,
    requestedBy: r.requestedBy,
    requesterName: namesByEmail.get(r.requestedBy) ?? r.requestedBy,
    reason: r.reason,
    durationHours: r.durationHours,
    status: r.status,
    decidedBy: r.decidedBy,
    decidedByName: r.decidedBy ? (namesByEmail.get(r.decidedBy) ?? r.decidedBy) : null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionNote: r.decisionNote,
    expiresAt: r.expiresAt.toISOString(),
    revokedBy: r.revokedBy,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    expired: r.status === 'APPROVED' && r.expiresAt.getTime() < now,
  }
}

export async function GET() {
  try {
    const gate = await resolveOperator(null, 'VIEW_DATASETS')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
    const { email, role } = gate.ctx
    const isOwner = canSeePii(role) // DATA_OWNER — ผู้ตัดสินคำขอ

    const rows = await db.columnAccessRequest.findMany({
      where: isOwner ? {} : { requestedBy: email },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { asset: { select: { name: true } } },
    })

    // เรียง: คิวรออนุมัติ (PENDING) นำหน้า — ภายในกลุ่มเรียงใหม่ → เก่า
    rows.sort((a, b) => {
      const pa = a.status === 'PENDING' ? 0 : 1
      const pb = b.status === 'PENDING' ? 0 : 1
      if (pa !== pb) return pa - pb
      return b.createdAt.getTime() - a.createdAt.getTime()
    })

    const emails = [...new Set(rows.flatMap((r) => [r.requestedBy, r.decidedBy].filter((v): v is string => Boolean(v))))]
    const users = emails.length
      ? await db.user.findMany({ where: { email: { in: emails } }, select: { email: true, name: true } })
      : []
    const namesByEmail = new Map(users.map((u) => [u.email, u.name]))

    return NextResponse.json({
      isOwner,
      requests: rows.map((r) => serializeRequest(r, r.asset.name, namesByEmail)),
    })
  } catch (e) {
    console.error('GET /api/access-requests', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการคำขอดูค่าจริงได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { assetId?: string; columnName?: string; reason?: string; durationHours?: number; operatorEmail?: string }
      | null
    if (!body) return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })

    // ผู้ขอ = ผู้เข้าสู่ระบบจริงเท่านั้น (session) — client ปลอม operatorEmail ไม่ได้
    const gate = await resolveOperator(body.operatorEmail, 'VIEW_DATASETS')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
    const { email, name, role } = gate.ctx

    // DATA_OWNER เห็นค่าจริงอยู่แล้ว (canSeePii) — ไม่ต้องขอ
    if (canSeePii(role)) {
      return NextResponse.json(
        { error: 'บทบาทเจ้าของข้อมูล (Data Owner) เห็นค่าจริงอยู่แล้ว — ไม่จำเป็นต้องขอสิทธิ์' },
        { status: 403 },
      )
    }

    const assetId = String(body.assetId ?? '').trim()
    const columnName = String(body.columnName ?? '').trim()
    const reason = String(body.reason ?? '').trim()
    const durationHours = Number(body.durationHours ?? 24)

    if (!assetId || !columnName) {
      return NextResponse.json({ error: 'ต้องระบุข้อมูล (Data Asset) และคอลัมน์ที่ต้องการขอดู' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'กรุณาระบุเหตุผลการขอดูค่าจริง (จำเป็นสำหรับหลักฐานตรวจสอบ)' }, { status: 400 })
    }
    if (reason.length > REASON_MAX) {
      return NextResponse.json({ error: `เหตุผลยาวเกิน ${REASON_MAX} ตัวอักษร` }, { status: 400 })
    }
    if (!ALLOWED_DURATIONS.includes(durationHours)) {
      return NextResponse.json({ error: 'อายุสิทธิ์ต้องเป็น 8, 24 หรือ 72 ชั่วโมงเท่านั้น' }, { status: 400 })
    }

    // คอลัมน์ต้องมีจริงใน Data Asset (deny-by-default)
    const asset = await db.dataAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, status: true },
    })
    if (!asset) return NextResponse.json({ error: 'ไม่พบข้อมูล (Data Asset) นี้ในระบบ' }, { status: 404 })
    const column = await db.dataAssetColumn.findFirst({
      where: { assetId, name: columnName },
      select: { id: true },
    })
    if (!column) {
      return NextResponse.json({ error: `ไม่พบคอลัมน์ "${columnName}" ในข้อมูลนี้` }, { status: 400 })
    }

    // กันซ้ำ — PENDING ค้าง หรือสิทธิ์ APPROVED ที่ยังไม่หมดอายุ (REVOKED/REJECTED/หมดอายุ = ขอใหม่ได้)
    const now = new Date()
    const duplicate = await db.columnAccessRequest.findFirst({
      where: {
        requestedBy: email,
        assetId,
        columnName,
        OR: [{ status: 'PENDING' }, { status: 'APPROVED', expiresAt: { gt: now } }],
      },
      select: { id: true, status: true, expiresAt: true },
    })
    if (duplicate) {
      return NextResponse.json(
        duplicate.status === 'PENDING'
          ? { error: 'มีคำขอคอลัมน์นี้รอการอนุมัติอยู่แล้ว — รอ Data Owner พิจารณาก่อน' }
          : { error: 'ท่านมีสิทธิ์ดูค่าจริงของคอลัมน์นี้อยู่แล้ว (ยังไม่หมดอายุ)' },
        { status: 409 },
      )
    }

    const created = await db.columnAccessRequest.create({
      data: {
        assetId,
        columnName,
        requestedBy: email,
        reason,
        durationHours,
        status: 'PENDING',
        // expiresAt เป็นค่าจองตามที่ขอ — ระบบจะตั้งใหม่จากเวลาอนุมัติจริง
        expiresAt: new Date(now.getTime() + durationHours * 60 * 60 * 1000),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'REQUEST_COLUMN_ACCESS',
        actor: email,
        target: `${asset.name} · ${columnName}`,
        detail: `ผู้ขอ: ${name} (${email}) · เหตุผล: ${reason} · อายุที่ขอ: ${durationHours} ชั่วโมง`,
      },
    })

    return NextResponse.json(
      {
        message: 'ส่งคำขอแล้ว — รอเจ้าของข้อมูล (Data Owner) อนุมัติ',
        request: serializeRequest(created, asset.name, new Map([[email, name]])),
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/access-requests', e)
    return NextResponse.json({ error: 'ไม่สามารถส่งคำขอดูค่าจริงได้' }, { status: 500 })
  }
}
