'use client'
// Dataset detail — header card with governance metadata + 10 lazy-loaded tabs.
// Deny-by-default: a 404 from the API renders as "not found or not permitted" (no existence disclosure).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight, CheckCircle2, CircleMinus, Clock3, Database, EyeOff, FileDown, PlayCircle,
  ShieldAlert, ShieldCheck, Star, Timer, User,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import { hasPermission, type AnomalyDTO, type AuditLogDTO, type ColumnProfile, type DatasetDTO, type IssueDTO, type ValidationRunDTO } from '@/lib/types'
import {
  PageShell, LoadingState, EmptyState, ErrorState, DeniedState, StatusBadge, ClassificationBadge,
  DataTable, KeyValue, KpiCard, ScoreRing, MaskedChip, MlDisclaimer,
} from '@/components/shared/kit'
import { TrendLine, HBar, Histogram } from '@/components/shared/charts'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { T, pick, useLang, fmtDateTime, fmtDuration, fmtNumber, fmtPercent } from '@/lib/i18n'
import type { ViewCtx } from './ctx'
import { cn } from '@/lib/utils'

// ─── Column shape (mirrors api.dataset columns) ───────────────────────────────
interface ColumnDTO {
  id: string; name: string; dataType: string; nullable: boolean
  isPii: boolean; piiType?: string | null; classification?: string | null
  description?: string | null; isCde: boolean; position: number
}

// ─── Defensive tab payload shapes ─────────────────────────────────────────────
interface ProfileSnapshotLite {
  id: string; createdAt: string; rowCount: number; nullRateAvg: number; duplicateRate: number
  columns: ColumnProfile[]
}
interface RuleLite {
  id: string; code: string; name: string; nameTh?: string | null; dimension: string
  severity: string; isActive: boolean; passRate?: number | null
  latestVersion?: { status: string } | null
}
interface DownstreamRef { id: string; name: string; relationship?: string | null }
interface GrantLite { userName: string; level: string; reason?: string | null; grantedAt: string }

const TABS = [
  { key: 'overview', en: 'Overview', th: 'ภาพรวม' },
  { key: 'schema', en: 'Schema', th: 'โครงสร้าง' },
  { key: 'profile', en: 'Profile', th: 'โปรไฟล์' },
  { key: 'rules', en: 'Rules', th: 'กฎการตรวจ' },
  { key: 'runs', en: 'Validation history', th: 'ประวัติการตรวจสอบ' },
  { key: 'anomalies', en: 'Anomalies', th: 'ความผิดปกติ' },
  { key: 'issues', en: 'Issues', th: 'ปัญหา' },
  { key: 'lineage', en: 'Lineage', th: 'สายที่มาข้อมูล' },
  { key: 'access', en: 'Access', th: 'สิทธิ์การเข้าถึง' },
  { key: 'audit', en: 'Audit', th: 'บันทึกตรวจสอบ' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface TabEntry { status: 'loading' | 'ok' | 'error' | 'denied'; nonce: number; data: Record<string, unknown>; message?: string }

function ClickableKpi({ onClick, children, label }: { onClick: () => void; children: ReactNode; label: string }) {
  return (
    <div
      role="button" tabIndex={0} aria-label={label} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="cursor-pointer rounded-lg transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
    >
      {children}
    </div>
  )
}

function DeniedNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <T en="Access detail requires elevated permission." th="การดูรายละเอียดสิทธิ์ต้องใช้สิทธิ์ระดับสูงกว่า" />
    </p>
  )
}

