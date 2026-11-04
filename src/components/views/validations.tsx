'use client'
// Validation runs view — trigger manual runs and monitor executions with full
// traceability (correlation id, trigger source, attempts).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Clock, Copy, Globe, Hand, Loader2, PlayCircle, Repeat, Upload } from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import { hasPermission, type DatasetDTO, type ValidationRunDTO } from '@/lib/types'
import { DataTable, LoadingState, ErrorState, PageShell, StatusBadge } from '@/components/shared/kit'
import { T, fmtDateTime, fmtDuration, fmtNumber, fmtPercent, pick, useLang } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import type { ViewCtx } from './ctx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIAL'] as const

const TRIGGER_META: Record<string, { Icon: React.ElementType; en: string; th: string }> = {
  SCHEDULED: { Icon: Clock, en: 'Scheduled', th: 'ตามกำหนดเวลา' },
  MANUAL: { Icon: Hand, en: 'Manual', th: 'ด้วยตนเอง' },
  API: { Icon: Globe, en: 'API', th: 'ผ่าน API' },
  ON_UPLOAD: { Icon: Upload, en: 'On upload', th: 'จากการอัปโหลด' },
}

export function TriggerBadge({ trigger }: { trigger: string }) {
  const meta = TRIGGER_META[trigger] ?? TRIGGER_META.MANUAL
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700">
      <meta.Icon className="size-3" aria-hidden />
      <T en={meta.en} th={meta.th} />
    </span>
  )
}

function scoreTone(score: number): string {
  return score >= 85 ? 'text-emerald-700' : score >= 70 ? 'text-amber-700' : 'text-red-700'
}

