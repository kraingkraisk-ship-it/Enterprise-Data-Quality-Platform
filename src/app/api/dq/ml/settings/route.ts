/**
 * GET /api/dq/ml/settings (v0.28.0) — เกณฑ์ค่าคงที่ ML ปัจจุบัน + ค่าเริ่มต้น + นิยามรายค่าที่ปรับได้
 * อ่านได้ทุกบทบาท (หลักความโปร่งใส — เกณฑ์ทุกตัวที่ engine ใช้ต้องเห็นได้บนจอ ตรวจย้อนได้)
 *
 * POST { operatorEmail, values?: Partial<MlSettings>, reset?: true }
 * - ต้องมีสิทธิ์ REVIEW_SIGNALS ตาม RBAC (บันทึก Audit Trail: UPDATE_ML_SETTINGS)
 * - ตรวจความถูกต้องด้วย sanitizeMlSettings (ช่วงรายค่า + เงื่อนไขไขว้)
 * - บันทึกสำเร็จ → ประเมิน batch ล่าสุดใหม่ทันทีด้วยเกณฑ์ใหม่ (idempotent upsert — ผลล้มไม่กระทบการบันทึก)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  DEFAULT_ML_SETTINGS,
  isDefaultMlSettings,
  sanitizeMlSettings,
  TUNABLE_DEFS,
  type MlSettings,
} from '@/lib/ml-settings'
import { getMlSettings, saveMlSettings } from '@/lib/ml-settings-server'
import { resolveOperator } from '@/lib/operator'
import { evaluateBatch } from '@/lib/ml-engine'
import { evaluateForecastBatch } from '@/lib/forecast-engine'

export async function GET() {
  try {
    const settings = await getMlSettings()
    let updatedAt: string | null = null
    let updatedBy: string | null = null
    try {
      const row = await db.dqMlSettings.findUnique({ where: { id: 1 }, select: { updatedAt: true, updatedBy: true } })
      updatedAt = row?.updatedAt.toISOString() ?? null
      updatedBy = row?.updatedBy ?? null
    } catch (rowErr) {
      console.error('GET /api/dq/ml/settings row meta', rowErr)
    }
    return NextResponse.json({
      settings,
      defaults: DEFAULT_ML_SETTINGS,
      defs: TUNABLE_DEFS,
      isDefault: isDefaultMlSettings(settings),
      updatedAt,
      updatedBy,
    })
  } catch (e) {
    console.error('GET /api/dq/ml/settings', e)
    return NextResponse.json({ error: 'ไม่สามารถอ่านเกณฑ์ ML ได้' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    // RBAC — ปรับเกณฑ์ ML = การกำกับดูแลสัญญาณ ต้องมีสิทธิ์ทบทวนสัญญาณ AI
    const op = await resolveOperator(body.operatorEmail, 'REVIEW_SIGNALS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    let values: MlSettings
    if (body.reset === true) {
      values = { ...DEFAULT_ML_SETTINGS }
    } else {
      const san = sanitizeMlSettings(body.values)
      if (!san.ok) return NextResponse.json({ error: san.message }, { status: 400 })
      values = san.values
    }

    await saveMlSettings(values, op.ctx.email)

    // Audit Trail — ระบุค่าที่ต่างจากค่าเริ่มต้น (หรือกรณีคืนค่าเริ่มต้น)
    const changed = TUNABLE_DEFS.filter((d) => values[d.key] !== DEFAULT_ML_SETTINGS[d.key]).map(
      (d) => `${d.labelTh} = ${values[d.key]}`,
    )
    try {
      await db.auditLog.create({
        data: {
          action: 'UPDATE_ML_SETTINGS',
          actor: op.ctx.email,
          target: 'เกณฑ์ค่าคงที่ ML',
          detail:
            body.reset === true
              ? 'คืนค่าเริ่มต้นของเกณฑ์ ML ทั้งหมด'
              : changed.length > 0
                ? `ปรับเกณฑ์ ML: ${changed.join(' · ')}`
                : 'บันทึกเกณฑ์ ML (ค่าเท่าค่าเริ่มต้น)',
        },
      })
    } catch (auditErr) {
      console.error('auditLog UPDATE_ML_SETTINGS failed', auditErr)
    }

    // ประเมิน batch ล่าสุดใหม่ด้วยเกณฑ์ใหม่ทันที (เห็นผลจริงโดยไม่ต้องรอรันใหม่)
    // — sequential กัน SQLite lock · ล้ม = การบันทึกยังสำเร็จ (เกณฑ์ใหม่ใช้รอบถัดไป)
    let recomputed: { anomalies: number; clusters: number; forecasts: number } | null = null
    let recomputeError: string | null = null
    try {
      const latestBatch = await db.dqValidationBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } })
      if (latestBatch) {
        const mlRes = await evaluateBatch(latestBatch.id)
        const fcRes = await evaluateForecastBatch(latestBatch.id)
        recomputed = { anomalies: mlRes.anomalies.length, clusters: mlRes.clusters.length, forecasts: fcRes.forecasts.length }
      }
    } catch (rcErr) {
      console.error('ML settings recompute failed (non-blocking)', rcErr)
      recomputeError = 'ประเมิน batch ล่าสุดใหม่ไม่สำเร็จ — เกณฑ์ใหม่จะถูกใช้เมื่อรัน validation ครั้งถัดไป'
    }

    return NextResponse.json({ ok: true, settings: values, isDefault: isDefaultMlSettings(values), recomputed, recomputeError })
  } catch (e) {
    console.error('POST /api/dq/ml/settings', e)
    return NextResponse.json({ error: 'ไม่สามารถบันทึกเกณฑ์ ML ได้' }, { status: 500 })
  }
}