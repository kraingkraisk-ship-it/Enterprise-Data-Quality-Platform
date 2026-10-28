/**
 * Operator Gate (v0.33.0) — ตรวจสิทธิ์ผู้ดำเนินการก่อนทุก mutation ของระบบ DQ
 * หลักการ: ผู้ดำเนินการ "ต้องเป็นผู้ที่เข้าสู่ระบบอยู่จริง" (session cookie) + ACTIVE
 * + บทบาทต้องมีสิทธิ์นั้นตาม RBAC — client ไม่สามารถปลอมบัญชีอื่นผ่าน body ได้อีกต่อไป
 * (เดิม v0.32 ยึด operatorEmail จาก request body — ใครก็ปลอมได้; v0.33 ยึด session เป็นความจริง
 *  โดยคง signature เดิมไว้ ทำให้ 35 API ไม่ต้องแก้ call site)
 */

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { hasPermission, ROLES, type PermissionKey } from '@/lib/rbac'
import { rolesWithPermission } from '@/lib/dq'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

export interface OperatorContext {
  email: string
  name: string
  role: string
  roleTh: string
}

export type OperatorResult =
  | { ok: true; ctx: OperatorContext }
  | { ok: false; status: 400 | 401 | 403 | 404; message: string }

/**
 * ตรวจผู้ดำเนินการจาก session + สิทธิ์ที่ต้องการ
 * - ไม่มี session ที่ถูกต้อง → 401 กรุณาเข้าสู่ระบบ
 * - rawEmail (จาก client เพื่อความเข้ากันได้ย้อนหลัง) ต้องตรง session email — ไม่ตรง = 403 ปลอมตัว
 * - บัญชีต้อง ACTIVE + บทบาทมีสิทธิ์ permission ตาม RBAC
 */
export async function resolveOperator(rawEmail: unknown, permission: PermissionKey): Promise<OperatorResult> {
  const store = await cookies()
  const session = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!session) {
    return { ok: false, status: 401, message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ (session หมดอายุ)' }
  }

  const email = session.e
  const claimed = String(rawEmail ?? '').trim().toLowerCase()
  if (claimed && claimed !== email) {
    return {
      ok: false,
      status: 403,
      message: `ผู้ดำเนินการในคำขอ (${claimed}) ไม่ตรงกับผู้เข้าสู่ระบบ (${email}) — ระบบยึดบัญชีผู้เข้าสู่ระบบเท่านั้น`,
    }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return { ok: false, status: 404, message: 'ไม่พบบัญชีผู้เข้าสู่ระบบนี้ในระบบ' }
  }
  if (user.status !== 'ACTIVE') {
    return { ok: false, status: 403, message: `บัญชี ${user.name} ถูกระงับการใช้งาน — ไม่สามารถดำเนินการได้` }
  }

  const roleDef = ROLES[user.role as keyof typeof ROLES]
  if (!roleDef) {
    return { ok: false, status: 403, message: 'บทบาทของผู้ดำเนินการไม่ถูกต้องในระบบ' }
  }

  if (!hasPermission(user.role, permission)) {
    const allowed = rolesWithPermission(permission)
      .map((r) => r.th)
      .join(', ')
    return {
      ok: false,
      status: 403,
      message: `บทบาท "${roleDef.th}" ไม่มีสิทธิ์ดำเนินการนี้ — ต้องเป็นบทบาท: ${allowed} (ตามหลัก RBAC)`,
    }
  }

  return { ok: true, ctx: { email: user.email, name: user.name, role: user.role, roleTh: roleDef.th } }
}

/**
 * บทบาทผู้ชมจาก session (v0.34.0) — ใช้กับทุก API ที่ปิดบัง PII ตามบทบาทผู้ชม
 * เดิมรับ role/operatorEmail/viewer จาก query/body (ปลอมได้ — ส่งอีเมลเจ้าของข้อมูลแล้วเห็น PII)
 * v0.34.0 อ่านบทบาทจาก session cookie เท่านั้น · ไม่มี session/บัญชีหาย/ถูกระงับ → BUSINESS_USER
 * (เข้มสุดเพื่อ PDPA-first: ตกชั้นหมายความว่า PII ถูกปิดบัง ไม่ใช่เห็นมากขึ้น)
 */
export async function resolveViewerRole(): Promise<string> {
  const store = await cookies()
  const session = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!session) return 'BUSINESS_USER'
  const user = await db.user.findUnique({ where: { email: session.e }, select: { role: true, status: true } })
  if (!user || user.status !== 'ACTIVE') return 'BUSINESS_USER'
  return user.role
}
