/**
 * POST /api/reference/sets/[id]/import (v0.31.0) — นำเข้าค่าอ้างอิงจากข้อความ CSV
 * body: { operatorEmail, csv } — รูปแบบ value,labelTh,labelEn,definition (ข้าม header อัตโนมัติถ้าแถวแรกเป็น "value,...")
 * โหมด merge: ค่าที่มีอยู่แล้ว (ACTIVE หรือ RETIRED) = ข้าม (รายงานจำนวน) — ไม่ทับของเดิมเงียบ ๆ
 * ข้อจำกัด: สูงสุด REFERENCE_IMPORT_MAX_ROWS แถวใหม่ต่อครั้ง · ค่ารวมในทะเบียนห้ามเกิน REFERENCE_VALUES_CAP
 * สิทธิ์: MANAGE_DATASETS · นำเข้าได้ทุกสถานะ (ขณะ ACTIVE = เวอร์ชัน +0.1 อัตโนมัติ) · บันทึก Audit Trail (IMPORT_REFERENCE_VALUES)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  REFERENCE_IMPORT_MAX_ROWS,
  REFERENCE_VALUES_CAP,
  bumpReferenceVersion,
  parseValuesCsv,
} from '@/lib/reference'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const set = await db.referenceSet.findUnique({ where: { id }, select: { id: true, code: true, name: true, status: true, version: true } })
    if (!set) return NextResponse.json({ error: 'ไม่พบทะเบียนข้อมูลอ้างอิงนี้ในระบบ' }, { status: 404 })

    const csv = typeof body.csv === 'string' ? body.csv : ''
    if (csv.trim() === '') return NextResponse.json({ error: 'กรุณาวางข้อความ CSV (value,labelTh,labelEn,definition)' }, { status: 400 })

    const parsed = parseValuesCsv(csv)
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'ไม่พบค่าที่นำเข้าได้จาก CSV — ตรวจรูปแบบแถว: value,labelTh,labelEn,definition' }, { status: 400 })
    }

    // กันค่าซ้ำภายในไฟล์
    const seen = new Set<string>()
    const uniqueRows = parsed.rows.filter((r) => {
      if (seen.has(r.value)) return false
      seen.add(r.value)
      return true
    })

    const existing = await db.referenceValue.findMany({ where: { setId: id }, select: { value: true }, })
    const existingSet = new Set(existing.map((v) => v.value))

    const room = REFERENCE_VALUES_CAP - existing.length
    if (room <= 0) {
      return NextResponse.json({ error: `ทะเบียนมีค่าครบจำนวนสูงสุดแล้ว (${REFERENCE_VALUES_CAP} ค่า)` }, { status: 409 })
    }

    const toCreate = uniqueRows.filter((r) => !existingSet.has(r.value)).slice(0, Math.min(room, REFERENCE_IMPORT_MAX_ROWS))
    const skippedExisting = uniqueRows.filter((r) => existingSet.has(r.value)).length
    const capped = uniqueRows.filter((r) => !existingSet.has(r.value)).length - toCreate.length

    if (toCreate.length === 0) {
      return NextResponse.json(
        { error: `ทุกค่าใน CSV มีอยู่ในทะเบียนแล้ว (${skippedExisting} ค่าถูกข้าม) — ไม่มีอะไรถูกนำเข้า` },
        { status: 409 },
      )
    }

    const maxSort = await db.referenceValue.aggregate({ where: { setId: id }, _max: { sortOrder: true } })
    let sort = (maxSort._max.sortOrder ?? 0) + 1

    await db.$transaction(async (tx) => {
      for (const r of toCreate) {
        await tx.referenceValue.create({
          data: {
            setId: id,
            value: r.value,
            labelTh: r.labelTh,
            labelEn: r.labelEn,
            definition: r.definition,
            sortOrder: sort++,
          },
        })
      }
    })

    // v0.36.0 — นำเข้าค่าขณะทะเบียนใช้งานอยู่ (ACTIVE) = เวอร์ชัน +0.1 อัตโนมัติ
    if (set.status === 'ACTIVE') {
      await db.referenceSet.update({ where: { id }, data: { version: bumpReferenceVersion(set.version) } })
    }

    const notes: string[] = [`นำเข้า ${toCreate.length} ค่า`]
    if (skippedExisting > 0) notes.push(`ข้ามค่าที่มีอยู่แล้ว ${skippedExisting} ค่า`)
    if (capped > 0) notes.push(`ข้ามเกินโควตา ${capped} ค่า (สูงสุด ${REFERENCE_IMPORT_MAX_ROWS} แถว/ครั้ง)`)
    if (parsed.skipped.length > 0) notes.push(`แถวไม่ผ่านรูปแบบ ${parsed.skipped.length} แถว`)

    await db.auditLog.create({
      data: {
        action: 'IMPORT_REFERENCE_VALUES',
        actor: op.ctx.email,
        target: `${set.code} ${set.name}`,
        detail: `${notes.join(' · ')} ในทะเบียน "${set.name}" (${set.code}) โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      imported: toCreate.length,
      skippedExisting,
      capped,
      skippedRows: parsed.skipped.length,
      message: `นำเข้าสำเร็จ — ${notes.join(' · ')}`,
    })
  } catch (e) {
    console.error('POST /api/reference/sets/[id]/import', e)
    return NextResponse.json({ error: 'นำเข้าค่าอ้างอิงไม่สำเร็จ' }, { status: 500 })
  }
}
