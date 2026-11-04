import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isClassificationKey, classificationLabel } from '@/lib/regulation'
import { resolveOperator } from '@/lib/operator'

/**
 * PATCH /api/dq/classification — กำหนดการจำแนกประเภทข้อมูลของชุดข้อมูล
 * ใช้ในแดชบอร์ดส่วน Data Classification (mapping ข้อมูลกับมาตรฐาน)
 * สิทธิ์: MANAGE_DATASETS (ตาม RBAC) — บันทึก Audit Trail ทุกครั้ง
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const datasetId = String(body.datasetId ?? '').trim()
    const classification = String(body.classification ?? '').trim()
    if (!datasetId) return NextResponse.json({ error: 'กรุณาระบุชุดข้อมูล' }, { status: 400 })
    if (!isClassificationKey(classification)) {
      return NextResponse.json({ error: 'ประเภทการจำแนกข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({ where: { id: datasetId } })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    const updated = await db.dataset.update({
      where: { id: datasetId },
      data: { classification },
    })

    const label = classificationLabel(classification)
    await db.auditLog.create({
      data: {
        action: 'SET_CLASSIFICATION',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `จำแนกประเภทข้อมูล: ${dataset.name} → ${label.no !== '—' ? `${label.no} ` : ''}${label.th} (${label.en}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      dataset: { id: updated.id, name: updated.name, classification: updated.classification },
      message: `จำแนก "${dataset.name}" เป็น "${label.th}" เรียบร้อย`,
    })
  } catch (e) {
    console.error('PATCH /api/dq/classification', e)
    return NextResponse.json({ error: 'ไม่สามารถกำหนดการจำแนกประเภทข้อมูลได้' }, { status: 500 })
  }
}
