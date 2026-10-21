import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import { profileRows, PROFILE_MAX_ROWS, type ProfileResult } from '@/lib/profiling'
import type { Row } from '@/lib/dq'

/**
 * POST /api/dq/profile — รันโปรไฟล์ข้อมูล 1 รอบ (READ-ONLY อ่านจาก snapshot sandbox เท่านั้น)
 * body: { datasetId, operatorEmail } — ต้องมีสิทธิ์ RUN_VALIDATION
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { datasetId?: string; operatorEmail?: string } | null
    if (!body?.datasetId) {
      return NextResponse.json({ error: 'กรุณาเลือกชุดข้อมูลที่ต้องการโปรไฟล์' }, { status: 400 })
    }

    const op = await resolveOperator(body.operatorEmail, 'RUN_VALIDATION')
    if (!op.ok) {
      return NextResponse.json({ error: op.message }, { status: op.status })
    }

    const dataset = await db.dataset.findUnique({
      where: { id: body.datasetId },
      select: { id: true, name: true, status: true },
    })
    if (!dataset) {
      return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })
    }

    const sampleRows = await db.sampleRow.findMany({
      where: { datasetId: dataset.id },
      select: { payload: true },
      take: PROFILE_MAX_ROWS,
    })
    if (sampleRows.length === 0) {
      return NextResponse.json(
        { error: 'ชุดข้อมูลนี้ยังไม่มีตัวอย่างข้อมูล (Sample Rows) ให้โปรไฟล์ — โปรไฟล์ทำงานบน snapshot sandbox เท่านั้น' },
        { status: 400 },
      )
    }

    const rows: Row[] = sampleRows.map((r) => {
      try {
        return JSON.parse(r.payload) as Row
      } catch {
        return {}
      }
    })

    const startedAt = Date.now()
    const result: ProfileResult = profileRows(rows)
    const durationMs = Math.max(1, Date.now() - startedAt)

    const run = await db.dqProfileRun.create({
      data: {
        datasetId: dataset.id,
        totalRows: result.totalRows,
        totalColumns: result.totalColumns,
        avgCompleteness: result.avgCompleteness,
        avgUniqueness: result.avgUniqueness,
        piiColumnCount: result.piiColumnCount,
        durationMs,
        createdBy: op.ctx.email,
      },
    })

    await db.dqProfileColumn.createMany({
      data: result.columns.map((c) => ({
        profileRunId: run.id,
        columnName: c.columnName,
        dataType: c.dataType,
        totalRows: c.totalRows,
        nullCount: c.nullCount,
        nullPct: c.nullPct,
        distinctCount: c.distinctCount,
        distinctPct: c.distinctPct,
        minValue: c.minValue,
        maxValue: c.maxValue,
        meanValue: c.meanValue,
        minLength: c.minLength,
        maxLength: c.maxLength,
        topValues: JSON.stringify(c.topValues),
        piiSuspected: c.piiSuspected,
      })),
    })

    await db.auditLog.create({
      data: {
        action: 'RUN_PROFILE',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `โปรไฟล์ข้อมูล "${dataset.name}" — ${result.totalRows} แถว / ${result.totalColumns} คอลัมน์ · ความสมบูรณ์เฉลี่ย ${result.avgCompleteness ?? '—'}% · สงสัย PII ${result.piiColumnCount} คอลัมน์ โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh}) — อ่านอย่างเดียว ไม่แก้ข้อมูลต้นทาง`,
      },
    })

    return NextResponse.json({
      ok: true,
      run: {
        id: run.id,
        datasetId: run.datasetId,
        datasetName: dataset.name,
        totalRows: run.totalRows,
        totalColumns: run.totalColumns,
        avgCompleteness: run.avgCompleteness,
        avgUniqueness: run.avgUniqueness,
        piiColumnCount: run.piiColumnCount,
        durationMs: run.durationMs,
        createdBy: run.createdBy,
        createdAt: run.createdAt.toISOString(),
      },
    })
  } catch (e) {
    console.error('POST /api/dq/profile', e)
    return NextResponse.json({ error: 'ไม่สามารถรันโปรไฟล์ข้อมูลได้' }, { status: 500 })
  }
}

/**
 * GET /api/dq/profile?datasetId=… — ประวัติรอบโปรไฟล์ของชุดข้อมูล (ไม่รวมสถิติรายคอลัมน์)
 */
export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('datasetId')?.trim() ?? ''
    if (!datasetId) {
      return NextResponse.json({ error: 'กรุณาระบุ datasetId' }, { status: 400 })
    }
    const runs = await db.dqProfileRun.findMany({
      where: { datasetId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        totalRows: true,
        totalColumns: true,
        avgCompleteness: true,
        avgUniqueness: true,
        piiColumnCount: true,
        durationMs: true,
        createdBy: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ runs: runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) })
  } catch (e) {
    console.error('GET /api/dq/profile', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดประวัติโปรไฟล์ได้' }, { status: 500 })
  }
}
