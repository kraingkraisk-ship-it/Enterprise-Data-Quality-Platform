'use client'
// Rules governance view — list, filter, inspect version history and drive the
// DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE lifecycle by role.
// Acceptance criterion #3 (approval gate) is enforced in renderRuleActions().
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, ClipboardCheck, ClipboardX, Lock, PauseCircle, PlayCircle,
  Send, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import {
  DIMENSIONS, hasPermission,
  type Dimension, type RuleDTO, type RuleDefinition, type RuleVersionStatus, type Severity,
} from '@/lib/types'
import {
  DataTable, DetailDrawer, ErrorState, KeyValue, LoadingState,
  PageShell, SectionHeading, StatusBadge,
} from '@/components/shared/kit'
import { T, fmtDate, fmtDateTime, pick, useLang } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import type { ViewCtx } from './ctx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const VERSION_STATUSES: (RuleVersionStatus | 'ACTIVE')[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE']
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const DIM_LABEL: Record<Dimension, { en: string; th: string }> = {
  COMPLETENESS: { en: 'Completeness', th: 'ความครบถ้วน' },
  ACCURACY: { en: 'Accuracy', th: 'ความถูกต้อง' },
  VALIDITY: { en: 'Validity', th: 'ความถูกต้องตามรูปแบบ' },
  CONSISTENCY: { en: 'Consistency', th: 'ความสอดคล้องกัน' },
  UNIQUENESS: { en: 'Uniqueness', th: 'ความไม่ซ้ำกัน' },
  TIMELINESS: { en: 'Timeliness', th: 'ความทันเวลา' },
  INTEGRITY: { en: 'Integrity', th: 'ความสมบูรณ์ของข้อมูลอ้างอิง' },
  VOLUME: { en: 'Volume', th: 'ปริมาณข้อมูล' },
  SCHEMA_CONFORMITY: { en: 'Schema conformity', th: 'ความสอดคล้องของสคีมา' },
}

type RuleDetail = Awaited<ReturnType<typeof api.rule>>
type RuleVersion = RuleDetail['versions'][number]

type DialogAction =
  | { type: 'submit' }
  | { type: 'activate' }
  | { type: 'deactivate' }
  | { type: 'approve' }
  | { type: 'reject' }
  | null

