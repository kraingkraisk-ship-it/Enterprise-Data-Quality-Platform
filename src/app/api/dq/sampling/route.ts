/**
 * API /api/dq/sampling — แผนสุ่มตรวจตามความเสี่ยง (v0.26.0)
 * GET  {batchId?} — อ่านแผนที่บันทึกไว้ (batch ที่ระบุ หรือ batch ล่าสุด)
 * POST {operatorEmail, policy, batchId?} — สร้าง/ทับแผนของ batch (ต้องมีสิทธิ์ REVIEW_SIGNALS ตาม RBAC)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { generateSamplePlan, readSamplePlan } from '@/lib/sampling-engine'
import { isSamplingPolicyKey } from '@/lib/sampling'

export async function GET(req: NextRequest) {
  try {
    const batchIdParam = req.nextUrl.searchParams.get('batchId')?.trim()
    const batchId =
      batchIdParam || (await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id
    if (!batchId) {
      return NextResponse.json({ plan: null, reason: 'NO_BATCH', message: 'ยังไม่มีรอบรัน (batch) ในระบบ — รัน validation ก่อน' })
    }
    const plan = await readSamplePlan(batchId)
    if (!plan) {
      return NextResponse.json({ plan: null, message: 'ยังไม่ได้สร้างแผนสุ่มตรวจสำหรับรอบนี้' })
    }
    return NextResponse.json({ plan })
  } catch (e) {
    console.error('GET /api/dq/sampling', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดแผนสุ่มตรวจได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'REVIEW_SIGNALS')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const policy = String(body.policy ?? 'P10')
    if (!isSamplingPolicyKey(policy)) {
      return NextResponse.json({ error: 'นโยบายสุ่มไม่ถูกต้อง — ต้องเป็น FULL / P10 / P5 / P1' }, { status: 400 })
    }

    const batchIdParam = String(body.batchId ?? '').trim()
    const batchId =
      batchIdParam || (await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id
    if (!batchId) {
      return NextResponse.json({
        plan: null,
        reason: 'NO_BATCH',
        message: 'ยังไม่มีรอบรัน (batch) ในระบบ — รัน validation ก่อน',
      })
    }

    const result = await generateSamplePlan(batchId, policy)
    if (result.plan) {
      await db.auditLog
        .create({
          data: {
            action: 'CREATE_SAMPLE_PLAN',
            actor: op.ctx.email,
            target: result.plan.batchId,
            detail: `สร้างแผนสุ่มตรวจตามความเสี่ยง (นโยบาย ${result.plan.policyLabel}) — งบ ${result.plan.summary.budgetRows} แถว จาก ${result.plan.summary.reviewableRows} แถวทบทวนได้ · ครอบคลุมความเสี่ยง ${result.plan.summary.riskCoveragePct}% (บทบาท ${op.ctx.roleTh})`,
          },
        })
        .catch(() => undefined)
    }
    return NextResponse.json(result)
  } catch (e) {
    console.error('POST /api/dq/sampling', e)
    return NextResponse.json({ error: 'ไม่สามารถสร้างแผนสุ่มตรวจได้' }, { status: 500 })
  }
}
