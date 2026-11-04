// GET /api/auth/me — current session user (null when unauthenticated).
import { guard, guardBlocked, json, requireUser } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { session: false })
  if (guardBlocked(g)) return g
  const user = await requireUser()
  return json({ user })
}
