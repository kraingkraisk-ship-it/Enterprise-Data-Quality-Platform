'use client'

import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Database,
  GitBranch,
  BrainCircuit,
  ClipboardCheck,
  LayoutDashboard,
  FileSpreadsheet,
  Server,
  Globe,
  Table2,
  CheckCircle2,
  AlertTriangle,
  UserCog,
  Users,
  BarChart3,
  Lock,
  EyeOff,
  FileSearch,
  ScrollText,
  ArrowRight,
  Sparkles,
  Scale,
  History,
  Boxes,
  GaugeCircle,
  Timer,
  Link2,
  Hash,
  Ruler,
  Shapes,
  Layers,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const APP_VERSION = 'v0.2.0'

/* ---------------------------------- data ---------------------------------- */

const DIMENSIONS = [
  {
    icon: CheckCircle2,
    th: 'ความสมบูรณ์',
    en: 'Completeness',
    desc: 'ข้อมูลจำเป็นต้องมีครบถ้วนตามที่กำหนด (Completeness)',
  },
  {
    icon: Ruler,
    th: 'ความถูกต้อง',
    en: 'Accuracy',
    desc: 'ค่าข้อมูลสอดคล้องกับความจริงหรือแหล่งอ้างอิง (Accuracy)',
  },
  {
    icon: Shapes,
    th: 'ความถูกต้องตามรูปแบบ',
    en: 'Validity',
    desc: 'รูปแบบ ชนิด และช่วงค่าอยู่ในเกณฑ์ที่กำหนด (Validity)',
  },
  {
    icon: Link2,
    th: 'ความสอดคล้อง',
    en: 'Consistency',
    desc: 'ข้อมูลสอดคล้องกันทั้งระบบและข้ามระบบ (Consistency)',
  },
  {
    icon: Hash,
    th: 'ความไม่ซ้ำซ้อน',
    en: 'Uniqueness',
    desc: 'ไม่มีระเบียนซ้ำซ้อนในชุดข้อมูลเดียวกัน (Uniqueness)',
  },
  {
    icon: Timer,
    th: 'ความทันเวลา',
    en: 'Timeliness',
    desc: 'ข้อมูลอัปเดตและพร้อมใช้ตรงตามเวลาที่คาดหวัง (Timeliness)',
  },
  {
    icon: Layers,
    th: 'เอกภาพการอ้างอิง',
    en: 'Integrity Constraints',
    desc: 'ความสัมพันธ์และการอ้างอิงถูกต้องตามข้อกำหนด (Integrity)',
  },
  {
    icon: GaugeCircle,
    th: 'ปริมาณข้อมูล',
    en: 'Volume / Amount',
    desc: 'จำนวนระเบียนอยู่ในช่วงที่คาดหวัง ตรวจจับข้อมูลหาย (Volume)',
  },
  {
    icon: Boxes,
    th: 'การตรงตามโครงสร้าง',
    en: 'Schema Conformance',
    desc: 'โครงสร้างคอลัมน์และชนิดข้อมูลตรงตาม Schema (Schema Conformance)',
  },
]

const FEATURES = [
  {
    icon: GitBranch,
    title: 'Rule Builder แบบไม่ต้องเขียนโค้ด',
    en: 'No-code Rule Builder',
    desc: 'สร้างกฎตรวจสอบคุณภาพข้อมูลด้วยประโยคที่อ่านเข้าใจง่าย ไม่ต้องมีความรู้ด้าน SQL หรือการเขียนโปรแกรม',
  },
  {
    icon: BrainCircuit,
    title: 'การตรวจจับด้วย AI อย่างรับผิดชอบ',
    en: 'ML-Assisted Detection',
    desc: 'โมเดล Machine Learning ช่วยแจ้งเตือนความผิดปกติ ข้อมูลซ้ำ และการเปลี่ยนแปลงของข้อมูล — เป็นเพียง “สัญญาณ” ที่ต้องมีมนุษย์ทบทวนเสมอ',
  },
  {
    icon: ClipboardCheck,
    title: 'กระบวนการอนุมัติและข้อยกเว้น',
    en: 'Approval & Exception Workflow',
    desc: 'ข้อยกเว้นต้องผ่านการอนุมัติตามบทบาท พร้อมเหตุผลและวันหมดอายุที่ตรวจสอบย้อนหลังได้',
  },
  {
    icon: LayoutDashboard,
    title: 'แดชบอร์ดรายงานผล',
    en: 'Role-based Dashboards',
    desc: 'แดชบอร์ดแยกตามบทบาทผู้ใช้ สรุปคะแนนคุณภาพข้อมูล แนวโน้ม และรายการที่ต้องดำเนินการ',
  },
]

