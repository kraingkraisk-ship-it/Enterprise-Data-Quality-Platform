'use client'
// Profiling view — dataset selector, snapshot history browser and poll-based re-profiling.
// Profiling is strictly read-only: it computes statistics without touching source data.
import { useCallback, useEffect, useRef, useState } from 'react'
import { History, PlayCircle, RefreshCw } from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import { hasPermission, type ColumnProfile, type DatasetDTO } from '@/lib/types'
import { PageShell, LoadingState, EmptyState, ErrorState, KpiCard, DataTable, MaskedChip } from '@/components/shared/kit'
import { Histogram } from '@/components/shared/charts'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { T, pick, useLang, fmtDateTime, fmtNumber, fmtPercent } from '@/lib/i18n'
import type { ViewCtx } from './ctx'
import { cn } from '@/lib/utils'

interface Snapshot { id: string; createdAt: string; rowCount: number; nullRateAvg: number; duplicateRate: number; columns: ColumnProfile[] }

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 30000

export default function ProfilingView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const canRun = hasPermission(ctx.user.role, 'VIEW_PROFILE') &&
    ['SYSTEM_ADMIN', 'DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER', 'DATA_SCIENTIST'].includes(ctx.user.role)

  const [datasets, setDatasets] = useState<DatasetDTO[] | null>(null)
  const [dsError, setDsError] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState<string>(ctx.params.id ?? '')

  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')

  const [pollingJob, setPollingJob] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStart = useRef<number>(0)

  // ── Dataset list ────────────────────────────────────────────────────────────
  const loadDatasets = useCallback(async () => {
    try {
      const res = await api.datasets()
      setDatasets(res.datasets)
      setDatasetId((prev) => prev || res.datasets[0]?.id || '')
      setDsError(null)
    } catch (e) {
      setDsError(e instanceof ApiError ? e.message : 'Failed to load datasets')
    }
  }, [])

  // Initial dataset list fetch (fetch-on-mount pattern; response handled in try/catch).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadDatasets() }, [loadDatasets])

  // ── Snapshot history for the selected dataset ───────────────────────────────
  const loadHistory = useCallback(async (dsId: string) => {
    if (!dsId) return
    try {
      const res = await api.profileHistory(dsId)
      const sorted = res.profiles.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setSnapshots(sorted)
      setSelectedId((prev) => (sorted.some((s) => s.id === prev) ? prev : sorted[0]?.id ?? ''))
      setProfileError(null)
    } catch (e) {
      setProfileError(e instanceof ApiError ? e.message : 'Failed to load profiling history')
    }
  }, [])

  // Fetch snapshot history whenever the selected dataset changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadHistory(datasetId) }, [datasetId, loadHistory])

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  // ── Run profiling + poll every 3s (max 30s) for a new snapshot ─────────────
  const runProfiling = async () => {
    if (!datasetId) return
    try {
      const res = await api.runProfiling(datasetId)
      toast.success(pick(lang, `Profiling job queued (id ${res.jobId})`, `เข้าคิวงานโปรไฟล์แล้ว (id ${res.jobId})`))
      startPolling(res.jobId)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to queue profiling'
      toast.error(pick(lang, 'Could not queue profiling', 'ไม่สามารถเข้าคิวโปรไฟล์ได้'), { description: msg })
    }
  }

  const startPolling = (jobId: string) => {
    stopPolling()
    pollStart.current = Date.now()
    const startedForDataset = datasetIdRef.current
    setPollingJob(jobId)
    pollTimer.current = setInterval(() => {
      void (async () => {
        if (datasetIdRef.current !== startedForDataset) {
          stopPolling()
          setPollingJob(null)
          return
        }
        if (Date.now() - pollStart.current > POLL_TIMEOUT_MS) {
          stopPolling()
          setPollingJob(null)
          toast.info(pick(lang, 'Profiling is still running — check back shortly', 'กำลังทำโปรไฟล์อยู่ — โปรดกลับมาตรวจสอบอีกครั้ง'))
          return
        }
        try {
          const res = await api.profileHistory(datasetIdRef.current)
          const sorted = res.profiles.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          const known = snapshotsRef.current
          const fresh = sorted.find((s) => !known.has(s.id))
          if (fresh) {
            stopPolling()
            setPollingJob(null)
            setSnapshots(sorted)
            setSelectedId(fresh.id)
            toast.success(pick(lang, 'Profiling completed — new snapshot available', 'โปรไฟล์เสร็จสิ้น — มีสแนปช็อตใหม่'))
          }
        } catch {
          // transient polling errors are ignored; timeout handles hard failure
        }
      })()
    }, POLL_INTERVAL_MS)
  }

  // Track known snapshot ids and the active dataset without re-triggering the interval.
  const snapshotsRef = useRef<Set<string>>(new Set())
  const datasetIdRef = useRef(datasetId)
  useEffect(() => {
    snapshotsRef.current = new Set((snapshots ?? []).map((s) => s.id))
  }, [snapshots])
  useEffect(() => {
    datasetIdRef.current = datasetId
  }, [datasetId])

  const selected = (snapshots ?? []).find((s) => s.id === selectedId) ?? snapshots?.[0]
  const numericCol = selected?.columns.find((c) => c.mean != null)

  return (
    <PageShell
      objective={{
        en: 'Inspect column-level statistics over time and trigger read-only profiling runs.',
        th: 'ตรวจดูสถิติระดับคอลัมน์ตามช่วงเวลา และสั่งรันโปรไฟล์แบบอ่านอย่างเดียว',
      }}
      primaryAction={canRun && datasetId ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={pollingJob !== null} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white" data-testid="run-profiling">
              <PlayCircle className="size-4" aria-hidden /> <T en="Run profiling now" th="รันโปรไฟล์เดี๋ยวนี้" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle><T en="Queue a profiling job?" th="เข้าคิวงานโปรไฟล์?" /></AlertDialogTitle>
              <AlertDialogDescription>
                <T
                  en="Profiling reads the dataset read-only and computes column statistics. The view polls for a new snapshot every 3 seconds for up to 30 seconds."
                  th="การทำโปรไฟล์จะอ่านชุดข้อมูลแบบอ่านอย่างเดียวและคำนวณสถิติรายคอลัมน์ หน้านี้จะตรวจสอบสแนปช็อตใหม่ทุก 3 วินาที นานสูงสุด 30 วินาที"
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[40px]"><T en="Cancel" th="ยกเลิก" /></AlertDialogCancel>
              <AlertDialogAction onClick={() => void runProfiling()} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
                <T en="Confirm — queue profiling" th="ยืนยัน — เข้าคิวโปรไฟล์" />
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : undefined}
      guidance={{
        en: 'Profiling never modifies source data. Values that may contain personal data are shown masked.',
        th: 'การทำโปรไฟล์จะไม่แก้ไขข้อมูลต้นทาง ค่าที่อาจมีข้อมูลส่วนบุคคลจะแสดงแบบปิดบัง',
      }}
    >
      {/* Dataset selector */}
      <div className="rounded-lg border bg-card p-3">
        {dsError && <ErrorState message={dsError} retry={() => void loadDatasets()} />}
        {!dsError && datasets === null && <LoadingState rows={2} label={{ en: 'Loading datasets…', th: 'กำลังโหลดชุดข้อมูล…' }} />}
        {!dsError && datasets !== null && (
          <div className="space-y-1.5">
            <label htmlFor="prof-ds" className="text-xs font-medium text-muted-foreground"><T en="Dataset" th="ชุดข้อมูล" /></label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger id="prof-ds" className="min-h-[40px] w-full sm:w-[360px]">
                <SelectValue placeholder={pick(lang, 'Select a dataset', 'เลือกชุดข้อมูล')} />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}{d.domain ? ` · ${d.domain}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {pollingJob && (
        <LoadingState
          rows={3}
          label={{
            en: `Profiling in progress… job queued (id ${pollingJob})`,
            th: `กำลังทำโปรไฟล์… งานเข้าคิวแล้ว (id ${pollingJob})`,
          }}
        />
      )}

      {profileError && !pollingJob && <ErrorState message={profileError} retry={() => void loadHistory(datasetId)} />}

      {!profileError && !pollingJob && snapshots === null && datasetId && (
        <LoadingState rows={5} label={{ en: 'Loading profiling history…', th: 'กำลังโหลดประวัติโปรไฟล์…' }} />
      )}

      {!profileError && !pollingJob && snapshots !== null && snapshots.length === 0 && (
        <EmptyState
          titleEn="No profiling snapshots" titleTh="ไม่มีสแนปช็อตโปรไฟล์"
          bodyEn="Run profiling to compute row counts, null rates, duplicate rates and per-column statistics for this dataset."
          bodyTh="รันโปรไฟล์เพื่อคำนวณจำนวนแถว อัตราค่าว่าง อัตราข้อมูลซ้ำ และสถิติรายคอลัมน์สำหรับชุดข้อมูลนี้"
        />
      )}

      {!profileError && !pollingJob && snapshots !== null && snapshots.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
          {/* Snapshot list */}
          <div className="rounded-lg border bg-card" data-testid="snapshot-list">
            <p className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
              <History className="size-4 text-teal-700" aria-hidden />
              <T en="Snapshot history" th="ประวัติสแนปช็อต" />
            </p>
            <ul className="max-h-[420px] overflow-auto edqp-scroll p-1.5">
              {snapshots.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-current={s.id === selected?.id}
                    className={cn(
                      'min-h-[64px] w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600',
                      s.id === selected?.id ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:bg-muted',
                    )}
                  >
                    <span className="block text-xs font-medium">{fmtDateTime(s.createdAt, lang)}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                      <T en="Rows" th="แถว" /> {fmtNumber(s.rowCount, lang)} · <T en="Null" th="ค่าว่าง" /> {fmtPercent(s.nullRateAvg * (s.nullRateAvg <= 1 ? 100 : 1), lang, 1)} · <T en="Dup" th="ซ้ำ" /> {fmtPercent(s.duplicateRate * (s.duplicateRate <= 1 ? 100 : 1), lang, 1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Snapshot detail */}
          <div className="space-y-3" data-testid="snapshot-detail">
            <div className="grid gap-3 md:grid-cols-3">
              <KpiCard labelEn="Row count" labelTh="จำนวนแถว" value={fmtNumber(selected?.rowCount, lang)} />
              <KpiCard
                labelEn="Average null rate" labelTh="อัตราค่าว่างเฉลี่ย"
                value={fmtPercent(selected ? selected.nullRateAvg * (selected.nullRateAvg <= 1 ? 100 : 1) : null, lang)}
                tone={selected && selected.nullRateAvg > 0.05 ? 'warn' : 'good'}
              />
              <KpiCard
                labelEn="Duplicate rate" labelTh="อัตราข้อมูลซ้ำ"
                value={fmtPercent(selected ? selected.duplicateRate * (selected.duplicateRate <= 1 ? 100 : 1) : null, lang)}
                tone={selected && selected.duplicateRate > 0.01 ? 'warn' : 'good'}
              />
            </div>

            {selected && <Histogram values={selected.columns.map((c) => c.nullRate * 100)} labelEn="Null rate distribution" labelTh="การกระจายอัตราค่าว่าง" />}

            {numericCol && (
              <div className="rounded-lg border bg-card p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  <T en="Numeric summary" th="สรุปตัวเลข" /> · <code className="font-mono text-[11px]">{numericCol.name}</code>
                </p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                  {([
                    ['min', numericCol.min], ['p05', numericCol.p05], ['mean', numericCol.mean],
                    ['median', numericCol.median], ['p95', numericCol.p95], ['max', numericCol.max],
                    ['stddev', numericCol.stddev], ['distinct', numericCol.distinct],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="tabular-nums">{fmtNumber(v, lang, { maximumFractionDigits: 3 })}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <DataTable
              columns={[
                { key: 'col', headerEn: 'Column', headerTh: 'คอลัมน์', render: (c: ColumnProfile) => <code className="font-mono text-xs">{c.name}</code> },
                { key: 'type', headerEn: 'Type', headerTh: 'ชนิด', render: (c: ColumnProfile) => <span className="text-xs">{c.type}</span> },
                { key: 'null', headerEn: 'Null %', headerTh: '% ค่าว่าง', render: (c: ColumnProfile) => <span className={cn('tabular-nums text-sm', c.nullRate > 0.05 && 'font-medium text-amber-700')}>{fmtPercent(c.nullRate * 100, lang)}</span> },
                { key: 'distinct', headerEn: 'Distinct', headerTh: 'ค่าไม่ซ้ำ', render: (c: ColumnProfile) => <span className="tabular-nums text-sm">{c.distinct != null ? fmtNumber(c.distinct, lang) : '—'}</span> },
                {
                  key: 'stats', headerEn: 'Mean / Median / Std', headerTh: 'เฉลี่ย / มัธยฐาน / ส่วนเบี่ยง',
                  render: (c: ColumnProfile) => c.mean != null ? (
                    <span className="tabular-nums text-xs">
                      {fmtNumber(c.mean, lang, { maximumFractionDigits: 3 })} / {fmtNumber(c.median, lang, { maximumFractionDigits: 3 })} / {fmtNumber(c.stddev, lang, { maximumFractionDigits: 3 })}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>,
                },
                {
                  key: 'top', headerEn: 'Top values (masked)', headerTh: 'ค่าที่พบบ่อย (ปิดบัง)',
                  render: (c: ColumnProfile) => (c.topValues && c.topValues.length > 0) ? (
                    <span className="flex flex-wrap gap-1">{c.topValues.slice(0, 3).map((tv, i) => <MaskedChip key={i}>{tv.value}</MaskedChip>)}</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>,
                },
              ]}
              rows={selected?.columns ?? []}
              rowKey={(c) => c.name}
              density="compact"
              caption="Per-column profiling statistics for the selected snapshot"
            />

            {canRun && (
              <Button variant="outline" onClick={() => void runProfiling()} disabled={pollingJob !== null} className="min-h-[40px]">
                <RefreshCw className={cn('size-4', pollingJob && 'animate-spin')} aria-hidden /> <T en="Re-run profiling" th="รันโปรไฟล์อีกครั้ง" />
              </Button>
            )}
            {selected && (
              <p className="text-xs text-muted-foreground">
                <T
                  en={`Snapshot taken ${fmtDateTime(selected.createdAt, lang)} · ${fmtNumber(selected.columns.length, lang)} columns profiled`}
                  th={`สแนปช็อตเมื่อ ${fmtDateTime(selected.createdAt, lang)} · ทำโปรไฟล์ ${fmtNumber(selected.columns.length, lang)} คอลัมน์`}
                />
              </p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