export default function ValidationsView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const { density } = useUi()
  const canRun = hasPermission(ctx.user.role, 'RUN_VALIDATION')

  const [datasets, setDatasets] = useState<DatasetDTO[]>([])
  const [runs, setRuns] = useState<ValidationRunDTO[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [filters, setFilters] = useState({ datasetId: 'ALL', status: 'ALL', q: '' })
  const [debouncedQ, setDebouncedQ] = useState('')
  const seq = useRef(0)

  // Run dialog
  const [runOpen, setRunOpen] = useState(false)
  const [runDataset, setRunDataset] = useState('')
  const [runBusy, setRunBusy] = useState(false)

  // Polling (every 3s for 30s after a manual run)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const loadRuns = useCallback(async (silent = false) => {
    const mySeq = ++seq.current
    if (!silent) { setError(null); setRuns(null) }
    try {
      const res = await api.validations({
        datasetId: filters.datasetId !== 'ALL' ? filters.datasetId : undefined,
        status: filters.status !== 'ALL' ? filters.status : undefined,
        q: debouncedQ || undefined,
      })
      if (mySeq === seq.current) setRuns(res.runs)
    } catch (e) {
      if (mySeq === seq.current) {
        setRuns([])
        setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
      }
    }
  }, [filters.datasetId, filters.status, debouncedQ])

  useEffect(() => {
    api.datasets().then((r) => setDatasets(r.datasets)).catch(() => setDatasets([]))
  }, [])

  useEffect(() => { void loadRuns() }, [loadRuns])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300)
    return () => clearTimeout(t)
  }, [filters.q])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    let ticks = 0
    pollRef.current = setInterval(() => {
      ticks += 1
      void loadRuns(true)
      if (ticks >= 10) stopPolling()
    }, 3000)
  }, [loadRuns, stopPolling])

  const submitRun = async () => {
    if (!runDataset) return
    setRunBusy(true)
    try {
      const res = await api.runValidation({ datasetId: runDataset, trigger: 'MANUAL' })
      if (res.runId) {
        toast.success(pick(lang, `Validation queued. Correlation id: ${res.correlationId}`, `เข้าคิวตรวจสอบแล้ว รหัสสหพันธ์: ${res.correlationId}`))
      } else {
        toast.warning(pick(lang, `No run was queued (correlation id ${res.correlationId}). Check that the dataset has active rules.`, `ไม่มีการเข้าคิว (รหัสสหพันธ์ ${res.correlationId}) ตรวจสอบว่าชุดข้อมูลมีกฎที่ใช้งานอยู่`))
      }
      setRunOpen(false)
      setRunDataset('')
      await loadRuns(true)
      startPolling()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : pick(lang, 'Could not queue the validation', 'ไม่สามารถเข้าคิวการตรวจสอบได้'))
    } finally {
      setRunBusy(false)
    }
  }

  const copyCorrelation = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success(pick(lang, 'Correlation id copied', 'คัดลอกรหัสสหพันธ์แล้ว'))
    } catch {
      toast.error(pick(lang, 'Copy failed', 'คัดลอกไม่สำเร็จ'))
    }
  }

  const columns = useMemo(() => [
    { key: 'started', headerEn: 'Started', headerTh: 'เริ่มต้น', render: (r: ValidationRunDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.startedAt, lang)}</span> },
    { key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r: ValidationRunDTO) => <span className="text-sm font-medium">{r.datasetName ?? r.datasetId}</span> },
    { key: 'trigger', headerEn: 'Trigger', headerTh: 'ที่มา', render: (r: ValidationRunDTO) => <TriggerBadge trigger={r.trigger} /> },
    { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (r: ValidationRunDTO) => <StatusBadge kind={r.status} /> },
    {
      key: 'score', headerEn: 'Score', headerTh: 'คะแนน', className: 'tabular-nums',
      render: (r: ValidationRunDTO) => <span className={`font-semibold tabular-nums ${scoreTone(r.qualityScore)}`}>{fmtNumber(r.qualityScore, lang, { maximumFractionDigits: 1 })}</span>,
    },
    { key: 'coverage', headerEn: 'Coverage', headerTh: 'ความครอบคลุม', render: (r: ValidationRunDTO) => <span className="tabular-nums">{fmtPercent(r.coverage * 100, lang, 0)}</span> },
    {
      key: 'rules', headerEn: 'Rules passed', headerTh: 'กฎที่ผ่าน',
      render: (r: ValidationRunDTO) => (
        <span className="whitespace-nowrap tabular-nums text-xs">
          <span className="font-semibold text-emerald-700">{fmtNumber(r.rulesPassed, lang)}</span>
          {' / '}
          {fmtNumber(r.rulesTotal, lang)}
        </span>
      ),
    },
    { key: 'duration', headerEn: 'Duration', headerTh: 'ระยะเวลา', render: (r: ValidationRunDTO) => <span className="whitespace-nowrap tabular-nums text-xs">{fmtDuration(r.durationMs, lang)}</span> },
    {
      key: 'attempt', headerEn: 'Attempt', headerTh: 'ความพยายาม',
      render: (r: ValidationRunDTO) => r.attempt > 1 ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
          <Repeat className="size-3.5" aria-hidden /> <T en={`attempt ${r.attempt}`} th={`ครั้งที่ ${r.attempt}`} />
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">1</span>
      ),
    },
    {
      key: 'correlation', headerEn: 'Correlation', headerTh: 'รหัสสหพันธ์',
      render: (r: ValidationRunDTO) => (
        <span className="inline-flex items-center gap-1">
          <code className="max-w-[130px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs" title={r.correlationId}>{r.correlationId}</code>
          <Button variant="ghost" size="icon" className="size-9" aria-label={pick(lang, `Copy correlation id ${r.correlationId}`, `คัดลอกรหัสสหพันธ์ ${r.correlationId}`)} onClick={(e) => { e.stopPropagation(); void copyCorrelation(r.correlationId) }}>
            <Copy className="size-3.5" aria-hidden />
          </Button>
        </span>
      ),
    },
  ], [lang])

  return (
    <PageShell
      objective={{
        en: 'Trigger and monitor validation executions with full traceability.',
        th: 'สั่งและติดตามการรันการตรวจสอบคุณภาพข้อมูล พร้อมความสามารถตรวจสอบย้อนกลับอย่างครบถ้วน',
      }}
      primaryAction={canRun ? (
        <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => setRunOpen(true)}>
          <PlayCircle className="size-4" aria-hidden /> <T en="Run validation" th="รันการตรวจสอบ" />
        </Button>
      ) : undefined}
      guidance={{
        en: 'Every run carries a correlation id linking its results, evidence and audit events. Idempotency guarantees results are written once per correlation id.',
        th: 'ทุกการรันมีรหัสสหพันธ์เชื่อมผลลัพธ์ หลักฐาน และเหตุการณ์ตรวจสอบ ระบบรับประกันว่าผลลัพธ์ถูกบันทึกเพียงครั้งเดียวต่อรหัสสหพันธ์',
      }}
    >
      {/* Filters */}
      <div className="rounded-lg border bg-card p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={filters.datasetId} onValueChange={(v) => setFilters((f) => ({ ...f, datasetId: v }))}>
            <SelectTrigger className="min-h-[40px] w-full" aria-label={pick(lang, 'Filter by dataset', 'กรองตามชุดข้อมูล')}>
              <SelectValue placeholder={<T en="All datasets" th="ทุกชุดข้อมูล" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><T en="All datasets" th="ทุกชุดข้อมูล" /></SelectItem>
              {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="min-h-[40px] w-full" aria-label={pick(lang, 'Filter by status', 'กรองตามสถานะ')}>
              <SelectValue placeholder={<T en="All statuses" th="ทุกสถานะ" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><T en="All statuses" th="ทุกสถานะ" /></SelectItem>
              {RUN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="sm:col-span-2">
            <Input
              type="search"
              className="min-h-[40px]"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder={lang === 'th' ? 'ค้นหาด้วยรหัสสหพันธ์' : 'Search by correlation id…'}
              aria-label={pick(lang, 'Search runs by correlation id', 'ค้นหาการรันด้วยรหัสสหพันธ์')}
            />
          </div>
        </div>
      </div>

      {/* List */}
      {error ? (
        <ErrorState message={error.message} auditId={error.auditId} retry={() => void loadRuns()} />
      ) : runs === null ? (
        <LoadingState rows={8} />
      ) : (
        <DataTable
          columns={columns}
          rows={runs}
          rowKey={(r) => r.id}
          onRowClick={(r) => ctx.navigate('validation-detail', { id: r.id })}
          density={density}
          caption={lang === 'th' ? 'ประวัติการรันการตรวจสอบ' : 'Validation run history'}
          emptyEn="No validation runs match the current filters."
          emptyTh="ไม่พบการรันที่ตรงกับตัวกรอง"
        />
      )}

      {/* Run validation dialog */}
      <Dialog open={runOpen} onOpenChange={(o) => { if (!o) setRunOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle><T en="Run validation" th="รันการตรวจสอบ" /></DialogTitle>
            <DialogDescription>
              <T
                en="Executes the dataset's active rule set now. The run is traceable by correlation id and recorded in the audit trail. Source data is never modified."
                th="รันชุดกฎที่ใช้งานอยู่ของชุดข้อมูลทันที สามารถตรวจสอบย้อนกลับได้ด้วยรหัสสหพันธ์ และบันทึกในระบบตรวจสอบ ข้อมูลต้นทางจะไม่ถูกแก้ไข"
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="run-dataset" className="text-sm font-medium"><T en="Dataset" th="ชุดข้อมูล" /></label>
            <Select value={runDataset || undefined} onValueChange={setRunDataset}>
              <SelectTrigger id="run-dataset" className="min-h-[40px] w-full" aria-invalid={!runDataset}>
                <SelectValue placeholder={pick(lang, 'Select a dataset…', 'เลือกชุดข้อมูล…')} />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!runDataset && <p className="text-xs text-red-700"><T en="Choose the dataset to validate." th="เลือกชุดข้อมูลที่ต้องการตรวจสอบ" /></p>}
            <p className="pt-1 text-xs text-muted-foreground">
              <T en="Trigger: Manual (you). Scheduled and API runs appear with their own trigger badges." th="ที่มา: ด้วยตนเอง การรันตามกำหนดเวลาและผ่าน API จะแสดงป้ายที่มาของตัวเอง" />
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[40px]" onClick={() => setRunOpen(false)} disabled={runBusy}><T en="Cancel" th="ยกเลิก" /></Button>
            <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => void submitRun()} disabled={runBusy || !runDataset}>
              {runBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PlayCircle className="size-4" aria-hidden />}
              <T en="Run now" th="รันเลย" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
