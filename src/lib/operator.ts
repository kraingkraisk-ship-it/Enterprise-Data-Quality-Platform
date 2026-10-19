/**
 * Operator Gate — ตรวจสิทธิ์ผู้ดำเนินการก่อนทุก mutation ของระบบ DQ
 * หลักการ: ผู้ดำเนินการต้องเป็นบัญชีจริงในระบบ + ACTIVE + บทบาทต้องมีสิทธิ์นั้นตาม RBAC
 * (ทำให้ "บทบาทผู้ใช้และสิทธิ์การเข้าถึง" ถูกบังคับใช้จริง ไม่ใช่แค่ตารางแสดงผล)
 */

import { db } from '@/lib/db'
import { hasPermission, ROLES, type PermissionKey } from '@/lib/rbac'
import { rolesWithPermission } from '@/lib/dq'

export interface OperatorContext {
  email: string
  name: string
  role: string
  roleTh: string
}

export type OperatorResult =
  | { ok: true; ctx: OperatorContext }
  | { ok: false; status: 400 | 403 | 404; message: string }

/**
 * ตรวจผู้ดำเนินการจาก email + สิทธิ์ที่ต้องการ
 * คืนผลลัพธ์แบบ discriminated union เพื่อให้ route แปลงเป็น NextResponse ได้ตรงไป
 */
export async function resolveOperator(rawEmail: unknown, permission: PermissionKey): Promise<OperatorResult> {
  const email = String(rawEmail ?? '').trim().toLowerCase()
  if (!email) {
    return { ok: false, status: 400, message: 'กรุณาระบุผู้ดำเนินการ (เลือกบัญชีผู้ใช้ในแต่ละฟอร์ม)' }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return { ok: false, status: 404, message: 'ไม่พบบัญชีผู้ดำเนินการนี้ในระบบ' }
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
