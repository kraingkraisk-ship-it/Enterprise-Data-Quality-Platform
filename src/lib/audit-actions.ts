/**
 * Audit Action Catalog (v0.30.0) — คลังชื่อ action ของ Audit Log แหล่งเดียวของระบบ
 * ปัญหาที่แก้: action ถูกเขียนกระจายใน 30+ API (60+ ชนิด) แต่หน้าแสดงผลแปลภาษาได้บางส่วน
 * แหล่งนี้รวมทุก action จริงที่ route เขียนลงตาราง AuditLog + จัดกลุ่ม + สไตล์ badge ต่อกลุ่ม
 * ใช้ร่วมกัน: ศูนย์บันทึกตรวจสอบ (audit-center) · RBAC Console แท็บบันทึกตรวจสอบ · API /api/audit/*
 * หมายเหตุ: เพิ่ม action ใหม่เมื่อ route เขียน action ใหม่ — ต้องอยู่ในกลุ่มที่มีอยู่เท่านั้น
 */

export type AuditGroupKey = 'rbac' | 'asset' | 'rule' | 'dq' | 'ml' | 'system'

export interface AuditGroupDef {
  key: AuditGroupKey
  th: string
  en: string
  /** สไตล์ badge ของ action ในกลุ่มนี้ (พื้นหลัง/ตัวอักษร/ขอบ) */
  badgeClass: string
  /** สไตล์ปุ่มกรองเมื่อเลือกอยู่ */
  chipActiveClass: string
}

/** กลุ่ม action — 6 กลุ่ม (สีตามขนบแพลตฟอร์ม: amber/teal/emerald/slate/orange/rose — ไม่ใช้ blue/indigo) */
export const AUDIT_GROUPS: Record<AuditGroupKey, AuditGroupDef> = {
  rbac: {
    key: 'rbac',
    th: 'บัญชีและสิทธิ์',
    en: 'RBAC',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    chipActiveClass: 'bg-amber-100 text-amber-900 border-amber-400',
  },
  asset: {
    key: 'asset',
    th: 'ข้อมูลและโดเมน',
    en: 'Data Assets',
    badgeClass: 'bg-teal-50 text-teal-900 border-teal-200',
    chipActiveClass: 'bg-teal-100 text-teal-900 border-teal-400',
  },
  rule: {
    key: 'rule',
    th: 'กฎและการแมป',
    en: 'Rules & Mapping',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    chipActiveClass: 'bg-emerald-100 text-emerald-800 border-emerald-400',
  },
  dq: {
    key: 'dq',
    th: 'กระบวนการตรวจสอบ',
    en: 'DQ Process',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    chipActiveClass: 'bg-slate-200 text-slate-900 border-slate-400',
  },
  ml: {
    key: 'ml',
    th: 'ML · สัญญาณอัจฉริยะ',
    en: 'ML Signals',
    badgeClass: 'bg-orange-50 text-orange-900 border-orange-200',
    chipActiveClass: 'bg-orange-100 text-orange-900 border-orange-400',
  },
  system: {
    key: 'system',
    th: 'ระบบ · บันทึกตรวจสอบ',
    en: 'System',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    chipActiveClass: 'bg-rose-100 text-rose-800 border-rose-400',
  },
}

/** ลำดับกลุ่มที่ใช้แสดงบนจอ */
export const AUDIT_GROUP_ORDER: AuditGroupKey[] = ['rbac', 'asset', 'rule', 'dq', 'ml', 'system']

const RBAC = AUDIT_GROUPS.rbac.key
const ASSET = AUDIT_GROUPS.asset.key
const RULE = AUDIT_GROUPS.rule.key
const DQ = AUDIT_GROUPS.dq.key
const ML = AUDIT_GROUPS.ml.key
const SYSTEM = AUDIT_GROUPS.system.key

/**
 * คลัง action ทั้งหมดที่ระบบเขียนจริง (สแกนจาก src/app/api/** ครบทุกจุด เมื่อ v0.30.0)
 * key = ค่า action ที่เขียนลงตาราง AuditLog · th = ชื่อภาษาไทยบนจอ · group = กลุ่ม
 */
