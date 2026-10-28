'use client'

import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Database,
  GitBranch,
  BrainCircuit,
  ClipboardCheck,
  LayoutDashboard,
  Server,
  Braces,
  BookMarked,
  Waypoints,
  Table2,
  AlertTriangle,
  Lock,
  EyeOff,
  ScrollText,
  ArrowRight,
  Sparkles,
  History,
  PackageSearch,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DIMENSION_ICONS } from '@/components/dimension-picker'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DIMENSION_ENGINES, DIMENSION_KEYS, DIMENSION_META, CONDITIONS } from '@/lib/dq'
import type { ViewKey } from '@/lib/views'

/* ---------------------------------- data ---------------------------------- */

/** มิติคุณภาพข้อมูล 9 มิติตาม DAMA-DMBOK — derive จากแหล่งเดียว (lib/dq.ts) */
const DIMENSIONS = DIMENSION_KEYS.map((key) => ({
  key,
  icon: DIMENSION_ICONS[key],
  th: DIMENSION_META[key].th,
  en: DIMENSION_META[key].en,
  desc: DIMENSION_META[key].description,
  badgeClass: DIMENSION_META[key].badgeClass,
  engines: DIMENSION_ENGINES[key].map((e) => CONDITIONS[e].th),
}))

const FEATURES = [
  {
    icon: PackageSearch,
    title: 'สินทรัพย์ข้อมูลครบวงจร',
    en: 'Data Asset · Domain · Inventory',
    desc:
      'นำเข้า CSV / JSON / ฐานข้อมูล เก็บเป็นคลังข้อมูลพร้อมพรีวิว แล้วจัดโครงสร้าง 4 ระดับ (Data Domain > Sub Domain > Data Element > Meta Data) ตามมาตรฐาน ISO/IEC 11179 พร้อมธง CDE และ workflow อนุมัติ',
  },
  {
    icon: BookMarked,
    title: 'ข้อมูลอ้างอิงศูนย์กลาง',
    en: 'Reference Data (v0.31.0)',
    desc:
      'ทะเบียนค่ามาตรฐาน (สกุลเงิน ISO 4217 กลุ่มลูกค้า ฯลฯ) แก้ที่ต้นทางจุดเดียว — กฎ IN_LIST / REFERENCE_MATCH โหมดทะเบียนใช้ค่าใหม่ทันทีโดยไม่ต้องแก้กฎ (anti-drift) พร้อมสแกนค่านอกทะเบียนและนำเข้า/ส่งออก CSV',
  },
  {
    icon: Waypoints,
    title: 'การแมปข้อมูลและ Lineage',
    en: 'Data Mapping & Lineage',
    desc:
      'เส้นเชื่อม Element ต้นทาง→ปลายทางข้ามระบบ/ข้ามโดเมน พร้อมแผนผังหลายขั้น (DIRECT / TRANSFORM / DERIVED / AGGREGATE / LOOKUP) และ workflow อนุมัติแบบเดียวกับ Data Element',
  },
  {
    icon: GitBranch,
    title: 'Rule Builder แบบไม่ต้องเขียนโค้ด',
    en: 'No-code Rule Builder',
    desc:
      'สร้างกฎตรวจสอบแบบทีละขั้น 4 ขั้น (เป้าหมาย → คอลัมน์ → เงื่อนไข → ตั้งค่า) เป็นประโยคที่อ่านเข้าใจง่าย ใช้เงื่อนไขจากคลังกลาง 10 เงื่อนไข — ไม่ต้องมีความรู้ SQL',
  },
  {
    icon: BrainCircuit,
    title: 'ศูนย์ ML — AI อย่างรับผิดชอบ',
    en: 'ML Center · Responsible AI',
    desc:
      '4 โมเดลช่วยตัดสินใจ: ความผิดปกติข้ามรอบ · สาเหตุร่วม · พยากรณ์แนวโน้ม · แผนสุ่มตรวจ พร้อมปรับเกณฑ์ค่าคงที่จากการใช้งานจริง — เป็นเพียง “สัญญาณ” ที่ต้องมีมนุษย์ทบทวนเสมอ',
  },
  {
    icon: ClipboardCheck,
    title: 'กระบวนการอนุมัติและข้อยกเว้น',
    en: 'Approval & Exception Workflow',
    desc:
      'ข้อยกเว้นและข้อมูลอ้างอิง/Element/Mapping ต้องผ่านการอนุมัติตามบทบาท พร้อมเหตุผล ผู้ดำเนินการ และวันหมดอายุที่ตรวจสอบย้อนหลังได้',
  },
  {
    icon: LayoutDashboard,
    title: 'แดชบอร์ดโปร่งใสตามบทบาท',
    en: 'Role-based Dashboards',
    desc:
      'DQ แดชบอร์ด 5 หมวด + บัตรคะแนนรายชุดครบ 9 มิติ + แดชบอร์ดผู้บริหาร (ตามสิทธิ์) — คะแนนแสดงสองฐานชัดเจน: เฉลี่ยเฉพาะที่เคยตรวจ และรวมทุกชุด (v0.32.0)',
  },
  {
    icon: ShieldCheck,
    title: 'การกำกับดูแลและตรวจสอบย้อนหลัง',
    en: 'Governance · RBAC · Audit',
    desc:
      'บทบาทและสิทธิ์ deny-by-default รายชุดข้อมูล · ศูนย์บันทึกตรวจสอบกรอง/ค้นหา/ส่งออก CSV · ประเมินความสอดคล้องรายมาตรฐาน (Inherent → Residual)',
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
    title: 'นำเข้าข้อมูล',
    en: 'Import Data',
    desc: 'ไฟล์ CSV ตรวจตัวคั่นอัตโนมัติ · ไฟล์ JSON รองรับอาร์เรย์/วัตถุซ้อน · ฐานข้อมูล MySQL/PostgreSQL (อ่านเฉพาะ SELECT)',
  },
  {
    step: 2,
    title: 'จัดโครงสร้างสินทรัพย์ข้อมูล',
    en: 'Structure Assets',
    desc: 'จัด Data Domain 4 ระดับตาม ISO/IEC 11179 ผูกทะเบียนข้อมูลอ้างอิง และแมป lineage ข้ามระบบ — ทุกอันผ่าน workflow อนุมัติ',
  },
  {
    step: 3,
    title: 'สร้างกฎคุณภาพข้อมูล',
    en: 'Define Rules',
    desc: 'สร้างกฎแบบทีละขั้น 4 ขั้นผ่าน Rule Builder เลือกเงื่อนไขจากคลังกลาง ระบุความรุนแรงและตัวกรองได้',
  },
  {
    step: 4,
    title: 'รันการตรวจสอบ',
    en: 'Run Validation',
    desc: 'ระบบตรวจตาม 9 มิติ รายรอบ (batch) สรุปผลและคะแนนรายมิติ — ชุดข้อมูล 0 แถวถือ NO_DATA ไม่ผ่านโดยปริยาย',
  },
  {
    step: 5,
    title: 'ทบทวนสัญญาณ AI และจัดการผล',
    en: 'Review & Handle Results',
    desc: 'ทีมวิเคราะห์ทบทวนสัญญาณจากศูนย์ ML ดูรายแถวที่ไม่ผ่าน (PII ถูกปิดบังตามบทบาท) และบริหารปัญหา/ข้อยกเว้นพร้อมอนุมัติ',
  },
  {
    step: 6,
    title: 'ติดตามและกำกับดูแล',
    en: 'Monitor & Govern',
    desc: 'แดชบอร์ดคะแนน 2 ฐาน บัตรคะแนน 9 มิติ ประเมินความสอดคล้องรายมาตรฐาน และศูนย์บันทึกตรวจสอบส่งออกได้',
  },
]

