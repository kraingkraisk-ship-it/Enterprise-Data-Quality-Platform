'use client'
// Enterprise UI kit — every view composes these. Implements the UX contract:
// objective banner, one primary action, guidance, all four states, badges with
// icon+text+colour (never colour alone), 40px touch targets, WCAG 2.2 AA.
import React from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleAlert, CircleHelp, Info, MinusCircle, Loader2, ShieldAlert, Ban, XCircle, SearchX, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { T, fmtNumber, fmtDateTime, useLang } from '@/lib/i18n'

// ─── Page structure ───────────────────────────────────────────────────────────

export function PageShell(props: {
  objective: { en: string; th: string }
  primaryAction?: React.ReactNode
  secondaryActions?: React.ReactNode
  guidance?: { en: string; th: string }
  children: React.ReactNode
  maxWidth?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4', props.maxWidth ?? 'max-w-[1400px]')} data-testid="page-shell">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground"><T en="Page objective" th="วัตถุประสงค์ของหน้า" /></p>
            <p className="mt-1 text-sm text-foreground"><T en={props.objective.en} th={props.objective.th} /></p>
          </div>
          {props.primaryAction && <div className="flex shrink-0 flex-wrap items-center gap-2">{props.primaryAction}</div>}
        </div>
        {props.secondaryActions && <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">{props.secondaryActions}</div>}
        {props.guidance && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-teal-700" aria-hidden />
            <T en={props.guidance.en} th={props.guidance.th} />
          </p>
        )}
      </div>
      {props.children}
    </div>
  )
}

export function SectionHeading({ titleEn, titleTh, hintEn, hintTh, actions }: { titleEn: string; titleTh: string; hintEn?: string; hintTh?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold"><T en={titleEn} th={titleTh} /></h2>
        {hintEn && <p className="text-xs text-muted-foreground"><T en={hintEn} th={hintTh ?? hintEn} /></p>}
      </div>
      {actions}
    </div>
  )
}

// ─── Status badges: icon + text + colour (WCAG — not colour alone) ───────────

type BadgeKind = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASSED' | 'FAILED' | 'WARNING' | 'ERROR' | 'SKIPPED' | 'RUNNING' | 'QUEUED' | 'SUCCEEDED' | 'CANCELLED' | 'DEAD' | 'PARTIAL' | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETIRED' | 'ACTIVE' | 'IN_PROGRESS' | 'RESOLVED' | 'OPEN' | 'PENDING' | 'CONFIRMED_ISSUE' | 'FALSE_POSITIVE' | 'REGISTERED' | 'VALIDATED' | 'SHADOW' | 'PROMOTED' | 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN' | 'CLOSED' | 'CLEAN' | 'INFECTED' | 'ACCEPTED' | 'QUARANTINED' | 'TRIAGED' | 'DISMISSED'

const BADGE_STYLE: Record<BadgeKind, { cls: string; Icon: React.ElementType }> = {
  CRITICAL: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: AlertOctagon },
  HIGH: { cls: 'bg-orange-50 text-orange-800 border-orange-300', Icon: AlertTriangle },
  MEDIUM: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: CircleAlert },
  LOW: { cls: 'bg-slate-50 text-slate-700 border-slate-300', Icon: MinusCircle },
  PASSED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  FAILED: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: XCircle },
  WARNING: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: AlertTriangle },
  ERROR: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: AlertOctagon },
  SKIPPED: { cls: 'bg-slate-50 text-slate-600 border-slate-300', Icon: Ban },
  RUNNING: { cls: 'bg-teal-50 text-teal-800 border-teal-300', Icon: Loader2 },
  QUEUED: { cls: 'bg-slate-50 text-slate-700 border-slate-300', Icon: Info },
  SUCCEEDED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  CANCELLED: { cls: 'bg-slate-100 text-slate-600 border-slate-300', Icon: Ban },
  DEAD: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: AlertOctagon },
  PARTIAL: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: AlertTriangle },
  DRAFT: { cls: 'bg-slate-50 text-slate-700 border-slate-300', Icon: Info },
  PENDING_APPROVAL: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: CircleAlert },
  APPROVED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  REJECTED: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: XCircle },
  RETIRED: { cls: 'bg-slate-100 text-slate-500 border-slate-300', Icon: Ban },
  ACTIVE: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  IN_PROGRESS: { cls: 'bg-teal-50 text-teal-800 border-teal-300', Icon: Loader2 },
  RESOLVED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  OPEN: { cls: 'bg-orange-50 text-orange-800 border-orange-300', Icon: CircleAlert },
  PENDING: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: CircleAlert },
  CONFIRMED_ISSUE: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: AlertOctagon },
  FALSE_POSITIVE: { cls: 'bg-slate-50 text-slate-600 border-slate-300', Icon: Ban },
  REGISTERED: { cls: 'bg-slate-50 text-slate-700 border-slate-300', Icon: Info },
  VALIDATED: { cls: 'bg-teal-50 text-teal-800 border-teal-300', Icon: CheckCircle2 },
  SHADOW: { cls: 'bg-violet-50 text-violet-800 border-violet-300', Icon: ShieldAlert },
  PROMOTED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  HEALTHY: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  DEGRADED: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: AlertTriangle },
  DOWN: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: AlertOctagon },
  UNKNOWN: { cls: 'bg-slate-50 text-slate-600 border-slate-300', Icon: CircleHelp },
  CLOSED: { cls: 'bg-slate-100 text-slate-600 border-slate-300', Icon: CheckCircle2 },
  CLEAN: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  INFECTED: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: AlertOctagon },
  ACCEPTED: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  QUARANTINED: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: ShieldAlert },
  TRIAGED: { cls: 'bg-teal-50 text-teal-800 border-teal-300', Icon: Info },
  DISMISSED: { cls: 'bg-slate-100 text-slate-600 border-slate-300', Icon: Ban },
}

