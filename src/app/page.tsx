'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from '@/components/app-sidebar'
import CoreFeaturesConsole from '@/components/core-features-console'
import RbacConsole from '@/components/rbac-console'
import AuditCenter from '@/components/audit-center'
import PlatformOverview from '@/components/platform-overview'
import AssetImport from '@/components/asset-import'
import AssetInventory from '@/components/asset-inventory'
import DataDomainConsole from '@/components/data-domain-console'
import ReferenceCenter from '@/components/reference-center'
import DataMappingConsole from '@/components/data-mapping-console'
import DqScorecard from '@/components/dq/scorecard'
import DqFailedRecords from '@/components/dq/failed-records'
import DqProfiling from '@/components/dq/profiling'
import DqIssues from '@/components/dq/issues'
import MlStudio from '@/components/dq/ml-studio'
import ExecutiveDashboard from '@/components/dq/executive-dashboard'
import ComplianceAssessment from '@/components/dq/compliance-assessment'
import DqProjectPlan from '@/components/dq/project-plan'
import { CurrentUserProvider, AccountMenu, useCurrentUser } from '@/components/user-context'
import LoginScreen from '@/components/login-screen'
import { APP_VERSION, VIEWS, isConsoleView, type ViewKey } from '@/lib/views'

/* ------------------------------------------------------------------ */
/* Enterprise App Shell                                                */
/* ┌──────────┬──────────────────────────────────────────┐            */
/* │ Sidebar  │ Header (sticky)                          │            */
/* │ (ซ้าย)    ├──────────────────────────────────────────┤            */
/* │          │ Content (view ตามเมนู)                    │            */
/* │          ├──────────────────────────────────────────┤            */
/* │          │ Footer (sticky bottom)                   │            */
/* └──────────┴──────────────────────────────────────────┘            */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <CurrentUserProvider>
      <AuthGate />
    </CurrentUserProvider>
  )
}

/**
 * AuthGate (v0.33.0) — ประตูเข้าสู่ระบบของทั้งแอป
 * กำลังตรวจเซสชัน → จอโหลด · ยังไม่เข้าสู่ระบบ → หน้าเข้าสู่ระบบ · เข้าแล้ว → แอปเต็ม
 */
function AuthGate() {
  const { user, loading } = useCurrentUser()
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <span className="flex size-12 animate-pulse items-center justify-center rounded-xl bg-emerald-600 text-white">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <p className="text-sm">กำลังตรวจสอบการเข้าสู่ระบบ…</p>
        </div>
      </div>
    )
  }
  if (!user) return <LoginScreen />
  return <HomeShell />
}

