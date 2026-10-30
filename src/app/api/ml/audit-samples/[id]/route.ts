/**
 * API /api/ml/audit-samples/[id] (v0.35.0) — บันทึกคำตัดสินของมนุษย์รายแถวสุ่มตรวจ
 * PATCH {humanVerdict: 'CORRECT' | 'INCORRECT', reason?, dimension?, operatorEmail?} — สิทธิ์: LABEL_ML_DATA
 * คำตัดสินของมนุษย์ = ความจริง (ground truth) → เข้าชุดฝึกในการเทรนถัดไป
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { isDimensionKey } from '@/lib/dq'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'LABEL_ML_DATA')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const item = await db.mlAuditSample.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'ไม่พบรายการสุ่มตรวจนี้' }, { status: 404 })

    const humanVerdict = String(body?.humanVerdict ?? '').trim()
    if (humanVerdict !== 'CORRECT' && humanVerdict !== 'INCORRECT') {
      return NextResponse.json({ error: 'humanVerdict ต้องเป็น CORRECT หรือ INCORRECT' }, { status: 400 })
    }
    const dimensionRaw = String(body?.dimension ?? '').trim()
    const dimension = isDimensionKey(dimensionRaw) ? dimensionRaw : ''

    const updated = await db.mlAuditSample.update({
      where: { id },
      data: {
        humanVerdict,
        humanReason: String(body?.reason ?? '').slice(0, 500),
        dimension: humanVerdict === 'INCORRECT' ? dimension : item.dimension,
        auditedBy: op.ctx.email,
        auditedAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'ML_AUDIT_VERDICT',
        actor: op.ctx.email,
        target: `${item.assetName} แถว ${item.rowNo}`,
        detail: `ตัดสินสุ่มตรวจรอบ ${item.batchNo}: ${humanVerdict === 'INCORRECT' ? 'ไม่ถูกต้อง' : 'ถูกต้อง'}${dimension ? ` (มิติ ${dimension})` : ''}${body?.reason ? ` — ${String(body.reason).slice(0, 200)}` : ''} — ความจริงนี้จะสอนโมเดลในการเทรนถัดไป`,
      },
    })
    return NextResponse.json({ item: updated })
  } catch (e) {
    console.error('PATCH /api/ml/audit-samples/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถบันทึกคำตัดสินได้' }, { status: 500 })
  }
}
