/**
 * RBAC Configuration — Single Source of Truth
 * บทบาทผู้ใช้และสิทธิ์การเข้าถึงของ Enterprise Data Quality Platform
 * ใช้ร่วมกันทั้ง Backend (API) และ Frontend (RBAC Console)
 */

export const ROLE_KEYS = [
  'DATA_OWNER',
  'DATA_STEWARD',
  'DQ_ANALYST',
  'DATA_ENGINEER',
  'COMPLIANCE_OFFICER',
  'BUSINESS_USER',
  'EXECUTIVE',
  'SYS_ADMIN',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export const PERMISSION_KEYS = [
  'VIEW_DATASETS',
  'MANAGE_DATASETS',
  'MANAGE_RULES',
  'RUN_VALIDATION',
  'REVIEW_SIGNALS',
  'APPROVE_EXCEPTIONS',
  'VIEW_DASHBOARDS',
  'MANAGE_USERS',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export const PERMISSION_LABELS: Record<PermissionKey, { th: string; en: string }> = {
  VIEW_DATASETS: { th: 'ดูชุดข้อมูล', en: 'View Datasets' },
  MANAGE_DATASETS: { th: 'จัดการชุดข้อมูล', en: 'Manage Datasets' },
  MANAGE_RULES: { th: 'สร้าง/แก้ไขกฎ', en: 'Manage Rules' },
  RUN_VALIDATION: { th: 'รันการตรวจสอบ', en: 'Run Validation' },
  REVIEW_SIGNALS: { th: 'ทบทวนสัญญาณ AI', en: 'Review ML Signals' },
  APPROVE_EXCEPTIONS: { th: 'อนุมัติข้อยกเว้น', en: 'Approve Exceptions' },
  VIEW_DASHBOARDS: { th: 'ดูแดชบอร์ด', en: 'View Dashboards' },
  MANAGE_USERS: { th: 'จัดการผู้ใช้และสิทธิ์', en: 'Manage Users' },
}

export interface RoleDefinition {
  key: RoleKey
  th: string
  en: string
  desc: string
  permissions: PermissionKey[]
  /** ขอบเขตการเห็นชุดข้อมูล — ตามหลัก dataset-level isolation */
  scope: string
}

export const ROLES: Record<RoleKey, RoleDefinition> = {
  DATA_OWNER: {
    key: 'DATA_OWNER',
    th: 'เจ้าของข้อมูล',
    en: 'Data Owner',
    desc: 'กำกับนโยบายข้อมูลในความรับผิดชอบและอนุมัติข้อยกเว้นระดับชุดข้อมูล',
    permissions: [
      'VIEW_DATASETS',
      'MANAGE_DATASETS',
      'MANAGE_RULES',
      'RUN_VALIDATION',
      'APPROVE_EXCEPTIONS',
      'VIEW_DASHBOARDS',
    ],
    scope: 'เห็นเฉพาะชุดข้อมูลที่ตนเป็นเจ้าของหรือได้รับมอบสิทธิ์',
  },
  DATA_STEWARD: {
    key: 'DATA_STEWARD',
    th: 'ผู้ดูแลข้อมูล',
    en: 'Data Steward',
    desc: 'ดูแลกฎ คุณภาพข้อมูล และทบทวนสัญญาณ AI ในงานประจำวัน',
    permissions: [
      'VIEW_DATASETS',
      'MANAGE_DATASETS',
      'MANAGE_RULES',
      'RUN_VALIDATION',
      'REVIEW_SIGNALS',
      'VIEW_DASHBOARDS',
    ],
    scope: 'เห็นเฉพาะชุดข้อมูลในโดเมนที่รับผิดชอบ',
  },
  DQ_ANALYST: {
    key: 'DQ_ANALYST',
    th: 'นักวิเคราะห์คุณภาพข้อมูล',
    en: 'Data Quality Analyst',
    desc: 'ทบทวนผลตรวจและสัญญาณ AI วิเคราะห์สาเหตุ และสร้างกฎเพิ่มเติม',
    permissions: ['VIEW_DATASETS', 'MANAGE_RULES', 'RUN_VALIDATION', 'REVIEW_SIGNALS', 'VIEW_DASHBOARDS'],
    scope: 'เห็นเฉพาะชุดข้อมูลที่ได้รับมอบหมายให้วิเคราะห์',
  },
  DATA_ENGINEER: {
    key: 'DATA_ENGINEER',
    th: 'วิศวกรข้อมูล',
    en: 'Data Engineer',
    desc: 'จัดการแหล่งข้อมูล การนำเข้า และประสิทธิภาพของการตรวจสอบ',
    permissions: ['VIEW_DATASETS', 'MANAGE_DATASETS', 'RUN_VALIDATION', 'VIEW_DASHBOARDS'],
    scope: 'เห็นเฉพาะชุดข้อมูลที่รับผิดชอบด้านวิศวกรรม',
  },
  COMPLIANCE_OFFICER: {
    key: 'COMPLIANCE_OFFICER',
    th: 'เจ้าหน้าที่กำกับดูแล',
    en: 'Compliance Officer',
    desc: 'ตรวจสอบการปฏิบัติตาม PDPA ทบทวนสัญญาณที่มีความเสี่ยง และอนุมัติร่วม',
    permissions: ['VIEW_DATASETS', 'REVIEW_SIGNALS', 'APPROVE_EXCEPTIONS', 'VIEW_DASHBOARDS'],
    scope: 'เห็นชุดข้อมูลที่เกี่ยวข้องกับการกำกับดูแลเท่านั้น',
  },
  BUSINESS_USER: {
    key: 'BUSINESS_USER',
    th: 'ผู้ใช้งานทั่วไป',
    en: 'Business User',
    desc: 'ใช้ชุดข้อมูลที่ผ่านการตรวจสอบแล้วในงานประจำของตน',
    permissions: ['VIEW_DATASETS', 'VIEW_DASHBOARDS'],
    scope: 'เห็นเฉพาะชุดข้อมูลที่อนุมัติให้ใช้งาน (ข้อมูลถูกปิดบัง PII แล้ว)',
  },
  EXECUTIVE: {
    key: 'EXECUTIVE',
    th: 'ผู้บริหาร',
    en: 'Executive',
    desc: 'ติดตามภาพรวมคุณภาพข้อมูลองค์กรและอนุมัติการกำกับดูแลระดับสูง',
    permissions: ['VIEW_DATASETS', 'APPROVE_EXCEPTIONS', 'VIEW_DASHBOARDS'],
    scope: 'เห็นเฉพาะสรุปภาพรวมและชุดข้อมูลระดับบริหาร',
  },
  SYS_ADMIN: {
    key: 'SYS_ADMIN',
    th: 'ผู้ดูแลระบบ',
    en: 'System Administrator',
    desc: 'จัดการผู้ใช้ บทบาท สิทธิ์การเข้าถึง และการตั้งค่าระบบ',
    permissions: [
      'VIEW_DATASETS',
      'MANAGE_DATASETS',
      'MANAGE_RULES',
      'RUN_VALIDATION',
      'VIEW_DASHBOARDS',
      'MANAGE_USERS',
    ],
    scope: 'จัดการการเข้าถึงทุกชุดข้อมูล (ไม่อนุมัติข้อยกเว้นทางธุรกิจ)',
  },
}

export const ROLE_LIST: RoleDefinition[] = ROLE_KEYS.map((k) => ROLES[k])

export function isValidRole(role: string): role is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(role)
}

export function hasPermission(role: string, permission: PermissionKey): boolean {
  if (!isValidRole(role)) return false
  return ROLES[role].permissions.includes(permission)
}
