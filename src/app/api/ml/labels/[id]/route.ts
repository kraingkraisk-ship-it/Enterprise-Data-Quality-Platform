/**
 * API /api/ml/labels/[id] (v0.35.0) — ตรวจ label รายแถว (human-in-the-loop)
 * PATCH {humanFlag: 'CONFIRMED' | 'OVERRIDDEN', note?, operatorEmail?} — สิทธิ์: LABEL_ML_DATA
 * CONFIRMED = เห็นด้วยกับ ML · OVERRIDDEN = แก้คำตัดสิน ML — ทั้งคู่เป็นข้อมูลสอนสำหรับ retrain
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'LABEL_ML_DATA')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const item = await db.mlLabelItem.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'ไม่พบ label รายการนี้' }, { status: 404 })

    const humanFlag = String(body?.humanFlag ?? '').trim()
    if (humanFlag !== 'CONFIRMED' && humanFlag !== 'OVERRIDDEN') {
      return NextResponse.json({ error: 'humanFlag ต้องเป็น CONFIRMED หรือ OVERRIDDEN' }, { status: 400 })
    }

    const updated = await db.mlLabelItem.update({
      where: { id },
      data: {
        humanFlag,
        humanNote: String(body?.note ?? '').slice(0, 500),
        labeledBy: op.ctx.email,
        labeledAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'ML_FLAG_LABEL',
        actor: op.ctx.email,
        target: `${item.assetName} แถว ${item.rowNo}`,
        detail: `ตรวจ label ของ ML v${item.version}: ${humanFlag === 'CONFIRMED' ? 'ยืนยันคำตัดสิน' : 'แก้คำตัดสิน'} (${item.mlVerdict}) — จะถูกใช้สอนในการเทรนถัดไป${body?.note ? ` · หมายเหตุ: ${String(body.note).slice(0, 200)}` : ''}`,
      },
    })
    return NextResponse.json({ item: updated })
  } catch (e) {
    console.error('PATCH /api/ml/labels/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถบันทึกผลตรวจ label ได้' }, { status: 500 })
  }
}