const RULE_PARTS = [
  { label: 'For [Dataset]', desc: 'ชุดข้อมูล' },
  { label: '[Column] must [Condition]', desc: 'เงื่อนไข' },
  { label: 'using [Parameters]', desc: 'พารามิเตอร์' },
  { label: 'when [Filter]', desc: 'ตัวกรอง (ไม่บังคับ)' },
  { label: 'otherwise mark as [Severity]', desc: 'ระดับความรุนแรง' },
]

const WORKFLOW = [
  {
    step: 1,
    title: 'อัปโหลดหรือเชื่อมต่อข้อมูล',
    en: 'Upload / Connect',
    desc: 'รองรับไฟล์ CSV, Excel และการเชื่อมต่อ PostgreSQL, MS SQL Server, REST API',
  },
  {
    step: 2,
    title: 'กำหนดกฎคุณภาพข้อมูล',
    en: 'Define Rules',
    desc: 'สร้างกฎผ่าน Rule Builder โดยเลือกชุดข้อมูล คอลัมน์ เงื่อนไข และระดับความรุนแรง',
  },
  {
    step: 3,
    title: 'รันการตรวจสอบ',
    en: 'Run Validation',
    desc: 'ระบบตรวจสอบตาม 9 มิติ พร้อมสรุปผลลัพธ์และคะแนนคุณภาพข้อมูล',
  },
  {
    step: 4,
    title: 'ทบทวนสัญญาณ AI',
    en: 'Review ML Signals',
    desc: 'ทีมวิเคราะห์ทบทวนความผิดปกติ/ข้อมูลซ้ำ/การเปลี่ยนแปลงที่ AI แจ้งเตือน ก่อนนำไปใช้',
  },
  {
    step: 5,
    title: 'อนุมัติหรือขอข้อยกเว้น',
    en: 'Approve / Exception',
    desc: 'ผู้อนุมัติตัดสินใจต่อผลลัพธ์ ข้อยกเว้นถูกบันทึกพร้อมเหตุผลและวันหมดอายุ',
  },
]

const ROLES = [
  { icon: Database, th: 'เจ้าของข้อมูล', en: 'Data Owner', desc: 'กำกับนโยบายข้อมูลและอนุมัติในความรับผิดชอบ' },
  { icon: UserCog, th: 'ผู้ดูแลข้อมูล', en: 'Data Steward', desc: 'ดูแลกฎ คุณภาพข้อมูล และข้อยกเว้นประจำวัน' },
  { icon: FileSearch, th: 'นักวิเคราะห์คุณภาพข้อมูล', en: 'DQ Analyst', desc: 'ทบทวนผลตรวจและสัญญาณ AI วิเคราะห์สาเหตุ' },
  { icon: Server, th: 'วิศวกรข้อมูล', en: 'Data Engineer', desc: 'จัดการแหล่งข้อมูล การนำเข้า และประสิทธิภาพ' },
  { icon: Scale, th: 'เจ้าหน้าที่กำกับดูแล', en: 'Compliance Officer', desc: 'ตรวจสอบการปฏิบัติตาม PDPA และข้อกำหนด' },
  { icon: Users, th: 'ผู้ใช้งานทั่วไป', en: 'Business User', desc: 'ใช้ข้อมูลที่ผ่านการตรวจสอบแล้วในงานของตน' },
  { icon: BarChart3, th: 'ผู้บริหาร', en: 'Executive', desc: 'ติดตามภาพรวมคุณภาพข้อมูลขององค์กร' },
  { icon: Lock, th: 'ผู้ดูแลระบบ', en: 'System Administrator', desc: 'จัดการผู้ใช้ สิทธิ์การเข้าถึง และการตั้งค่าระบบ' },
]

