'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GitBranch,
  Play,
  BrainCircuit,
  ClipboardCheck,
  Check,
  CheckCircle2,
  XCircle,
  Trash2,
  Power,
  RefreshCw,
  ShieldAlert,
  EyeOff,
  Sparkles,
  Send,
  Library,
  Table2,
  Plus,
  Lock,
  Scale,
  Lightbulb,
  BookOpen,
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { DIMENSION_ICONS, DimensionBadge, DimensionHint, DimensionPicker } from '@/components/dimension-picker'
import { EngineBadge, EngineHint, EnginePicker } from '@/components/engine-picker'
import {
  buildRuleSentence,
  CONDITIONS,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  DIMENSION_META,
  SEVERITY_KEYS,
  SEVERITY_LABELS,
  type TemplateParamDef,
} from '@/lib/dq'
import { ROLE_KEYS, ROLE_LIST, type PermissionKey, type RoleKey } from '@/lib/rbac'
import { isCoreView, type ViewKey } from '@/lib/views'

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

interface ApiCondition {
  id: string
  key: string
  name: string
  nameEn: string
  sentence: string
  dimension: string
  dimensionTh: string
  engineType: string
  engineLabel: string
  params: TemplateParamDef[]
  isSystem: boolean
  enabled: boolean
  createdBy: string | null
  createdAt: string
  usageCount: number
}

interface ApiRule {
  id: string
  datasetIds: string[]
  datasetNames: string[]
  datasetName: string
  column: string
  condition: string
  conditionName: string
  isSystemCondition: boolean
  conditionSentence: string | null
  engineType: string | null
  dimension: string | null
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
  skipped?: number
  newSignals: number
  overallScore: number | null
  overallGrade: { band: string; label: string; badgeClass: string; textClass: string } | null
  summary: string
  /** ครบทั้ง 9 มาตรา — score = null เมื่อไม่มีกฎในมิตินั้น (ยังไม่ได้ประเมิน) */
  dimensionScores: Array<{
    dimension: string
    th: string
    en: string
    clauseNo: number
    statement: string
    measure: string
    formula: string
    score: number | null
    grade: { band: string; label: string; badgeClass: string; barClass: string; textClass: string } | null
    rulesCount: number
    failedRules: number
    advice: string | null
  }>
  results: Array<{
    ruleId: string
    column: string
    condition: string
    conditionName: string
    severity: string
    dimension: string
    dimensionTh: string
    dimensionEn: string
    clauseNo: number
    sentence: string
    /** คำตัดสินตามมาตรา (ภาษาไทยอ่านง่าย) */
    verdict: string
    advice: string | null
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
  datasetId: string
  datasetName: string
  columns: string[]
  rows: Record<string, unknown>[]
  piiMasked: boolean
  hasSample: boolean
}

interface ColumnInfo {
  name: string
  availableIn: string[]
  missingIn: string[]
}

interface MultiPreviewData {
  previews: PreviewData[]
  columns: ColumnInfo[]
  datasetsWithSampleCount: number
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

interface CoreFeaturesConsoleProps {
  /** มุมมองปัจจุบัน — ควบคุมจาก App Sidebar (controlled) */
  activeView: ViewKey
  /** เรียกเมื่อผู้ใช้เปลี่ยนมุมมองภายในคอนโซล (ถ้ามี) */
  onViewChange: (view: ViewKey) => void
}

export default function CoreFeaturesConsole({ activeView, onViewChange }: CoreFeaturesConsoleProps) {
  const { toast } = useToast()

  // shared data
  const [users, setUsers] = useState<ApiUser[]>([])
  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [rules, setRules] = useState<ApiRule[] | null>(null)
  const [conditions, setConditions] = useState<ApiCondition[]>([])
  const [signals, setSignals] = useState<ApiSignal[]>([])
  const [signalStats, setSignalStats] = useState({ pending: 0, confirmed: 0, dismissed: 0 })
  const [exceptions, setExceptions] = useState<ApiException[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // tab 1 — rule builder form
  const [rbDatasets, setRbDatasets] = useState<string[]>([])
  const [rbPreviewDataset, setRbPreviewDataset] = useState('')
  const [rbPreview, setRbPreview] = useState<MultiPreviewData | null>(null)
  const [rbColumn, setRbColumn] = useState('')
  const [rbCondition, setRbCondition] = useState('')
  const [rbSeverity, setRbSeverity] = useState('MEDIUM')
  const [rbFilter, setRbFilter] = useState('')
  const [rbParams, setRbParams] = useState<Record<string, string>>({})
  const [rbOperator, setRbOperator] = useState('somchai.owner@company.co.th')

  // tab 2 — condition library
  const [cnName, setCnName] = useState('')
  const [cnNameEn, setCnNameEn] = useState('')
  const [cnSentence, setCnSentence] = useState('')
  const [cnDimension, setCnDimension] = useState('VALIDITY')
  const [cnEngine, setCnEngine] = useState('REGEX')
  // เติมนิยามพารามิเตอร์ของเอนจินเริ่มต้น (REGEX) ให้พร้อมแก้ไขทันที
  const [cnParams, setCnParams] = useState<Array<{ key: string; label: string; type: TemplateParamDef['type']; placeholder: string }>>(
    CONDITIONS.REGEX.params.map((p) => ({ key: p.key, label: p.label, type: p.type, placeholder: p.placeholder ?? '' })),
  )
  const [cnOperator, setCnOperator] = useState('anucha.analyst@company.co.th')

  // tab 3 — run + review
  const [runDataset, setRunDataset] = useState('')
  const [runOperator, setRunOperator] = useState('malee.steward@company.co.th')
  const [runResult, setRunResult] = useState<RunResponse | null>(null)
  const [reviewerEmail, setReviewerEmail] = useState('anucha.analyst@company.co.th')

  // tab 4 — exceptions
  const [exDataset, setExDataset] = useState('')
  const [exRule, setExRule] = useState('')
  const [exReason, setExReason] = useState('')
  const [exExpires, setExExpires] = useState('')
  const [exRequester, setExRequester] = useState('malee.steward@company.co.th')
  const [exApprover, setExApprover] = useState('somchai.owner@company.co.th')

  // tab 5 — PII preview
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
        const [r, c, s, x, dash] = await Promise.all([
          fetch('/api/dq/rules').then((r) => r.json()),
          fetch('/api/dq/conditions').then((r) => r.json()),
          fetch('/api/dq/signals').then((r) => r.json()),
          fetch('/api/dq/exceptions').then((r) => r.json()),
          fetch('/api/dq/dashboard').then((r) => r.json()),
        ])
        if (!alive) return
        setRules(r.rules ?? [])
        setConditions(c.conditions ?? [])
        setSignals(s.signals ?? [])
        setSignalStats(s.stats ?? { pending: 0, confirmed: 0, dismissed: 0 })
        setExceptions(x.exceptions ?? [])
        setDashboard(dash.error ? null : dash)
      } catch {
        if (!alive) return
        setRules([])
        setConditions([])
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])

