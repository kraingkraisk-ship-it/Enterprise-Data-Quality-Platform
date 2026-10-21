'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from '@/components/app-sidebar'
import CoreFeaturesConsole from '@/components/core-features-console'
import RbacConsole from '@/components/rbac-console'
import PlatformOverview from '@/components/platform-overview'
import AssetImport from '@/components/asset-import'
import AssetInventory from '@/components/asset-inventory'
import DqScorecard from '@/components/dq/scorecard'
import DqFailedRecords from '@/components/dq/failed-records'
import DqProfiling from '@/components/dq/profiling'
import DqIssues from '@/components/dq/issues'
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
  const [view, setView] = useState<ViewKey>('dashboard')
  const mainRef = useRef<HTMLElement>(null)

  // เปลี่ยนหน้า → เลื่อนขึ้นบนสุด + โฟกัส main เพื่อ screen reader (WCAG)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [view])

  const meta = VIEWS[view]

  return (
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
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-5">
          <SidebarTrigger aria-label="สลับการแสดงเมนูด้านซ้าย" className="size-8" />
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{meta.th}</h1>
            <p className="hidden truncate text-xs text-muted-foreground md:block">{meta.desc}</p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {meta.en}
          </span>
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

          {/* หน้าใหม่ของโมดูล Data Quality — บัตรคะแนน + ข้อมูลที่ไม่ผ่าน + โปรไฟล์ + ปัญหา */}
          <div className={view === 'scorecard' ? '' : 'hidden'} aria-hidden={view !== 'scorecard'}>
            <DqScorecard active={view === 'scorecard'} onGoValidations={() => setView('validation-results')} />
          </div>
          <div className={view === 'failed-records' ? '' : 'hidden'} aria-hidden={view !== 'failed-records'}>
            <DqFailedRecords active={view === 'failed-records'} />
          </div>
          <div className={view === 'profiling' ? '' : 'hidden'} aria-hidden={view !== 'profiling'}>
            <DqProfiling active={view === 'profiling'} />
          </div>
          <div className={view === 'issues' ? '' : 'hidden'} aria-hidden={view !== 'issues'}>
            <DqIssues active={view === 'issues'} />
          </div>

          {/* RBAC Console — คง mounted ไว้เสมอเพื่อรักษาสถานะ สลับด้วย visibility */}
          <div className={view === 'rbac' ? '' : 'hidden'} aria-hidden={view !== 'rbac'}>
            <RbacConsole />
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
        <footer className="mt-auto border-t bg-slate-900 text-slate-300 pb-[env(safe-area-inset-bottom)]">
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
  )
}