export function StatusBadge({ kind, label, className }: { kind: BadgeKind; label?: string; className?: string }) {
  const style = BADGE_STYLE[kind] ?? BADGE_STYLE.UNKNOWN
  const Icon = style.Icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium', style.cls, className)}>
      <Icon className={cn('size-3', kind === 'RUNNING' || kind === 'IN_PROGRESS' ? 'animate-spin' : '')} aria-hidden />
      {label ?? kind.replaceAll('_', ' ')}
    </span>
  )
}

export function ClassificationBadge({ level }: { level: string }) {
  const map: Record<string, { cls: string; Icon: React.ElementType }> = {
    PUBLIC: { cls: 'bg-slate-50 text-slate-700 border-slate-300', Icon: Info },
    INTERNAL: { cls: 'bg-teal-50 text-teal-800 border-teal-300', Icon: Info },
    CONFIDENTIAL: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: ShieldAlert },
    RESTRICTED: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: ShieldAlert },
  }
  const s = map[level] ?? map.INTERNAL
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium', s.cls)}>
      <s.Icon className="size-3" aria-hidden />{level}
    </span>
  )
}

// ─── States ───────────────────────────────────────────────────────────────────

export function LoadingState({ rows = 5, label }: { rows?: number; label?: { en: string; th: string } }) {
  return (
    <div role="status" aria-live="polite" className="rounded-lg border bg-card p-4">
      <span className="sr-only"><T en={label?.en ?? 'Loading'} th={label?.th ?? 'กำลังโหลด'} /></span>
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        <T en={label?.en ?? 'Loading…'} th={label?.th ?? 'กำลังโหลด…'} />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    </div>
  )
}

export function EmptyState({ titleEn, titleTh, bodyEn, bodyTh, action }: { titleEn: string; titleTh: string; bodyEn: string; bodyTh: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-10 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold"><T en={titleEn} th={titleTh} /></p>
      <p className="max-w-md text-xs text-muted-foreground"><T en={bodyEn} th={bodyTh} /></p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, retry, auditId }: { message?: string; retry?: () => void; auditId?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
        <AlertOctagon className="size-4" aria-hidden />
        <T en="Something went wrong" th="เกิดข้อผิดพลาด" />
      </div>
      <p className="text-xs text-red-700">{message ?? <T en="The request could not be completed. Safe details only are shown." th="คำขอไม่สำเร็จ แสดงเฉพาะข้อมูลที่ปลอดภัยเท่านั้น" />}</p>
      {auditId && <p className="text-xs text-red-700"><T en={`Audit reference: ${auditId}`} th={`รหัสอ้างอิงตรวจสอบ: ${auditId}`} /></p>}
      {retry && (
        <Button variant="outline" size="sm" onClick={retry} className="mt-1 min-h-[40px] border-red-300 text-red-800 hover:bg-red-100">
          <RefreshCw className="size-4" aria-hidden /> <T en="Retry" th="ลองอีกครั้ง" />
        </Button>
      )}
    </div>
  )
}

