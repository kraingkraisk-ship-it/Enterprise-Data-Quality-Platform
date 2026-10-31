/**
 * API /api/ml/import (v0.37.0) — นำเข้าโมเดลจากไฟล์ .dqmmodel (สำรอง/เตรียมเทรนแยกรายโดเมนในอนาคต)
 * POST {payload: string (เนื้อไฟล์ JSON), operatorEmail?} — สิทธิ์: TRAIN_ML_MODEL
 * ตรวจ: รูปแบบไฟล์ (format/formatVersion) + checksum (กันไฟล์ถูกแก้) — นำเข้าเป็นเวอร์ชันใหม่สถานะ TRAINED
 * ไฟล์ที่มีข้อมูลดิบ (คร่อมเครื่องหมายความปลอดภัย) จะถูกปฏิเสธ
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const op = await resolveOperator(body?.operatorEmail, 'TRAIN_ML_MODEL')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const raw = String(body?.payload ?? '').trim()
    if (!raw) return NextResponse.json({ error: 'ไม่พบเนื้อไฟล์โมเดล' }, { status: 400 })

    let file: Record<string, unknown>
    try {
      file = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'ไฟล์ไม่ใช่ JSON ที่ถูกต้อง' }, { status: 400 })
    }

    if (file.format !== 'DQ-MODEL' || file.formatVersion !== 1) {
      return NextResponse.json({ error: 'รูปแบบไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์ .dqmmodel ของแพลตฟอร์ม (DQ-MODEL v1)' }, { status: 400 })
    }
    if (file.safety !== 'NO_RAW_ROWS_NO_PII') {
      return NextResponse.json({ error: 'ปฏิเสธไฟล์: ตัวเครื่องหมายความปลอดภัยไม่ถูกต้อง (ไฟล์อาจมีข้อมูลดิบ)' }, { status: 400 })
    }

    const checksum = String(file.checksum ?? '')
    const { checksum: _omit, ...rest } = file as { checksum?: string }
    void _omit
    const expected = createHash('sha256').update(JSON.stringify(rest)).digest('hex')
    if (checksum !== expected) {
      return NextResponse.json({ error: 'checksum ไม่ตรงกัน — ไฟล์ถูกแก้ไขหรือเสียหาย ปฏิเสธการนำเข้า' }, { status: 400 })
    }

    const model = file.model as Record<string, unknown> | undefined
    if (!model || typeof model.version !== 'number' || typeof model.params !== 'object' || typeof model.stats !== 'object') {
      return NextResponse.json({ error: 'โครงสร้างโมเดลในไฟล์ไม่ครบถ้วน' }, { status: 400 })
    }

    const domainId = String(model.domainId ?? '')
    const priorVersion = Number(model.version ?? 0)
    const nextVersion = ((await db.mlModelVersion.aggregate({ where: { domainId }, _max: { version: true } }))._max.version ?? 0) + 1

    const imported = await db.mlModelVersion.create({
      data: {
        version: nextVersion,
        domainId,
        status: 'TRAINED',
        trainPct: Number(model.trainPct ?? 70),
        accuracy: (model.accuracy as number | null) ?? null,
        precision: (model.precision as number | null) ?? null,
        recall: (model.recall as number | null) ?? null,
        f1: (model.f1 as number | null) ?? null,
        rocAuc: (model.rocAuc as number | null) ?? null,
        trainRows: Number(model.trainRows ?? 0),
        testRows: Number(model.testRows ?? 0),
        assetCount: Number(model.assetCount ?? 0),
        ruleCount: Number(model.ruleCount ?? 0),
        labelCount: Number(model.labelCount ?? 0),
        paramsJson: JSON.stringify(model.params),
        statsJson: JSON.stringify(model.stats),
        trainedBy: op.ctx.email,
        note: `นำเข้าจากไฟล์สำรอง (เดิม: v${priorVersion} ของ ${String(model.domainName ?? (domainId || 'ทุกโดเมน'))}, เทรนโดย ${String(model.trainedBy ?? 'ไม่ทราบ')})`,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'ML_IMPORT',
        actor: op.ctx.email,
        target: `ML v${nextVersion}`,
        detail: `นำเข้าโมเดลจากไฟล์ .dqmmodel สำเร็จ (เดิม v${priorVersion} · โดเมน ${String(model.domainName ?? 'ทุกโดเมน')}) — ตรวจ checksum ผ่าน · สถานะ TRAINED รอตั้งใช้งาน`,
      },
    })
    return NextResponse.json({ versionId: imported.id, version: nextVersion })
  } catch (e) {
    console.error('POST /api/ml/import', e)
    return NextResponse.json({ error: 'ไม่สามารถนำเข้าโมเดลได้' }, { status: 500 })
  }
}
