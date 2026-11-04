// GET /api/admin/users — full user directory (ADMIN_USERS).
import { db } from '@/lib/db'
import { guard, guardBlocked, json, serializeUser } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'ADMIN_USERS' })
  if (guardBlocked(g)) return g
  const users = await db.user.findMany({ orderBy: { name: 'asc' } })
  return json({ users: users.map((u) => serializeUser(u, true)) })
}
