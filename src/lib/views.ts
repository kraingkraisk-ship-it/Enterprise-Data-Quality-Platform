import {
  ClipboardList,
  Crown,
  FileUp,
  FileWarning,
  FolderTree,
  Gauge,
  GitBranch,
  LayoutDashboard,
  Library,
  ListChecks,
  PackageSearch,
  Play,
  Printer,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* View registry — แหล่งเดียวที่กำหนด "หน้าจอ" ทั้งหมดของแอป            */
/* ใช้ร่วมกันระหว่าง App Sidebar / Header / Console                   */
/* ------------------------------------------------------------------ */

/** เวอร์ชันแพลตฟอร์ม (semver) — แสดงบน sidebar/header/footer */
export const APP_VERSION = 'v0.20.0'

/**
 * มุมมองภายในคอนโซลคุณภาพข้อมูล (CoreFeaturesConsole)
 * - 'rules' / 'conditions' — ใช้ภายในโหมด DQ Rule Library (กดสลับแท็บภายใน)
 * - 'run' — ใช้เป็นเนื้อหาของหน้า Validation Results
 * - 'dashboard' — หน้าตรง
 * (v0.13.0 — 'exceptions' ย้ายไปเป็นแท็บของหน้า DQ Issues แล้ว)
 */
export type CoreViewKey = 'rules' | 'conditions' | 'run' | 'dashboard'

/** มุมมองของโมดูล Data Asset */
export type AssetViewKey = 'asset-import' | 'asset-inventory' | 'asset-domain'

/** มุมมองระดับผู้บริหาร (v0.17.0) — จำกัดสิทธิ์ตาม VIEW_EXEC_DASHBOARD */
export type ExecViewKey = 'exec-dashboard' | 'exec-reports'

/** มุมมองหน้าใหม่ของโมดูล Data Quality */
export type DqViewKey = 'scorecard' | 'rule-library' | 'profiling' | 'validation-results' | 'failed-records' | 'issues'

/** มุมมองทั้งหมดของแอป (รวม Data Asset, RBAC และหน้าแนะนำแพลตฟอร์ม) */
export type ViewKey = CoreViewKey | AssetViewKey | DqViewKey | ExecViewKey | 'rbac' | 'about'

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
    th: 'DQ แดชบอร์ด',
    en: 'DQ Dashboard',
    desc: '5 ส่วน: ภาพรวมคุณภาพข้อมูล · รายละเอียดการตรวจ · Regulation · Risk · Data Classification',
    icon: LayoutDashboard,
  },
  'exec-dashboard': {
    key: 'exec-dashboard',
    th: 'แดชบอร์ดผู้บริหาร',
    en: 'Executive Dashboard',
    desc: 'ภาพรวมระดับบริหาร 7 ส่วน: คะแนนรวม · คะแนนราย Data Domain (Element Rollup 4 ระดับ) · กฎผ่าน/ไม่ผ่าน · Critical Issues · แนวโน้ม 30/90/180/365 วัน · กฎต่ำกว่าเกณฑ์ · ปัญหาเกินกำหนด',
    icon: Crown,
  },
  'exec-reports': {
    key: 'exec-reports',
    th: 'รายงานผู้บริหาร',
    en: 'Executive Reports',
    desc: 'พิมพ์/บันทึกรายงานแดชบอร์ดผู้บริหารเป็น PDF สำหรับประชุม — เลือกช่วงเวลาและสิทธิ์ตาม RBAC',
    icon: Printer,
  },
  scorecard: {
    key: 'scorecard',
    th: 'บัตรคะแนน DQ',
    en: 'DQ Scorecard',
    desc: 'คะแนนคุณภาพข้อมูลรายชุดข้อมูลครบ 9 มิติ DAMA-DMBOK พร้อมเกรด แนวโน้ม 30 วัน และมิติที่อ่อนที่สุด',
    icon: Gauge,
  },
  'rule-library': {
    key: 'rule-library',
    th: 'คลังกฎตรวจสอบ',
    en: 'DQ Rule Library',
    desc: 'สร้างกฎแบบทีละขั้น 4 ขั้น (เป้าหมาย → คอลัมน์ → เงื่อนไข → ตั้งค่า) · จัดการกฎที่มี · คลังเงื่อนไข (must) ส่วนกลาง',
    icon: Library,
  },
  profiling: {
    key: 'profiling',
    th: 'โปรไฟล์ข้อมูล',
    en: 'Data Profiling',
    desc: 'สำรวจลักษณะข้อมูลจริงรายคอลัมน์: ค่าว่าง ความไม่ซ้ำ ช่วงค่า ค่าที่พบบ่อย และการแจ้งเตือน PII (อ่านอย่างเดียว)',
    icon: ScanSearch,
  },
  'validation-results': {
    key: 'validation-results',
    th: 'ผลการตรวจสอบ',
    en: 'Validation Results',
    desc: 'รันตรวจสอบและเจาะดูผลรายรอบ (batch) คำตัดสินตามมาตรา 1–9 และทบทวนสัญญาณ AI',
    icon: ClipboardList,
  },
  'failed-records': {
    key: 'failed-records',
    th: 'ข้อมูลที่ไม่ผ่าน',
    en: 'Failed Records',
    desc: 'รายการข้อมูลรายแถวที่ไม่ผ่านการตรวจ พร้อมเหตุผล สถานะการจัดการ และ PII masking ตามบทบาท',
    icon: FileWarning,
  },
  issues: {
    key: 'issues',
    th: 'ปัญหาคุณภาพข้อมูล',
    en: 'DQ Issues',
    desc: 'ทะเบียนปัญหาพร้อม lifecycle: เปิด → ดำเนินการ → แก้ไขแล้ว → ปิดโดยผู้อนุมัติ พร้อมแท็บข้อยกเว้น & การอนุมัติ',
    icon: ListChecks,
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
    th: 'ผลการตรวจสอบ',
    en: 'Validation Results',
    desc: 'รันการตรวจสอบคุณภาพข้อมูล และทบทวนสัญญาณความผิดปกติจาก AI (ต้องมีมนุษย์ทบทวนเสมอ)',
    icon: Play,
  },
  'asset-import': {
    key: 'asset-import',
    th: 'นำเข้าข้อมูล',
    en: 'Import Data',
    desc: 'นำเข้าข้อมูลจากไฟล์ CSV, ไฟล์ JSON หรือฐานข้อมูล พร้อมตั้งชื่อ Data Asset ได้เอง',
    icon: FileUp,
  },
  'asset-inventory': {
    key: 'asset-inventory',
    th: 'คลังข้อมูล',
    en: 'Data Inventory',
    desc: 'รายการข้อมูลที่นำเข้ามาทั้งหมด กรองตามโดเมนข้อมูล พร้อมสำรวจคอลัมน์ พรีวิวข้อมูล และค้นหา',
    icon: PackageSearch,
  },
  'asset-domain': {
    key: 'asset-domain',
    th: 'Data Domain',
    en: 'Data Domain · Element · Meta',
    desc: 'โครงสร้าง 4 ระดับ: Data Domain > Sub Data Domain > Data Element > Meta Data (ISO/IEC 11179) — Meta Data 4 กลุ่ม (Business/Technical/Operational/Governance) กรอกครั้งเดียวต่อ element + ธง CDE/การเงิน + workflow อนุมัติ (บันทึกผู้อนุมัติ+Audit Trail) + แมปคอลัมน์จริงจากคลังข้อมูล',
    icon: FolderTree,
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

export const CORE_VIEWS: CoreViewKey[] = ['rules', 'conditions', 'run', 'dashboard']

export function isCoreView(view: ViewKey): view is CoreViewKey {
  return (CORE_VIEWS as string[]).includes(view)
}

/** หน้าที่เรนเดอร์ผ่าน CoreFeaturesConsole โหมดเต็ม (แดชบอร์ด / ผลการตรวจ) */
export function isConsoleView(view: ViewKey): view is CoreViewKey {
  return view === 'dashboard' || view === 'run' || view === 'validation-results'
}

/* กลุ่มเมนูของ sidebar — เรียงตามลำดับการใช้งานจริง
   โครงสร้าง Data Quality แบบ enterprise (v0.13.0)
   — Alerts จะเพิ่มในเวอร์ชันถัดไป (v0.14.0) */
export interface NavGroup {
  labelTh: string
  labelEn: string
  items: ViewKey[]
}

export const NAV_GROUPS: NavGroup[] = [
  { labelTh: 'ภาพรวม', labelEn: 'Overview', items: ['dashboard', 'exec-dashboard', 'exec-reports'] },
  {
    labelTh: 'Data Asset',
    labelEn: 'สินทรัพย์ข้อมูล',
    items: ['asset-import', 'asset-inventory', 'asset-domain'],
  },
  {
    labelTh: 'คุณภาพข้อมูล',
    labelEn: 'Data Quality',
    items: ['scorecard', 'rule-library', 'profiling', 'validation-results', 'failed-records', 'issues'],
  },
  {
    labelTh: 'การกำกับดูแล',
    labelEn: 'Governance',
    items: ['rbac', 'about'],
  },
]
