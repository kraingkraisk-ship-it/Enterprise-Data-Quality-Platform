// Left-navigation data, kept separate from the shell so it can be reused by
// tests, the mobile sheet and any future command palette.
import type { LucideIcon } from 'lucide-react'
import {
  Activity, Brain, CircleAlert, CirclePlay, Database, FileChartColumn, History,
  LayoutDashboard, Library, ListChecks, ScanSearch, Settings, ShieldCheck, Sparkles, Workflow, Gauge,
} from 'lucide-react'
import type { ViewKey } from '@/lib/types'

export interface NavItem {
  view: ViewKey
  icon: LucideIcon
  labelEn: string
  labelTh: string
}

export interface NavGroup {
  groupEn: string
  groupTh: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    groupEn: 'Overview',
    groupTh: 'ภาพรวม',
    items: [
      { view: 'dashboard-executive', icon: LayoutDashboard, labelEn: 'Executive', labelTh: 'ผู้บริหาร' },
      { view: 'dashboard-operational', icon: Gauge, labelEn: 'Operational', labelTh: 'ปฏิบัติการ' },
      { view: 'dashboard-engineering', icon: Workflow, labelEn: 'Data Engineering', labelTh: 'วิศวกรรมข้อมูล' },
      { view: 'dashboard-ml', icon: Activity, labelEn: 'ML Monitoring', labelTh: 'ติดตามโมเดล ML' },
      { view: 'dashboard-audit', icon: ShieldCheck, labelEn: 'Audit', labelTh: 'การตรวจสอบ' },
    ],
  },
  {
    groupEn: 'Data',
    groupTh: 'ข้อมูล',
    items: [
      { view: 'data-sources', icon: Database, labelEn: 'Data Sources', labelTh: 'แหล่งข้อมูล' },
      { view: 'catalogue', icon: Library, labelEn: 'Dataset Catalogue', labelTh: 'แคตตาล็อกชุดข้อมูล' },
      { view: 'profiling', icon: ScanSearch, labelEn: 'Profiling', labelTh: 'การวิเคราะห์ข้อมูล' },
    ],
  },
  {
    groupEn: 'Quality',
    groupTh: 'คุณภาพข้อมูล',
    items: [
      { view: 'rules', icon: ListChecks, labelEn: 'Rules', labelTh: 'กฎคุณภาพ' },
      { view: 'validations', icon: CirclePlay, labelEn: 'Validation Runs', labelTh: 'การรันตรวจสอบ' },
      { view: 'anomalies', icon: Sparkles, labelEn: 'Anomalies', labelTh: 'ความผิดปกติ' },
      { view: 'issues', icon: CircleAlert, labelEn: 'Issues', labelTh: 'ปัญหาข้อมูล' },
    ],
  },
  {
    groupEn: 'Intelligence',
    groupTh: 'อัจฉริยะภาพ',
    items: [
      { view: 'ml-models', icon: Brain, labelEn: 'ML Models', labelTh: 'โมเดล ML' },
    ],
  },
  {
    groupEn: 'Governance',
    groupTh: 'ธรรมาภิบาลข้อมูล',
    items: [
      { view: 'reports', icon: FileChartColumn, labelEn: 'Reports', labelTh: 'รายงาน' },
      { view: 'audit-logs', icon: History, labelEn: 'Audit Logs', labelTh: 'บันทึกการตรวจสอบ' },
      { view: 'administration', icon: Settings, labelEn: 'Administration', labelTh: 'การจัดการระบบ' },
    ],
  },
]

/** Every view reachable from the primary navigation. */
export const NAV_VIEWS: ViewKey[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.view))