const SECURITY = [
  {
    icon: EyeOff,
    title: 'ปิดบังข้อมูลส่วนบุคคลเป็นค่าเริ่มต้น',
    en: 'PII Masking by Default',
    desc: 'ข้อมูลที่ระบุตัวตนได้ถูกปกปิดตามบทบาทของผู้ใช้ปัจจุบัน สอดคล้อง พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)',
  },
  {
    icon: Lock,
    title: 'แยกการเข้าถึงรายชุดข้อมูล',
    en: 'Dataset-level Isolation',
    desc: 'ชุดข้อมูลที่ไม่ได้รับอนุญาตจะมองไม่เห็นทั้งหมด — สิทธิ์กำหนดผ่านบทบาท 8 บทบาท (RBAC) แบบ deny-by-default ตรวจสอบที่ API ทุกคำขอ',
  },
  {
    icon: History,
    title: 'ตรวจสอบย้อนหลังได้ทุกการเปลี่ยนแปลง',
    en: 'Full Audit Trail',
    desc: 'ทุกการกระทำถูกบันทึกเวลาและผู้ใช้ปัจจุบัน ค้นดู/กรอง/ส่งออก CSV ได้จากศูนย์บันทึกตรวจสอบ พร้อมนโยบายเก็บรักษา (meta-audit)',
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
  { icon: Braces, name: 'JSON' },
  { icon: Database, name: 'MySQL' },
  { icon: Server, name: 'PostgreSQL' },
]

const STANDARDS = ['ISO 8000', 'ISO/IEC 25012', 'ISO/IEC 11179', 'DAMA-DMBOK', 'DCAM', 'BCBS 239', 'PDPA (TH)']

/* -------------------------------- component ------------------------------- */

interface PlatformOverviewProps {
  onNavigate: (view: ViewKey) => void
}

export function PlatformOverview({ onNavigate }: PlatformOverviewProps) {
  return (
    <div className="space-y-10">
      {/* ------------------------------- hero ------------------------------ */}
      <section id="hero" aria-labelledby="hero-title" className="relative overflow-hidden rounded-xl border bg-gradient-to-b from-emerald-50/60 to-background p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Badge variant="secondary" className="mb-4 gap-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              <Sparkles className="size-3.5" aria-hidden="true" />
              ระบบพร้อมใช้งาน · System Ready
            </Badge>
            <h1 id="hero-title" className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
              บริหารคุณภาพข้อมูลองค์กร
              <span className="block text-emerald-700">อย่างถูกต้อง ตรวจสอบได้ ปลอดภัย</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">
              Enterprise Data Quality Platform ครบทั้งวงจร: นำเข้าและจัดโครงสร้างสินทรัพย์ข้อมูล (Data Domain · ข้อมูลอ้างอิง · Lineage)
              ตรวจสอบคุณภาพครบ 9 มิติด้วยกฎแบบไม่ต้องเขียนโค้ด พร้อม AI ช่วยแจ้งเตือนที่ต้องผ่านการทบทวนโดยมนุษย์เสมอ
              ทุกการเปลี่ยนแปลงบันทึกตรวจสอบย้อนหลังได้ ปฏิบัติตาม PDPA และมาตรฐานสากล
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onNavigate('rule-library')}>
                เริ่มสร้างกฎคุณภาพข้อมูล
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => onNavigate('dashboard')}>
                ไปที่แดชบอร์ด
              </Button>
            </div>
            <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { value: '9', label: 'มิติคุณภาพข้อมูล', en: 'DQ Dimensions' },
                { value: '8', label: 'บทบาทผู้ใช้', en: 'User Roles' },
                { value: '10', label: 'เงื่อนไขตรวจสอบกลาง', en: 'Shared Conditions' },
                { value: '4', label: 'แหล่งข้อมูลรองรับ', en: 'Data Sources' },
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
            className="lg:w-full lg:max-w-md lg:justify-self-end"
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
                      <code className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-xs text-emerald-800">
                        {part.label}
                      </code>
                      <span className="text-muted-foreground">{part.desc}</span>
                    </li>
                  ))}
                </ul>
                <p className="rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-[11px] text-emerald-900">
                  เงื่อนไข IN_LIST / REFERENCE_MATCH มี “โหมดทะเบียน” — พารามิเตอร์จะระบุ [ทะเบียน: ชื่อทะเบียน]
                  ให้ใช้ค่าจากข้อมูลอ้างอิงศูนย์กลาง (แก้ที่ทะเบียน กฎใช้ใหม่ทันที)
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* --------------------------- dimensions ---------------------------- */}
      <section id="dimensions" aria-labelledby="dimensions-title">
        <div className="mb-6 max-w-2xl">
          <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">9 Dimensions — DAMA-DMBOK</Badge>
          <h2 id="dimensions-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            ครอบคลุมมิติคุณภาพข้อมูลตามมาตรฐาน DAMA-DMBOK ครบทั้ง 9 มิติ
          </h2>
          <p className="mt-2 text-muted-foreground">
            Accuracy · Completeness · Consistency · Validity · Uniqueness · Integrity · Timeliness · Currentness · Reasonableness
            — ทุกกฎที่สร้างผูกกับมิติเหล่านี้ และรายงานคะแนนแยกตามมิติในการรันครั้งเดียว
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DIMENSIONS.map((d) => (
            <Card key={d.key} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <span className={`flex size-9 items-center justify-center rounded-lg border ${d.badgeClass}`}>
                    <d.icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle className="text-sm">{d.th}</CardTitle>
                    <CardDescription className="text-xs">{d.en}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{d.desc}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-slate-600">เอนจินประเมินผล:</span>
                  {d.engines.map((e) => (
                    <Badge key={e} variant="outline" className="text-[9.5px]">
                      {e}
                    </Badge>
                  ))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ----------------------------- features ---------------------------- */}
      <section id="features" aria-labelledby="features-title">
        <div className="mb-6 max-w-2xl">
          <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">Core Features — Live</Badge>
          <h2 id="features-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            ฟีเจอร์หลักของแพลตฟอร์ม
          </h2>
          <p className="mt-2 text-muted-foreground">
            ออกแบบตามหลัก Data Governance — มนุษย์คือผู้ตัดสินใจสุดท้าย ระบบช่วยตรวจสอบและแจ้งเตือน
            (เปิดใช้งานทุกฟีเจอร์ได้จากเมนูด้านซ้ายมือ — ทุกการเปลี่ยนแปลงตรวจสอบย้อนหลังได้)
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
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{f.desc}</p>
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
          <p className="mt-3 text-xs text-muted-foreground">
            ไฟล์ CSV ตรวจหาตัวคั่นอัตโนมัติ · JSON รองรับอาร์เรย์/วัตถุซ้อน · ฐานข้อมูล MySQL และ PostgreSQL เชื่อมต่อแบบอ่านอย่างเดียว (SELECT)
          </p>
        </div>
      </section>

      {/* ----------------------------- workflow ---------------------------- */}
      <section id="workflow" aria-labelledby="workflow-title">
        <div className="mb-6 max-w-2xl">
          <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">Workflow</Badge>
          <h2 id="workflow-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            ขั้นตอนการใช้งาน 6 ขั้นตอน
          </h2>
          <p className="mt-2 text-muted-foreground">จากข้อมูลดิบสู่ข้อมูลที่ผ่านการรับรองคุณภาพ พร้อมตรวจสอบย้อนหลังได้ทุกจุด</p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{w.desc}</p>
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

      {/* ----------------------------- security ---------------------------- */}
      <section id="security" aria-labelledby="security-title">
        <div className="mb-6 max-w-2xl">
          <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 text-emerald-800">Security &amp; Governance</Badge>
          <h2 id="security-title" className="text-xl font-bold tracking-tight sm:text-2xl">
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
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{s.desc}</p>
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

      <Separator />
    </div>
  )
}

export default PlatformOverview
