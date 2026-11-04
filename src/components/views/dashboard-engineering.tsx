'use client'
// Data Engineering dashboard — source health, job pipeline, drift and run stats.
import React, { useCallback, useEffect, useState } from 'react'
import {
  Ban, Database, FileSpreadsheet, Globe, HardDrive, Loader2, ServerCog, TriangleAlert, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api-client'
import { canAccessView } from '@/lib/types'
import type { EngineeringDashboardDTO, JobDTO } from '@/lib/types'
import { T, useLang, fmtNumber, fmtDateTime, fmtPercent, fmtDuration } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import { PageShell, SectionHeading, KpiCard, StatusBadge, DataTable, LoadingState, ErrorState, DeniedState, PartialFailure } from '@/components/shared/kit'
import { StackedBars, TrendLine } from '@/components/shared/charts'
import { Button } from '@/components/ui/button'
import type { ViewCtx } from '@/components/views/ctx'

type BadgeKindOf = Parameters<typeof StatusBadge>[0]['kind']
const asKind = (s: string): BadgeKindOf => s as BadgeKindOf
const toPct = (v: number | null | undefined) => (v == null ? null : v <= 1 ? v * 100 : v)

const SOURCE_ICON: Record<string, React.ElementType> = {
  POSTGRESQL: Database, MSSQL: Database, CSV: FileSpreadsheet, XLSX: FileSpreadsheet, REST_API: Globe,
}

export default function DashboardEngineeringView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const [data, setData] = useState<EngineeringDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string; auditId?: string } | null>(null)
  const [tick, setTick] = useState(0)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ en: string; th: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    api.dashboardEngineering()
      .then((d) => { if (!cancelled) { setData(d); setError(null); setLoading(false) } })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError({ message: e instanceof Error ? e.message : undefined, auditId: e instanceof ApiError ? e.auditId : undefined })
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [tick])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setTick((t) => t + 1)
  }, [])

  const cancelJob = async (job: JobDTO) => {
    setCancellingId(job.id)
    setActionError(null)
    try {
      await api.cancelJob(job.id)
      setTick((t) => t + 1) // refresh job table after cooperative cancellation
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setActionError({ en: `Could not cancel job: ${msg}`, th: `ยกเลิกงานไม่สำเร็จ: ${msg}` })
    } finally {
      setCancellingId(null)
    }
  }

  const objective = {
    en: 'Operate the platform: source health, job pipeline status, schema drift and validation run failures.',
    th: 'ดูแลแพลตฟอร์ม: สุขภาพแหล่งข้อมูล สถานะท่องาน schema drift และการรันที่ล้มเหลว',
  }
  const guidance = {
    en: 'Check degraded sources first (latency p95 and success rate), then dead jobs in the DLQ — cancel stuck queued jobs directly from the table. Schema drift needs a rule or contract update before the next run.',
    th: 'ตรวจแหล่งข้อมูลที่เสื่อมสภาพก่อน (latency p95 และอัตราสำเร็จ) แล้วไล่ดูงานตายใน DLQ — ยกเลิกงานที่ค้างในคิวได้จากตารางโดยตรง schema drift ควรปรับกฎหรือสัญญาข้อมูลก่อนรันครั้งถัดไป',
  }

  if (!canAccessView(ctx.user.role, 'dashboard-engineering')) {
    return <PageShell objective={objective}><DeniedState resourceEn="the engineering dashboard" /></PageShell>
  }
  if (loading) return <PageShell objective={objective} guidance={guidance}><LoadingState rows={6} /></PageShell>
  if (error) return <PageShell objective={objective} guidance={guidance}><ErrorState message={error.message} retry={retry} auditId={error.auditId} /></PageShell>
  if (!data) return null

  const unhealthySources = (data.sourceHealth ?? []).filter((s) => s.health !== 'HEALTHY').length
  const failedRuns14d = (data.runStats ?? []).reduce((a, b) => a + (b.failed ?? 0), 0)
  const js = data.jobStats

  return (
    <PageShell objective={objective} guidance={guidance}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          labelEn="Sources degraded / down" labelTh="แหล่งข้อมูลเสื่อม / หยุด" icon={HardDrive}
          value={`${fmtNumber(unhealthySources, lang)}/${fmtNumber(data.sourceHealth?.length ?? 0, lang)}`}
          tone={unhealthySources > 0 ? 'bad' : 'good'}
          sub={<T en="Not fully healthy right now" th="ปัจจุบันไม่ปกติเต็มร้อย" />}
        />
        <KpiCard
          labelEn="Dead jobs (DLQ)" labelTh="งานตาย (DLQ)" icon={XCircle}
          value={fmtNumber(js?.dead ?? 0, lang)}
          tone={(js?.dead ?? 0) > 0 ? 'bad' : 'good'}
          sub={<T en="Exhausted retries — need manual action" th="ลองใหม่ครบแล้ว — ต้องดำเนินการเอง" />}
        />
        <KpiCard
          labelEn="Schema drift open" labelTh="Schema drift ที่เปิดอยู่" icon={TriangleAlert}
          value={fmtNumber(data.schemaDriftCount, lang)}
          tone={(data.schemaDriftCount ?? 0) > 0 ? 'warn' : 'good'}
          sub={<T en="Detected by profiling" th="ตรวจพบจากการวิเคราะห์ข้อมูล" />}
        />
        <KpiCard
          labelEn="Failed runs (14d)" labelTh="รันล้มเหลว (14 วัน)" icon={ServerCog}
          value={fmtNumber(failedRuns14d, lang)}
          tone={failedRuns14d > 0 ? 'warn' : 'good'}
          sub={<T en="Validation runs ending in FAILED" th="การรันตรวจสอบที่จบด้วย FAILED" />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Job pipeline */}
        <StackedBars
          groups={[{ label: lang === 'th' ? 'งานทั้งหมด' : 'All jobs', values: [js?.queued ?? 0, js?.running ?? 0, js?.succeeded ?? 0, js?.failed ?? 0, js?.dead ?? 0, js?.cancelled ?? 0] }]}
          series={[
            { name: 'QUEUED', color: '#14b8a6' },
            { name: 'RUNNING', color: '#0f766e' },
            { name: 'SUCCEEDED', color: '#10b981' },
            { name: 'FAILED', color: '#ef4444' },
            { name: 'DEAD', color: '#991b1b' },
            { name: 'CANCELLED', color: '#94a3b8' },
          ]}
          labelEn="Job pipeline status" labelTh="สถานะท่องาน"
        />
        {/* Run trend */}
        {(data.runStats?.length ?? 0) >= 2 ? (
          <TrendLine
            points={(data.runStats ?? []).map((r) => ({ label: r.date?.slice(5) ?? '', value: r.count }))}
            labelEn="Validation runs per day (14d)" labelTh="การรันตรวจสอบต่อวัน (14 วัน)"
            unitEn="runs" unitTh="ครั้ง"
          />
        ) : (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground"><T en="Not enough run history for a trend yet." th="ยังมีประวัติการรันไม่พอสำหรับแสดงแนวโน้ม" /></div>
        )}
      </div>

      {/* Source health */}
      <section aria-labelledby="eng-sources" className="space-y-2">
        <SectionHeading titleEn="Source health" titleTh="สุขภาพแหล่งข้อมูล" hintEn="Virtual read-only adapters — click to open Data Sources" hintTh="อะแดปเตอร์อ่านอย่างเดียว — คลิกเพื่อเปิดหน้าแหล่งข้อมูล" />
        <DataTable
          caption="Data sources with health, latency and success rate"
          rows={data.sourceHealth ?? []}
          rowKey={(r) => r.id}
          density={density}
          onRowClick={() => ctx.navigate('data-sources')}
          emptyEn="No sources are registered yet."
          emptyTh="ยังไม่มีแหล่งข้อมูลที่ลงทะเบียน"
          columns={[
            {
              key: 'name', headerEn: 'Source', headerTh: 'แหล่งข้อมูล',
              render: (r) => {
                const Icon = SOURCE_ICON[r.type] ?? HardDrive
                return (
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-teal-700" aria-hidden />
                    <span className="font-medium">{r.name}</span>
                  </span>
                )
              },
            },
            { key: 'type', headerEn: 'Type', headerTh: 'ประเภท', render: (r) => <span className="text-xs text-muted-foreground">{r.type}</span> },
            { key: 'health', headerEn: 'Health', headerTh: 'สุขภาพ', render: (r) => <StatusBadge kind={asKind(r.health)} /> },
            { key: 'latency', headerEn: 'Latency p95', headerTh: 'ความหน่วง p95', render: (r) => <span className="whitespace-nowrap tabular-nums text-xs">{r.latencyP95Ms != null ? `${fmtNumber(r.latencyP95Ms, lang)} ms` : '—'}</span> },
            { key: 'success', headerEn: 'Success rate', headerTh: 'อัตราสำเร็จ', render: (r) => <span className="whitespace-nowrap tabular-nums text-xs">{fmtPercent(toPct(r.successRate), lang)}</span> },
            { key: 'sync', headerEn: 'Last sync', headerTh: 'ซิงก์ล่าสุด', render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.lastSyncAt, lang)}</span> },
          ]}
        />
      </section>

      {/* Recent jobs */}
      <section aria-labelledby="eng-jobs" className="space-y-2">
        <SectionHeading titleEn="Recent jobs" titleTh="งานล่าสุด" hintEn="Cancel queued or running jobs — retried jobs use exponential backoff" hintTh="ยกเลิกงานที่อยู่ในคิวหรือกำลังทำ — งานที่ลองใหม่ใช้ exponential backoff" />
        {actionError && <PartialFailure note={actionError} />}
        <DataTable
          caption="Recent pipeline jobs with attempts and cancel action"
          rows={data.recentJobs ?? []}
          rowKey={(r) => r.id}
          density={density}
          emptyEn="No jobs have been executed yet."
          emptyTh="ยังไม่มีการรันงาน"
          columns={[
            {
              key: 'id', headerEn: 'Job', headerTh: 'งาน',
              render: (r) => (
                <span className="block max-w-[180px] truncate font-mono text-xs" title={r.id}>{r.id}</span>
              ),
            },
            { key: 'type', headerEn: 'Type', headerTh: 'ประเภท', render: (r) => <span className="font-medium">{r.type}</span> },
            { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (r) => <StatusBadge kind={asKind(r.status)} /> },
            {
              key: 'retry', headerEn: 'Retry status', headerTh: 'สถานะการลองใหม่',
              render: (r) => (
                <span className={cn('whitespace-nowrap text-xs tabular-nums', r.attempts >= r.maxAttempts && r.status === 'FAILED' ? 'font-medium text-red-700' : 'text-muted-foreground')} title={lang === 'th' ? `ความพยายาม ${r.attempts} จาก ${r.maxAttempts}` : `Attempt ${r.attempts} of ${r.maxAttempts}`}>
                  <T en={`Attempt ${r.attempts}/${r.maxAttempts}`} th={`ครั้งที่ ${r.attempts}/${r.maxAttempts}`} />
                </span>
              ),
            },
            { key: 'duration', headerEn: 'Duration', headerTh: 'ระยะเวลา', render: (r) => <span className="whitespace-nowrap text-xs">{r.startedAt && r.finishedAt ? fmtDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime(), lang) : '—'}</span> },
            {
              key: 'error', headerEn: 'Last error', headerTh: 'ข้อผิดพลาดล่าสุด',
              render: (r) => <span className="block max-w-[260px] truncate text-xs text-muted-foreground" title={r.lastError ?? undefined}>{r.lastError ?? '—'}</span>,
            },
            {
              key: 'action', headerEn: 'Actions', headerTh: 'การดำเนินการ',
              render: (r) => (r.status === 'QUEUED' || r.status === 'RUNNING') ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[40px] border-red-300 text-red-800 hover:bg-red-50"
                  disabled={cancellingId === r.id}
                  onClick={() => void cancelJob(r)}
                >
                  {cancellingId === r.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Ban className="size-4" aria-hidden />}
                  <T en="Cancel" th="ยกเลิก" />
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
            },
          ]}
        />
      </section>
    </PageShell>
  )
}
