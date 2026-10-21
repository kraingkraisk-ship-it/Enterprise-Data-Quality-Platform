import { NextRequest, NextResponse } from 'next/server'
import { resolveOperator } from '@/lib/operator'
import { ASSET_LIMITS, type DbConnectionConfig } from '@/lib/asset'

/**
 * POST /api/assets/test-connection — ทดสอบการเชื่อมต่อฐานข้อมูลก่อนนำเข้า
 * สิทธิ์: MANAGE_DATASETS (ตาม RBAC)
 * คืนผล: เวอร์ชันเซิร์ฟเวอร์ + รายชื่อตารางในฐานข้อมูล (ไม่นำเข้าข้อมูลใด ๆ)
 */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const dbType = String(body.dbType ?? '').trim().toUpperCase()
    if (!['MYSQL', 'POSTGRESQL'].includes(dbType)) {
      return NextResponse.json({ error: 'รองรับ MySQL และ PostgreSQL เท่านั้น' }, { status: 400 })
    }
    const host = String(body.host ?? '').trim()
    const database = String(body.database ?? '').trim()
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')
    const port = Number(body.port ?? (dbType === 'MYSQL' ? 3306 : 5432))
    if (!host || !database || !username) {
      return NextResponse.json({ error: 'กรุณากรอก Host / Database / Username ให้ครบ' }, { status: 400 })
    }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return NextResponse.json({ error: 'Port ไม่ถูกต้อง (1–65535)' }, { status: 400 })
    }

    const cfg = { dbType, host, port, database, username, password } as DbConnectionConfig
    const tables: string[] = []
    let serverInfo = ''

    if (dbType === 'MYSQL') {
      const mysql = await import('mysql2/promise')
      const conn = await mysql
        .createConnection({
          host: cfg.host,
          port: cfg.port,
          user: cfg.username,
          password: cfg.password,
          database: cfg.database,
          connectTimeout: ASSET_LIMITS.dbQueryTimeoutMs,
        })
        .catch((e: Error) => {
          throw new Error(e.message)
        })
      try {
        const [ver] = await conn.query('SELECT VERSION() AS v')
        serverInfo = `MySQL ${(ver as Array<{ v: string }>)[0]?.v ?? ''}`
        const [tbls] = await conn.query('SHOW TABLES')
        for (const row of tbls as Array<Record<string, unknown>>) {
          tables.push(String(Object.values(row)[0]))
        }
      } finally {
        await conn.end().catch(() => undefined)
      }
    } else {
      const { Client } = await import('pg')
      const client = new Client({
        host: cfg.host,
        port: cfg.port,
        user: cfg.username,
        password: cfg.password,
        database: cfg.database,
        connectionTimeoutMillis: ASSET_LIMITS.dbQueryTimeoutMs,
      })
      try {
        await client.connect()
        const ver = await client.query('SELECT version() AS v')
        serverInfo = String((ver.rows[0] as { v?: string })?.v ?? 'PostgreSQL').split(',')[0]
        const tbls = await client.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
        )
        for (const row of tbls.rows as Array<{ table_name: string }>) tables.push(row.table_name)
      } finally {
        await client.end().catch(() => undefined)
      }
    }

    return NextResponse.json({
      ok: true,
      serverInfo,
      tables: tables.slice(0, 100),
      tableCount: tables.length,
      message: `เชื่อมต่อสำเร็จ — ${serverInfo} · พบตาราง ${tables.length} ตาราง`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ'
    return NextResponse.json(
      { ok: false, error: `เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ${msg}` },
      { status: 422 },
    )
  }
}
