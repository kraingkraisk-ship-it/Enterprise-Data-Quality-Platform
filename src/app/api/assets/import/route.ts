import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'
import {
  ASSET_LIMITS,
  buildDbSourceInfo,
  checkIdentifier,
  checkReadOnlySql,
  inferColumnType,
  parseCsv,
  parseJsonData,
  type DbConnectionConfig,
  type Row,
} from '@/lib/asset'

/**
 * POST /api/assets/import — นำเข้าข้อมูลเป็น Data Asset (CSV / JSON / DATABASE)
 * สิทธิ์: MANAGE_DATASETS (ตาม RBAC) — บันทึก Audit Trail ทุกครั้ง
 * - CSV/JSON: รับข้อความไฟล์ → แยกวิเคราะห์ฝั่งเซิร์ฟเวอร์
 * - DATABASE: เชื่อมต่อจริงด้วย mysql2/pg — อนุญาตเฉพาะ SELECT (deny-by-default)
 * ข้อจำกัด: สูงสุด 1000 แถว / 100 คอลัมน์ ต่อการนำเข้า 1 ครั้ง
 */

const MAX_BODY_CHARS = ASSET_LIMITS.maxFileChars

function okRow(r: Row): Row {
  // ทุกค่าเป็นข้อความเสมอ (เก็บ JSON รายแถว — แสดงใน Inventory ได้ตรงกันทั้ง 3 แหล่ง)
  const out: Row = {}
  for (const [k, v] of Object.entries(r)) {
    out[k] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

interface DbRowResult {
  rows: Row[]
  columns: string[]
}

async function fetchFromDatabase(cfg: DbConnectionConfig): Promise<DbRowResult> {
  const limit = ASSET_LIMITS.maxRows
  if (cfg.dbType === 'MYSQL') {
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.username,
      password: cfg.password,
      database: cfg.database,
      connectTimeout: ASSET_LIMITS.dbQueryTimeoutMs,
    })
    try {
      let sql: string
      if (cfg.query && cfg.query.trim()) {
        sql = `SELECT * FROM (${cfg.query.trim().replace(/;+\s*$/, '')}) AS __dq_sub LIMIT ${limit}`
      } else {
        sql = `SELECT * FROM \`${cfg.tableName}\` LIMIT ${limit}`
      }
      const [rowsRaw] = await conn.query(sql)
      const rows = (Array.isArray(rowsRaw) ? rowsRaw : []).slice(0, limit) as Row[]
      const columns = rows.length > 0 ? [...new Set(rows.flatMap((r) => Object.keys(r)))] : []
      return { rows, columns }
    } finally {
      await conn.end().catch(() => undefined)
    }
  }
  // POSTGRESQL
  const { Client } = await import('pg')
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database,
    connectionTimeoutMillis: ASSET_LIMITS.dbQueryTimeoutMs,
  })
  await client.connect()
  try {
    let sql: string
    if (cfg.query && cfg.query.trim()) {
      sql = `SELECT * FROM (${cfg.query.trim().replace(/;+\s*$/, '')}) AS __dq_sub LIMIT ${limit}`
    } else {
      sql = `SELECT * FROM "${cfg.tableName}" LIMIT ${limit}`
    }
    const res = await client.query(sql)
    const rows = res.rows.slice(0, limit) as Row[]
    const columns = rows.length > 0 ? [...new Set(rows.flatMap((r) => Object.keys(r)))] : []
    return { rows, columns }
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const name = String(body.name ?? '').trim()
    const description = String(body.description ?? '').trim().slice(0, 500)
    const sourceType = String(body.sourceType ?? '').trim().toUpperCase()
    if (!name) return NextResponse.json({ error: 'กรุณาตั้งชื่อ Data Asset' }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: 'ชื่อยาวเกิน 120 ตัวอักษร' }, { status: 400 })
    if (!['CSV', 'JSON', 'DATABASE'].includes(sourceType)) {
      return NextResponse.json({ error: 'ชนิดแหล่งข้อมูลไม่ถูกต้อง (CSV | JSON | DATABASE)' }, { status: 400 })
    }

    let columns: string[] = []
    let rows: Row[] = []
    let sourceInfo: Record<string, unknown> = {}
    let note = ''

    if (sourceType === 'CSV') {
      const text = String(body.csvText ?? '')
      if (!text.trim()) return NextResponse.json({ error: 'กรุณาแนบไฟล์หรือวางเนื้อหา CSV' }, { status: 400 })
      if (text.length > MAX_BODY_CHARS) {
        return NextResponse.json({ error: `ไฟล์ใหญ่เกินขีดจำกัด (สูงสุด ~${Math.round(MAX_BODY_CHARS / 1_000_000)}MB)` }, { status: 413 })
      }
      const parsed = parseCsv(text, body.delimiter ? String(body.delimiter) : undefined)
      columns = parsed.columns
      rows = parsed.rows.map(okRow)
      sourceInfo = {
        fileName: String(body.fileName ?? '').slice(0, 200) || '(วางข้อความ)',
        sizeChars: text.length,
        delimiter: parsed.delimiter === '\t' ? '\\t' : parsed.delimiter,
        skippedRows: parsed.skippedRows,
      }
      if (parsed.skippedRows > 0) note = `ข้ามแถวว่าง ${parsed.skippedRows} แถว`
    } else if (sourceType === 'JSON') {
      const text = String(body.jsonText ?? '')
      if (!text.trim()) return NextResponse.json({ error: 'กรุณาแนบไฟล์หรือวางเนื้อหา JSON' }, { status: 400 })
      if (text.length > MAX_BODY_CHARS) {
        return NextResponse.json({ error: `ไฟล์ใหญ่เกินขีดจำกัด (สูงสุด ~${Math.round(MAX_BODY_CHARS / 1_000_000)}MB)` }, { status: 413 })
      }
      const parsed = parseJsonData(text)
      columns = parsed.columns
      rows = parsed.rows.map(okRow)
      sourceInfo = {
        fileName: String(body.fileName ?? '').slice(0, 200) || '(วางข้อความ)',
        sizeChars: text.length,
        shape: parsed.shape,
        skippedRows: parsed.skippedRows,
      }
      if (parsed.skippedRows > 0) note = `ข้ามรายการที่ไม่ใช่วัตถุ ${parsed.skippedRows} รายการ`
    } else {
      // DATABASE — ตรวจ config แบบเข้มงวด + deny-by-default SQL
      const dbType = String(body.dbType ?? '').trim().toUpperCase()
      if (!['MYSQL', 'POSTGRESQL'].includes(dbType)) {
        return NextResponse.json({ error: 'รองรับ MySQL และ PostgreSQL เท่านั้น' }, { status: 400 })
      }
      const host = String(body.host ?? '').trim()
      const database = String(body.database ?? '').trim()
      const username = String(body.username ?? '').trim()
      const password = String(body.password ?? '')
      const port = Number(body.port ?? (dbType === 'MYSQL' ? 3306 : 5432))
      const tableName = String(body.tableName ?? '').trim()
      const query = String(body.query ?? '').trim()
      if (!host || !database || !username) {
        return NextResponse.json({ error: 'กรุณากรอก Host / Database / Username ให้ครบ' }, { status: 400 })
      }
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        return NextResponse.json({ error: 'Port ไม่ถูกต้อง (1–65535)' }, { status: 400 })
      }
      if (!tableName && !query) {
        return NextResponse.json({ error: 'ระบุชื่อตาราง หรือคำสั่ง SQL อย่างใดอย่างหนึ่ง' }, { status: 400 })
      }
      if (tableName) {
        const ident = checkIdentifier(tableName)
        if (!ident.ok) return NextResponse.json({ error: ident.message }, { status: 400 })
      }
      if (query) {
        const guard = checkReadOnlySql(query)
        if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: 400 })
      }
      const cfg: DbConnectionConfig = { dbType: dbType as 'MYSQL' | 'POSTGRESQL', host, port, database, username, password, tableName: tableName || undefined, query: query || undefined }
      try {
        const result = await fetchFromDatabase(cfg)
        if (result.rows.length === 0) {
          return NextResponse.json({ error: 'เชื่อมต่อสำเร็จแต่ไม่พบข้อมูลในตาราง/คำสั่งนี้' }, { status: 422 })
        }
        columns = result.columns
        rows = result.rows.map(okRow)
        sourceInfo = JSON.parse(buildDbSourceInfo(cfg, { fetchedRows: rows.length }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ'
        return NextResponse.json({ error: `เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ${msg}` }, { status: 422 })
      }
    }

    if (columns.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลที่นำเข้าได้' }, { status: 422 })
    }

    // บันทึกลงฐานข้อมูล (asset + columns + records) เป็นธุรกรรมเดียว
    const created = await db.$transaction(async (tx) => {
      const asset = await tx.dataAsset.create({
        data: {
          name,
          description,
          sourceType,
          sourceInfo: JSON.stringify(sourceInfo),
          rowCount: rows.length,
          columnCount: columns.length,
          importedBy: op.ctx.email,
        },
      })
      await tx.dataAssetColumn.createMany({
        data: columns.map((c, idx) => ({
          assetId: asset.id,
          name: c,
          dataType: inferColumnType(rows, c),
          position: idx,
        })),
      })
      await tx.dataAssetRecord.createMany({
        data: rows.map((r, idx) => ({
          assetId: asset.id,
          rowNo: idx + 1,
          payload: JSON.stringify(r),
        })),
      })
      return asset
    })

    await db.auditLog.create({
      data: {
        action: 'IMPORT_DATA_ASSET',
        actor: op.ctx.email,
        target: name,
        detail: `นำเข้า Data Asset "${name}" จากแหล่ง ${sourceType} — ${rows.length} แถว / ${columns.length} คอลัมน์ โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      asset: { id: created.id, name: created.name, sourceType, rowCount: rows.length, columnCount: columns.length },
      columns,
      preview: rows.slice(0, ASSET_LIMITS.previewRows),
      note,
      message: `นำเข้า "${name}" สำเร็จ — ${rows.length} แถว / ${columns.length} คอลัมน์${note ? ` (${note})` : ''}`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    if (msg.includes('ขีดจำกัด') || msg.includes('ต้องมี') || msg.includes('ไม่พบ') || msg.includes('รูปแบบ')) {
      return NextResponse.json({ error: msg }, { status: 422 })
    }
    console.error('POST /api/assets/import', e)
    return NextResponse.json({ error: 'นำเข้าข้อมูลไม่สำเร็จ' }, { status: 500 })
  }
}
