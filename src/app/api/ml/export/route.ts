/**
 * API /api/ml/export (v0.35.0) — ส่งออกโมเดลเป็นไฟล์ .dqmmodel (สำรอง/ย้ายระบบ)
 * GET ?versionId= — สิทธิ์: TRAIN_ML_MODEL
 * ความปลอดภัย: ไฟล์มีเฉพาะ "พารามิเตอร์โมเดล + สถิติรวม" (เกณฑ์/สัดส่วน/histogram ระดับรวม)
 * — ไม่มีข้อมูลดิบรายแถว ไม่มี PII โดยเด็ดขาด + checksum ป้องกันการแก้ไขไฟล์
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export async function GET(req: NextRequest) {
  try {
    const op = await resolveOperator(null, 'TRAIN_ML_MODEL')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const versionId = req.nextUrl.searchParams.get('versionId')?.trim()
    if (!versionId) return NextResponse.json({ error: 'กรุณาระบุ versionId' }, { status: 400 })
    const version = await db.mlModelVersion.findUnique({ where: { id: versionId } })
    if (!version) return NextResponse.json({ error: 'ไม่พบเวอร์ชันโมเดลนี้' }, { status: 404 })

    const domainName = version.domainId ? (await db.dataDomain.findUnique({ where: { id: version.domainId }, select: { name: true } }))?.name ?? version.domainId : 'ALL_DOMAINS'

    const model = {
      version: version.version,
      domainId: version.domainId,
      domainName,
      trainPct: version.trainPct,
      accuracy: version.accuracy,
      precision: version.precision,
      recall: version.recall,
      f1: version.f1,
      trainRows: version.trainRows,
      testRows: version.testRows,
      assetCount: version.assetCount,
      ruleCount: version.ruleCount,
      labelCount: version.labelCount,
      params: JSON.parse(version.paramsJson || '{}'),
      stats: JSON.parse(version.statsJson || '{}'),
      trainedBy: version.trainedBy,
      trainedAt: version.createdAt.toISOString(),
    }
    const payload = {
      format: 'DQ-MODEL',
      formatVersion: 1,
      platform: 'Enterprise DQ Platform',
      exportedAt: new Date().toISOString(),
      // หมายเหตุความปลอดภัย: ไฟล์นี้ไม่มีข้อมูลดิบรายแถว — เฉพาะพารามิเตอร์และสถิติรวมที่โมเดลเรียนรู้
      safety: 'NO_RAW_ROWS_NO_PII',
      model,
    }
    payload.model = model // จัดลำดับคงที่ก่อนคำนวณ checksum
    const checksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    const file = { ...payload, checksum }

    await db.auditLog.create({
      data: {
        action: 'ML_EXPORT',
        actor: op.ctx.email,
        target: `ML v${version.version}`,
        detail: `ส่งออกโมเดล v${version.version} (โดเมน: ${domainName}) เป็นไฟล์ .dqmmodel — เฉพาะพารามิเตอร์/สถิติรวม ไม่มีข้อมูลดิบ ไม่มี PII`,
      },
    })

    return new NextResponse(JSON.stringify(file, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="dq-model-${domainName}-v${version.version}.dqmmodel"`,
      },
    })
  } catch (e) {
    console.error('GET /api/ml/export', e)
    return NextResponse.json({ error: 'ไม่สามารถส่งออกโมเดลได้' }, { status: 500 })
  }
}