const SECURITY = [
  {
    icon: EyeOff,
    title: 'ปิดบังข้อมูลส่วนบุคคลเป็นค่าเริ่มต้น',
    en: 'PII Masking by Default',
    desc: 'ข้อมูลที่ระบุตัวตนได้ถูกปกปิดตามค่าเริ่มต้น สอดคล้อง พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)',
  },
  {
    icon: Lock,
    title: 'แยกการเข้าถึงรายชุดข้อมูล',
    en: 'Dataset-level Isolation',
    desc: 'ชุดข้อมูลที่ไม่ได้รับอนุญาตจะมองไม่เห็นทั้งหมด — การเข้าถึงกำหนดผ่านบทบาท (RBAC)',
  },
  {
    icon: History,
    title: 'ตรวจสอบย้อนหลังได้ทุกการเปลี่ยนแปลง',
    en: 'Full Audit Trail',
    desc: 'ทุกการกระทำถูกบันทึกเวลาและผู้ใช้ สร้างรายงานการตรวจสอบได้ตลอดเวลา',
  },
  {
    icon: ShieldCheck,
    title: 'ไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ',
    en: 'No Auto-fix Source Data',
    desc: 'ระบบตรวจสอบและแจ้งเตือนเท่านั้น การแก้ไขข้อมูลต้นทางต้องเป็นการตัดสินใจของมนุษย์',
  },
]

const SOURCES = [
  { icon: Table2, name: 'CSV' },
  { icon: FileSpreadsheet, name: 'Excel' },
  { icon: Database, name: 'PostgreSQL' },
  { icon: Server, name: 'MS SQL Server' },
  { icon: Globe, name: 'REST API' },
]

const STANDARDS = ['ISO 8000', 'ISO/IEC 25012', 'DAMA-DMBOK', 'DCAM', 'BCBS 239', 'PDPA (TH)']