  // Rule Builder — ตัวอย่างข้อมูลของชุดข้อมูลที่เลือก (รองรับหลายชุด + ปิดบัง PII ตามบทบาทผู้ดำเนินการ)
  const rbOperatorRole = useMemo(() => {
    const role = users.find((u) => u.email === rbOperator)?.role
    return (role as RoleKey) ?? 'BUSINESS_USER'
  }, [users, rbOperator])

  useEffect(() => {
    if (rbDatasets.length === 0) {
      setRbPreview(null)
      setRbPreviewDataset('')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/dq/dataset-preview?datasetIds=${rbDatasets.join(',')}&role=${rbOperatorRole}&rows=5`)
        const data = (await res.json()) as MultiPreviewData & { error?: string }
        if (!alive) return
        if (data.error) {
          setRbPreview(null)
          return
        }
        setRbPreview(data)
      } catch {
        if (alive) setRbPreview(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [rbDatasets, rbOperatorRole])

  // คงตัวอย่างที่แสดงไว้กับชุดข้อมูลที่ยังเลือกอยู่ — ถ้าหลุดให้สลับไปชุดแรกที่เลือก
  useEffect(() => {
    if (rbDatasets.length === 0) return
    if (!rbPreviewDataset || !rbDatasets.includes(rbPreviewDataset)) {
      setRbPreviewDataset(rbDatasets[0])
    }
  }, [rbDatasets, rbPreviewDataset])

  // PII preview (แท็บแดชบอร์ด)
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

  const hasPerm = useCallback(
    (email: string, permission: PermissionKey): boolean => {
      const role = users.find((u) => u.email === email)?.role as RoleKey | undefined
      if (!role) return false
      return ROLE_LIST.find((r) => r.key === role)?.permissions.includes(permission) ?? false
    },
    [users],
  )

  // เงื่อนไขในคลัง — แยกของระบบ / ที่ผู้ใช้สร้าง (เฉพาะที่เปิดใช้งาน สำหรับสร้างกฎ)
  const systemConditions = useMemo(() => conditions.filter((c) => c.isSystem && c.enabled), [conditions])
  const customConditions = useMemo(() => conditions.filter((c) => !c.isSystem && c.enabled), [conditions])
  const rbTemplate = useMemo(() => conditions.find((c) => c.key === rbCondition) ?? null, [conditions, rbCondition])

  // เงื่อนไขที่มีพารามิเตอร์ชนิด "เลือกชุดข้อมูลอ้างอิง" (เช่นเอนจิน EXISTS_IN_DATASET) —
  // โหลดคอลัมน์ของชุดข้อมูลอ้างอิงจากข้อมูลจริง เพื่อให้เลือกคอลัมน์อ้างอิงได้จาก dropdown
  const rbRefDatasetIds = useMemo(() => {
    const ids: string[] = []
    for (const p of rbTemplate?.params ?? []) {
      if (p.type !== 'dataset') continue
      const v = rbParams[p.key]
      if (v && !ids.includes(v)) ids.push(v)
    }
    return ids
  }, [rbTemplate, rbParams])

  const [refPreview, setRefPreview] = useState<MultiPreviewData | null>(null)

  useEffect(() => {
    if (rbRefDatasetIds.length === 0) {
      setRefPreview(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/dq/dataset-preview?datasetIds=${rbRefDatasetIds.join(',')}&role=${rbOperatorRole}&rows=5`)
        const data = (await res.json()) as MultiPreviewData & { error?: string }
        if (!alive) return
        setRefPreview(data.error ? null : data)
      } catch {
        if (alive) setRefPreview(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [rbRefDatasetIds, rbOperatorRole])

  const refColumnsByDataset = useMemo(
    () => new Map((refPreview?.previews ?? []).map((p) => [p.datasetId, p.columns])),
    [refPreview],
  )

  // ชุดข้อมูลอ้างอิงตัวแรกของเงื่อนไข (พารามิเตอร์ชนิด dataset) — ใช้กับพารามิเตอร์ชนิด dataset-column
  const rbRefDatasetParam = useMemo(() => rbTemplate?.params.find((p) => p.type === 'dataset') ?? null, [rbTemplate])
  const rbRefDatasetId = rbRefDatasetParam ? (rbParams[rbRefDatasetParam.key] ?? '') : ''
  const rbRefDatasetName = useMemo(
    () => (rbRefDatasetId ? (datasets.find((d) => d.id === rbRefDatasetId)?.name ?? undefined) : undefined),
    [rbRefDatasetId, datasets],
  )
  const rbRefColumnOptions = useMemo(() => refColumnsByDataset.get(rbRefDatasetId) ?? [], [refColumnsByDataset, rbRefDatasetId])

  const rbDatasetNames = useMemo(
    () => rbDatasets.map((id) => datasets.find((d) => d.id === id)?.name ?? '').filter(Boolean),
    [rbDatasets, datasets],
  )

  const previewSentence = useMemo(() => {
    const template = rbTemplate
    return buildRuleSentence({
      datasetNames: rbDatasetNames.length > 0 ? rbDatasetNames : undefined,
      column: rbColumn || '[Column]',
      condition: rbCondition || 'NOT_NULL',
      conditionSentence: template?.sentence,
      engineType: template?.engineType,
      refDatasetName: rbRefDatasetName,
      parameters: JSON.stringify(rbParams),
      severity: rbSeverity,
      filter: rbFilter || null,
    })
  }, [rbDatasetNames, rbColumn, rbCondition, rbTemplate, rbRefDatasetName, rbParams, rbSeverity, rbFilter])

  // คอลัมน์ที่เลือกได้ — union จากข้อมูลตัวอย่างของทุกชุดข้อมูลที่เลือก
  const rbColumnOptions = useMemo(() => rbPreview?.columns ?? [], [rbPreview])
  const rbHasSampleData = useMemo(() => (rbPreview?.datasetsWithSampleCount ?? 0) > 0, [rbPreview])
  const rbSelectedPreview = useMemo(
    () => rbPreview?.previews.find((p) => p.datasetId === rbPreviewDataset) ?? null,
    [rbPreview, rbPreviewDataset],
  )

  const cnSentencePreview = useMemo(
    () =>
      buildRuleSentence({
        column: '[Column]',
        condition: cnEngine,
        conditionSentence: cnSentence.trim() || '[ประโยค must ภาษาอังกฤษ]',
        engineType: cnEngine,
        parameters: JSON.stringify({}),
        severity: 'MEDIUM',
      }),
    [cnEngine, cnSentence],
  )

  const rulesOfDataset = useMemo(
    () => rules?.filter((r) => r.enabled && r.datasetIds.includes(exDataset)) ?? [],
    [rules, exDataset],
  )

  const pendingExceptions = useMemo(() => exceptions.filter((x) => x.status === 'PENDING'), [exceptions])
  const decidedExceptions = useMemo(() => exceptions.filter((x) => x.status !== 'PENDING'), [exceptions])
  const pendingSignals = useMemo(() => signals.filter((s) => s.status === 'PENDING_REVIEW'), [signals])
  const decidedSignals = useMemo(() => signals.filter((s) => s.status !== 'PENDING_REVIEW'), [signals])

  // ความครอบคลุมมิติของคลังเงื่อนไข (เฉพาะที่เปิดใช้งาน) — แสดง "ครอบคลุม X/9 มิติ"
  const coveredDimensions = useMemo(() => new Set(conditions.filter((c) => c.enabled && c.dimension).map((c) => c.dimension)), [conditions])
  const coveredCount = useMemo(() => DIMENSION_KEYS.filter((k) => coveredDimensions.has(k)).length, [coveredDimensions])

  /** เปลี่ยนเอนจินในฟอร์มสร้างเงื่อนไข — เติมนิยามพารามิเตอร์เริ่มต้นของเอนจินให้อัตโนมัติ */
  function applyCnEngine(engine: keyof typeof CONDITIONS) {
    setCnEngine(engine)
    setCnParams(CONDITIONS[engine].params.map((p) => ({ key: p.key, label: p.label, type: p.type, placeholder: p.placeholder ?? '' })))
  }

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

  async function deleteJson(url: string, body: Record<string, unknown>, busyKey: string, okMessage: string): Promise<boolean> {
    setBusy(busyKey)
    try {
      const res = await fetch(url, {
        method: 'DELETE',
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

  function toggleRbDataset(id: string) {
    setRbDatasets((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
    setRbColumn('')
  }

  async function handleCreateRule() {
    const ok = await postJson(
      '/api/dq/rules',
      {
        datasetIds: rbDatasets,
        column: rbColumn,
        condition: rbCondition,
        parameters: rbParams,
        severity: rbSeverity,
        filter: rbFilter,
        operatorEmail: rbOperator,
      },
      'create-rule',
      rbDatasets.length > 1 ? `สร้างกฎใหม่เรียบร้อย (ใช้ร่วม ${rbDatasets.length} ชุดข้อมูล)` : 'สร้างกฎใหม่เรียบร้อย',
    )
    if (ok) {
      setRbColumn('')
      setRbFilter('')
      setRbParams({})
      refetch()
    }
  }

  async function handleCreateCondition() {
    const ok = await postJson(
      '/api/dq/conditions',
      {
        name: cnName,
        nameEn: cnNameEn,
        sentence: cnSentence,
        dimension: cnDimension,
        engineType: cnEngine,
        params: cnParams,
        operatorEmail: cnOperator,
      },
      'create-condition',
      'บันทึกเงื่อนไขส่วนกลางใหม่เรียบร้อย — ใช้ได้กับทุกกฎในระบบ',
    )
    if (ok) {
      setCnName('')
      setCnNameEn('')
      setCnSentence('')
      refetch()
    }
  }

  async function handleToggleCondition(c: ApiCondition) {
    const ok = await patchJson(
      `/api/dq/conditions/${c.id}`,
      { action: 'TOGGLE_ENABLED', operatorEmail: cnOperator },
      `cond-toggle-${c.id}`,
      c.enabled ? 'ปิดใช้งานเงื่อนไขแล้ว' : 'เปิดใช้งานเงื่อนไขแล้ว',
    )
    if (ok) refetch()
  }

  async function handleDeleteCondition(c: ApiCondition) {
    const ok = await deleteJson(
      `/api/dq/conditions/${c.id}`,
      { operatorEmail: cnOperator },
      `cond-del-${c.id}`,
      'ลบเงื่อนไขส่วนกลางแล้ว',
    )
    if (ok) refetch()
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

  /* ------------------------- dataset multi select -------------------------- */

  function DatasetMultiSelect() {
    const allSelected = rbDatasets.length === datasets.length && datasets.length > 0
    return (
      <div className="rounded-lg border" role="group" aria-label="เลือกชุดข้อมูล (เลือกได้หลายชุด)">
        <div className="flex items-center justify-between gap-2 border-b bg-slate-50/70 px-3 py-2">
          <span className="text-xs font-medium text-slate-700">
            เลือกแล้ว {rbDatasets.length}/{datasets.length} ชุดข้อมูล
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setRbDatasets(datasets.map((d) => d.id))}
              disabled={allSelected}
            >
              เลือกทั้งหมด
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                setRbDatasets([])
                setRbColumn('')
              }}
              disabled={rbDatasets.length === 0}
            >
              ล้าง
            </Button>
          </div>
        </div>
        <div className="max-h-44 overflow-y-auto p-1">
          {datasets.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">กำลังโหลดชุดข้อมูล…</p>}
          {datasets.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              <Checkbox
                checked={rbDatasets.includes(d.id)}
                onCheckedChange={() => toggleRbDataset(d.id)}
                aria-label={`เลือกชุดข้อมูล ${d.name}`}
              />
              <span className="truncate">{d.name}</span>
              {d.piiEnabled && (
                <Badge variant="outline" className="ml-auto shrink-0 text-[10px] text-slate-500">
                  PII
                </Badge>
              )}
            </label>
          ))}
        </div>
      </div>
    )
  }

  /* -------------------------------- render -------------------------------- */

  return (
    <Tabs
      value={isCoreView(activeView) ? activeView : 'rules'}
      onValueChange={(v) => onViewChange(v as ViewKey)}
      className="w-full"
    >

      {/* ============================ TAB 1: RULE BUILDER ============================ */}
      <TabsContent value="rules" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="size-4 text-emerald-700" aria-hidden="true" />
                สร้างกฎคุณภาพข้อมูลแบบไม่ต้องเขียนโค้ด
              </CardTitle>
              <CardDescription>
                เลือกชุดข้อมูลได้หลายชุด (กฎใช้ร่วมกันได้) · ดูตัวอย่างข้อมูลก่อนเลือกคอลัมน์ · เงื่อนไขจากคลังส่วนกลาง
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 1) ชุดข้อมูล — เลือกได้หลายชุด */}
              <div className="space-y-1.5">
                <Label>ชุดข้อมูล (For) — เลือกได้มากกว่า 1 ชุด</Label>
                <DatasetMultiSelect />
                {rbDatasets.length > 1 && (
                  <p className="text-xs text-emerald-700" role="status">
                    กฎนี้จะถูกใช้ตรวจทั้ง {rbDatasetNames.length} ชุดข้อมูล: {rbDatasetNames.join(', ')}
                  </p>
                )}
              </div>

              {/* 2) ตัวอย่างข้อมูล + เลือกคอลัมน์จากข้อมูลจริง */}
              <div className="space-y-2 rounded-lg border bg-slate-50/50 p-3">
                <div className="flex items-center gap-2">
                  <Table2 className="size-4 text-slate-600" aria-hidden="true" />
                  <p className="text-xs font-medium text-slate-700">ตัวอย่างข้อมูล (sandbox — ปิดบัง PII ตามบทบาท)</p>
                </div>

                {rbDatasets.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">เลือกชุดข้อมูลก่อน เพื่อดูตัวอย่างและเลือกคอลัมน์</p>
                )}

                {rbDatasets.length > 0 && (rbPreview?.previews.length ?? 0) > 1 && (
                  <Select value={rbPreviewDataset} onValueChange={setRbPreviewDataset}>
                    <SelectTrigger aria-label="เลือกชุดข้อมูลที่ต้องการดูตัวอย่าง" className="h-8 text-xs">
                      <SelectValue placeholder="ชุดข้อมูลที่ดูตัวอย่าง" />
                    </SelectTrigger>
                    <SelectContent>
                      {rbPreview!.previews.map((p) => (
                        <SelectItem key={p.datasetId} value={p.datasetId}>
                          {p.datasetName}
                          {!p.hasSample ? ' (ไม่มีข้อมูลตัวอย่าง)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {rbSelectedPreview && rbSelectedPreview.hasSample && (
                  <div className="relative overflow-x-auto rounded-md border bg-white">
                    <table className="w-full min-w-[480px] text-left text-[11px]">
                      <thead className="bg-emerald-50/70 text-emerald-900">
                        <tr>
                          {rbSelectedPreview.columns.map((c) => (
                            <th key={c} scope="col" className="px-2.5 py-1.5 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rbSelectedPreview.rows.map((row, i) => (
                          <tr key={i} className="border-t">
                            {rbSelectedPreview.columns.map((c) => (
                              <td key={c} className="max-w-40 truncate whitespace-nowrap px-2.5 py-1 font-mono" title={String(row[c] ?? '')}>
                                {String(row[c] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {rbSelectedPreview && !rbSelectedPreview.hasSample && (
                  <p className="rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
                    ชุดข้อมูล “{rbSelectedPreview.datasetName}” ยังไม่มีข้อมูลตัวอย่างในระบบ — พิมพ์ชื่อคอลัมน์เองได้ด้านล่าง
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="rb-column">คอลัมน์ (Column) — จากข้อมูลตัวอย่างที่เลือก</Label>
                  {rbHasSampleData ? (
                    <Select
                      value={rbColumn}
                      onValueChange={setRbColumn}
                    >
                      <SelectTrigger id="rb-column">
                        <SelectValue placeholder={rbColumnOptions.length > 0 ? 'เลือกคอลัมน์' : 'ยังไม่พบคอลัมน์'} />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {rbColumnOptions.map((col) => {
                          const missingCount = col.missingIn.filter((id) => rbDatasets.includes(id)).length
                          const selectedCount = rbDatasets.length
                          return (
                            <SelectItem key={col.name} value={col.name}>
                              {col.name}
                              {missingCount > 0 && selectedCount > 1 ? ` — ไม่พบใน ${missingCount} ชุดข้อมูลที่เลือก` : ''}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="rb-column"
                      value={rbColumn}
                      onChange={(e) => setRbColumn(e.target.value)}
                      placeholder="พิมพ์ชื่อคอลัมน์ เช่น email"
                    />
                  )}
                  {rbColumn &&
                    rbColumnOptions.find((c) => c.name === rbColumn)?.missingIn.some((id) => rbDatasets.includes(id)) && (
                      <p className="text-[11px] text-amber-700" role="alert">
                        คอลัมน์ “{rbColumn}” ไม่พบในบางชุดข้อมูลที่เลือก (ชุดที่มีข้อมูลตัวอย่าง) — ระบบจะปฏิเสธตอนบันทึก
                      </p>
                    )}
                </div>
              </div>

              {/* 3) เงื่อนไขจากคลังส่วนกลาง */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rb-condition" className="gap-1">
                    เงื่อนไข (must) — จากคลังส่วนกลาง
                  </Label>
                  <Select
                    value={rbCondition}
                    onValueChange={(v) => {
                      setRbCondition(v)
                      setRbParams({})
                    }}
                  >
                    <SelectTrigger id="rb-condition">
                      <SelectValue placeholder="เลือกเงื่อนไข" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectGroup>
                        <SelectLabel>มาตรฐานของระบบ</SelectLabel>
                        {systemConditions.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {customConditions.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>ส่วนกลางที่สร้างเอง</SelectLabel>
                          {customConditions.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
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

              {rbTemplate && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900">
                  <Badge variant="outline" className="border-emerald-200 bg-white text-[10.5px] text-emerald-800">
                    {rbTemplate.isSystem ? 'เงื่อนไขมาตรฐาน' : 'สร้างโดยผู้ใช้'}
                  </Badge>
                  <span className="font-medium">{rbTemplate.name}</span>
                  <span className="text-emerald-700">must {rbTemplate.sentence}</span>
                  <Badge variant="outline" className="border-emerald-200 bg-white text-[10.5px] text-emerald-800">
                    {DIMENSION_LABELS[rbTemplate.dimension as keyof typeof DIMENSION_LABELS]?.th ?? rbTemplate.dimension}
                  </Badge>
                  <EngineBadge engine={rbTemplate.engineType} className="border-emerald-200 bg-white text-emerald-800" />
                </div>
              )}

              {/* dynamic parameters — จากนิยามของเงื่อนไขในคลัง (รองรับทุกชนิดพารามิเตอร์รวมถึงเลือกชุดข้อมูล/คอลัมน์อ้างอิง) */}
              {rbTemplate && rbTemplate.params.length > 0 && (
                <div className="grid gap-3 rounded-lg border bg-emerald-50/50 p-3 sm:grid-cols-2">
                  <p className="text-xs font-medium text-emerald-900 sm:col-span-2">
                    พารามิเตอร์ของเงื่อนไข “{rbTemplate.name}” (using)
                  </p>
                  {rbTemplate.params.map((p) => {
                    // ชนิดพิเศษ: เลือกชุดข้อมูลอ้างอิงจากรายการชุดข้อมูลในระบบ
                    if (p.type === 'dataset') {
                      return (
                        <div key={p.key} className="space-y-1.5">
                          <Label htmlFor={`rb-param-${p.key}`} className="text-xs">
                            {p.label}
                          </Label>
                          <Select
                            value={rbParams[p.key] ?? ''}
                            onValueChange={(v) =>
                              setRbParams((prev) => {
                                const next = { ...prev, [p.key]: v }
                                // เปลี่ยนชุดข้อมูลอ้างอิง → ล้างคอลัมน์อ้างอิงที่เลือกไว้ก่อนหน้า
                                for (const q of rbTemplate.params) {
                                  if (q.type === 'dataset-column') delete next[q.key]
                                }
                                return next
                              })
                            }
                          >
                            <SelectTrigger id={`rb-param-${p.key}`}>
                              <SelectValue placeholder="เลือกชุดข้อมูลอ้างอิง" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              {datasets.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    }
                    // ชนิดพิเศษ: เลือกคอลัมน์อ้างอิงจากคอลัมน์จริงของชุดข้อมูลอ้างอิง
                    if (p.type === 'dataset-column') {
                      return (
                        <div key={p.key} className="space-y-1.5">
                          <Label htmlFor={`rb-param-${p.key}`} className="text-xs">
                            {p.label}
                          </Label>
                          {rbRefDatasetId ? (
                            rbRefColumnOptions.length > 0 ? (
                              <Select value={rbParams[p.key] ?? ''} onValueChange={(v) => setRbParams((prev) => ({ ...prev, [p.key]: v }))}>
                                <SelectTrigger id={`rb-param-${p.key}`}>
                                  <SelectValue placeholder="เลือกคอลัมน์อ้างอิง" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {rbRefColumnOptions.map((col) => (
                                    <SelectItem key={col} value={col}>
                                      {col}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id={`rb-param-${p.key}`}
                                value={rbParams[p.key] ?? ''}
                                placeholder="ชุดข้อมูลอ้างอิงยังไม่มีข้อมูลตัวอย่าง — พิมพ์ชื่อคอลัมน์"
                                onChange={(e) => setRbParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                              />
                            )
                          ) : (
                            <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                              เลือกชุดข้อมูลอ้างอิงก่อน แล้วคอลัมน์จะแสดงจากข้อมูลจริง
                            </p>
                          )}
                        </div>
                      )
                    }
                    // ชนิดทั่วไป: ตัวเลข / ข้อความ
                    return (
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
                    )
                  })}
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
              <div className="rounded-lg bg-slate-900 p-3.5 font-mono text-[12.5px] leading-relaxed break-words text-emerald-300" aria-live="polite">
                {previewSentence}
              </div>

              <Button
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleCreateRule}
                disabled={rbDatasets.length === 0 || !rbColumn || !rbCondition || busy !== null}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {busy === 'create-rule' ? 'กำลังบันทึก…' : `บันทึกกฎใหม่${rbDatasets.length > 1 ? ` (ใช้ร่วม ${rbDatasets.length} ชุดข้อมูล)` : ''}`}
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
              <CardDescription>ผลรันล่าสุดของแต่ละกฎ แสดงเคียงข้างกฎเสมอ — กฎที่ใช้ร่วมหลายชุดข้อมูลแสดงหลายป้าย</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
                {rules === null && <p className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด…</p>}
                {rules?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีกฎ — สร้างกฎแรกจากฟอร์มด้านซ้าย</p>}
                {rules?.map((rule) => (
                  <div key={rule.id} className={`rounded-lg border p-3 ${rule.enabled ? '' : 'opacity-60'}`}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {rule.datasetNames.map((name) => (
                        <Badge key={name} variant="outline" className="text-[11px]">
                          {name}
                        </Badge>
                      ))}
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${
                          rule.isSystemCondition
                            ? 'border-slate-200 bg-slate-50 text-slate-600'
                            : 'border-violet-200 bg-violet-50 text-violet-800'
                        }`}
                      >
                        {rule.conditionName}
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

      {/* ====================== TAB 2: CONDITION LIBRARY ====================== */}
      <TabsContent value="conditions" className="mt-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1fr]">
          {/* create new global condition */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Library className="size-4 text-emerald-700" aria-hidden="true" />
                สร้างเงื่อนไข (must) ส่วนกลางใหม่
              </CardTitle>
              <CardDescription>
                เงื่อนไขที่สร้างจะถูกจัดเก็บเป็นส่วนกลางของระบบ — นำไปใช้กับกฎทุกตัวและทุกชุดข้อมูลได้
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cn-name">ชื่อเงื่อนไข (ไทย)</Label>
                  <Input id="cn-name" value={cnName} onChange={(e) => setCnName(e.target.value)} placeholder="เช่น หมายเลขประชาชนไทย" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-name-en">ชื่อภาษาอังกฤษ (ไม่บังคับ)</Label>
                  <Input id="cn-name-en" value={cnNameEn} onChange={(e) => setCnNameEn(e.target.value)} placeholder="Thai citizen ID" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-sentence">ประโยค “must …” (ภาษาอังกฤษ — ต่อจากคำว่า must ในประโยคกฎ)</Label>
                <Input
                  id="cn-sentence"
                  value={cnSentence}
                  onChange={(e) => setCnSentence(e.target.value)}
                  placeholder="เช่น match the Thai citizen ID pattern (13 digits)"
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cn-dimension">ขั้นที่ 1 — มิติคุณภาพข้อมูล: 9 มิติตาม DAMA-DMBOK</Label>
                  <p className="text-[11px] text-muted-foreground">
                    เลือกมิติที่เงื่อนไขนี้ช่วยรับประกัน — ระบบจะแนะนำเอนจินที่เหมาะกับมิตินั้นให้อัตโนมัติ
                  </p>
                  <DimensionPicker
                    value={cnDimension}
                    onChange={(dim) => {
                      setCnDimension(dim)
                      // Guided flow — เปลี่ยนมิติ → สลับไปเอนจินแรกที่แนะนำของมิตินั้น + เติมพารามิเตอร์เริ่มต้น
                      const rec = DIMENSION_META[dim].recommendedEngines[0]
                      if (rec) applyCnEngine(rec)
                    }}
                  />
                  <DimensionHint value={cnDimension} />
                </div>
                <div className="space-y-1.5">
                  <Label>ขั้นที่ 2 — เอนจินประเมินผล (จัดกลุ่มตามมิติ — ครบทั้ง 9 มิติ)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    เอนจินของมิติที่เลือกถูกไฮไลต์เป็น “มิติที่เลือก” — เลือกเอนจินที่ตรงกับวิธีตรวจสอบของเงื่อนไขนี้
                  </p>
                  <EnginePicker value={cnEngine} onChange={applyCnEngine} recommendedFor={cnDimension} />
                  <EngineHint value={cnEngine} />
                </div>
              </div>

              {/* parameter definitions */}
              <div className="space-y-2 rounded-lg border bg-slate-50/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-700">พารามิเตอร์ที่ผู้ใช้กรอกตอนสร้างกฎ (using)</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() =>
                      setCnParams((prev) => [...prev, { key: '', label: '', type: 'text', placeholder: '' }])
                    }
                    disabled={cnParams.length >= 6}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    เพิ่มพารามิเตอร์
                  </Button>
                </div>
                {cnParams.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">เอนจินนี้ไม่ต้องใช้พารามิเตอร์</p>
                )}
                {cnParams.map((p, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_0.9fr_1.2fr_auto]">
                    <Input
                      aria-label={`คีย์พารามิเตอร์ ${i + 1}`}
                      value={p.key}
                      placeholder="key เช่น pattern"
                      onChange={(e) =>
                        setCnParams((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                      }
                    />
                    <Input
                      aria-label={`ป้ายชื่อพารามิเตอร์ ${i + 1}`}
                      value={p.label}
                      placeholder="ป้ายชื่อ (ไทย)"
                      onChange={(e) =>
                        setCnParams((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                    />
                    <Select
                      value={p.type}
                      onValueChange={(v) =>
                        setCnParams((prev) => prev.map((x, j) => (j === i ? { ...x, type: v as TemplateParamDef['type'] } : x)))
                      }
                    >
                      <SelectTrigger aria-label={`ชนิดพารามิเตอร์ ${i + 1}`} className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">ข้อความ</SelectItem>
                        <SelectItem value="number">ตัวเลข</SelectItem>
                        <SelectItem value="dataset">เลือกชุดข้อมูล</SelectItem>
                        <SelectItem value="dataset-column">เลือกคอลัมน์อ้างอิง</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={`ตัวอย่างพารามิเตอร์ ${i + 1}`}
                      value={p.placeholder}
                      placeholder="ตัวอย่างค่า (ไม่บังคับ)"
                      onChange={(e) =>
                        setCnParams((prev) => prev.map((x, j) => (j === i ? { ...x, placeholder: e.target.value } : x)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`ลบพารามิเตอร์ ${i + 1}`}
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setCnParams((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-operator">ผู้ดำเนินการ (ต้องมีสิทธิ์ MANAGE_RULES)</Label>
                <OperatorSelect id="cn-operator" value={cnOperator} onChange={setCnOperator} permission={PERMISSIONS_BY_ACTION.MANAGE_RULES} />
              </div>

              <div className="rounded-lg bg-slate-900 p-3.5 font-mono text-[12.5px] leading-relaxed break-words text-emerald-300" aria-live="polite">
                {cnSentencePreview}
              </div>

              <Button
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleCreateCondition}
                disabled={cnName.trim().length < 2 || cnSentence.trim().length < 3 || busy !== null}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {busy === 'create-condition' ? 'กำลังบันทึก…' : 'บันทึกเงื่อนไขส่วนกลาง'}
              </Button>
            </CardContent>
          </Card>

          {/* condition list */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">เงื่อนไขในระบบ ({conditions.length})</CardTitle>
                <Button variant="ghost" size="sm" onClick={refetch} aria-label="รีเฟรชคลังเงื่อนไข">
                  <RefreshCw className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <CardDescription>เงื่อนไขมาตรฐานของระบบลบ/แก้ไม่ได้ — เงื่อนไขที่สร้างเองลบได้เมื่อไม่มีกฎใช้อ้างอิง</CardDescription>
              {/* ความครอบคลุมมิติ DAMA-DMBOK ของคลังเงื่อนไข */}
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-slate-50/60 px-2.5 py-1.5"
                role="status"
                aria-label={`คลังเงื่อนไขครอบคลุม ${coveredCount} จาก 9 มิติ DAMA-DMBOK`}
              >
                <span className="text-[11px] font-medium text-slate-600">ครอบคลุมมิติ {coveredCount}/9:</span>
                {DIMENSION_KEYS.map((k) => {
                  const covered = coveredDimensions.has(k)
                  return (
                    <span
                      key={k}
                      title={`${DIMENSION_META[k].th} (${DIMENSION_META[k].en})${covered ? ' — มีเงื่อนไขแล้ว' : ' — ยังไม่มีเงื่อนไข'}`}
                      className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] ${
                        covered ? `${DIMENSION_META[k].badgeClass} font-medium` : 'border-dashed border-slate-300 bg-white text-slate-400'
                      }`}
                    >
                      {covered ? <Check className="size-2.5" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-slate-300" aria-hidden="true" />}
                      {DIMENSION_META[k].en}
                    </span>
                  )
                })}
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[36rem] space-y-2.5 overflow-y-auto pr-1">
                {conditions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">กำลังโหลดคลังเงื่อนไข…</p>}
                {conditions.map((c) => (
                  <div key={c.id} className={`rounded-lg border p-3 ${c.enabled ? '' : 'opacity-60'}`}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10.5px] ${
                          c.isSystem ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-violet-200 bg-violet-50 text-violet-800'
                        }`}
                      >
                        {c.isSystem ? (
                          <span className="flex items-center gap-1">
                            <Lock className="size-3" aria-hidden="true" />
                            ของระบบ
                          </span>
                        ) : (
                          'สร้างโดยผู้ใช้'
                        )}
                      </Badge>
                      <DimensionBadge dimension={c.dimension} />
                      <EngineBadge engine={c.engineType} />
                      <Badge variant="outline" className="text-[10.5px]">
                        ใช้ใน {c.usageCount} กฎ
                      </Badge>
                      {!c.enabled && (
                        <Badge variant="outline" className="text-[10.5px] bg-slate-50 text-slate-500">
                          ปิดใช้งาน
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      {c.name}
                      {c.nameEn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({c.nameEn})</span>}
                    </p>
                    <p className="mt-0.5 font-mono text-[11.5px] text-slate-600">
                      …must {c.sentence} · รหัส {c.key}
                    </p>
                    {c.params.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.params.map((p) => (
                          <Badge key={p.key} variant="outline" className="text-[10px] text-slate-500">
                            {p.key}: {p.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {!c.isSystem && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] text-muted-foreground">
                          สร้างโดย {c.createdBy ?? '—'} · {fmtTime(c.createdAt)}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={c.enabled ? 'ปิดใช้งานเงื่อนไข' : 'เปิดใช้งานเงื่อนไข'}
                            onClick={() => handleToggleCondition(c)}
                            disabled={busy !== null}
                          >
                            <Power className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="ลบเงื่อนไข"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => handleDeleteCondition(c)}
                            disabled={busy !== null || c.usageCount > 0}
                            title={c.usageCount > 0 ? `ใช้ใน ${c.usageCount} กฎ — ลบไม่ได้ (ปิดใช้งานแทนได้)` : 'ลบเงื่อนไข'}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ========================= TAB 3: RUN + SIGNALS ========================= */}
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
                  {runResult.rowsCount} แถว · {runResult.rulesCount} กฎ
                  {runResult.skipped ? ` · ข้าม ${runResult.skipped} กฎ (เงื่อนไขไม่พบในคลัง)` : ''} · สัญญาณใหม่ {runResult.newSignals} รายการ (รอมนุษย์ทบทวน)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* สรุปผลรวมตามมาตรา — คะแนนรวม + เกรด + ประโยคสรุปภาษาคน */}
                <div className="flex flex-col gap-3 rounded-lg border bg-emerald-50/50 p-4 sm:flex-row sm:items-center">
                  <div className="shrink-0">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Scale className="size-3.5" aria-hidden="true" />
                      คะแนนคุณภาพข้อมูลรวม (เฉลี่ย 9 มาตรา)
                    </p>
                    <p className={`text-3xl font-bold ${runResult.overallGrade?.textClass ?? scoreColor(runResult.overallScore)}`}>
                      {runResult.overallScore !== null ? runResult.overallScore.toFixed(1) : '—'}
                      <span className="text-base">/100</span>
                    </p>
                  </div>
                  {runResult.overallGrade && (
                    <Badge variant="outline" className={`w-fit border text-xs font-semibold ${runResult.overallGrade.badgeClass}`}>
                      เกรด {runResult.overallGrade.label}
                    </Badge>
                  )}
                  <p className="text-xs leading-relaxed text-slate-700 sm:border-l sm:border-emerald-200 sm:pl-3" role="note">
                    {runResult.summary}
                  </p>
                </div>

                {/* บัตรคะแนนรายมาตรา 9 ใบ — เรียงมาตรา 1–9 ตามลำดับ DAMA-DMBOK */}
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-700">
                    ผลประเมินรายมาตรา — เรียงตามมาตรฐาน DAMA-DMBOK (มาตราที่ 1–9)
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {runResult.dimensionScores.map((d) => {
                      const Icon = DIMENSION_ICONS[d.dimension as keyof typeof DIMENSION_ICONS]
                      return (
                        <div
                          key={d.dimension}
                          className={`rounded-lg border p-3 ${d.score !== null ? 'bg-white' : 'border-dashed bg-slate-50/60 opacity-75'}`}
                          title={d.score !== null ? `${d.statement}\nมาตราการวัด: ${d.measure}\nสูตร: ${d.formula}` : `${d.statement} — ยังไม่มีกฎที่เปิดใช้ในมิตินี้`}
                        >
                          <div className="mb-1.5 flex items-center gap-1.5">
                            {Icon && <Icon className={`size-3.5 shrink-0 ${d.score !== null ? 'text-slate-700' : 'text-slate-400'}`} aria-hidden="true" />}
                            <span className="truncate text-xs font-semibold text-slate-800">มาตรา {d.clauseNo}: {d.th}</span>
                            {d.grade && (
                              <Badge variant="outline" className={`ml-auto shrink-0 border text-[10px] font-semibold ${d.grade.badgeClass}`}>
                                {d.grade.label}
                              </Badge>
                            )}
                          </div>
                          {d.score !== null ? (
                            <>
                              <div className="flex items-baseline gap-1">
                                <span className={`text-xl font-bold ${d.grade?.textClass ?? scoreColor(d.score)}`}>{d.score.toFixed(0)}</span>
                                <span className="text-[10px] text-muted-foreground">/100</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  กฎ {d.rulesCount} ข้อ{d.failedRules > 0 ? ` · ล้มเหลว ${d.failedRules}` : ' · ผ่านทั้งหมด'}
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                                <div className={`h-full rounded-full ${d.grade?.barClass ?? 'bg-slate-400'}`} style={{ width: `${d.score}%` }} />
                              </div>
                              {d.advice && (
                                <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-snug text-amber-800">
                                  <Lightbulb className="mt-0.5 size-3 shrink-0 text-amber-500" aria-hidden="true" />
                                  {d.advice}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">ยังไม่ได้ประเมิน — ไม่มีกฎที่เปิดใช้ในมิตินี้</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* มาตราฉบับเต็ม — ข้อกำหนด + มาตราการวัด + สูตร ของทั้ง 9 มาตรา (ช่วยให้ผู้ใช้เข้าใจวิธีตัดสิน) */}
                <details className="rounded-lg border bg-slate-50/60 p-3">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
                    <BookOpen className="size-3.5 text-emerald-700" aria-hidden="true" />
                    ดูข้อกำหนดและวิธีคำนวณของมาตราทั้ง 9 (DAMA-DMBOK)
                  </summary>
                  <ol className="mt-2 space-y-2">
                    {runResult.dimensionScores.map((d) => (
                      <li key={d.dimension} className="rounded-md border bg-white p-2.5 text-[11.5px] leading-relaxed">
                        <p className="font-semibold text-slate-800">
                          มาตราที่ {d.clauseNo} — {d.th} ({d.en})
                        </p>
                        <p className="text-slate-600">{d.statement}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          <span className="font-medium text-slate-600">มาตราการวัด:</span> {d.measure}
                        </p>
                        <p className="font-mono text-[11px] text-emerald-800">สูตร: {d.formula}</p>
                      </li>
                    ))}
                  </ol>
                </details>

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
                        <DimensionBadge dimension={r.dimension} />
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          <Scale className="size-3" aria-hidden="true" />
                          มาตรา {r.clauseNo} · {r.dimensionTh}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {r.conditionName}
                        </Badge>
                        <span className={`text-xs font-semibold ${r.status === 'PASSED' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {r.status === 'PASSED' ? 'ผ่าน' : `ล้มเหลว ${r.failedRows}/${r.totalRows} แถว (${Math.round(r.passRate * 100)}%)`}
                        </span>
                      </div>
                      <p className="font-mono text-[12px] text-slate-700">{r.sentence}</p>
                      {/* คำตัดสินตามมาตรา — อ่านง่าย รู้ทันทีว่าผ่าน/ไม่ผ่านมาตราใด เพราะอะไร */}
                      <p className={`mt-1.5 text-[12.5px] leading-relaxed ${r.status === 'PASSED' ? 'text-emerald-800' : 'text-rose-800'}`} role="note">
                        {r.verdict}
                      </p>
                      {r.advice && (
                        <p className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11.5px] leading-relaxed text-amber-900">
                          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                          <span>
                            <strong>คำแนะนำ:</strong> {r.advice} <span className="text-amber-700">(เป็นข้อแนะนำ — การแก้ไขข้อมูลต้องดำเนินการโดยมนุษย์)</span>
                          </span>
                        </p>
                      )}
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
                      <DimensionBadge dimension={s.dimension} />
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

      {/* ===================== TAB 4: EXCEPTIONS ===================== */}
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
                        {r.column} ({r.conditionName})
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

      {/* ===================== TAB 5: DASHBOARD ===================== */}
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