export default function DatasetDetail({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const id = ctx.params.id

  const [dataset, setDataset] = useState<DatasetDTO | null>(null)
  const [columns, setColumns] = useState<ColumnDTO[]>([])
  const [headError, setHeadError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)

  const [selectedTab, setSelectedTab] = useState<TabKey>('overview')
  const [tabState, setTabState] = useState<Record<string, TabEntry>>({})
  const [nonce, setNonce] = useState(0)
  const loadedRef = useRef<Record<string, number>>({})

  const canRunValidation = hasPermission(ctx.user.role, 'RUN_VALIDATION')
  const canProfile = hasPermission(ctx.user.role, 'VIEW_PROFILE') &&
    ['SYSTEM_ADMIN', 'DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER'].includes(ctx.user.role)

  // ── Header fetch ────────────────────────────────────────────────────────────
  const loadHeader = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.dataset(id)
      setDataset(res.dataset)
      setColumns((res.columns ?? []) as ColumnDTO[])
      setDenied(false)
      setHeadError(null)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
        setDenied(true)
        setDataset(null)
        setColumns([])
        return
      }
      setDataset(null)
      setColumns([])
      setHeadError(e instanceof ApiError ? e.message : 'Failed to load dataset')
    }
  }, [id])

  useEffect(() => { void loadHeader() }, [loadHeader])

  // ── Lazy tab fetch (memoised per dataset+tab in the state map) ──────────────
  const fetchTab = useCallback(async (tab: string, n: number) => {
    const mapKey = `${id}:${tab}`
    setTabState((m) => ({ ...m, [mapKey]: { status: 'loading', nonce: n, data: m[mapKey]?.data ?? {} } }))
    try {
      const data = await api.datasetTabs(id, tab)
      setTabState((m) => ({ ...m, [mapKey]: { status: 'ok', nonce: n, data: data ?? {} } }))
    } catch (e) {
      const isDenied = e instanceof ApiError && (e.status === 403 || e.status === 404)
      setTabState((m) => ({
        ...m,
        [mapKey]: {
          status: isDenied ? 'denied' : 'error', nonce: n, data: {},
          message: e instanceof ApiError ? e.message : 'Failed to load tab',
        },
      }))
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const mapKey = `${id}:${selectedTab}`
    if (loadedRef.current[mapKey] === nonce) return
    loadedRef.current[mapKey] = nonce
    void fetchTab(selectedTab, nonce)
  }, [selectedTab, nonce, fetchTab, id])

  // Per-tab state accessor scoped to the current dataset id.
  const ts = (tab: TabKey): TabEntry | undefined => tabState[`${id}:${tab}`]
  const reloadTab = () => setNonce((n) => n + 1)

  // ── Actions ─────────────────────────────────────────────────────────────────
  const runValidation = async () => {
    if (!id) return
    setBusy(true)
    try {
      const res = await api.runValidation({ datasetId: id, trigger: 'MANUAL' })
      toast.success(pick(lang, `Validation queued (correlation ${res.correlationId})`, `เข้าคิวตรวจสอบแล้ว (รหัสสหพันธ์ ${res.correlationId})`))
      ctx.navigate('validations')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to queue validation'
      toast.error(pick(lang, 'Could not queue validation', 'ไม่สามารถเข้าคิวตรวจสอบได้'), { description: msg })
    } finally {
      setBusy(false)
    }
  }

  const runProfiling = async () => {
    if (!id) return
    setBusy(true)
    try {
      const res = await api.runProfiling(id)
      toast.success(pick(lang, `Profiling job queued (id ${res.jobId})`, `เข้าคิวงานโปรไฟล์แล้ว (id ${res.jobId})`))
      setSelectedTab('profile')
      reloadTab()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to queue profiling'
      toast.error(pick(lang, 'Could not queue profiling', 'ไม่สามารถเข้าคิวโปรไฟล์ได้'), { description: msg })
    } finally {
      setBusy(false)
    }
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!id) {
    return (
      <PageShell objective={{ en: 'Dataset quality detail', th: 'รายละเอียดคุณภาพชุดข้อมูล' }}>
        <ErrorState message={pick(lang, 'No dataset was selected. Open a dataset from the catalogue.', 'ยังไม่ได้เลือกชุดข้อมูล โปรดเปิดจากบัญชีชุดข้อมูล')} retry={() => ctx.navigate('catalogue')} />
      </PageShell>
    )
  }

  if (denied) {
    return (
      <PageShell objective={{ en: 'Dataset quality detail', th: 'รายละเอียดคุณภาพชุดข้อมูล' }}>
        <p className="rounded-lg border bg-card p-3 text-sm font-medium">
          <T en="Resource not found or not permitted" th="ไม่พบทรัพยากรหรือไม่ได้รับอนุญาต" />
        </p>
        <DeniedState resourceEn="this dataset" />
      </PageShell>
    )
  }

  if (headError) {
    return (
      <PageShell objective={{ en: 'Dataset quality detail', th: 'รายละเอียดคุณภาพชุดข้อมูล' }}>
        <ErrorState message={headError} retry={() => void loadHeader()} />
      </PageShell>
    )
  }

  if (!dataset) {
    return (
      <PageShell objective={{ en: 'Dataset quality detail', th: 'รายละเอียดคุณภาพชุดข้อมูล' }}>
        <LoadingState rows={6} label={{ en: 'Loading dataset…', th: 'กำลังโหลดชุดข้อมูล…' }} />
      </PageShell>
    )
  }

  const ownerName = (dataset as unknown as { ownerName?: string | null }).ownerName ?? dataset.ownerId
  const stewardName = (dataset as unknown as { stewardName?: string | null }).stewardName ?? dataset.stewardId
  const criticality = (dataset.criticality as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM'

  return (
    <PageShell
      objective={{
        en: `Assess quality, governance and lineage of ${dataset.name}.`,
        th: `ประเมินคุณภาพ การกำกับดูแล และสายที่มาของ ${dataset.name}`,
      }}
      primaryAction={canRunValidation ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={busy} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white" data-testid="run-validation">
              <PlayCircle className="size-4" aria-hidden /> <T en="Run validation" th="รันการตรวจสอบ" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle><T en="Queue a validation run?" th="เข้าคิวการตรวจสอบ?" /></AlertDialogTitle>
              <AlertDialogDescription>
                <T
                  en={`This will evaluate all active rules for ${dataset.name} against version ${dataset.version}. Source data is never modified.`}
                  th={`ระบบจะประเมินกฎที่ใช้งานทั้งหมดของ ${dataset.name} กับเวอร์ชัน ${dataset.version} ข้อมูลต้นทางจะไม่ถูกแก้ไข`}
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[40px]"><T en="Cancel" th="ยกเลิก" /></AlertDialogCancel>
              <AlertDialogAction onClick={() => void runValidation()} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
                <T en="Confirm — queue run" th="ยืนยัน — เข้าคิว" />
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : undefined}
      secondaryActions={
        <>
          {canProfile && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={busy} className="min-h-[40px]">
                  <Timer className="size-4" aria-hidden /> <T en="Profile now" th="ทำโปรไฟล์เดี๋ยวนี้" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle><T en="Queue a profiling job?" th="เข้าคิวงานโปรไฟล์?" /></AlertDialogTitle>
                  <AlertDialogDescription>
                    <T
                      en="Profiling reads the dataset read-only and computes column statistics. Existing snapshots are kept."
                      th="การทำโปรไฟล์จะอ่านชุดข้อมูลแบบอ่านอย่างเดียวและคำนวณสถิติรายคอลัมน์ สแนปช็อตเดิมจะถูกเก็บไว้"
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
          )}
          <Button variant="outline" onClick={() => ctx.navigate('reports')} className="min-h-[40px]">
            <FileDown className="size-4" aria-hidden /> <T en="Export report" th="ส่งออกรายงาน" />
          </Button>
        </>
      }
    >
      {/* ── Header card ── */}
      <div className="rounded-lg border bg-card p-4 shadow-sm" data-testid="dataset-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold" title={dataset.name}>{dataset.name}</h1>
              <ClassificationBadge level={dataset.classification} />
              <StatusBadge kind={criticality} />
              {dataset.isCde && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                  <Star className="size-3 fill-amber-400 text-amber-500" aria-hidden />CDE
                </span>
              )}
              <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{dataset.version}</span>
            </div>
            {dataset.nameTh && <p className="mt-0.5 text-sm text-muted-foreground">{dataset.nameTh}</p>}
            <p className="mt-2 max-w-3xl text-sm text-foreground/90">{dataset.description}</p>
            <div className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
              <KeyValue kEn="Rows" kTh="จำนวนแถว"><span className="tabular-nums">{fmtNumber(dataset.rowCount, lang)}</span></KeyValue>
              <KeyValue kEn="Columns" kTh="จำนวนคอลัมน์"><span className="tabular-nums">{fmtNumber(dataset.columnCount, lang)}</span></KeyValue>
              <KeyValue kEn="PII fields" kTh="ฟิลด์ PII">
                <span className="inline-flex items-center gap-1 tabular-nums"><EyeOff className="size-3.5 text-violet-700" aria-hidden />{fmtNumber(dataset.piiFields, lang)}</span>
              </KeyValue>
              <KeyValue kEn="Refresh SLA" kTh="SLA การรีเฟรช"><span className="tabular-nums"><T en={`${dataset.slaHours} hours`} th={`${dataset.slaHours} ชั่วโมง`} /></span></KeyValue>
              <KeyValue kEn="Owner" kTh="เจ้าของข้อมูล"><span className="inline-flex items-center gap-1"><User className="size-3.5 text-muted-foreground" aria-hidden />{ownerName}</span></KeyValue>
              <KeyValue kEn="Steward" kTh="ผู้ดูแลข้อมูล"><span className="inline-flex items-center gap-1"><User className="size-3.5 text-muted-foreground" aria-hidden />{stewardName}</span></KeyValue>
              <KeyValue kEn="Last refresh" kTh="รีเฟรชล่าสุด"><span className="tabular-nums">{fmtDateTime(dataset.lastRefreshAt, lang)}</span></KeyValue>
              <KeyValue kEn="Source" kTh="แหล่งข้อมูล">
                {dataset.source ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Database className="size-3.5 text-teal-700" aria-hidden />{dataset.source.name}
                    <span className="text-xs text-muted-foreground">({dataset.source.type.replaceAll('_', ' ')})</span>
                    <StatusBadge kind={(dataset.source.health as 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN') ?? 'UNKNOWN'} />
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </KeyValue>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border bg-muted/30 p-3">
            <span className="text-xs font-medium text-muted-foreground"><T en="Quality score" th="คะแนนคุณภาพ" /></span>
            {dataset.qualityScore != null ? <ScoreRing score={dataset.qualityScore} size={88} /> : <span className="py-6 text-sm text-muted-foreground">—</span>}
            {dataset.lastRunAt && <span className="text-[11px] text-muted-foreground">{fmtDateTime(dataset.lastRunAt, lang)}</span>}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as TabKey)} className="gap-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="min-h-[40px] px-3">{lang === 'th' ? t.th : t.en}</TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          {ts('overview')?.status === 'loading' && <LoadingState rows={4} />}
          {ts('overview')?.status === 'error' && <ErrorState message={ts('overview')?.message} retry={() => reloadTab()} />}
          {ts('overview')?.status === 'denied' && <DeniedNote />}
          {ts('overview')?.status === 'ok' && <OverviewTab data={ts('overview')!.data} onOpenTab={(t) => setSelectedTab(t as TabKey)} />}
        </TabsContent>

        {/* Schema */}
        <TabsContent value="schema">
          {ts('schema')?.status === 'loading' && <LoadingState rows={6} />}
          {ts('schema')?.status === 'error' && <ErrorState message={ts('schema')?.message} retry={() => reloadTab()} />}
          {ts('schema')?.status === 'denied' && <DeniedNote />}
          {(!ts('schema') || ts('schema')?.status === 'ok') && (
            <SchemaTab payloadColumns={(ts('schema')?.data?.columns as ColumnDTO[] | undefined) ?? undefined} columns={columns} />
          )}
        </TabsContent>

        {/* Profile */}
        <TabsContent value="profile">
          {ts('profile')?.status === 'loading' && <LoadingState rows={6} />}
          {ts('profile')?.status === 'error' && <ErrorState message={ts('profile')?.message} retry={() => reloadTab()} />}
          {ts('profile')?.status === 'denied' && <DeniedNote />}
          {ts('profile')?.status === 'ok' && (
            <ProfileTab
              data={ts('profile')!.data}
              canProfile={canProfile}
              busy={busy}
              onRun={() => void runProfiling()}
            />
          )}
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules">
          {ts('rules')?.status === 'loading' && <LoadingState rows={5} />}
          {ts('rules')?.status === 'error' && <ErrorState message={ts('rules')?.message} retry={() => reloadTab()} />}
          {ts('rules')?.status === 'denied' && <DeniedNote />}
          {ts('rules')?.status === 'ok' && <RulesTab data={ts('rules')!.data} onOpenRules={() => ctx.navigate('rules')} />}
        </TabsContent>

        {/* Validation history */}
        <TabsContent value="runs">
          {ts('runs')?.status === 'loading' && <LoadingState rows={6} />}
          {ts('runs')?.status === 'error' && <ErrorState message={ts('runs')?.message} retry={() => reloadTab()} />}
          {ts('runs')?.status === 'denied' && <DeniedNote />}
          {ts('runs')?.status === 'ok' && <RunsTab data={ts('runs')!.data} onOpen={(runId) => ctx.navigate('validation-detail', { id: runId })} />}
        </TabsContent>

        {/* Anomalies */}
        <TabsContent value="anomalies">
          {ts('anomalies')?.status === 'loading' && <LoadingState rows={5} />}
          {ts('anomalies')?.status === 'error' && <ErrorState message={ts('anomalies')?.message} retry={() => reloadTab()} />}
          {ts('anomalies')?.status === 'denied' && <DeniedNote />}
          {ts('anomalies')?.status === 'ok' && <AnomaliesTab data={ts('anomalies')!.data} onOpenAll={() => ctx.navigate('anomalies')} />}
        </TabsContent>

        {/* Issues */}
        <TabsContent value="issues">
          {ts('issues')?.status === 'loading' && <LoadingState rows={5} />}
          {ts('issues')?.status === 'error' && <ErrorState message={ts('issues')?.message} retry={() => reloadTab()} />}
          {ts('issues')?.status === 'denied' && <DeniedNote />}
          {ts('issues')?.status === 'ok' && <IssuesTab data={ts('issues')!.data} onOpenAll={() => ctx.navigate('issues')} />}
        </TabsContent>

        {/* Lineage */}
        <TabsContent value="lineage">
          {ts('lineage')?.status === 'loading' && <LoadingState rows={3} />}
          {ts('lineage')?.status === 'error' && <ErrorState message={ts('lineage')?.message} retry={() => reloadTab()} />}
          {ts('lineage')?.status === 'denied' && <DeniedNote />}
          {ts('lineage')?.status === 'ok' && (
            <LineageTab data={ts('lineage')!.data} dataset={dataset} onOpen={(dsId) => ctx.navigate('dataset-detail', { id: dsId })} />
          )}
        </TabsContent>

        {/* Access */}
        <TabsContent value="access">
          {ts('access')?.status === 'loading' && <LoadingState rows={4} />}
          {ts('access')?.status === 'error' && <ErrorState message={ts('access')?.message} retry={() => reloadTab()} />}
          {ts('access')?.status === 'denied' && <DeniedNote />}
          {ts('access')?.status === 'ok' && <AccessTab data={ts('access')!.data} dataset={dataset} />}
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit">
          {ts('audit')?.status === 'loading' && <LoadingState rows={5} />}
          {ts('audit')?.status === 'error' && <ErrorState message={ts('audit')?.message} retry={() => reloadTab()} />}
          {ts('audit')?.status === 'denied' && <DeniedNote />}
          {ts('audit')?.status === 'ok' && <AuditTab data={ts('audit')!.data} />}
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

// ─── Overview tab ───────────────────────────────────────────────────────────────
function OverviewTab({ data, onOpenTab }: { data: Record<string, unknown>; onOpenTab: (t: string) => void }) {
  const { lang } = useLang()
  const latestRun = data.latestRun as ValidationRunDTO | null | undefined
  const scoreTrend = (data.scoreTrend as { date: string; score: number }[] | undefined) ?? []
  // dimensionRates may arrive as an array or a keyed record — normalise defensively.
  const dimensionRates = ((): { dimension: string; rate: number }[] => {
    const dr = data.dimensionRates
    if (Array.isArray(dr)) return dr as { dimension: string; rate: number }[]
    if (dr && typeof dr === 'object') {
      return Object.entries(dr as Record<string, { rate?: number }>).map(([dimension, v]) => ({ dimension, rate: v?.rate ?? 0 }))
    }
    return []
  })()
  const openIssues = (data.openIssues as number | undefined) ?? 0
  const activeRules = (data.activeRules as number | undefined) ?? 0
  const openAnomalies = (data.openAnomalies as number | undefined) ?? 0

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold"><T en="Latest validation run" th="การตรวจสอบล่าสุด" /></h3>
        {latestRun ? (
          <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            <KeyValue kEn="Score" kTh="คะแนน"><span className="font-semibold tabular-nums">{fmtNumber(latestRun.qualityScore, lang, { maximumFractionDigits: 1 })}</span></KeyValue>
            <KeyValue kEn="Coverage" kTh="การครอบคลุม">{fmtPercent(latestRun.coverage * (latestRun.coverage <= 1 ? 100 : 1), lang)}</KeyValue>
            <KeyValue kEn="Rules passed" kTh="กฎที่ผ่าน"><span className="tabular-nums">{fmtNumber(latestRun.rulesPassed, lang)} / {fmtNumber(latestRun.rulesTotal, lang)}</span></KeyValue>
            <KeyValue kEn="Duration" kTh="ระยะเวลา">{fmtDuration(latestRun.durationMs, lang)}</KeyValue>
            <KeyValue kEn="Trigger" kTh="ที่มา">{latestRun.trigger}</KeyValue>
            <KeyValue kEn="Correlation ID" kTh="รหัสสหพันธ์"><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{latestRun.correlationId}</code></KeyValue>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground"><T en="No validation run recorded yet." th="ยังไม่มีประวัติการตรวจสอบ" /></p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ClickableKpi label={pick(lang, 'Open issues — open Issues tab', 'ปัญหาที่เปิดอยู่ — เปิดแท็บปัญหา')} onClick={() => onOpenTab('issues')}>
          <KpiCard labelEn="Open issues" labelTh="ปัญหาที่เปิดอยู่" value={fmtNumber(openIssues, lang)} tone={openIssues > 0 ? 'warn' : 'good'} />
        </ClickableKpi>
        <ClickableKpi label={pick(lang, 'Active rules — open Rules tab', 'กฎที่ใช้งาน — เปิดแท็บกฎ')} onClick={() => onOpenTab('rules')}>
          <KpiCard labelEn="Active rules" labelTh="กฎที่ใช้งาน" value={fmtNumber(activeRules, lang)} />
        </ClickableKpi>
        <ClickableKpi label={pick(lang, 'Open anomalies — open Anomalies tab', 'ความผิดปกติที่เปิดอยู่ — เปิดแท็บความผิดปกติ')} onClick={() => onOpenTab('anomalies')}>
          <KpiCard labelEn="Open anomalies" labelTh="ความผิดปกติที่เปิดอยู่" value={fmtNumber(openAnomalies, lang)} tone={openAnomalies > 0 ? 'warn' : 'good'} />
        </ClickableKpi>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TrendLine
          points={scoreTrend.map((p) => ({ label: p.date?.slice(5) ?? '', value: p.score }))}
          labelEn="Score trend" labelTh="แนวโน้มคะแนน"
        />
        <HBar
          points={dimensionRates.map((d) => ({ label: d.dimension.replaceAll('_', ' '), value: d.rate <= 1 ? d.rate * 100 : d.rate }))}
          labelEn="Dimension pass rates" labelTh="อัตราผ่านรายมิติ"
        />
      </div>
    </div>
  )
}

// ─── Schema tab ─────────────────────────────────────────────────────────────────
function SchemaTab({ payloadColumns, columns }: { payloadColumns?: ColumnDTO[]; columns: ColumnDTO[] }) {
  const cols = (payloadColumns && payloadColumns.length > 0 ? payloadColumns : columns)
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-900">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <T en="PII columns are masked in all evidence, previews and exports." th="คอลัมน์ PII จะถูกปิดบังในหลักฐาน การแสดงตัวอย่าง และการส่งออกทั้งหมด" />
      </p>
      <DataTable
        columns={[
          { key: 'name', headerEn: 'Column', headerTh: 'คอลัมน์', render: (c: ColumnDTO) => <code className="font-mono text-xs">{c.name}</code> },
          { key: 'type', headerEn: 'Type', headerTh: 'ชนิดข้อมูล', render: (c: ColumnDTO) => <span className="text-xs">{c.dataType}</span> },
          {
            key: 'nullable', headerEn: 'Nullable', headerTh: 'เป็นค่าว่างได้',
            render: (c: ColumnDTO) => c.nullable ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CircleMinus className="size-3.5" aria-hidden /><T en="Yes" th="ได้" /></span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden /><T en="No" th="ไม่ได้" /></span>
            ),
          },
          {
            key: 'cde', headerEn: 'CDE', headerTh: 'CDE',
            render: (c: ColumnDTO) => c.isCde ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800"><Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden /><T en="Yes" th="ใช่" /></span>
            ) : <span className="text-xs text-muted-foreground">—</span>,
          },
          {
            key: 'pii', headerEn: 'PII', headerTh: 'PII',
            render: (c: ColumnDTO) => c.isPii ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-800">
                <ShieldAlert className="size-3.5" aria-hidden />{c.piiType ?? 'PII'}
              </span>
            ) : <span className="text-xs text-muted-foreground">—</span>,
          },
          { key: 'cls', headerEn: 'Classification', headerTh: 'ระดับชั้นความลับ', render: (c: ColumnDTO) => c.classification ? <ClassificationBadge level={c.classification} /> : <span className="text-xs text-muted-foreground">—</span> },
          { key: 'desc', headerEn: 'Description', headerTh: 'คำอธิบาย', render: (c: ColumnDTO) => <span className="text-xs text-muted-foreground">{c.description ?? '—'}</span> },
        ]}
        rows={cols}
        rowKey={(c) => c.id}
        caption="Dataset schema — column, type, nullability, CDE, PII, classification and description"
      />
    </div>
  )
}