/* --------------------------------- page ----------------------------------- */

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-background to-background">
      {/* ------------------------------ header ------------------------------ */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="#hero" className="flex min-w-0 items-center gap-2.5" aria-label="หน้าแรก Enterprise Data Quality Platform">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight sm:text-base">
                Enterprise Data Quality Platform
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                แพลตฟอร์มบริหารคุณภาพข้อมูลระดับองค์กร
              </span>
            </span>
          </a>
          <nav aria-label="เมนูหลัก" className="hidden items-center gap-1 md:flex">
            {[
              { href: '#dimensions', label: 'มิติคุณภาพ' },
              { href: '#features', label: 'ฟีเจอร์หลัก' },
              { href: '#workflow', label: 'ขั้นตอนการใช้งาน' },
              { href: '#roles', label: 'บทบาทผู้ใช้' },
              { href: '#security', label: 'ความปลอดภัย' },
            ].map((item) => (
              <Button key={item.href} variant="ghost" size="sm" asChild>
                <a href={item.href}>{item.label}</a>
              </Button>
            ))}
          </nav>
          <Badge variant="outline" className="shrink-0 font-mono text-xs text-emerald-700 border-emerald-300 bg-emerald-50">
            {APP_VERSION}
          </Badge>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* ------------------------------- hero ------------------------------ */}
        <section id="hero" aria-labelledby="hero-title" className="relative overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <Badge variant="secondary" className="mb-4 gap-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                <Sparkles className="size-3.5" aria-hidden="true" />
                ระบบพร้อมใช้งาน · System Ready
              </Badge>
              <h1 id="hero-title" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                บริหารคุณภาพข้อมูลองค์กร
                <span className="block text-emerald-700">อย่างถูกต้อง ตรวจสอบได้ ปลอดภัย</span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                Enterprise Data Quality Platform ช่วยตรวจสอบคุณภาพข้อมูลครบทั้ง 9 มิติ
                สร้างกฎแบบไม่ต้องเขียนโค้ด พร้อม AI ช่วยแจ้งเตือนความผิดปกติที่ต้องผ่านการทบทวนโดยมนุษย์เสมอ
                ปฏิบัติตาม PDPA และมาตรฐานสากล
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button size="lg" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" asChild>
                  <a href="#workflow">
                    เริ่มต้นใช้งาน
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#features">ดูฟีเจอร์หลัก</a>
                </Button>
              </div>
              <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { value: '9', label: 'มิติคุณภาพข้อมูล', en: 'DQ Dimensions' },
                  { value: '8', label: 'บทบาทผู้ใช้', en: 'User Roles' },
                  { value: '23', label: 'ฟังก์ชันหลัก', en: 'Core Functions' },
                  { value: '5', label: 'แหล่งข้อมูลรองรับ', en: 'Data Sources' },
                ].map((stat) => (
                  <div key={stat.en} className="rounded-xl border bg-card p-4 shadow-sm">
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-2xl font-bold text-emerald-700 sm:text-3xl">{stat.value}</span>
                      <span className="mt-1 block text-xs font-medium text-foreground">{stat.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{stat.en}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>

            {/* rule builder preview card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
              className="lg:justify-self-end lg:w-full lg:max-w-md"
            >
              <Card className="border-emerald-200/70 shadow-lg shadow-emerald-100/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-4 text-emerald-700" aria-hidden="true" />
                    <CardTitle className="text-base">ตัวอย่าง Rule Builder</CardTitle>
                  </div>
                  <CardDescription>สร้างกฎด้วยประโยคธรรมชาติ ไม่ต้องเขียนโค้ด</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg bg-slate-900 p-4 font-mono text-[13px] leading-relaxed text-emerald-300">
                    For <span className="text-amber-300">[Dataset]</span>,{' '}
                    <span className="text-amber-300">[Column]</span> must{' '}
                    <span className="text-amber-300">[Condition]</span> using{' '}
                    <span className="text-amber-300">[Parameters]</span> when{' '}
                    <span className="text-amber-300">[Optional filter]</span>, otherwise mark as{' '}
                    <span className="text-amber-300">[Severity]</span>
                  </div>
                  <ul className="space-y-2">
                    {RULE_PARTS.map((part) => (
                      <li key={part.label} className="flex items-start gap-2 text-sm">
                        <code className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs text-emerald-800 border border-emerald-200">
                          {part.label}
                        </code>
                        <span className="text-muted-foreground">{part.desc}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        <Separator className="max-w-6xl mx-auto" />

        {/* --------------------------- dimensions ---------------------------- */}
        <section id="dimensions" aria-labelledby="dimensions-title" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
          <div className="mb-8 max-w-2xl">
            <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">9 Dimensions</Badge>
            <h2 id="dimensions-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              ครอบคลุมมิติคุณภาพข้อมูลครบทั้ง 9 มิติ
            </h2>
            <p className="mt-2 text-muted-foreground">
              อ้างอิงมาตรฐาน ISO/IEC 25012 และ DAMA-DMBOK ตรวจสอบได้ทุกมิติในการรันครั้งเดียว
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DIMENSIONS.map((d) => (
              <Card key={d.en} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                      <d.icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <div>
                      <CardTitle className="text-sm">{d.th}</CardTitle>
                      <CardDescription className="text-xs">{d.en}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{d.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ----------------------------- features ---------------------------- */}
        <section id="features" aria-labelledby="features-title" className="border-y bg-emerald-50/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
            <div className="mb-8 max-w-2xl">
              <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">Core Features</Badge>
              <h2 id="features-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
                ฟีเจอร์หลักของแพลตฟอร์ม
              </h2>
              <p className="mt-2 text-muted-foreground">
                ออกแบบตามหลัก Data Governance — มนุษย์คือผู้ตัดสินใจสุดท้าย ระบบช่วยตรวจสอบและแจ้งเตือน
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {FEATURES.map((f) => (
                <Card key={f.en} className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <f.icon className="size-5" aria-hidden="true" />
                      </span>
                      <div>
                        <CardTitle className="text-base">{f.title}</CardTitle>
                        <CardDescription className="text-xs">{f.en}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-6 rounded-xl border bg-card p-4 sm:p-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Database className="size-4 text-emerald-700" aria-hidden="true" />
                แหล่งข้อมูลที่รองรับ (Supported Data Sources)
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {SOURCES.map((s) => (
                  <span
                    key={s.name}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-medium"
                  >
                    <s.icon className="size-4 text-emerald-700" aria-hidden="true" />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------- workflow ---------------------------- */}
        <section id="workflow" aria-labelledby="workflow-title" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
          <div className="mb-8 max-w-2xl">
            <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">Workflow</Badge>
            <h2 id="workflow-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              ขั้นตอนการใช้งาน 5 ขั้นตอน
            </h2>
            <p className="mt-2 text-muted-foreground">จากข้อมูลดิบสู่ข้อมูลที่ผ่านการรับรองคุณภาพ พร้อมตรวจสอบย้อนหลังได้ทุกจุด</p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {WORKFLOW.map((w) => (
              <li key={w.step}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <span
                      className="flex size-8 items-center justify-center rounded-full bg-emerald-600 font-mono text-sm font-bold text-white"
                      aria-hidden="true"
                    >
                      {w.step}
                    </span>
                    <CardTitle className="pt-1 text-sm leading-snug">{w.title}</CardTitle>
                    <CardDescription className="text-xs">{w.en}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{w.desc}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              <strong>ข้อควรทราบ:</strong> ผลการตรวจจับของ AI/ML เป็นเพียง &ldquo;สัญญาณ&rdquo; ที่ต้องผ่านการทบทวนโดยมนุษย์เสมอ
              และระบบจะไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ — ทุกการดำเนินการต้องมีมนุษย์อนุมัติ
            </p>
          </div>
        </section>

        {/* ------------------------------- roles ------------------------------ */}
        <section id="roles" aria-labelledby="roles-title" className="border-y bg-emerald-50/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
            <div className="mb-8 max-w-2xl">
              <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">8 User Roles</Badge>
              <h2 id="roles-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
                บทบาทผู้ใช้และสิทธิ์การเข้าถึง
              </h2>
              <p className="mt-2 text-muted-foreground">
                แต่ละบทบาทมีหน้าจอเฉพาะของตนเอง (Role-based Workspace) ตามหลักการให้สิทธิ์น้อยที่สุด
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((r) => (
                <Card key={r.en} className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                        <r.icon className="size-4.5" aria-hidden="true" />
                      </span>
                      <div>
                        <CardTitle className="text-sm">{r.th}</CardTitle>
                        <CardDescription className="text-xs">{r.en}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{r.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------- security ---------------------------- */}
        <section id="security" aria-labelledby="security-title" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
          <div className="mb-8 max-w-2xl">
            <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">Security & Governance</Badge>
            <h2 id="security-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              ความปลอดภัยและการกำกับดูแลข้อมูล
            </h2>
            <p className="mt-2 text-muted-foreground">
              ออกแบบตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) และมาตรฐานสากลด้านการจัดการข้อมูล
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {SECURITY.map((s) => (
              <Card key={s.en} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-slate-900 text-emerald-300">
                      <s.icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <CardTitle className="text-base">{s.title}</CardTitle>
                      <CardDescription className="text-xs">{s.en}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6 rounded-xl border bg-card p-4 sm:p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ScrollText className="size-4 text-emerald-700" aria-hidden="true" />
              มาตรฐานที่รองรับ (Supported Standards)
            </h3>
            <div className="flex flex-wrap gap-2">
              {STANDARDS.map((std) => (
                <Badge key={std} variant="secondary" className="font-medium">
                  {std}
                </Badge>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------ footer ------------------------------ */}
      <footer className="mt-auto border-t bg-slate-900 text-slate-300 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <ShieldCheck className="size-4.5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Enterprise Data Quality Platform</p>
              <p className="text-xs text-slate-400">แพลตฟอร์มบริหารคุณภาพข้อมูลระดับองค์กร</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span className="font-mono text-emerald-400">{APP_VERSION}</span>
            <Separator orientation="vertical" className="hidden h-3 bg-slate-700 sm:block" />
            <span>ตรวจสอบย้อนหลังได้ 100% · Full Audit Trail</span>
            <Separator orientation="vertical" className="hidden h-3 bg-slate-700 sm:block" />
            <span>PDPA Ready</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
