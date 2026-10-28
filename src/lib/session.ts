/**
 * Session (v0.33.0) — signed token แบบ HMAC-SHA256 ใน httpOnly cookie
 * รูปแบบ token: base64url(JSON payload).base64url(HMAC signature)
 * payload: { e: email, iat: issuedAt(ms), exp: expireAt(ms) }
 * ใช้ globalThis.crypto.subtle (Web Crypto) — ทำงานได้ทั้ง Node runtime (API routes)
 * และ Edge runtime (middleware) ด้วยโค้ดชุดเดียว
 */

export const SESSION_COOKIE = 'dq_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 วัน

const SECRET = process.env.AUTH_SECRET ?? 'dq-platform-v033-local-secret'

function enc(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function dec(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export interface SessionPayload {
  e: string
  iat: number
  exp: number
}

/** สร้าง token ใหม่ให้ email (อายุ 7 วัน) */
export async function signSession(email: string): Promise<string> {
  const payload: SessionPayload = { e: email, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS }
  const body = enc(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await hmacKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${enc(sig)}`
}

/** ตรวจ token — คืน payload ถ้าผ่าน (ลายเซ็นถูก + ไม่หมดอายุ) ไม่เช็ค DB */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const key = await hmacKey()
    const ok = await crypto.subtle.verify('HMAC', key, dec(sig), new TextEncoder().encode(body))
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(dec(body))) as SessionPayload
    if (typeof payload.e !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/** อ่านค่า cookie จาก request แบบไม่พึ่ง framework (ทำงานทั้ง middleware/route) */
export function readSessionCookie(headers: Headers): string | undefined {
  const raw = headers.get('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** ตรวจ session จาก headers โดยตรง (ใช้ใน middleware + route ที่มีแค่ Request) */
export async function verifySessionFromHeaders(headers: Headers): Promise<SessionPayload | null> {
  return verifySession(readSessionCookie(headers))
}