export const AUDIT_ACTIONS: Record<string, { th: string; group: AuditGroupKey }> = {
  /* ------------------------------ บัญชีและสิทธิ์ (RBAC) ------------------------------ */
  CREATE_USER: { th: 'สร้างบัญชี', group: RBAC },
  ASSIGN_ROLE: { th: 'เปลี่ยนบทบาท', group: RBAC },
  SUSPEND_USER: { th: 'ระงับบัญชี', group: RBAC },
  ACTIVATE_USER: { th: 'เปิดบัญชี', group: RBAC },
  GRANT_ACCESS: { th: 'มอบสิทธิ์', group: RBAC },
  REVOKE_ACCESS: { th: 'ยกเลิกสิทธิ์', group: RBAC },
  SET_ACCESS_LEVEL: { th: 'ปรับระดับสิทธิ์', group: RBAC },
  LOGIN_SUCCESS: { th: 'เข้าสู่ระบบสำเร็จ', group: RBAC },
  LOGIN_FAILED: { th: 'เข้าสู่ระบบไม่สำเร็จ', group: RBAC },
  LOGOUT: { th: 'ออกจากระบบ', group: RBAC },

  /* ------------------------------ ข้อมูลและโดเมน ------------------------------ */
  IMPORT_DATA_ASSET: { th: 'นำเข้าข้อมูล', group: ASSET },
  CREATE_DATASET: { th: 'สร้างชุดข้อมูล', group: ASSET },
  UPDATE_DATA_ASSET: { th: 'แก้ไขข้อมูล', group: ASSET },
  RENAME_DATA_ASSET: { th: 'เปลี่ยนชื่อข้อมูล', group: ASSET },
  DELETE_DATA_ASSET: { th: 'ลบข้อมูล', group: ASSET },
  SET_DATA_ASSET_DOMAIN: { th: 'กำหนดโดเมนข้อมูล', group: ASSET },
  SET_DATA_ASSET_PHYSICAL: { th: 'กำหนดที่เก็บข้อมูลจริง', group: ASSET },
  SET_DATASET_DOMAIN: { th: 'กำหนดโดเมนชุดข้อมูล', group: ASSET },
  SET_CLASSIFICATION: { th: 'จัดระดับชั้นข้อมูล', group: ASSET },
  RUN_PROFILE: { th: 'รันโปรไฟล์ข้อมูล', group: ASSET },
  CREATE_DATA_DOMAIN: { th: 'สร้าง Data Domain', group: ASSET },
  UPDATE_DATA_DOMAIN: { th: 'แก้ไข Data Domain', group: ASSET },
  DELETE_DATA_DOMAIN: { th: 'ลบ Data Domain', group: ASSET },
  CREATE_DATA_ELEMENT: { th: 'สร้าง Data Element', group: ASSET },
  UPDATE_DATA_ELEMENT: { th: 'แก้ไข Data Element', group: ASSET },
  DELETE_DATA_ELEMENT: { th: 'ลบ Data Element', group: ASSET },
  SUBMIT_DATA_ELEMENT_APPROVAL: { th: 'ส่งขออนุมัติ Element', group: ASSET },
  APPROVE_DATA_ELEMENT: { th: 'อนุมัติ Data Element', group: ASSET },
  REJECT_DATA_ELEMENT_APPROVAL: { th: 'ปฏิเสธอนุมัติ Element', group: ASSET },
  DEPRECATE_DATA_ELEMENT: { th: 'เลิกใช้ Data Element', group: ASSET },
  ASSIGN_DOMAIN_COLUMNS: { th: 'ผูกคอลัมน์เข้า Element', group: ASSET },
  MAP_ELEMENT_COLUMNS: { th: 'แมปคอลัมน์ Element', group: ASSET },

  /* ---------------- ข้อมูลอ้างอิง (Reference Data — v0.31.0) ---------------- */
  CREATE_REFERENCE_SET: { th: 'สร้างทะเบียนอ้างอิง', group: ASSET },
  UPDATE_REFERENCE_SET: { th: 'แก้ไขทะเบียนอ้างอิง', group: ASSET },
  DELETE_REFERENCE_SET: { th: 'ลบทะเบียนอ้างอิง', group: ASSET },
  SUBMIT_REFERENCE_APPROVAL: { th: 'ส่งขออนุมัติทะเบียน', group: ASSET },
  APPROVE_REFERENCE_SET: { th: 'อนุมัติทะเบียนอ้างอิง', group: ASSET },
  REJECT_REFERENCE_APPROVAL: { th: 'ปฏิเสธอนุมัติทะเบียน', group: ASSET },
  DEPRECATE_REFERENCE_SET: { th: 'เลิกใช้ทะเบียนอ้างอิง', group: ASSET },
  CREATE_REFERENCE_VALUE: { th: 'เพิ่มค่าอ้างอิง', group: ASSET },
  UPDATE_REFERENCE_VALUE: { th: 'แก้ไขค่าอ้างอิง', group: ASSET },
  RETIRE_REFERENCE_VALUE: { th: 'เลิกใช้ค่าอ้างอิง', group: ASSET },
  REACTIVATE_REFERENCE_VALUE: { th: 'เปิดใช้ค่าอ้างอิงซ้ำ', group: ASSET },
  IMPORT_REFERENCE_VALUES: { th: 'นำเข้าค่าอ้างอิง (CSV)', group: ASSET },
  SCAN_REFERENCE_ORPHAN: { th: 'สแกนค่านอกทะเบียน', group: ASSET },
  SET_ELEMENT_REFERENCE: { th: 'ผูก Element กับทะเบียนอ้างอิง', group: ASSET },
  SET_MAPPING_LOOKUP_SET: { th: 'ผูก Mapping LOOKUP กับทะเบียน', group: ASSET },

  /* ------------------------------ กฎและการแมป ------------------------------ */
  CREATE_RULE: { th: 'สร้างกฎ', group: RULE },
  TOGGLE_RULE: { th: 'เปิด/ปิดกฎ', group: RULE },
  DELETE_RULE: { th: 'ลบกฎ', group: RULE },
  SET_RULE_THRESHOLD: { th: 'ตั้งเกณฑ์ผ่านของกฎ', group: RULE },
  SET_RULE_ELEMENT: { th: 'ผูกกฎกับ Element', group: RULE },
  BIND_RULE_ELEMENT: { th: 'ผูกกฎกับ Element', group: RULE },
  CREATE_CONDITION: { th: 'สร้างเงื่อนไข', group: RULE },
  UPDATE_CONDITION: { th: 'แก้ไขเงื่อนไข', group: RULE },
  DELETE_CONDITION: { th: 'ลบเงื่อนไข', group: RULE },
  TOGGLE_CONDITION: { th: 'เปิด/ปิดเงื่อนไข', group: RULE },
  CREATE_DATA_MAPPING: { th: 'สร้างการแมป', group: RULE },
  UPDATE_DATA_MAPPING: { th: 'แก้ไขการแมป', group: RULE },
  DELETE_DATA_MAPPING: { th: 'ลบการแมป', group: RULE },
  APPROVE_DATA_MAPPING: { th: 'อนุมัติการแมป', group: RULE },
  SUBMIT_DATA_MAPPING_APPROVAL: { th: 'ส่งขออนุมัติการแมป', group: RULE },
  REJECT_DATA_MAPPING_APPROVAL: { th: 'ปฏิเสธอนุมัติการแมป', group: RULE },
  SET_MAPPING_VERSION: { th: 'ตั้งเวอร์ชันการแมป', group: RULE },
  DEPRECATE_DATA_MAPPING: { th: 'เลิกใช้การแมป', group: RULE },

  /* ------------------------------ กระบวนการตรวจสอบ ------------------------------ */
  RUN_VALIDATION: { th: 'รันตรวจสอบ', group: DQ },
  RUN_DOMAIN_VALIDATION: { th: 'รันตรวจสอบรายโดเมน', group: DQ },
  UPDATE_FAILURE_STATUS: { th: 'ปรับสถานะแถวไม่ผ่าน', group: DQ },
  CREATE_ISSUE: { th: 'เปิดปัญหา', group: DQ },
  START_ISSUE: { th: 'เริ่มดำเนินการปัญหา', group: DQ },
  ASSIGN_ISSUE: { th: 'มอบหมายปัญหา', group: DQ },
  SET_ISSUE_DUE: { th: 'ตั้งวันครบกำหนดปัญหา', group: DQ },
  RESOLVE_ISSUE: { th: 'แก้ไขปัญหาแล้ว', group: DQ },
  CLOSE_ISSUE: { th: 'ปิดปัญหา', group: DQ },
  REOPEN_ISSUE: { th: 'เปิดปัญหาซ้ำ', group: DQ },
  REQUEST_EXCEPTION: { th: 'ขอข้อยกเว้น', group: DQ },
  APPROVE_EXCEPTION: { th: 'อนุมัติข้อยกเว้น', group: DQ },
  REJECT_EXCEPTION: { th: 'ปฏิเสธข้อยกเว้น', group: DQ },
  CONFIRM_SIGNAL: { th: 'ยืนยันสัญญาณ AI', group: DQ },
  DISMISS_SIGNAL: { th: 'ปัดสัญญาณ AI', group: DQ },

  /* ------------------------------ ML · สัญญาณอัจฉริยะ ------------------------------ */
  UPDATE_ML_SETTINGS: { th: 'ปรับเกณฑ์ค่าคงที่ ML', group: ML },
  CREATE_SAMPLE_PLAN: { th: 'สร้างแผนสุ่มตรวจ', group: ML },

  /* ------------------------------ ระบบ · บันทึกตรวจสอบ ------------------------------ */
  SET_AUDIT_RETENTION: { th: 'ตั้งนโยบายเก็บรักษา', group: SYSTEM },
  AUDIT_LOG_PRUNE: { th: 'ลบบันทึกตามนโยบาย', group: SYSTEM },
  EXPORT_AUDIT_LOG: { th: 'ส่งออกบันทึก', group: SYSTEM },
}

export interface AuditBadge {
  th: string
  className: string
  group: AuditGroupKey | null
}

/** แปลง action เป็น badge (ชื่อไทย + สไตล์ตามกลุ่ม) — action นอกคลัง fallback ชื่อดิบสีเทา */
export function auditBadge(action: string): AuditBadge {
  const def = AUDIT_ACTIONS[action]
  if (def) {
    return { th: def.th, className: AUDIT_GROUPS[def.group].badgeClass, group: def.group }
  }
  return { th: action, className: 'bg-muted text-muted-foreground border-border', group: null }
}

/** ขยายรายการกลุ่ม → รายการ action ทั้งหมดในกลุ่มนั้น (ใช้ที่ API ตอนกรอง) */
export function actionsOfGroups(groups: AuditGroupKey[]): string[] {
  const out: string[] = []
  for (const [action, def] of Object.entries(AUDIT_ACTIONS)) {
    if (groups.includes(def.group)) out.push(action)
  }
  return out
}
