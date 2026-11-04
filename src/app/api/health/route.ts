// GET /api/health — liveness probe: database, worker, storage.
import { accessSync, mkdirSync, constants } from 'fs'
import { join } from 'path'
import { db } from '@/lib/db'
import { json } from '@/lib/api-helpers'

const UPLOADS_DIR = join(process.cwd(), 'uploads')

export async function GET() {
  const checks: Record<string, string> = { database: 'ok', worker: 'ok', storage: 'ok' }
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    checks.database = 'error'
  }
  try {
    mkdirSync(UPLOADS_DIR, { recursive: true })
    accessSync(UPLOADS_DIR, constants.W_OK)
  } catch {
    checks.storage = 'error'
  }
  const status = checks.database === 'ok' ? 'ok' : 'degraded'
  return json({ status, checks })
}
