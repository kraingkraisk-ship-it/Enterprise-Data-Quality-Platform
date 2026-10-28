/**
 * Seed รหัสผ่านเริ่มต้น (v0.33.0) — ตั้งรหัส Dq@2025 ให้ผู้ใช้ทุกคนที่ยังไม่มี passwordHash
 * รันเฉพาะครั้งแรก: bunx tsx scripts/seed-passwords.ts
 */
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'node:crypto'

const prisma = new PrismaClient()
export const DEMO_PASSWORD = 'Dq@2025'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

async function main() {
  const users = await prisma.user.findMany({ where: { passwordHash: null }, select: { email: true, name: true, status: true } })
  if (users.length === 0) {
    console.log('ทุกบัญชีมีรหัสผ่านแล้ว — ไม่ต้อง seed')
    return
  }
  const hash = hashPassword(DEMO_PASSWORD)
  for (const u of users) {
    await prisma.user.update({ where: { email: u.email }, data: { passwordHash: hash } })
    console.log(`ตั้งรหัสผ่านให้ ${u.email} (${u.name}) [${u.status}]`)
  }
  console.log(`\nเสร็จ: ${users.length} บัญชี · รหัสผ่านเริ่มต้น = ${DEMO_PASSWORD}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
