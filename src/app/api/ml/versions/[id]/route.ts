/**
 * API /api/ml/versions/[id] (v0.37.0) — จัดการเวอร์ชันโมเดลรายเวอร์ชัน
 * PATCH {action: 'ACTIVATE' | 'ARCHIVE', operatorEmail?} — สิทธิ์: TRAIN_ML_MODEL
 *   ACTIVATE = ตั้งเป็นโมเดลที่ใช้งานของโดเมนนั้น (ACTIVE ได้ 1 ต่อโดเมน — ตัวอื่นเปลี่ยนเป็น ARCHIVED)
 * DELETE — ลบเวอร์ชัน (สิทธิ์: TRAIN_ML_MODEL) — ข้อมูลสอน (คลัง label/สุ่มตรวจ) ไม่ถูกลบตาม
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'TRAIN_ML_MODEL')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const version = await db.mlModelVersion.findUnique({ where: { id } })
    if (!version) return NextResponse.json({ error: 'ไม่พบเวอร์ชันโมเดลนี้' }, { status: 404 })

    const action = String(body?.action ?? '').trim()
    if (action === 'ACTIVATE') {
      // ACTIVE ได้ 1 ต่อโดเมน — ปิดตัวอื่นก่อน
      await db.mlModelVersion.updateMany({ where: { domainId: version.domainId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } })
      const updated = await db.mlModelVersion.update({ where: { id }, data: { status: 'ACTIVE', activatedAt: new Date() } })
      await db.auditLog.create({
        data: {
          action: 'ML_ACTIVATE',
          actor: op.ctx.email,
          target: `ML v${version.version}${version.domainId ? ` (โดเมน ${version.domainId})` : ' (ทุกโดเมน)'}`,
          detail: `ตั้งโมเดลเวอร์ชัน v${version.version} เป็นโมเดลที่ใช้งาน${version.domainId ? 'ของโดเมน' : 'ระดับทั้งระบบ'} — ความแม่นยำจากชุดทดสอบ ${updated.accuracy !== null ? `${(updated.accuracy * 100).toFixed(1)}%` : 'ยังไม่รายงาน'}`,
        },
      })
      return NextResponse.json({ version: updated })
    }
    if (action === 'ARCHIVE') {
      const updated = await db.mlModelVersion.update({ where: { id }, data: { status: 'ARCHIVED' } })
      await db.auditLog.create({
        data: {
          action: 'ML_ARCHIVE',
          actor: op.ctx.email,
          target: `ML v${version.version}`,
          detail: `เก็บโมเดลเวอร์ชัน v${version.version} เข้าคลัง (ไม่ใช้งาน)`,
        },
      })
      return NextResponse.json({ version: updated })
    }
    return NextResponse.json({ error: 'action ต้องเป็น ACTIVATE หรือ ARCHIVE' }, { status: 400 })
  } catch (e) {
    console.error('PATCH /api/ml/versions/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถจัดการเวอร์ชันโมเดลได้' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const op = await resolveOperator(null, 'TRAIN_ML_MODEL')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const version = await db.mlModelVersion.findUnique({ where: { id } })
    if (!version) return NextResponse.json({ error: 'ไม่พบเวอร์ชันโมเดลนี้' }, { status: 404 })
    if (version.status === 'ACTIVE') {
      return NextResponse.json({ error: 'ไม่สามารถลบโมเดลที่กำลังใช้งาน (ACTIVE) — เก็บเข้าคลังหรือตั้งเวอร์ชันอื่นก่อน' }, { status: 400 })
    }

    await db.mlModelVersion.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        action: 'ML_DELETE_VERSION',
        actor: op.ctx.email,
        target: `ML v${version.version}`,
        detail: `ลบเวอร์ชันโมเดล v${version.version} — ข้อมูลสอน (คลัง label/สุ่มตรวจ) ยังอยู่ครบถ้วน`,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/ml/versions/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถลบเวอร์ชันโมเดลได้' }, { status: 500 })
  }
}