export function DeniedState({ resourceEn = 'this resource' }: { resourceEn?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-10 text-center">
      <ShieldAlert className="size-8 text-amber-700" aria-hidden />
      <p className="text-sm font-semibold text-amber-900"><T en="You do not have permission to view this page" th="คุณไม่มีสิทธิ์เข้าถึงหน้านี้" /></p>
      <p className="max-w-md text-xs text-amber-800">
        <T en={`Access is deny-by-default. If you believe this is an error, contact the data owner. The platform does not disclose whether ${resourceEn} exists.`} th={`การเข้าถึงถูกปฏิเสธเป็นค่าเริ่มต้น หากคิดว่าเป็นข้อผิดพลาด ติดต่อเจ้าของข้อมูล ระบบจะไม่เปิดเผยว่ามีทรัพยากรนี้อยู่หรือไม่`} />
      </p>
    </div>
  )
}

export function PartialFailure({ note }: { note: { en: string; th: string } }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <T en={note.en} th={note.th} />
    </div>
  )
}

// ─── KPI & scores ─────────────────────────────────────────────────────────────

export function KpiCard({ labelEn, labelTh, value, sub, icon: Icon, tone = 'neutral' }: {
  labelEn: string; labelTh: string; value: React.ReactNode; sub?: React.ReactNode
  icon?: React.ElementType; tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneCls = { neutral: 'text-foreground', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' }[tone]
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground"><T en={labelEn} th={labelTh} /></p>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', toneCls)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const { lang } = useLang()
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const color = pct >= 85 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-500' : 'text-red-600'
  return (
    <div className="relative inline-flex items-center justify-center" role="img" aria-label={lang === 'th' ? `คะแนนคุณภาพข้อมูล ${pct} จาก 100` : `Data quality score ${pct} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted" strokeWidth={7} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className={cn(color)} stroke="currentColor" strokeWidth={7} fill="none" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums">{Math.round(pct)}</span>
    </div>
  )
}

// ─── Accessible data table ────────────────────────────────────────────────────

export function DataTable<T>({ columns, rows, rowKey, onRowClick, density = 'comfortable', emptyEn, emptyTh, caption, maxRowsScroll = 12 }: {
  columns: { key: string; headerEn: string; headerTh: string; render: (row: T) => React.ReactNode; className?: string; sortable?: boolean }[]
  rows: T[]
  rowKey: (row: T, i: number) => string
  onRowClick?: (row: T) => void
  density?: 'comfortable' | 'compact'
  emptyEn?: string; emptyTh?: string
  caption?: string
  maxRowsScroll?: number
}) {
  const { lang } = useLang()
  if (rows.length === 0) {
    return <EmptyState titleEn="No records found" titleTh="ไม่พบข้อมูล" bodyEn={emptyEn ?? 'Try adjusting filters or create a new record.'} bodyTh={emptyTh ?? 'ลองปรับตัวกรอง หรือสร้างรายการใหม่'} />
  }
  const cellPad = density === 'compact' ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="max-h-[70vh] overflow-auto edqp-scroll" style={{ maxHeight: maxRowsScroll * 44 + 60 }}>
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground', cellPad, c.className)}>
                  <T en={c.headerEn} th={c.headerTh} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={cn('border-b transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-teal-50/50 focus-within:bg-teal-50')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row) } : undefined}
                aria-live={undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn(cellPad, c.className)}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        <T en={`${fmtNumber(rows.length, lang)} rows`} th={`${fmtNumber(rows.length, lang)} แถว`} />
      </p>
    </div>
  )
}

// ─── Drawer for contextual details ────────────────────────────────────────────

export function DetailDrawer({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg edqp-scroll" aria-describedby={description ? 'drawer-desc' : undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription id="drawer-desc">{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-4 space-y-4 px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function KeyValue({ kEn, kTh, children }: { kEn: string; kTh: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground"><T en={kEn} th={kTh} /></span>
      <span>{children}</span>
    </div>
  )
}

// ─── ML disclaimer (mandatory on every ML result surface) ─────────────────────

export function MlDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={cn('flex items-start gap-2 rounded border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900', compact && 'p-1.5')}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <T
        en="ML detection is a signal, not confirmation that the data is incorrect. Human review is required before any action. Source data is never modified automatically."
        th="ผลการตรวจจับด้วย ML เป็นเพียงสัญญาณ ไม่ใช่การยืนยันว่าข้อมูลไม่ถูกต้อง ต้องมีมนุษย์ตรวจสอบก่อนดำเนินการเสมอ และระบบจะไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ"
      />
    </p>
  )
}

export function MaskedChip({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80" title="Masked value">{children}</code>
  )
}
