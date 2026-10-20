import {
  ClipboardCheck,
  GitBranch,
  LayoutDashboard,
  Library,
  Play,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* View registry — แหล่งเดียวที่กำหนด "หน้าจอ" ทั้งหมดของแอป            */
/* ใช้ร่วมกันระหว่าง App Sidebar / Header / Console                   */
/* ------------------------------------------------------------------ */

/** เวอร์ชันแพลตฟอร์ม (semver) — แสดงบน sidebar/header/footer */
export const APP_VERSION = 'v0.9.0'

/** มุมมองที่อยู่ในคอนโซลคุณภาพข้อมูลหลัก (CoreFeaturesConsole) */
export type CoreViewKey = 'rules' | 'conditions' | 'run' | 'exceptions' | 'dashboard'

/** มุมมองทั้งหมดของแอป (รวม RBAC และหน้าแนะนำแพลตฟอร์ม) */
export type ViewKey = CoreViewKey | 'rbac' | 'about'

export interface ViewMeta {
  key: ViewKey
  th: string
  en: string
  desc: string
  icon: LucideIcon
}

export const VIEWS: Record<ViewKey, ViewMeta> = {
  dashboard: {
    key: 'dashboard',
    th: 'แดชบอร์ด',
    en: 'Dashboard',
    desc: 'ภาพรวมคะแนนคุณภาพข้อมูล สัญญาณ AI และสิ่งที่ต้องดำเนินการ',
    icon: LayoutDashboard,
  },
  rules: {
    key: 'rules',
    th: 'Rule Builder',
    en: 'No-code Rule Builder',
    desc: 'สร้างกฎตรวจสอบจากตัวอย่างข้อมูลจริง เลือกคอลัมน์และเงื่อนไขจากคลังส่วนกลาง',
    icon: GitBranch,
  },
  conditions: {
    key: 'conditions',
    th: 'คลังเงื่อนไข (must)',
    en: 'Condition Library',
    desc: 'เงื่อนไขส่วนกลางของระบบ สร้างครั้งเดียว ใช้ร่วมกับทุกกฎและทุกชุดข้อมูล',
    icon: Library,
  },
  run: {
    key: 'run',
    th: 'รันตรวจสอบ & สัญญาณ AI',
    en: 'Validation & ML Signals',
    desc: 'รันการตรวจสอบคุณภาพข้อมูล และทบทวนสัญญาณความผิดปกติจาก AI (ต้องมีมนุษย์ทบทวนเสมอ)',
    icon: Play,
  },
  exceptions: {
    key: 'exceptions',
    th: 'ข้อยกเว้น & การอนุมัติ',
    en: 'Exceptions & Approvals',
    desc: 'คำขอยกเว้นผลตรวจที่ต้องผ่านการอนุมัติตามบทบาท พร้อมเหตุผลและวันหมดอายุ',
    icon: ClipboardCheck,
  },
  rbac: {
    key: 'rbac',
    th: 'บทบาทและสิทธิ์',
    en: 'RBAC Console',
    desc: 'จัดการบทบาทผู้ใช้ มอบสิทธิ์เข้าถึงรายชุดข้อมูล และตรวจ Audit Trail',
    icon: ShieldCheck,
  },
  about: {
    key: 'about',
    th: 'เกี่ยวกับแพลตฟอร์ม',
    en: 'Platform Overview',
    desc: 'ภาพรวมความสามารถ มิติคุณภาพข้อมูล 9 มิติตาม DAMA-DMBOK ขั้นตอนการใช้งาน และมาตรฐานที่รองรับ',
    icon: ScrollText,
  },
}

export const CORE_VIEWS: CoreViewKey[] = ['rules', 'conditions', 'run', 'exceptions', 'dashboard']

export function isCoreView(view: ViewKey): view is CoreViewKey {
  return (CORE_VIEWS as string[]).includes(view)
}

/* กลุ่มเมนูของ sidebar — เรียงตามลำดับการใช้งานจริง */
export interface NavGroup {
  labelTh: string
  labelEn: string
  items: ViewKey[]
}

export const NAV_GROUPS: NavGroup[] = [
  { labelTh: 'ภาพรวม', labelEn: 'Overview', items: ['dashboard'] },
  {
    labelTh: 'คุณภาพข้อมูล',
    labelEn: 'Data Quality',
    items: ['rules', 'conditions', 'run', 'exceptions'],
  },
  {
    labelTh: 'การกำกับดูแล',
    labelEn: 'Governance',
    items: ['rbac', 'about'],
  },
]
