// Server-side session helpers. Demo auth issues an HMAC-signed cookie per user
// (SSO/OIDC-ready: swap login handler for an OIDC code flow — session contract identical).
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { UserDTO, Role } from '@/lib/types'

const COOKIE = 'edqp_session'
const SECRET = process.env.SESSION_SECRET || 'edqp-dev-secret-change-in-production'

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: Date.now() })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string): string | null {
  const idx = token.lastIndexOf('.')
  if (idx < 0) return null
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = sign(payload)
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!data?.sub) return null
    return data.sub as string
  } catch {
    return null
  }
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies()
  jar.set(COOKIE, createSessionToken(userId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 8,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

export async function getSessionUser(): Promise<UserDTO | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const userId = verifySessionToken(token)
  if (!userId) return null
  const u = await db.user.findUnique({ where: { id: userId } })
  if (!u || !u.active) return null
  return {
    id: u.id, email: u.email, name: u.name, nameTh: u.nameTh, role: u.role as Role,
    businessUnit: u.businessUnit, titleEn: u.titleEn, titleTh: u.titleTh, mfaEnabled: u.mfaEnabled,
  }
}