export default function RulesView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const { density } = useUi()
  const canCreate = hasPermission(ctx.user.role, 'CREATE_RULE')

  // ── Data ────────────────────────────────────────────────────────────────────
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([])
  const [rules, setRules] = useState<RuleDTO[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [filters, setFilters] = useState({ datasetId: 'ALL', dimension: 'ALL', status: 'ALL', severity: 'ALL', q: '' })
  const [debouncedQ, setDebouncedQ] = useState('')
  const listSeq = useRef(0)

  useEffect(() => {
    api.datasets().then((r) => setDatasets(r.datasets)).catch(() => setDatasets([]))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300)
    return () => clearTimeout(t)
  }, [filters.q])

  const loadRules = useCallback(async () => {
    const seq = ++listSeq.current
    setError(null)
    try {
      const res = await api.rules({
        datasetId: filters.datasetId !== 'ALL' ? filters.datasetId : undefined,
        dimension: filters.dimension !== 'ALL' ? filters.dimension : undefined,
        status: filters.status !== 'ALL' ? filters.status : undefined,
        severity: filters.severity !== 'ALL' ? filters.severity : undefined,
        q: debouncedQ || undefined,
      })
      if (seq === listSeq.current) setRules(res.rules)
    } catch (e) {
      if (seq === listSeq.current) { setRules([]); setError(e instanceof ApiError ? e : new ApiError(0, String(e))) }
    }
  }, [filters.datasetId, filters.dimension, filters.status, filters.severity, debouncedQ])

  useEffect(() => { void loadRules() }, [loadRules])

  // ── Drawer detail ───────────────────────────────────────────────────────────
  const [openRuleId, setOpenRuleId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RuleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<ApiError | null>(null)

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await api.rule(id)
      setDetail(res)
    } catch (e) {
      setDetailError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openDrawer = useCallback((rule: RuleDTO) => {
    setOpenRuleId(rule.id)
    setDetail(null)
    void loadDetail(rule.id)
  }, [loadDetail])

  // ── Governance actions ──────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<DialogAction>(null)
  const [dialogNote, setDialogNote] = useState('')
  const [busy, setBusy] = useState(false)

  const closeDialog = () => { setDialog(null); setDialogNote('') }

  const runAction = async (fn: () => Promise<unknown>, okEn: string, okTh: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(pick(lang, okEn, okTh))
      if (openRuleId) await loadDetail(openRuleId)
      await loadRules()
      closeDialog()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : pick(lang, 'Action failed', 'การดำเนินการไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  const latest = detail?.versions?.slice().sort((a, b) => b.version - a.version)[0] ?? null
  const rule = detail?.rule ?? null

  const renderRuleActions = () => {
    if (detailLoading || !rule || !latest) return null
    const actions: React.ReactNode[] = []
    const perms = ctx.user.role

    // Steward: submit draft for approval
    if (hasPermission(perms, 'SUBMIT_RULE') && latest.status === 'DRAFT') {
      actions.push(
        <Button key="submit" className="min-h-[40px] bg-teal-700 hover:bg-teal-800" disabled={busy} onClick={() => setDialog({ type: 'submit' })}>
          <Send className="size-4" aria-hidden /> <T en="Submit for approval" th="ส่งเพื่อขออนุมัติ" />
        </Button>,
      )
    }

    // Data Owner: approve / reject pending version
    if (hasPermission(perms, 'APPROVE_RULE') && latest.status === 'PENDING_APPROVAL') {
      actions.push(
        <React.Fragment key="approve-reject">
          <Button className="min-h-[40px] bg-emerald-700 hover:bg-emerald-800" disabled={busy} onClick={() => { setDialogNote(''); setDialog({ type: 'approve' }) }}>
            <ClipboardCheck className="size-4" aria-hidden /> <T en="Approve" th="อนุมัติ" />
          </Button>
          <Button variant="outline" className="min-h-[40px] border-red-300 text-red-800 hover:bg-red-50" disabled={busy} onClick={() => { setDialogNote(''); setDialog({ type: 'reject' }) }}>
            <ClipboardX className="size-4" aria-hidden /> <T en="Reject" th="ปฏิเสธ" />
          </Button>
        </React.Fragment>,
      )
    }

    // ACTIVATE_RULE with the approval gate (acceptance criterion #3).
    // A rule that requires approval may ONLY be activated when its latest
    // version status is APPROVED — otherwise render a disabled, explained lock.
    if (hasPermission(perms, 'ACTIVATE_RULE')) {
      if (latest.status === 'APPROVED') {
        actions.push(
          <Button key="activate" className="min-h-[40px] bg-teal-700 hover:bg-teal-800" disabled={busy} onClick={() => setDialog({ type: 'activate' })}>
            <PlayCircle className="size-4" aria-hidden /> <T en="Activate" th="เปิดใช้งาน" />
          </Button>,
        )
      } else if (rule.requiresApproval) {
        // GATE: do NOT render an active Activate control in this state.
        actions.push(
          <div key="gate" className="flex flex-col gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block" tabIndex={0} role="button" aria-disabled aria-label={pick(lang, `Waiting for Data Owner approval of v${latest.version}`, `รอการอนุมัติจากเจ้าของข้อมูลของ v${latest.version}`)}>
                  <Button disabled className="min-h-[40px]" aria-disabled>
                    <Lock className="size-4" aria-hidden /> <T en="Activate" th="เปิดใช้งาน" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <T en={`Waiting for Data Owner approval of v${latest.version}`} th={`รอการอนุมัติจากเจ้าของข้อมูลของ v${latest.version}`} />
              </TooltipContent>
            </Tooltip>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              <T en={`Waiting for Data Owner approval of v${latest.version}`} th={`รอการอนุมัติจากเจ้าของข้อมูลของ v${latest.version}`} />
            </p>
          </div>,
        )
      } else {
        actions.push(
          <Button key="activate" className="min-h-[40px] bg-teal-700 hover:bg-teal-800" disabled={busy} onClick={() => setDialog({ type: 'activate' })}>
            <PlayCircle className="size-4" aria-hidden /> <T en="Activate" th="เปิดใช้งาน" />
          </Button>,
        )
      }
    }

    // Deactivate an active rule
    if (rule.isActive && hasPermission(perms, 'ACTIVATE_RULE')) {
      actions.push(
        <Button key="deactivate" variant="outline" className="min-h-[40px]" disabled={busy} onClick={() => setDialog({ type: 'deactivate' })}>
          <PauseCircle className="size-4" aria-hidden /> <T en="Deactivate" th="ระงับการใช้งาน" />
        </Button>,
      )
    }

    if (actions.length === 0) return null
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <SectionHeading titleEn="Actions" titleTh="การดำเนินการ" hintEn="Dataset steward / owner eligibility is enforced server-side too." hintTh="สิทธิ์ตามชุดข้อมูลถูกตรวจสอบโดยเซิร์ฟเวอร์ด้วยเช่นกัน" />
        <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
        {hasPermission(perms, 'APPROVE_RULE') && latest.status === 'PENDING_APPROVAL' && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <T en="Review test evidence in the Rule Builder before approving." th="ตรวจสอบหลักฐานการทดสอบใน Rule Builder ก่อนอนุมัติ" />
          </p>
        )}
      </div>
    )
  }

  // ── Table columns ───────────────────────────────────────────────────────────
  const columns = useMemo(() => [
    {
      key: 'code', headerEn: 'Code', headerTh: 'รหัส', className: 'font-mono',
      render: (r: RuleDTO) => <span className="font-mono text-xs font-semibold text-teal-800">{r.code}</span>,
    },
    {
      key: 'name', headerEn: 'Rule', headerTh: 'กฎ',
      render: (r: RuleDTO) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          {r.nameTh && <p className="truncate text-xs text-muted-foreground">{r.nameTh}</p>}
        </div>
      ),
    },
    {
      key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล',
      render: (r: RuleDTO) => <span className="text-xs">{r.datasetName ?? r.datasetId}</span>,
    },
    {
      key: 'dimension', headerEn: 'Dimension', headerTh: 'มิติ',
      render: (r: RuleDTO) => <span className="text-xs">{pick(lang, DIM_LABEL[r.dimension]?.en ?? r.dimension, DIM_LABEL[r.dimension]?.th ?? r.dimension)}</span>,
    },
    {
      key: 'severity', headerEn: 'Severity', headerTh: 'ความรุนแรง',
      render: (r: RuleDTO) => <StatusBadge kind={r.severity} />,
    },
    {
      key: 'version', headerEn: 'Latest version', headerTh: 'เวอร์ชันล่าสุด',
      render: (r: RuleDTO) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold">v{r.currentVersion}</span>
          <StatusBadge kind={(r.latestVersion?.status ?? 'DRAFT') as RuleVersionStatus} />
        </span>
      ),
    },
    {
      key: 'active', headerEn: 'Active', headerTh: 'ใช้งาน',
      render: (r: RuleDTO) => r.isActive ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="size-3.5" aria-hidden /> <T en="Active" th="ใช้งาน" />
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <PauseCircle className="size-3.5" aria-hidden /> <T en="Inactive" th="ไม่ใช้งาน" />
        </span>
      ),
    },
    { key: 'owner', headerEn: 'Owner', headerTh: 'เจ้าของ', render: (r: RuleDTO) => <span className="text-xs">{r.owner}</span> },
    {
      key: 'updated', headerEn: 'Updated', headerTh: 'อัปเดต',
      render: (r: RuleDTO) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.latestVersion?.approvedAt ?? r.createdAt, lang)}</span>,
    },
  ], [lang])

  const openRuleRow = rules?.find((r) => r.id === openRuleId) ?? null

  return (
    <PageShell
      objective={{
        en: 'Author, review and govern versioned data quality rules — no code required.',
        th: 'สร้าง ตรวจสอบ และกำกับดูแลกฎคุณภาพข้อมูลแบบมีเวอร์ชัน — ไม่ต้องเขียนโค้ด',
      }}
      primaryAction={canCreate ? (
        <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => ctx.navigate('rule-builder', filters.datasetId !== 'ALL' ? { datasetId: filters.datasetId } : undefined)}>
          <Sparkles className="size-4" aria-hidden /> <T en="New rule" th="สร้างกฎใหม่" />
        </Button>
      ) : undefined}
      guidance={{
        en: 'Lifecycle: Draft → Pending approval → Approved → Active. Rules requiring approval can only be activated once the Data Owner has approved the exact version.',
        th: 'วงจรชีวิต: ร่างแรก → รออนุมัติ → อนุมัติแล้ว → ใช้งาน กฎที่กำหนดให้ต้องอนุมัติจะเปิดใช้งานได้เมื่อเจ้าของข้อมูลอนุมัติเวอร์ชันนั้นแล้วเท่านั้น',
      }}
    >
      {/* Filters */}
      <div className="rounded-lg border bg-card p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Select value={filters.datasetId} onValueChange={(v) => setFilters((f) => ({ ...f, datasetId: v }))}>
            <SelectTrigger className="min-h-[40px] w-full" aria-label={pick(lang, 'Filter by dataset', 'กรองตามชุดข้อมูล')}>
              <SelectValue placeholder={<T en="All datasets" th="ทุกชุดข้อมูล" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><T en="All datasets" th="ทุกชุดข้อมูล" /></SelectItem>
              {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.dimension} onValueChange={(v) => setFilters((f) => ({ ...f, dimension: v }))}>
            <SelectTrigger className="min-h-[40px] w-full" aria-label={pick(lang, 'Filter by dimension', 'กรองตามมิติ')}>
              <SelectValue placeholder={<T en="All dimensions" th="ทุกมิติ" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><T en="All dimensions" th="ทุกมิติ" /></SelectItem>
              {DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{pick(lang, DIM_LABEL[d].en, DIM_LABEL[d].th)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="min-h-[40px] w-full" aria-label={pick(lang, 'Filter by version status', 'กรองตามสถานะเวอร์ชัน')}>
              <SelectValue placeholder={<T en="All statuses" th="ทุกสถานะ" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><T en="All statuses" th="ทุกสถานะ" /></SelectItem>
              {VERSION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.severity} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v }))}>
            <SelectTrigger className="min-h-[40px] w-full" aria-label={pick(lang, 'Filter by severity', 'กรองตามความรุนแรง')}>
              <SelectValue placeholder={<T en="All severities" th="ทุกระดับ" />} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><T en="All severities" th="ทุกระดับ" /></SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="sm:col-span-2">
            <Input
              type="search"
              className="min-h-[40px]"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder={lang === 'th' ? 'ค้นหา รหัส/ชื่อกฎ/เจ้าของ' : 'Search code, name or owner…'}
              aria-label={pick(lang, 'Search rules', 'ค้นหากฎ')}
            />
          </div>
        </div>
      </div>

      {/* List */}
      {error ? (
        <ErrorState message={error.message} auditId={error.auditId} retry={() => void loadRules()} />
      ) : rules === null ? (
        <LoadingState rows={8} />
      ) : (
        <DataTable
          columns={columns}
          rows={rules}
          rowKey={(r) => r.id}
          onRowClick={openDrawer}
          density={density}
          caption={lang === 'th' ? 'รายการกฎคุณภาพข้อมูล' : 'Data quality rules'}
          emptyEn={debouncedQ || filters.datasetId !== 'ALL' ? 'No rules match the current filters.' : 'No rules yet — create your first rule in the Rule Builder.'}
          emptyTh={debouncedQ || filters.datasetId !== 'ALL' ? 'ไม่พบกฎที่ตรงกับตัวกรอง' : 'ยังไม่มีกฎ — สร้างกฎแรกใน Rule Builder'}
        />
      )}

      {/* Detail drawer */}
      <DetailDrawer
        open={openRuleId !== null}
        onOpenChange={(o) => { if (!o) setOpenRuleId(null) }}
        title={rule ? `${rule.code} · ${rule.name}` : openRuleRow ? `${openRuleRow.code} · ${openRuleRow.name}` : ''}
        description={pick(lang, 'Version history, definition and lifecycle actions', 'ประวัติเวอร์ชัน นิยาม และการดำเนินการตามวงจรชีวิต')}
      >
        {detailLoading && <LoadingState rows={4} />}
        {detailError && <ErrorState message={detailError.message} auditId={detailError.auditId} retry={() => openRuleId && void loadDetail(openRuleId)} />}
        {detail && rule && latest && (
          <>
            <section className="space-y-2" aria-label={pick(lang, 'Summary', 'สรุป')}>
              <SectionHeading titleEn="Natural language summary" titleTh="สรุปด้วยภาษาธรรมชาติ" />
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p><span className="mr-1 font-semibold">EN:</span>{latest.naturalSummaryEn}</p>
                <p className="mt-1 text-muted-foreground"><span className="mr-1 font-semibold">TH:</span>{latest.naturalSummaryTh}</p>
              </div>
              <KeyValue kEn="Dataset" kTh="ชุดข้อมูล">{rule.datasetName ?? rule.datasetId}</KeyValue>
              <KeyValue kEn="Dimension" kTh="มิติ">{pick(lang, DIM_LABEL[rule.dimension]?.en ?? rule.dimension, DIM_LABEL[rule.dimension]?.th ?? rule.dimension)}</KeyValue>
              <KeyValue kEn="Severity" kTh="ความรุนแรง"><StatusBadge kind={rule.severity} /></KeyValue>
              <KeyValue kEn="Owner" kTh="เจ้าของ">{rule.owner}</KeyValue>
              <KeyValue kEn="Approval required" kTh="ต้องได้รับอนุมัติ">{rule.requiresApproval ? <T en="Yes — Data Owner must approve each version" th="ใช่ — เจ้าของข้อมูลต้องอนุมัติทุกเวอร์ชัน" /> : <T en="No" th="ไม่" />}</KeyValue>
            </section>

            {renderRuleActions()}

            <section className="space-y-2" aria-label={pick(lang, 'Definition', 'นิยามกฎ')}>
              <SectionHeading titleEn="Definition (JSON)" titleTh="นิยาม (JSON)" />
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs edqp-scroll" tabIndex={0} aria-label={pick(lang, 'Rule definition JSON', 'JSON นิยามกฎ')}>
                {JSON.stringify(latest.definition as RuleDefinition, null, 2)}
              </pre>
            </section>

            <section className="space-y-2" aria-label={pick(lang, 'Version history', 'ประวัติเวอร์ชัน')}>
              <SectionHeading titleEn="Version history" titleTh="ประวัติเวอร์ชัน" />
              <ol className="space-y-2">
                {detail.versions.slice().sort((a, b) => b.version - a.version).map((v) => (
                  <li key={v.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold">v{v.version} <StatusBadge kind={v.status as RuleVersionStatus} /></span>
                      <span className="text-xs text-muted-foreground">{fmtDate(v.createdAt, lang)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span><T en="Created by" th="สร้างโดย" />: {v.createdBy}</span>
                      <span><T en="Approved by" th="อนุมัติโดย" />: {v.approvedBy ?? '—'}</span>
                      <span><T en="Effective from" th="มีผลตั้งแต่" />: {v.effectiveFrom ? fmtDate(v.effectiveFrom, lang) : '—'}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </DetailDrawer>

      {/* Confirm / decision dialogs */}
      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) closeDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === 'submit' && <T en="Submit for approval?" th="ส่งเพื่อขออนุมัติ?" />}
              {dialog?.type === 'activate' && <T en="Activate rule?" th="เปิดใช้งานกฎ?" />}
              {dialog?.type === 'deactivate' && <T en="Deactivate rule?" th="ระงับการใช้งานกฎ?" />}
              {dialog?.type === 'approve' && <T en="Approve version?" th="อนุมัติเวอร์ชันนี้?" />}
              {dialog?.type === 'reject' && <T en="Reject version?" th="ปฏิเสธเวอร์ชันนี้?" />}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === 'submit' && <T en={`Version v${latest?.version ?? ''} will move to PENDING_APPROVAL and the Data Owner will be notified. This action is recorded in the audit trail.`} th={`เวอร์ชัน v${latest?.version ?? ''} จะเปลี่ยนเป็นรออนุมัติ และเจ้าของข้อมูลจะได้รับแจ้ง การดำเนินการนี้ถูกบันทึกในระบบตรวจสอบ`} />}
              {dialog?.type === 'activate' && <T en="The rule will be evaluated in every scheduled and manual validation run. This action is recorded in the audit trail." th="กฎจะถูกใช้ประเมินในทุกการตรวจสอบ ทั้งตามกำหนดเวลาและตามคำขอ การดำเนินการนี้ถูกบันทึกในระบบตรวจสอบ" />}
              {dialog?.type === 'deactivate' && <T en="The rule stops being evaluated but stays in the catalogue with its history. This action is recorded in the audit trail." th="กฎจะหยุดการประเมิน แต่ยังอยู่ในแคตตาล็อกพร้อมประวัติ การดำเนินการนี้ถูกบันทึกในระบบตรวจสอบ" />}
              {dialog?.type === 'approve' && <T en={`Version v${latest?.version ?? ''} will be marked APPROVED and becomes eligible for activation. This action is recorded in the audit trail.`} th={`เวอร์ชัน v${latest?.version ?? ''} จะถูกทำเครื่องหมายว่าอนุมัติแล้ว และพร้อมเปิดใช้งาน การดำเนินการนี้ถูกบันทึกในระบบตรวจสอบ`} />}
              {dialog?.type === 'reject' && <T en="Please provide a reason — the steward needs it to revise the rule. This action is recorded in the audit trail." th="กรุณาระบุเหตุผล — ผู้ดูแลข้อมูลต้องใช้ในการปรับปรุงกฎ การดำเนินการนี้ถูกบันทึกในระบบตรวจสอบ" />}
            </DialogDescription>
          </DialogHeader>

          {(dialog?.type === 'approve' || dialog?.type === 'reject') && (
            <div className="space-y-1.5">
              <Label htmlFor="decision-note">
                {dialog.type === 'approve' ? <T en="Note (optional)" th="บันทึก (ไม่บังคับ)" /> : <T en="Reason (required)" th="เหตุผล (จำเป็น)" />}
              </Label>
              <Textarea
                id="decision-note"
                value={dialogNote}
                onChange={(e) => setDialogNote(e.target.value)}
                aria-invalid={dialog.type === 'reject' && dialogNote.trim() === ''}
                placeholder={lang === 'th' ? 'เช่น ค่าควรยึดตามนโยบายเครดิต 2024' : 'e.g. threshold should follow the 2024 credit policy'}
              />
              {dialog.type === 'reject' && dialogNote.trim() === '' && (
                <p className="flex items-center gap-1 text-xs text-red-700"><XCircle className="size-3.5" aria-hidden /> <T en="A rejection reason is required." th="จำเป็นต้องระบุเหตุผลในการปฏิเสธ" /></p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="min-h-[40px]" onClick={closeDialog} disabled={busy}><T en="Cancel" th="ยกเลิก" /></Button>
            {dialog?.type === 'submit' && (
              <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" disabled={busy || !rule || !latest}
                onClick={() => rule && latest && void runAction(() => api.submitRuleVersion(rule.id, latest.id), `Rule ${rule.code} v${latest.version} submitted for approval. Recorded in audit trail.`, `กฎ ${rule.code} v${latest.version} ถูกส่งเพื่อขออนุมัติ บันทึกในระบบตรวจสอบแล้ว`)}>
                <Send className="size-4" aria-hidden /> <T en="Submit" th="ส่ง" />
              </Button>
            )}
            {dialog?.type === 'activate' && (
              <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" disabled={busy || !rule}
                onClick={() => rule && void runAction(() => api.activateRule(rule.id), `Rule ${rule.code} activated. Recorded in audit trail.`, `กฎ ${rule.code} เปิดใช้งานแล้ว บันทึกในระบบตรวจสอบแล้ว`)}>
                <PlayCircle className="size-4" aria-hidden /> <T en="Activate" th="เปิดใช้งาน" />
              </Button>
            )}
            {dialog?.type === 'deactivate' && (
              <Button variant="destructive" className="min-h-[40px]" disabled={busy || !rule}
                onClick={() => rule && void runAction(() => api.deactivateRule(rule.id), `Rule ${rule.code} deactivated. Recorded in audit trail.`, `กฎ ${rule.code} หยุดใช้งานแล้ว บันทึกในระบบตรวจสอบแล้ว`)}>
                <PauseCircle className="size-4" aria-hidden /> <T en="Deactivate" th="ระงับการใช้งาน" />
              </Button>
            )}
            {dialog?.type === 'approve' && (
              <Button className="min-h-[40px] bg-emerald-700 hover:bg-emerald-800" disabled={busy || !rule || !latest}
                onClick={() => rule && latest && void runAction(() => api.approveRuleVersion(rule.id, latest.id, true, dialogNote.trim() || undefined), `Rule ${rule.code} v${latest.version} approved. Recorded in audit trail.`, `กฎ ${rule.code} v${latest.version} อนุมัติแล้ว บันทึกในระบบตรวจสอบแล้ว`)}>
                <ClipboardCheck className="size-4" aria-hidden /> <T en="Approve" th="อนุมัติ" />
              </Button>
            )}
            {dialog?.type === 'reject' && (
              <Button variant="destructive" className="min-h-[40px]" disabled={busy || !rule || !latest || dialogNote.trim() === ''}
                onClick={() => rule && latest && void runAction(() => api.approveRuleVersion(rule.id, latest.id, false, dialogNote.trim()), `Rule ${rule.code} v${latest.version} rejected. Recorded in audit trail.`, `กฎ ${rule.code} v${latest.version} ถูกปฏิเสธ บันทึกในระบบตรวจสอบแล้ว`)}>
                <XCircle className="size-4" aria-hidden /> <T en="Reject" th="ปฏิเสธ" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
