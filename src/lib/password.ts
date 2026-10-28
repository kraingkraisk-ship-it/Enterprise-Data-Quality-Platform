/**
 * Password hashing (v0.33.0) — scrypt จาก node:crypto (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
 * รูปแบบเก็บใน DB: "scrypt:<salt-hex>:<hash-hex>"
 * ใช้เฉพาะฝั่ง server (API routes) — ห้าม import ใน client component
 */
import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto'

const KEY_LEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hash] = parts
  try {
    const expected = Buffer.from(hash, 'hex')
    const actual = scryptSync(password, salt, expected.length)
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
