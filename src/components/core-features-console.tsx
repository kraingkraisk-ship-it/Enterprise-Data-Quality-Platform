'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GitBranch,
  Play,
  BrainCircuit,
  ClipboardCheck,
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  Trash2,
  Power,
  RefreshCw,
  ShieldAlert,
  EyeOff,
  Sparkles,
  Send,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  buildRuleSentence,
  CONDITIONS,
  CONDITION_KEYS,
  DIMENSION_LABELS,
  SEVERITY_KEYS,
  SEVERITY_LABELS,
} from '@/lib/dq'
import { ROLE_KEYS, ROLE_LIST, type PermissionKey, type RoleKey } from '@/lib/rbac'

/* ------------------------------- types ---------------------------------- */

interface ApiUser {
  id: string
  email: string
  name: string
  role: string
  status: 'ACTIVE' | 'SUSPENDED'
}

interface ApiDataset {
  id: string
  name: string
  sourceType: string
  piiEnabled: boolean
}

interface ApiRule {
  id: string
  datasetId: string
  datasetName: string
  column: string
  condition: string
  parameters: string
  filter: string | null
  severity: string
  enabled: boolean
  sentence: string
  lastRun: { status: string; passRate: number; totalRows: number; failedRows: number; at: string } | null
}

interface ApiSignal {
  id: string
  datasetName: string
  kind: 'ML_ANOMALY' | 'RULE_VIOLATION'
  dimension: string
  title: string
  detail: string
  severity: string
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

interface ApiException {
  id: string
  datasetName: string
  ruleId: string | null
  ruleLabel: string | null
  reason: string
  requestedBy: string
  status: string
  expiresAt: string
  decidedBy: string | null
  decidedAt: string | null
}

interface RunResponse {
  datasetName: string
  rowsCount: number
  rulesCount: number
  newSignals: number
  overallScore: number | null
  dimensionScores: Array<{ dimension: string; th: string; en: string; score: number }>
  results: Array<{
    ruleId: string
    column: string
    condition: string
    severity: string
    dimensionTh: string
    sentence: string
    status: 'PASSED' | 'FAILED'
    totalRows: number
    failedRows: number
    passRate: number
    failedSamples: string[]
  }>
}

interface DashboardData {
  totals: { pendingSignals: number; pendingExceptions: number; rulesEnabled: number; datasetsWithRun: number; datasetsTotal: number }
  perDataset: Array<{
    id: string
    name: string
    sourceType: string
    ruleCount: number
    lastRunAt: string | null
    overallScore: number | null
    weakestDimension: { th: string; score: number } | null
    pendingSignals: number
  }>
  dimensions: Array<{ dimension: string; th: string; en: string; score: number }>
}

interface PreviewData {
  datasetName: string
  columns: string[]
  rows: Record<string, unknown>[]
  piiMasked: boolean
}

/* ------------------------------ helpers ---------------------------------- */

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 90) return 'text-emerald-700'
  if (score >= 75) return 'text-amber-700'
  return 'text-rose-700'
}

const PERMISSIONS_BY_ACTION: Record<string, PermissionKey> = {
  MANAGE_RULES: 'MANAGE_RULES',
  RUN_VALIDATION: 'RUN_VALIDATION',
  REVIEW_SIGNALS: 'REVIEW_SIGNALS',
  APPROVE_EXCEPTIONS: 'APPROVE_EXCEPTIONS',
}

/* ----------------------------- component --------------------------------- */