// ─── Profile tab ────────────────────────────────────────────────────────────────
function ProfileTab({ data, canProfile, busy, onRun }: { data: Record<string, unknown>; canProfile: boolean; busy: boolean; onRun: () => void }) {
  const { lang } = useLang()
  const [selectedId, setSelectedId] = useState<string>('')
  const profiles = ((data.profiles as ProfileSnapshotLite[] | undefined) ?? []).slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0]

  if (profiles.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          titleEn="No profiling snapshots yet" titleTh="ยังไม่มีสแนปช็อตโปรไฟล์"
          bodyEn="Run profiling to compute column statistics such as null rates, distinct counts and numeric summaries."
          bodyTh="รันโปรไฟล์เพื่อคำนวณสถิติรายคอลัมน์ เช่น อัตราค่าว่าง จำนวนค่าไม่ซ้ำ และสรุปตัวเลข"
          action={canProfile ? (
            <Button onClick={onRun} disabled={busy} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
              <Timer className="size-4" aria-hidden /> <T en="Run profiling" th="รันโปรไฟล์" />
            </Button>
          ) : undefined}
        />
      </div>
    )
  }

  const numericCols = selected.columns.filter((c) => c.mean != null)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1.5">
          <Select value={selected?.id ?? ''} onValueChange={setSelectedId}>
            <SelectTrigger className="min-h-[40px] w-[280px]" aria-label={pick(lang, 'Profile snapshot', 'สแนปช็อตโปรไฟล์')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{fmtDateTime(p.createdAt, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canProfile && (
          <Button onClick={onRun} disabled={busy} variant="outline" className="min-h-[40px]">
            <Timer className="size-4" aria-hidden /> <T en="Run profiling" th="รันโปรไฟล์" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard labelEn="Row count" labelTh="จำนวนแถว" value={fmtNumber(selected.rowCount, lang)} />
        <KpiCard labelEn="Average null rate" labelTh="อัตราค่าว่างเฉลี่ย" value={fmtPercent(selected.nullRateAvg * (selected.nullRateAvg <= 1 ? 100 : 1), lang)} tone={selected.nullRateAvg > 0.05 ? 'warn' : 'good'} />
        <KpiCard labelEn="Duplicate rate" labelTh="อัตราข้อมูลซ้ำ" value={fmtPercent(selected.duplicateRate * (selected.duplicateRate <= 1 ? 100 : 1), lang)} tone={selected.duplicateRate > 0.01 ? 'warn' : 'good'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Histogram
          values={selected.columns.map((c) => c.nullRate * 100)}
          labelEn="Null rate distribution" labelTh="การกระจายอัตราค่าว่าง"
        />
        {numericCols.length > 0 && (
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground"><T en="Numeric column summary" th="สรุปคอลัมน์ตัวเลข" /></p>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <KeyValue kEn="Column" kTh="คอลัมน์"><code className="font-mono text-xs">{numericCols[0].name}</code></KeyValue>
              <KeyValue kEn="Mean" kTh="ค่าเฉลี่ย"><span className="tabular-nums">{fmtNumber(numericCols[0].mean, lang, { maximumFractionDigits: 3 })}</span></KeyValue>
              <KeyValue kEn="Median" kTh="มัธยฐาน"><span className="tabular-nums">{fmtNumber(numericCols[0].median, lang, { maximumFractionDigits: 3 })}</span></KeyValue>
              <KeyValue kEn="Std deviation" kTh="ส่วนเบี่ยงเบนมาตรฐาน"><span className="tabular-nums">{fmtNumber(numericCols[0].stddev, lang, { maximumFractionDigits: 3 })}</span></KeyValue>
              <KeyValue kEn="p05" kTh="p05"><span className="tabular-nums">{fmtNumber(numericCols[0].p05, lang, { maximumFractionDigits: 3 })}</span></KeyValue>
              <KeyValue kEn="p95" kTh="p95"><span className="tabular-nums">{fmtNumber(numericCols[0].p95, lang, { maximumFractionDigits: 3 })}</span></KeyValue>
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'col', headerEn: 'Column', headerTh: 'คอลัมน์', render: (c: ColumnProfile) => <code className="font-mono text-xs">{c.name}</code> },
          { key: 'type', headerEn: 'Type', headerTh: 'ชนิด', render: (c: ColumnProfile) => <span className="text-xs">{c.type}</span> },
          { key: 'null', headerEn: 'Null %', headerTh: '% ค่าว่าง', render: (c: ColumnProfile) => <span className={cn('tabular-nums text-sm', c.nullRate > 0.05 ? 'font-medium text-amber-700' : '')}>{fmtPercent(c.nullRate * 100, lang)}</span> },
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
        rows={selected.columns}
        rowKey={(c) => c.name}
        caption="Column profile statistics"
      />
    </div>
  )
}

// ─── Rules tab ──────────────────────────────────────────────────────────────────
function RulesTab({ data, onOpenRules }: { data: Record<string, unknown>; onOpenRules: () => void }) {
  const { lang } = useLang()
  const rules = (data.rules as RuleLite[] | undefined) ?? []
  return (
    <DataTable
      columns={[
        { key: 'code', headerEn: 'Code', headerTh: 'รหัส', render: (r: RuleLite) => <code className="font-mono text-xs">{r.code}</code> },
        { key: 'name', headerEn: 'Rule', headerTh: 'ชื่อกฎ', render: (r: RuleLite) => <span className="text-sm font-medium">{r.name}</span> },
        { key: 'dim', headerEn: 'Dimension', headerTh: 'มิติ', render: (r: RuleLite) => <span className="text-xs">{r.dimension.replaceAll('_', ' ')}</span> },
        { key: 'sev', headerEn: 'Severity', headerTh: 'ความรุนแรง', render: (r: RuleLite) => <StatusBadge kind={(r.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM'} /> },
        { key: 'ver', headerEn: 'Version status', headerTh: 'สถานะเวอร์ชัน', render: (r: RuleLite) => <StatusBadge kind={(r.latestVersion?.status as 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETIRED') ?? 'DRAFT'} /> },
        {
          key: 'active', headerEn: 'Active', headerTh: 'ใช้งาน',
          render: (r: RuleLite) => r.isActive ? <StatusBadge kind="ACTIVE" /> : <StatusBadge kind="RETIRED" label={pick(lang, 'Inactive', 'ไม่ใช้งาน')} />,
        },
        { key: 'pass', headerEn: 'Pass rate', headerTh: 'อัตราผ่าน', render: (r: RuleLite) => r.passRate != null ? <span className="tabular-nums text-sm">{fmtPercent(r.passRate * (r.passRate <= 1 ? 100 : 1), lang)}</span> : <span className="text-xs text-muted-foreground">—</span> },
      ]}
      rows={rules}
      rowKey={(r) => r.id}
      onRowClick={() => onOpenRules()}
      caption="Rules assigned to this dataset — click a row to open the rules view"
      emptyEn="No rules are defined for this dataset yet."
      emptyTh="ยังไม่มีกฎที่กำหนดสำหรับชุดข้อมูลนี้"
    />
  )
}

// ─── Validation history tab ─────────────────────────────────────────────────────
function RunsTab({ data, onOpen }: { data: Record<string, unknown>; onOpen: (runId: string) => void }) {
  const { lang } = useLang()
  const runs = (data.runs as ValidationRunDTO[] | undefined) ?? []
  return (
    <DataTable
      columns={[
        { key: 'start', headerEn: 'Started', headerTh: 'เริ่ม', render: (r: ValidationRunDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.startedAt, lang)}</span> },
        { key: 'trigger', headerEn: 'Trigger', headerTh: 'ที่มา', render: (r: ValidationRunDTO) => <span className="text-xs">{r.trigger}</span> },
        { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (r: ValidationRunDTO) => <StatusBadge kind={(r.status as 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PARTIAL') ?? 'QUEUED'} /> },
        { key: 'score', headerEn: 'Score', headerTh: 'คะแนน', render: (r: ValidationRunDTO) => <span className="tabular-nums text-sm font-medium">{fmtNumber(r.qualityScore, lang, { maximumFractionDigits: 1 })}</span> },
        { key: 'cov', headerEn: 'Coverage', headerTh: 'การครอบคลุม', render: (r: ValidationRunDTO) => <span className="tabular-nums text-xs">{fmtPercent(r.coverage * (r.coverage <= 1 ? 100 : 1), lang)}</span> },
        { key: 'passed', headerEn: 'Rules passed', headerTh: 'กฎที่ผ่าน', render: (r: ValidationRunDTO) => <span className="tabular-nums text-xs">{fmtNumber(r.rulesPassed, lang)}/{fmtNumber(r.rulesTotal, lang)}</span> },
        { key: 'dur', headerEn: 'Duration', headerTh: 'ระยะเวลา', render: (r: ValidationRunDTO) => <span className="text-xs">{fmtDuration(r.durationMs, lang)}</span> },
        { key: 'corr', headerEn: 'Correlation ID', headerTh: 'รหัสสหพันธ์', render: (r: ValidationRunDTO) => <code className="font-mono text-[11px]">{r.correlationId}</code> },
        { key: 'attempt', headerEn: 'Attempt', headerTh: 'ความพยายาม', render: (r: ValidationRunDTO) => <span className="tabular-nums text-xs">{fmtNumber(r.attempt, lang)}</span> },
      ]}
      rows={runs}
      rowKey={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      caption="Validation run history — click a row to open run detail"
      emptyEn="No validation runs recorded yet."
      emptyTh="ยังไม่มีประวัติการตรวจสอบ"
    />
  )
}

// ─── Anomalies tab ──────────────────────────────────────────────────────────────
function AnomaliesTab({ data, onOpenAll }: { data: Record<string, unknown>; onOpenAll: () => void }) {
  const { lang } = useLang()
  const anomalies = (data.anomalies as AnomalyDTO[] | undefined) ?? []
  return (
    <div className="space-y-3">
      <MlDisclaimer />
      <DataTable
        columns={[
          { key: 'type', headerEn: 'Type', headerTh: 'ชนิด', render: (a: AnomalyDTO) => <span className="text-xs font-medium">{a.type.replaceAll('_', ' ')}</span> },
          { key: 'sev', headerEn: 'Severity', headerTh: 'ความรุนแรง', render: (a: AnomalyDTO) => <StatusBadge kind={(a.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM'} /> },
          { key: 'score', headerEn: 'Score', headerTh: 'คะแนน', render: (a: AnomalyDTO) => <span className="tabular-nums text-sm">{fmtNumber(a.score, lang, { maximumFractionDigits: 2 })}</span> },
          { key: 'col', headerEn: 'Column', headerTh: 'คอลัมน์', render: (a: AnomalyDTO) => a.columnName ? <code className="font-mono text-xs">{a.columnName}</code> : <span className="text-xs text-muted-foreground">—</span> },
          { key: 'model', headerEn: 'Model version', headerTh: 'เวอร์ชันโมเดล', render: (a: AnomalyDTO) => <span className="text-xs">{a.modelName ?? '—'}{a.modelVersion ? ` v${a.modelVersion}` : ''}</span> },
          { key: 'det', headerEn: 'Detected', headerTh: 'ตรวจพบ', render: (a: AnomalyDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(a.detectedAt, lang)}</span> },
          { key: 'review', headerEn: 'Review status', headerTh: 'สถานะการตรวจ', render: (a: AnomalyDTO) => <StatusBadge kind={(a.reviewStatus as 'PENDING' | 'CONFIRMED_ISSUE' | 'FALSE_POSITIVE') ?? 'PENDING'} /> },
        ]}
        rows={anomalies}
        rowKey={(a) => a.id}
        onRowClick={() => onOpenAll()}
        caption="ML-detected anomalies for this dataset — click a row to open the anomalies view"
        emptyEn="No anomalies detected for this dataset."
        emptyTh="ไม่พบความผิดปกติสำหรับชุดข้อมูลนี้"
      />
    </div>
  )
}

// ─── Issues tab ─────────────────────────────────────────────────────────────────
function IssuesTab({ data, onOpenAll }: { data: Record<string, unknown>; onOpenAll: () => void }) {
  const { lang } = useLang()
  const issues = (data.issues as IssueDTO[] | undefined) ?? []
  const statusKind = (s: string) => (s === 'PENDING_REVIEW' ? 'PENDING' : (s as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED' | 'PENDING'))
  return (
    <DataTable
      columns={[
        { key: 'key', headerEn: 'Key', headerTh: 'รหัส', render: (i: IssueDTO) => <code className="font-mono text-xs">{i.key}</code> },
        { key: 'title', headerEn: 'Title', headerTh: 'หัวข้อ', render: (i: IssueDTO) => <span className="text-sm font-medium">{lang === 'th' && i.titleTh ? i.titleTh : i.title}</span> },
        { key: 'sev', headerEn: 'Severity', headerTh: 'ความรุนแรง', render: (i: IssueDTO) => <StatusBadge kind={(i.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM'} /> },
        { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (i: IssueDTO) => <StatusBadge kind={statusKind(i.status)} label={i.status.replaceAll('_', ' ')} /> },
        {
          key: 'sla', headerEn: 'SLA due', headerTh: 'กำหนด SLA',
          render: (i: IssueDTO) => (
            <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs', i.slaBreached && 'font-semibold text-red-700')}>
              <Clock3 className="size-3.5" aria-hidden />{fmtDateTime(i.slaDueAt, lang)}
              {i.slaBreached && <T en="(breached)" th="(เกินกำหนด)" />}
            </span>
          ),
        },
      ]}
      rows={issues}
      rowKey={(i) => i.id}
      onRowClick={() => onOpenAll()}
      caption="Data quality issues for this dataset — click a row to open the issues view"
      emptyEn="No issues recorded for this dataset."
      emptyTh="ไม่มีปัญหาที่บันทึกไว้สำหรับชุดข้อมูลนี้"
    />
  )
}

// ─── Lineage tab ────────────────────────────────────────────────────────────────
function LineageTab({ data, dataset, onOpen }: { data: Record<string, unknown>; dataset: DatasetDTO; onOpen: (dsId: string) => void }) {
  const downstream = (data.downstream as DownstreamRef[] | undefined) ?? []
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4" data-testid="lineage-flow">
        <div className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700"><T en="Source" th="แหล่งข้อมูล" /></p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
            <Database className="size-4 text-teal-700" aria-hidden />
            {dataset.source?.name ?? '—'}
          </p>
          {dataset.source && <p className="text-xs text-teal-800">{dataset.source.type.replaceAll('_', ' ')}</p>}
        </div>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-label="flows into" />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700"><T en="Dataset" th="ชุดข้อมูล" /></p>
          <p className="mt-0.5 text-sm font-semibold">{dataset.name}</p>
          <p className="font-mono text-xs text-amber-800">{dataset.version}</p>
        </div>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-label="feeds" />
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><T en="Downstream" th="ปลายทาง" /></p>
          {downstream.length === 0 && <p className="text-xs text-muted-foreground"><T en="No downstream datasets registered." th="ไม่มีชุดข้อมูลปลายทางที่ลงทะเบียน" /></p>}
          {downstream.map((d) => (
            <Button key={d.id} variant="outline" size="sm" className="min-h-[40px] justify-start" onClick={() => onOpen(d.id)}>
              {d.name}
              {d.relationship && <span className="text-xs text-muted-foreground">· {d.relationship}</span>}
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <T
          en={`Text summary: ${dataset.source?.name ?? 'an unregistered source'} feeds dataset ${dataset.name} (version ${dataset.version}), which is consumed by ${downstream.length === 0 ? 'no downstream datasets' : `${downstream.length} downstream dataset(s): ${downstream.map((d) => d.name).join(', ')}`}. Each downstream item is a link to its dataset detail.`}
          th={`สรุปเป็นข้อความ: ${dataset.source?.name ?? 'แหล่งข้อมูลที่ยังไม่ลงทะเบียน'} ป้อนข้อมูลสู่ชุดข้อมูล ${dataset.name} (เวอร์ชัน ${dataset.version}) ซึ่งถูกใช้โดย ${downstream.length === 0 ? 'ไม่มีชุดข้อมูลปลายทาง' : `ชุดข้อมูลปลายทาง ${downstream.length} รายการ: ${downstream.map((d) => d.name).join(', ')}`} ทุกรายการเป็นลิงก์ไปยังรายละเอียดชุดข้อมูล`}
        />
      </p>
    </div>
  )
}

// ─── Access tab ─────────────────────────────────────────────────────────────────
function AccessTab({ data, dataset }: { data: Record<string, unknown>; dataset: DatasetDTO }) {
  const { lang } = useLang()
  const denied = data.denied === true
  const ownerName = (data.owner as string | undefined) ?? (dataset as unknown as { ownerName?: string }).ownerName ?? dataset.ownerId
  const stewardName = (data.steward as string | undefined) ?? (dataset as unknown as { stewardName?: string }).stewardName ?? dataset.stewardId
  const grants = (data.grants as GrantLite[] | undefined) ?? []

  if (denied) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-card p-4">
          <KeyValue kEn="Owner" kTh="เจ้าของข้อมูล">{ownerName}</KeyValue>
          <div className="mt-1.5"><KeyValue kEn="Steward" kTh="ผู้ดูแลข้อมูล">{stewardName}</KeyValue></div>
        </div>
        <DeniedNote />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold"><T en="Accountable roles" th="บทบาทผู้รับผิดชอบ" /></h3>
        <KeyValue kEn="Owner" kTh="เจ้าของข้อมูล"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5 text-teal-700" aria-hidden />{ownerName}</span></KeyValue>
        <div className="mt-1.5"><KeyValue kEn="Steward" kTh="ผู้ดูแลข้อมูล"><span className="inline-flex items-center gap-1"><User className="size-3.5 text-muted-foreground" aria-hidden />{stewardName}</span></KeyValue></div>
      </div>
      <DataTable
        columns={[
          { key: 'user', headerEn: 'User', headerTh: 'ผู้ใช้', render: (g: GrantLite) => <span className="text-sm">{g.userName}</span> },
          { key: 'level', headerEn: 'Level', headerTh: 'ระดับ', render: (g: GrantLite) => <span className="rounded border bg-muted px-1.5 py-0.5 text-xs font-medium">{g.level}</span> },
          { key: 'reason', headerEn: 'Reason', headerTh: 'เหตุผล', render: (g: GrantLite) => <span className="text-xs text-muted-foreground">{g.reason ?? '—'}</span> },
          { key: 'at', headerEn: 'Granted at', headerTh: 'ให้สิทธิ์เมื่อ', render: (g: GrantLite) => <span className="whitespace-nowrap text-xs">{fmtDateTime(g.grantedAt, lang)}</span> },
        ]}
        rows={grants}
        rowKey={(g, i) => `${g.userName}-${i}`}
        caption="Explicit dataset grants"
        emptyEn="No explicit grants beyond role-based visibility."
        emptyTh="ไม่มีการให้สิทธิ์เพิ่มเติมนอกเหนือจากสิทธิ์ตามบทบาท"
      />
    </div>
  )
}

// ─── Audit tab ──────────────────────────────────────────────────────────────────
function AuditTab({ data }: { data: Record<string, unknown> }) {
  const { lang } = useLang()
  const denied = data.denied === true
  const logs = (data.logs as AuditLogDTO[] | undefined) ?? []
  if (denied) return <DeniedNote />
  return (
    <DataTable
      columns={[
        { key: 'time', headerEn: 'Time', headerTh: 'เวลา', render: (l: AuditLogDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt, lang)}</span> },
        { key: 'actor', headerEn: 'Actor', headerTh: 'ผู้ดำเนินการ', render: (l: AuditLogDTO) => <span className="text-xs font-medium">{l.actor}</span> },
        { key: 'action', headerEn: 'Action', headerTh: 'การกระทำ', render: (l: AuditLogDTO) => <code className="font-mono text-xs">{l.action}</code> },
        { key: 'res', headerEn: 'Resource', headerTh: 'ทรัพยากร', render: (l: AuditLogDTO) => <span className="text-xs">{l.resourceType}:{l.resourceId}</span> },
        { key: 'corr', headerEn: 'Correlation ID', headerTh: 'รหัสสหพันธ์', render: (l: AuditLogDTO) => l.correlationId ? <code className="font-mono text-[11px]">{l.correlationId}</code> : <span className="text-xs text-muted-foreground">—</span> },
      ]}
      rows={logs}
      rowKey={(l) => l.id}
      caption="Audit trail for this dataset"
      emptyEn="No audit entries for this dataset."
      emptyTh="ไม่มีรายการตรวจสอบสำหรับชุดข้อมูลนี้"
    />
  )
}