function HomeShell() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const mainRef = useRef<HTMLElement>(null)

  // เปลี่ยนหน้า → เลื่อนขึ้นบนสุด + โฟกัส main เพื่อ screen reader (WCAG)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [view])

  const meta = VIEWS[view]

  return (
    <CurrentUserProvider>
      <SidebarProvider>
      <AppSidebar activeView={view} onViewChange={setView} />
      <SidebarInset className="flex min-h-svh flex-col bg-background">
        {/* skip link — ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านหน้าจอ */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-emerald-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>

        {/* ----------------------------- header ----------------------------- */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden sm:gap-3 sm:px-5">
          <SidebarTrigger aria-label="สลับการแสดงเมนูด้านซ้าย" className="size-8" />
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{meta.th}</h1>
            {/* line-clamp-1 แทน truncate — กัน min-content ของข้อความยาว (white-space:nowrap)
                ดันความกว้างขั้นต่ำของ header จนล้นจอ 1280px (แก้บั๊กแฝงที่ view desc ยาวที่สุดของระบบ) */}
            <p className="hidden text-xs text-muted-foreground md:block">
              <span className="line-clamp-1">{meta.desc}</span>
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {meta.en}
          </span>
          {/* บัญชีผู้เข้าสู่ระบบปัจจุบัน (v0.33.0) — มุมมอง/สิทธิ์/ผู้ดำเนินการยึดบัญชีนี้เสมอ */}
          <AccountMenu />
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-300 bg-emerald-50 font-mono text-xs text-emerald-800"
          >
            {APP_VERSION}
          </Badge>
        </header>

        {/* ----------------------------- content ----------------------------- */}
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 outline-none sm:px-5 sm:py-6"
        >
          {/* หน้าแนะนำแพลตฟอร์ม (เนื้อหาคงที่ — เรนเดอร์เฉพาะเมื่อเปิด) */}
          {view === 'about' && <PlatformOverview onNavigate={setView} />}

          {/* โมดูล Data Asset — นำเข้าข้อมูล + คลังข้อมูล
              คง mounted ไว้เสมอ ฟอร์ม/สถานะไม่หายเวลาสลับหน้า */}
          <div className={view === 'asset-import' ? '' : 'hidden'} aria-hidden={view !== 'asset-import'}>
            <AssetImport onGoInventory={() => setView('asset-inventory')} />
          </div>
          <div className={view === 'asset-inventory' ? '' : 'hidden'} aria-hidden={view !== 'asset-inventory'}>
            <AssetInventory active={view === 'asset-inventory'} />
          </div>

          {/* Data Domain Console — เมนูอิสระภายใต้กลุ่ม Data Asset (v0.15.0)
              คง mounted ไว้เสมอเพื่อรักษาสถานะ สลับด้วย visibility */}
          <div className={view === 'asset-domain' ? '' : 'hidden'} aria-hidden={view !== 'asset-domain'}>
            <DataDomainConsole active={view === 'asset-domain'} />
          </div>

          {/* Reference Data Center — ทะเบียนค่าอ้างอิงศูนย์กลางใต้กลุ่ม Data Asset (v0.31.0)
              คง mounted ไว้เสมอ สลับด้วย visibility — โหลดข้อมูลใหม่เมื่อ active */}
          <div className={view === 'asset-reference' ? '' : 'hidden'} aria-hidden={view !== 'asset-reference'}>
            <ReferenceCenter active={view === 'asset-reference'} />
          </div>

          {/* Data Mapping Console — เส้นเชื่อม element ต้นทาง→ปลายทาง + lineage (v0.21.0)
              คง mounted ไว้เสมอเพื่อรักษาสถานะ สลับด้วย visibility */}
          <div className={view === 'data-mapping' ? '' : 'hidden'} aria-hidden={view !== 'data-mapping'}>
            <DataMappingConsole active={view === 'data-mapping'} />
          </div>

          {/* หน้าใหม่ของโมดูล Data Quality — บัตรคะแนน + ข้อมูลที่ไม่ผ่าน + โปรไฟล์ + ปัญหา */}
          <div className={view === 'scorecard' ? '' : 'hidden'} aria-hidden={view !== 'scorecard'}>
            <DqScorecard active={view === 'scorecard'} onGoValidations={() => setView('validation-results')} />
          </div>
          <div className={view === 'failed-records' ? '' : 'hidden'} aria-hidden={view !== 'failed-records'}>
            <DqFailedRecords active={view === 'failed-records'} />
          </div>
          <div className={view === 'profiling' ? '' : 'hidden'} aria-hidden={view !== 'profiling'}>
            <DqProfiling active={view === 'profiling'} onViewChange={setView} />
          </div>
          <div className={view === 'issues' ? '' : 'hidden'} aria-hidden={view !== 'issues'}>
            <DqIssues active={view === 'issues'} />
          </div>

          {/* ML Studio — ผู้ช่วย ML บนหลัก Train/Test (v0.37.0 แทนศูนย์ ML เดิม)
              คง mounted ไว้เสมอ สลับด้วย visibility — โหลดข้อมูลใหม่เมื่อ active */}
          <div className={view === 'ml-studio' ? '' : 'hidden'} aria-hidden={view !== 'ml-studio'}>
            <MlStudio active={view === 'ml-studio'} />
          </div>

          {/* หน้าระดับผู้บริหาร — แดชบอร์ด (พิมพ์/PDF จากปุ่มในหน้า) สิทธิ์ตรวจใน API (v0.32.0 ยุบ exec-reports) */}
          <div className={view === 'exec-dashboard' ? '' : 'hidden'} aria-hidden={view !== 'exec-dashboard'}>
            <ExecutiveDashboard active={view === 'exec-dashboard'} />
          </div>

          {/* ประเมินความสอดคล้อง — จุดเดียวของความเสี่ยงรายมาตรฐาน (v0.24.0 · v0.34.0 รวมแท็บรายมาตรฐานของ Risk มาที่นี่)
              คง mounted ไว้เสมอ สลับด้วย visibility — โหลด/รีเฟรชข้อมูลเมื่อ active */}
          <div
            className={view === 'compliance-assessment' ? '' : 'hidden'}
            aria-hidden={view !== 'compliance-assessment'}
          >
            <ComplianceAssessment active={view === 'compliance-assessment'} />
          </div>

          {/* แผนงาน DQ — แผนแม่บททวนสอบ 2026–2030 + Progress ถ่วงน้ำหนัก (v0.34.0)
              คง mounted ไว้เสมอ สลับด้วย visibility — โหลดข้อมูลเมื่อ active */}
          <div
            className={view === 'project-plan' ? '' : 'hidden'}
            aria-hidden={view !== 'project-plan'}
          >
            <DqProjectPlan active={view === 'project-plan'} />
          </div>

          {/* RBAC Console — คง mounted ไว้เสมอเพื่อรักษาสถานะ สลับด้วย visibility */}
          <div className={view === 'rbac' ? '' : 'hidden'} aria-hidden={view !== 'rbac'}>
            <RbacConsole onGoAuditCenter={() => setView('audit-center')} />
          </div>

          {/* ศูนย์บันทึกตรวจสอบ — คลัง Audit Log ศูนย์กลางทั้งระบบ (v0.30.0)
              คง mounted ไว้เสมอ สลับด้วย visibility — โหลดข้อมูลใหม่เมื่อ active */}
          <div className={view === 'audit-center' ? '' : 'hidden'} aria-hidden={view !== 'audit-center'}>
            <AuditCenter active={view === 'audit-center'} />
          </div>

          {/* คอนโซลคุณภาพข้อมูล (คลังกฎ / ผลการตรวจ / ข้อยกเว้น / DQ แดชบอร์ด)
              — คง mounted ไว้เสมอ ข้อมูลและฟอร์มไม่หายเวลาสลับหน้า
              — 'rule-library' ใช้โหมด library (แท็บกฎ + เงื่อนไขภายในหน้าเดียว) */}
          <div
            className={view === 'rule-library' || isConsoleView(view) ? '' : 'hidden'}
            aria-hidden={!(view === 'rule-library' || isConsoleView(view))}
          >
            <CoreFeaturesConsole
              activeView={isConsoleView(view) ? (view === 'validation-results' ? 'run' : view) : 'rules'}
              onViewChange={setView}
              mode={view === 'rule-library' ? 'library' : 'full'}
            />
          </div>
        </main>

        {/* ----------------------------- footer ----------------------------- */}
        <footer className="mt-auto border-t bg-slate-900 text-slate-300 pb-[env(safe-area-inset-bottom)] print:hidden">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-3 py-5 sm:flex-row sm:px-5">
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
      </SidebarInset>
    </SidebarProvider>
    </CurrentUserProvider>
  )
}