export default function CoreFeaturesConsole() {
  const { toast } = useToast()

  // shared data
  const [users, setUsers] = useState<ApiUser[]>([])
  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [rules, setRules] = useState<ApiRule[] | null>(null)
  const [signals, setSignals] = useState<ApiSignal[]>([])
  const [signalStats, setSignalStats] = useState({ pending: 0, confirmed: 0, dismissed: 0 })
  const [exceptions, setExceptions] = useState<ApiException[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // tab 1 — rule builder form
  const [rbDataset, setRbDataset] = useState('')
  const [rbColumn, setRbColumn] = useState('')
  const [rbCondition, setRbCondition] = useState('NOT_NULL')
  const [rbSeverity, setRbSeverity] = useState('MEDIUM')
  const [rbFilter, setRbFilter] = useState('')
  const [rbParams, setRbParams] = useState<Record<string, string>>({})
  const [rbOperator, setRbOperator] = useState('somchai.owner@company.co.th')

  // tab 2 — run + review
  const [runDataset, setRunDataset] = useState('')
  const [runOperator, setRunOperator] = useState('malee.steward@company.co.th')
  const [runResult, setRunResult] = useState<RunResponse | null>(null)
  const [reviewerEmail, setReviewerEmail] = useState('anucha.analyst@company.co.th')

  // tab 3 — exceptions
  const [exDataset, setExDataset] = useState('')
  const [exRule, setExRule] = useState('')
  const [exReason, setExReason] = useState('')
  const [exExpires, setExExpires] = useState('')
  const [exRequester, setExRequester] = useState('malee.steward@company.co.th')
  const [exApprover, setExApprover] = useState('somchai.owner@company.co.th')

  // tab 4 — PII preview
  const [previewRole, setPreviewRole] = useState<RoleKey>('BUSINESS_USER')
  const [previewDataset, setPreviewDataset] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)

  const refetch = useCallback(() => setReloadTick((t) => t + 1), [])

  /* ---------------------------- data load -------------------------------- */

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [u, d] = await Promise.all([
          fetch('/api/rbac/users').then((r) => r.json()),
          fetch('/api/rbac/datasets').then((r) => r.json()),
        ])
        if (!alive) return
        setUsers(u.users ?? [])
        setDatasets(d.datasets ?? [])
      } catch {
        /* network error — คงค่าว่างไว้ */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [r, s, x, dash] = await Promise.all([
          fetch('/api/dq/rules').then((r) => r.json()),
          fetch('/api/dq/signals').then((r) => r.json()),
          fetch('/api/dq/exceptions').then((r) => r.json()),
          fetch('/api/dq/dashboard').then((r) => r.json()),
        ])
        if (!alive) return
        setRules(r.rules ?? [])
        setSignals(s.signals ?? [])
        setSignalStats(s.stats ?? { pending: 0, confirmed: 0, dismissed: 0 })
        setExceptions(x.exceptions ?? [])
        setDashboard(dash.error ? null : dash)
      } catch {
        if (!alive) return
        setRules([])
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])

  // PII preview fetch
  useEffect(() => {
    if (!previewDataset) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/dq/sample-preview?datasetId=${encodeURIComponent(previewDataset)}&role=${previewRole}`)
        const data = await res.json()
        if (!alive) return
        setPreview(data.error ? null : data)
      } catch {
        if (alive) setPreview(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [previewDataset, previewRole])

  /* ------------------------------ derived -------------------------------- */

  const activeUsers = useMemo(() => users.filter((u) => u.status === 'ACTIVE'), [users])

  const roleOf = useCallback((email: string): RoleKey | null => (users.find((u) => u.email === email)?.role as RoleKey) ?? null, [users])

  const hasPerm = useCallback(
    (email: string, permission: PermissionKey): boolean => {
      const role = roleOf(email)
      if (!role) return false
      return ROLE_LIST.find((r) => r.key === role)?.permissions.includes(permission) ?? false
    },
    [roleOf],
  )

  const condDef = CONDITIONS[rbCondition as keyof typeof CONDITIONS]

  const previewSentence = useMemo(() => {
    const datasetName = datasets.find((d) => d.id === rbDataset)?.name ?? '[Dataset]'
    const params = JSON.stringify(rbParams)
    return buildRuleSentence({
      datasetName,
      column: rbColumn || '[Column]',
      condition: rbCondition,
      parameters: params,
      severity: rbSeverity,
      filter: rbFilter || null,
    })
  }, [datasets, rbDataset, rbColumn, rbCondition, rbParams, rbSeverity, rbFilter])

  const rulesOfDataset = useMemo(() => rules?.filter((r) => r.datasetId === exDataset && r.enabled) ?? [], [rules, exDataset])

  const pendingExceptions = useMemo(() => exceptions.filter((x) => x.status === 'PENDING'), [exceptions])
  const decidedExceptions = useMemo(() => exceptions.filter((x) => x.status !== 'PENDING'), [exceptions])
  const pendingSignals = useMemo(() => signals.filter((s) => s.status === 'PENDING_REVIEW'), [signals])
  const decidedSignals = useMemo(() => signals.filter((s) => s.status !== 'PENDING_REVIEW'), [signals])

  /* ------------------------------ actions -------------------------------- */

  async function postJson(url: string, body: Record<string, unknown>, busyKey: string, okMessage: string): Promise<boolean> {
    setBusy(busyKey)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return false
      }
      toast({ title: okMessage })
      return true
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function patchJson(url: string, body: Record<string, unknown>, busyKey: string, okMessage: string): Promise<boolean> {
    setBusy(busyKey)
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return false
      }
      toast({ title: okMessage })
      return true
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateRule() {
    const ok = await postJson(
      '/api/dq/rules',
      {
        datasetId: rbDataset,
        column: rbColumn,
        condition: rbCondition,
        parameters: rbParams,
        severity: rbSeverity,
        filter: rbFilter,
        operatorEmail: rbOperator,
      },
      'create-rule',
      'สร้างกฎใหม่เรียบร้อย',
    )
    if (ok) {
      setRbColumn('')
      setRbFilter('')
      setRbParams({})
      refetch()
    }
  }

  async function handleToggleRule(id: string, enabled: boolean) {
    const ok = await patchJson(
      `/api/dq/rules/${id}`,
      { action: 'TOGGLE_ENABLED', operatorEmail: rbOperator },
      `toggle-${id}`,
      enabled ? 'ปิดใช้งานกฎแล้ว' : 'เปิดใช้งานกฎแล้ว',
    )
    if (ok) refetch()
  }

  async function handleDeleteRule(id: string) {
    const ok = await patchJson(`/api/dq/rules/${id}`, { action: 'DELETE', operatorEmail: rbOperator }, `del-${id}`, 'ลบกฎแล้ว')
    if (ok) refetch()
  }

  async function handleRun() {
    setRunResult(null)
    setBusy('run')
    try {
      const res = await fetch('/api/dq/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: runDataset, operatorEmail: runOperator }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'รันการตรวจสอบไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      setRunResult(data as RunResponse)
      toast({
        title: 'รันตรวจสอบสำเร็จ',
        description: `ตรวจ ${data.rulesCount} กฎ บน ${data.rowsCount} แถว — สัญญาณใหม่ ${data.newSignals} รายการ (รอมนุษย์ทบทวน)`,
      })
      refetch()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function handleReviewSignal(id: string, action: 'CONFIRM' | 'DISMISS') {
    const ok = await patchJson(
      `/api/dq/signals/${id}`,
      { action, reviewerEmail },
      `signal-${id}`,
      action === 'CONFIRM' ? 'ยืนยันสัญญาณแล้ว (บันทึกผู้ทบทวน)' : 'ปลดสัญญาณแล้ว (บันทึกผู้ทบทวน)',
    )
    if (ok) refetch()
  }

  async function handleCreateException() {
    const ok = await postJson(
      '/api/dq/exceptions',
      {
        datasetId: exDataset,
        ruleId: exRule || undefined,
        reason: exReason,
        expiresAt: exExpires ? new Date(exExpires).toISOString() : '',
        requestedByEmail: exRequester,
      },
      'create-exception',
      'ส่งคำขอข้อยกเว้นแล้ว (รอผู้อนุมัติ)',
    )
    if (ok) {
      setExReason('')
      setExExpires('')
      setExRule('')
      refetch()
    }
  }

  async function handleDecideException(id: string, action: 'APPROVE' | 'REJECT') {
    const ok = await patchJson(
      `/api/dq/exceptions/${id}`,
      { action, approverEmail: exApprover },
      `exception-${id}`,
      action === 'APPROVE' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว',
    )
    if (ok) refetch()
  }

  /* ---------------------------- operator select --------------------------- */

  function OperatorSelect({
    value,
    onChange,
    permission,
    id,
  }: {
    value: string
    onChange: (v: string) => void
    permission: PermissionKey
    id: string
  }) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="เลือกผู้ดำเนินการ" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {activeUsers.map((u) => {
            const allowed = ROLE_LIST.find((r) => r.key === u.role)?.permissions.includes(permission) ?? false
            return (
              <SelectItem key={u.id} value={u.email}>
                {u.name} — {ROLE_LIST.find((r) => r.key === u.role)?.th}
                {!allowed ? ' (ไม่มีสิทธิ์)' : ''}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    )
  }

  /* -------------------------------- render -------------------------------- */

  return (
    <Tabs defaultValue="rules" className="w-full">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:h-10">
        <TabsTrigger value="rules" className="gap-1.5">
          <GitBranch className="size-4" aria-hidden="true" />
          Rule Builder
        </TabsTrigger>
        <TabsTrigger value="run" className="gap-1.5">
          <Play className="size-4" aria-hidden="true" />
          รันตรวจสอบ &amp; สัญญาณ AI
          {signalStats.pending > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-900">
              {signalStats.pending}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="exceptions" className="gap-1.5">
          <ClipboardCheck className="size-4" aria-hidden="true" />
          ข้อยกเว้น
          {pendingExceptions.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 rounded-full bg-emerald-100 px-1.5 text-[11px] text-emerald-900">
              {pendingExceptions.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="gap-1.5">
          <LayoutDashboard className="size-4" aria-hidden="true" />
          แดชบอร์ด
        </TabsTrigger>
      </TabsList>

      {/* ============================ TAB 1: RULE BUILDER ============================ */}
      <TabsContent value="rules" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="size-4 text-emerald-700" aria-hidden="true" />
                สร้างกฎคุณภาพข้อมูลแบบไม่ต้องเขียนโค้ด
              </CardTitle>
              <CardDescription>ประกอบประโยคกฎจากตัวเลือก — ระบบบังคับใช้สิทธิ์ MANAGE_RULES ตามบทบาทจริง</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rb-dataset">ชุดข้อมูล (For)</Label>
                  <Select value={rbDataset} onValueChange={setRbDataset}>
                    <SelectTrigger id="rb-dataset">
                      <SelectValue placeholder="เลือกชุดข้อมูล" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rb-column">คอลัมน์ (Column)</Label>
                  <Input
                    id="rb-column"
                    value={rbColumn}
                    onChange={(e) => setRbColumn(e.target.value)}
                    placeholder="เช่น email, credit_limit"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rb-condition">เงื่อนไข (must)</Label>
                  <Select
                    value={rbCondition}
                    onValueChange={(v) => {
                      setRbCondition(v)
                      setRbParams({})
                    }}
                  >
                    <SelectTrigger id="rb-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {CONDITIONS[k].th}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rb-severity">ระดับความรุนแรง</Label>
                  <Select value={rbSeverity} onValueChange={setRbSeverity}>
                    <SelectTrigger id="rb-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {SEVERITY_LABELS[k].th} ({k})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* dynamic parameters */}
              {condDef && condDef.params.length > 0 && (
                <div className="grid gap-3 rounded-lg border bg-emerald-50/50 p-3 sm:grid-cols-2">
                  <p className="text-xs font-medium text-emerald-900 sm:col-span-2">
                    พารามิเตอร์ของเงื่อนไข “{condDef.th}” (using)
                  </p>
                  {condDef.params.map((p) => (
                    <div key={p.key} className="space-y-1.5">
                      <Label htmlFor={`rb-param-${p.key}`} className="text-xs">
                        {p.label}
                      </Label>
                      <Input
                        id={`rb-param-${p.key}`}
                        type={p.type}
                        value={rbParams[p.key] ?? ''}
                        placeholder={p.placeholder}
                        onChange={(e) => setRbParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="rb-filter">ตัวกรอง (when — ไม่บังคับ)</Label>
                <Input
                  id="rb-filter"
                  value={rbFilter}
                  onChange={(e) => setRbFilter(e.target.value)}
                  placeholder="เช่น segment = 'ENTERPRISE'"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rb-operator" className="gap-1">
                  ผู้ดำเนินการ (บทบาทต้องมีสิทธิ์สร้างกฎ)
                </Label>
                <OperatorSelect id="rb-operator" value={rbOperator} onChange={setRbOperator} permission={PERMISSIONS_BY_ACTION.MANAGE_RULES} />
              </div>

              {/* live sentence preview */}
              <div className="rounded-lg bg-slate-900 p-3.5 font-mono text-[12.5px] leading-relaxed text-emerald-300" aria-live="polite">
                {previewSentence}
              </div>

              <Button
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleCreateRule}
                disabled={!rbDataset || !rbColumn || busy !== null}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {busy === 'create-rule' ? 'กำลังบันทึก…' : 'บันทึกกฎใหม่'}
              </Button>
            </CardContent>
          </Card>

          {/* rule list */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">กฎที่มีทั้งหมด ({rules?.length ?? '…'})</CardTitle>
                <Button variant="ghost" size="sm" onClick={refetch} aria-label="รีเฟรชรายการกฎ">
                  <RefreshCw className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <CardDescription>ผลรันล่าสุดของแต่ละกฎ แสดงเคียงข้างกฎเสมอ</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
                {rules === null && <p className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด…</p>}
                {rules?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีกฎ — สร้างกฎแรกจากฟอร์มด้านซ้าย</p>}
                {rules?.map((rule) => (
                  <div key={rule.id} className={`rounded-lg border p-3 ${rule.enabled ? '' : 'opacity-60'}`}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px]">
                        {rule.datasetName}
                      </Badge>
                      <Badge variant="outline" className={`border text-[11px] ${SEVERITY_BADGE[rule.severity] ?? ''}`}>
                        {SEVERITY_LABELS[rule.severity as keyof typeof SEVERITY_LABELS]?.th ?? rule.severity}
                      </Badge>
                      {!rule.enabled && (
                        <Badge variant="outline" className="border text-[11px] bg-slate-50 text-slate-500">
                          ปิดใช้งาน
                        </Badge>
                      )}
                      {rule.lastRun && (
                        <Badge
                          variant="outline"
                          className={`border text-[11px] ${
                            rule.lastRun.status === 'PASSED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          ผลรันล่าสุด {Math.round(rule.lastRun.passRate * 100)}%
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-[12px] leading-relaxed text-slate-700">{rule.sentence}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {rule.lastRun ? `ตรวจเมื่อ ${fmtTime(rule.lastRun.at)} · ล้มเหลว ${rule.lastRun.failedRows}/${rule.lastRun.totalRows} แถว` : 'ยังไม่เคยรันตรวจสอบ'}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={rule.enabled ? 'ปิดใช้งานกฎ' : 'เปิดใช้งานกฎ'}
                          onClick={() => handleToggleRule(rule.id, rule.enabled)}
                          disabled={busy !== null}
                        >
                          <Power className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="ลบกฎ"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => handleDeleteRule(rule.id)}
                          disabled={busy !== null}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ========================= TAB 2: RUN + SIGNALS ========================= */}
      <TabsContent value="run" className="mt-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="size-4 text-emerald-700" aria-hidden="true" />
                รันการตรวจสอบคุณภาพข้อมูล
              </CardTitle>
              <CardDescription>รันกฎทั้งหมดที่เปิดใช้งานกับข้อมูลตัวอย่าง (sandbox) — ไม่แตะข้อมูลต้นทางจริงเสมอ</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="run-dataset">ชุดข้อมูล</Label>
                <Select value={runDataset} onValueChange={setRunDataset}>
                  <SelectTrigger id="run-dataset">
                    <SelectValue placeholder="เลือกชุดข้อมูล" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="run-operator">ผู้รัน (ต้องมีสิทธิ์ RUN_VALIDATION)</Label>
                <OperatorSelect id="run-operator" value={runOperator} onChange={setRunOperator} permission={PERMISSIONS_BY_ACTION.RUN_VALIDATION} />
              </div>
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleRun}
                disabled={!runDataset || busy !== null}
              >
                <Play className="size-4" aria-hidden="true" />
                {busy === 'run' ? 'กำลังรัน…' : 'รันการตรวจสอบ'}
              </Button>
            </CardContent>
          </Card>

          {runResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  ผลการตรวจสอบ — {runResult.datasetName}
                </CardTitle>
                <CardDescription>
                  {runResult.rowsCount} แถว · {runResult.rulesCount} กฎ · สัญญาณใหม่ {runResult.newSignals} รายการ (รอมนุษย์ทบทวน)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-emerald-50/50 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">คะแนนคุณภาพข้อมูลรวม</p>
                    <p className={`text-3xl font-bold ${scoreColor(runResult.overallScore)}`}>
                      {runResult.overallScore !== null ? runResult.overallScore.toFixed(1) : '—'}
                      <span className="text-base">/100</span>
                    </p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {runResult.dimensionScores.map((d) => (
                      <div key={d.dimension} className="flex items-center gap-2 text-xs">
                        <span className="w-40 shrink-0 truncate">{d.th}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${d.score >= 90 ? 'bg-emerald-500' : d.score >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${d.score}%` }}
                          />
                        </div>
                        <span className={`w-12 text-right font-mono ${scoreColor(d.score)}`}>{d.score.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {runResult.results.map((r) => (
                    <div key={r.ruleId} className="rounded-lg border p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {r.status === 'PASSED' ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-label="ผ่าน" />
                        ) : (
                          <XCircle className="size-4 text-rose-600" aria-label="ล้มเหลว" />
                        )}
                        <Badge variant="outline" className={`border text-[11px] ${SEVERITY_BADGE[r.severity] ?? ''}`}>
                          {SEVERITY_LABELS[r.severity as keyof typeof SEVERITY_LABELS]?.th ?? r.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {r.dimensionTh}
                        </Badge>
                        <span className={`text-xs font-semibold ${r.status === 'PASSED' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {r.status === 'PASSED' ? 'ผ่าน' : `ล้มเหลว ${r.failedRows}/${r.totalRows} แถว`}
                        </span>
                      </div>
                      <p className="font-mono text-[12px] text-slate-700">{r.sentence}</p>
                      {r.failedSamples.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-rose-800">
                          {r.failedSamples.map((s) => (
                            <li key={s}>• {s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ML signals */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BrainCircuit className="size-4 text-emerald-700" aria-hidden="true" />
                    สัญญาณ AI รอทบทวน ({signalStats.pending})
                  </CardTitle>
                  <CardDescription>
                    ทบทวนแล้ว: ยืนยัน {signalStats.confirmed} · ปลด {signalStats.dismissed}
                  </CardDescription>
                </div>
                <div className="w-full sm:w-72">
                  <Label htmlFor="reviewer" className="mb-1 block text-xs">
                    ผู้ทบทวน (ต้องมีสิทธิ์ REVIEW_SIGNALS)
                  </Label>
                  <OperatorSelect id="reviewer" value={reviewerEmail} onChange={setReviewerEmail} permission={PERMISSIONS_BY_ACTION.REVIEW_SIGNALS} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <p>
                  <strong>ข้อควรทราบ:</strong> สัญญาณ AI/ML เป็นเพียงข้อแนะนำ — ต้องมีมนุษย์ทบทวนเสมอ และระบบจะไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
                </p>
              </div>

              <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                {pendingSignals.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีสัญญาณรอทบทวน — ลองรันการตรวจสอบด้านบน</p>
                )}
                {pendingSignals.map((s) => (
                  <div key={s.id} className="rounded-lg border p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`border text-[11px] ${SEVERITY_BADGE[s.severity] ?? ''}`}>
                        {SEVERITY_LABELS[s.severity as keyof typeof SEVERITY_LABELS]?.th ?? s.severity}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {DIMENSION_LABELS[s.dimension as keyof typeof DIMENSION_LABELS]?.th ?? s.dimension}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`border text-[11px] ${
                          s.kind === 'ML_ANOMALY' ? 'bg-violet-50 text-violet-800 border-violet-200' : 'bg-sky-50 text-sky-800 border-sky-200'
                        }`}
                      >
                        {s.kind === 'ML_ANOMALY' ? 'สัญญาณ ML' : 'กฎล้มเหลว'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{s.datasetName} · {fmtTime(s.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleReviewSignal(s.id, 'CONFIRM')} disabled={busy !== null}>
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        ยืนยันสัญญาณ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-slate-600 hover:bg-slate-50"
                        onClick={() => handleReviewSignal(s.id, 'DISMISS')}
                        disabled={busy !== null}
                      >
                        <EyeOff className="size-3.5" aria-hidden="true" />
                        ปลดสัญญาณ
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {decidedSignals.length > 0 && (
                <details className="rounded-lg border bg-slate-50/60 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-700">
                    ประวัติการทบทวน ({decidedSignals.length} รายการ)
                  </summary>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                    {decidedSignals.slice(0, 12).map((s) => (
                      <li key={s.id}>
                        {s.status === 'CONFIRMED' ? '✅' : '🚫'} {s.title} — {s.status === 'CONFIRMED' ? 'ยืนยัน' : 'ปลด'}โดย{' '}
                        {s.reviewedBy} · {fmtTime(s.reviewedAt)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ===================== TAB 3: EXCEPTIONS ===================== */}
      <TabsContent value="exceptions" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="size-4 text-emerald-700" aria-hidden="true" />
                ขอข้อยกเว้นกฎ
              </CardTitle>
              <CardDescription>ทุกคำขอต้องระบุเหตุผลและวันหมดอายุ พร้อมรอการอนุมัติจากบทบาทที่มีสิทธิ์</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ex-dataset">ชุดข้อมูล</Label>
                <Select
                  value={exDataset}
                  onValueChange={(v) => {
                    setExDataset(v)
                    setExRule('')
                  }}
                >
                  <SelectTrigger id="ex-dataset">
                    <SelectValue placeholder="เลือกชุดข้อมูล" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ex-rule">กฎที่ขอยกเว้น (ไม่บังคับ)</Label>
                <Select value={exRule || 'none'} onValueChange={(v) => setExRule(v === 'none' ? '' : v)} disabled={!exDataset}>
                  <SelectTrigger id="ex-rule">
                    <SelectValue placeholder={exDataset ? 'เลือกกฎ (หรือไม่ระบุ)' : 'เลือกชุดข้อมูลก่อน'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุกฎ —</SelectItem>
                    {rulesOfDataset.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.column} ({r.condition})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ex-reason">เหตุผล (อย่างน้อย 10 ตัวอักษร)</Label>
                <textarea
                  id="ex-reason"
                  className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={exReason}
                  onChange={(e) => setExReason(e.target.value)}
                  placeholder="อธิบายเหตุผลและระยะเวลาที่จำเป็น เพื่อการตรวจสอบย้อนหลัง"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-expires">วันหมดอายุ</Label>
                  <Input id="ex-expires" type="date" value={exExpires} onChange={(e) => setExExpires(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-requester">ผู้ขอ (ต้องมีสิทธิ์ MANAGE_RULES)</Label>
                  <OperatorSelect id="ex-requester" value={exRequester} onChange={setExRequester} permission={PERMISSIONS_BY_ACTION.MANAGE_RULES} />
                </div>
              </div>

              <Button
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleCreateException}
                disabled={!exDataset || exReason.trim().length < 10 || !exExpires || busy !== null}
              >
                <Send className="size-4" aria-hidden="true" />
                {busy === 'create-exception' ? 'กำลังส่ง…' : 'ส่งคำขอข้อยกเว้น'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">รอการอนุมัติ ({pendingExceptions.length})</CardTitle>
              <CardDescription>เฉพาะบทบาทที่มีสิทธิ์ APPROVE_EXCEPTIONS เท่านั้นที่อนุมัติได้ (ลองเลือกบทบาทอื่นเพื่อทดสอบ)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ex-approver">ผู้อนุมัติ</Label>
                <OperatorSelect id="ex-approver" value={exApprover} onChange={setExApprover} permission={PERMISSIONS_BY_ACTION.APPROVE_EXCEPTIONS} />
              </div>

              <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                {pendingExceptions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีคำขอรออนุมัติ</p>}
                {pendingExceptions.map((x) => (
                  <div key={x.id} className="rounded-lg border p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="text-[11px]">
                        {x.datasetName}
                      </Badge>
                      {x.ruleLabel && <Badge variant="outline" className="text-[11px]">กฎ: {x.ruleLabel}</Badge>}
                      <span>หมดอายุ {fmtDate(x.expiresAt)}</span>
                    </div>
                    <p className="text-sm">{x.reason}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">ขอโดย {x.requestedBy} · {fmtTime(x.createdAt)}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => handleDecideException(x.id, 'APPROVE')}
                        disabled={busy !== null}
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        อนุมัติ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-rose-700 hover:bg-rose-50"
                        onClick={() => handleDecideException(x.id, 'REJECT')}
                        disabled={busy !== null}
                      >
                        <XCircle className="size-3.5" aria-hidden="true" />
                        ปฏิเสธ
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {decidedExceptions.length > 0 && (
                <details className="rounded-lg border bg-slate-50/60 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-700">
                    ตัดสินแล้ว ({decidedExceptions.length} รายการ)
                  </summary>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                    {decidedExceptions.slice(0, 12).map((x) => (
                      <li key={x.id}>
                        {x.status === 'APPROVED' ? '✅' : '❌'} {x.datasetName} — {x.status === 'APPROVED' ? 'อนุมัติ' : 'ปฏิเสธ'}โดย {x.decidedBy} ·{' '}
                        {fmtTime(x.decidedAt)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ===================== TAB 4: DASHBOARD ===================== */}
      <TabsContent value="dashboard" className="mt-4">
        <div className="space-y-4">
          {/* stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'สัญญาณรอทบทวน', value: dashboard?.totals.pendingSignals, accent: 'text-amber-700' },
              { label: 'คำขอข้อยกเว้นรออนุมัติ', value: dashboard?.totals.pendingExceptions, accent: 'text-emerald-700' },
              { label: 'กฎที่เปิดใช้งาน', value: dashboard?.totals.rulesEnabled, accent: 'text-slate-900' },
              {
                label: 'ชุดข้อมูลที่รันแล้ว',
                value: dashboard ? `${dashboard.totals.datasetsWithRun}/${dashboard.totals.datasetsTotal}` : null,
                accent: 'text-slate-900',
              },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`mt-1 text-2xl font-bold ${s.accent}`}>{s.value ?? '…'}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            {/* per dataset scores */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">คะแนนคุณภาพข้อมูลต่อชุดข้อมูล</CardTitle>
                <CardDescription>คำนวณจากผลรันล่าสุดของทุกกฎที่เปิดใช้งาน</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                  {dashboard?.perDataset.map((d) => (
                    <div key={d.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{d.name}</p>
                          <Badge variant="outline" className="text-[10.5px]">
                            {d.ruleCount} กฎ
                          </Badge>
                          {d.pendingSignals > 0 && (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10.5px] text-amber-900">
                              {d.pendingSignals} สัญญาณรอทบทวน
                            </Badge>
                          )}
                        </div>
                        <span className={`font-mono text-lg font-bold ${scoreColor(d.overallScore)}`}>
                          {d.overallScore !== null ? d.overallScore.toFixed(0) : '—'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{d.lastRunAt ? `รันล่าสุด ${fmtTime(d.lastRunAt)}` : 'ยังไม่เคยรันตรวจสอบ'}</span>
                        {d.weakestDimension && (
                          <span>
                            มิติอ่อนสุด: <strong className="text-amber-800">{d.weakestDimension.th}</strong> ({d.weakestDimension.score.toFixed(0)})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {dashboard === null && <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด…</p>}
                </div>
              </CardContent>
            </Card>

            {/* dimension averages */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">คะแนนเฉลี่ยตามมิติคุณภาพข้อมูล</CardTitle>
                <CardDescription>เรียงจากอ่อนที่สุด → แข็งแรงที่สุด</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashboard?.dimensions.map((d) => (
                    <div key={d.dimension} className="flex items-center gap-2 text-xs">
                      <span className="w-36 shrink-0 truncate" title={d.en}>
                        {d.th}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${d.score >= 90 ? 'bg-emerald-500' : d.score >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${d.score}%` }}
                        />
                      </div>
                      <span className={`w-12 text-right font-mono font-semibold ${scoreColor(d.score)}`}>{d.score.toFixed(0)}</span>
                    </div>
                  ))}
                  {(!dashboard || dashboard.dimensions.length === 0) && (
                    <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีผลรัน — รันการตรวจสอบก่อน</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* PII masking demo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <EyeOff className="size-4 text-emerald-700" aria-hidden="true" />
                ตัวอย่างการปิดบัง PII ตามบทบาท (Live — ฝั่งเซิร์ฟเวอร์)
              </CardTitle>
              <CardDescription>
                ข้อมูลส่วนบุคคลถูกปิดบังเป็นค่าเริ่มต้น — ประเมินฝั่ง backend ตามบทบาท สอดคล้อง PDPA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pv-dataset">ชุดข้อมูล</Label>
                  <Select value={previewDataset} onValueChange={setPreviewDataset}>
                    <SelectTrigger id="pv-dataset">
                      <SelectValue placeholder="เลือกชุดข้อมูล" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                          {d.piiEnabled ? ' (มี PII)' : ' (ไม่มี PII)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pv-role">สวมบทบาท</Label>
                  <Select value={previewRole} onValueChange={(v) => setPreviewRole(v as RoleKey)}>
                    <SelectTrigger id="pv-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {ROLE_LIST.find((r) => r.key === k)?.th}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {preview && (
                <div className="relative overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="bg-emerald-50/70 text-emerald-900">
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c} scope="col" className="px-3 py-2 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {preview.columns.map((c) => (
                            <td key={c} className="whitespace-nowrap px-3 py-1.5 font-mono">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview && (
                <p className="text-xs" role="status">
                  {preview.piiMasked ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      ปิดบัง PII อยู่ — บทบาทนี้ไม่มีสิทธิ์เห็นข้อมูลส่วนบุคคล
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                      แสดงข้อมูลจริง — บทบาทนี้มีสิทธิ์เห็น PII (ตามนโยบาย least privilege)
                    </Badge>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}
