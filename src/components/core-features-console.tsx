'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GitBranch,
  Play,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Trash2,
  Power,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Library,
  Table2,
  Plus,
  Lock,
  Scale,
  Lightbulb,
  BookOpen,
  Box,
  Star,
  Banknote,
  CircleMinus,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EXCEPTION_ACTIONS, EXCEPTION_ACTION_KEYS } from '@/lib/mappings'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'
import { DIMENSION_ICONS, DimensionBadge, DimensionHint, DimensionPicker } from '@/components/dimension-picker'
import { EngineBadge, EngineHint, EnginePicker } from '@/components/engine-picker'
import BatchHistory from '@/components/dq/batch-history'
import DomainRunPanel from '@/components/dq/domain-run'
import {
  buildRuleSentence,
  CONDITIONS,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  DIMENSION_META,
  isConditionKey,
  SEVERITY_KEYS,
  SEVERITY_LABELS,
  type TemplateParamDef,
} from '@/lib/dq'
import { ROLE_LIST, type PermissionKey, type RoleKey } from '@/lib/rbac'
import type { DomainItem } from '@/lib/domains'
import { ELEMENT_DATA_TYPE_LABELS, type ElementDataType } from '@/lib/elements'
import { isCoreView, type ViewKey } from '@/lib/views'
import DqDashboard from '@/components/dq-dashboard'

/** ทะเบียนข้อมูลอ้างอิงแบบย่อ (v0.31.0) — ตัวเลือกโหมดทะเบียนของ IN_LIST/REFERENCE_MATCH */
interface ReferenceSetOption {
  id: string
  code: string
  name: string
  activeValueCount: number
}

/** Data Element แบบย่อสำหรับ Rule Builder (จาก /api/elements) */
interface ElementRowLite {
  id: string
  code: string
  subDomainId: string
  parentDomainId: string | null
  subDomainName: string
  nameTh: string
  nameEn: string
  dataType: string
  formatPattern: string
  valueDomain: string
  pii: boolean
  isCde: boolean
  isFinancial: boolean
  status: string
  ruleCount: number
  mappingCount: number
}

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
  classification: string
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
  threshold: number
  /** การดำเนินการเมื่อกฎ fail (v0.22.0) — สรุปแสดงในหน้ารายละเอียด Mapping */
  exceptionAction: string
  exceptionActionNote: string
  enabled: boolean
  sentence: string
  /** Data Element ที่กฎผูกอยู่ (v0.18.0) — null = ยังไม่ผูก */
  dataElement: { id: string; code: string; nameTh: string; path: string } | null
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

interface RunResponse {
  batchId?: string
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
    status: 'PASSED' | 'FAILED' | 'NO_DATA'
    totalRows: number
    failedRows: number
    passRate: number
    failedSamples: string[]
  }>
}

interface DashboardData {
  totals: { pendingSignals: number; activeExceptions: number; rulesEnabled: number; datasetsWithRun: number; datasetsTotal: number }
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

/* Rule Builder wizard (v0.18.1) — ชื่อขั้นตอน 4 ขั้นของการสร้างกฎ */
const RB_STEPS = [
  { title: 'เป้าหมาย', desc: 'ชุดข้อมูล + Data Element' },
  { title: 'คอลัมน์', desc: 'จากตัวอย่างข้อมูลจริง' },
  { title: 'เงื่อนไข', desc: 'must + พารามิเตอร์' },
  { title: 'ตั้งค่า', desc: 'รุนแรง · เกณฑ์ · บันทึก' },
] as const

const PERMISSIONS_BY_ACTION: Record<string, PermissionKey> = {
  MANAGE_RULES: 'MANAGE_RULES',
  RUN_VALIDATION: 'RUN_VALIDATION',
}

/** ชิปแสดงผู้ดำเนินการปัจจุบัน (v0.32.0) — แทนตัวเลือก "ผู้ดำเนินการ" ที่เคยกระจายทุกแท็บ
 *  เปลี่ยนตัวบุคคลที่ตัวเลือก "ผู้ใช้งาน" มุมขวาบนของ header เพียงจุดเดียว */
function ActorChip({ id, permission }: { id: string; permission: PermissionKey }) {
  const { user, hasPermission } = useCurrentUser()
  const allowed = hasPermission(permission)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs" aria-live="polite">
      <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
      <span className="min-w-0 truncate font-medium text-slate-800" id={id}>
        {user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลดผู้ใช้…'}
      </span>
      <Badge variant="outline" className={`shrink-0 text-[10px] ${allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        {allowed ? 'มีสิทธิ์ดำเนินการ' : 'ไม่มีสิทธิ์ (API จะปฏิเสธ)'}
      </Badge>
    </div>
  )
}

/* ----------------------------- component --------------------------------- */

interface CoreFeaturesConsoleProps {
  /** มุมมองปัจจุบัน — ควบคุมจาก App Sidebar (controlled) */
  activeView: ViewKey
  /** เรียกเมื่อผู้ใช้เปลี่ยนมุมมองภายในคอนโซล (ถ้ามี) */
  onViewChange: (view: ViewKey) => void
  /** 'full' = หน้าตรง (ผลการตรวจ/แดชบอร์ด) · 'library' = หน้าคลังกฎ (สลับกฎ/เงื่อนไขภายในหน้า) */
  mode?: 'full' | 'library'
}

export default function CoreFeaturesConsole({ activeView, onViewChange, mode = 'full' }: CoreFeaturesConsoleProps) {
  const { toast } = useToast()
  /* v0.32.0 — identity ศูนย์กลาง: มุมมอง/สิทธิ์/ผู้ดำเนินการ = ผู้ใช้ปัจจุบันเดียวของทั้งระบบ */
  const { user } = useCurrentUser()
  const actorEmail = user?.email ?? ''

  // โหมด library — สลับแท็บกฎ/เงื่อนไขภายในหน้าเดียว (ไม่เปลี่ยนเมนู)
  const [libraryTab, setLibraryTab] = useState<'rules' | 'conditions'>('rules')

  // shared data
  // v0.32.0 — รายชื่อผู้ใช้ย้ายไปโหลดครั้งเดียวที่ UserSwitcher (CurrentUserProvider) — ไม่โหลดซ้ำที่นี่
  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [rules, setRules] = useState<ApiRule[] | null>(null)
  const [conditions, setConditions] = useState<ApiCondition[]>([])
  const [signals, setSignals] = useState<ApiSignal[]>([])
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
  const [rbThreshold, setRbThreshold] = useState('95')
  const [rbFilter, setRbFilter] = useState('')
  /* v0.22.0 — Exception Action เมื่อกฎ fail (แสดงสรุปในหน้ารายละเอียด Mapping) */
  const [rbExceptionAction, setRbExceptionAction] = useState('')
  const [rbExceptionActionNote, setRbExceptionActionNote] = useState('')
  const [rbParams, setRbParams] = useState<Record<string, string>>({})
  /* v0.32.0 — ผู้ดำเนินการทุก action = ผู้ใช้ปัจจุบันจาก UserSwitcher (identity ศูนย์กลาง — เดิมมี selector แยก 4 จุด) */
  /* Data Element cascade (v0.18.0) — โดเมนหลัก → โดเมนย่อย → element */
  const [rbDomains, setRbDomains] = useState<DomainItem[]>([])
  const [rbElements, setRbElements] = useState<ElementRowLite[]>([])
  const [rbElDomain, setRbElDomain] = useState('')
  const [rbElSub, setRbElSub] = useState('')
  const [rbElementId, setRbElementId] = useState('')
  /* ทะเบียนข้อมูลอ้างอิง (v0.31.0) — ตัวเลือกโหมดทะเบียนของเอนจิน IN_LIST/REFERENCE_MATCH (เฉพาะ ACTIVE) */
  const [rbReferenceSets, setRbReferenceSets] = useState<ReferenceSetOption[]>([])
  /* Rule Builder wizard (v0.18.1) — ขั้นตอนปัจจุบัน 1–4 */
  const [rbStep, setRbStep] = useState(1)
  // B1 (v0.37.0) — คำแนะนำเงื่อนไขจาก ML Studio (scikit-learn) ตอนเลือกคอลัมน์ใน Rule Builder
  const [rbRecs, setRbRecs] = useState<{
    dataType: string
    modelVersion: number | null
    recommendations: Array<{ condition: string; th: string; dimensionTh: string; confidence: string; reason: string }>
  } | null>(null)
  const [rbRecsLoading, setRbRecsLoading] = useState(false)

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

  // tab 3 — run + review
  const [runDataset, setRunDataset] = useState('')
  const [runResult, setRunResult] = useState<RunResponse | null>(null)
  // B2 (v0.37.0) — สรุปหลังตรวจจาก ML Studio (ผู้ช่วยเสนอแนะ — ไม่ตัดสินแทนคะแนนกฎ)
  const [mlSummary, setMlSummary] = useState<{
    summaryText: string
    modelVersion: number | null
    advice: string[]
    commonCauses: Array<{ signature: string; failedRows: number; hypothesis: string }>
  } | null>(null)
  const [mlSummaryOpen, setMlSummaryOpen] = useState(true)


  const refetch = useCallback(() => setReloadTick((t) => t + 1), [])

  /* ---------------------------- data load -------------------------------- */

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [d] = await Promise.all([
          fetch('/api/rbac/datasets').then((r) => r.json()),
        ])
        if (!alive) return
        setDatasets(d.datasets ?? [])
      } catch {
        /* network error — คงค่าว่างไว้ */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Data Element สำหรับ Rule Builder (v0.18.0) + ทะเบียนอ้างอิง (v0.31.0) — โหลดครั้งเดียวพอ (เปลี่ยนน้อยมาก)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [dom, els, refSets] = await Promise.all([
          fetch('/api/domains').then((r) => r.json()),
          fetch('/api/elements').then((r) => r.json()),
          fetch('/api/reference/sets').then((r) => r.json()),
        ])
        if (!alive) return
        setRbDomains(dom.domains ?? [])
        setRbElements(els.elements ?? [])
        setRbReferenceSets(
          (refSets.sets ?? [])
            .filter((s: { status: string; activeValueCount: number }) => s.status === 'ACTIVE' && s.activeValueCount > 0)
            .map((s: { id: string; code: string; name: string; activeValueCount: number }) => ({
              id: s.id,
              code: s.code,
              name: s.name,
              activeValueCount: s.activeValueCount,
            })),
        )
      } catch {
        /* คงค่าว่างไว้ */
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
        const [r, c, s, dash] = await Promise.all([
          fetch('/api/dq/rules').then((r) => r.json()),
          fetch('/api/dq/conditions').then((r) => r.json()),
          fetch('/api/dq/signals').then((r) => r.json()),
          fetch('/api/dq/dashboard').then((r) => r.json()),
        ])
        if (!alive) return
        setRules(r.rules ?? [])
        setConditions(c.conditions ?? [])
        setSignals(s.signals ?? [])
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

  // Rule Builder — ตัวอย่างข้อมูลของชุดข้อมูลที่เลือก (รองรับหลายชุด)
  // v0.34.0 — บทบาทผู้ชม (PII masking) อ่านฝั่ง backend จาก session ผู้เข้าสู่ระบบ — client ไม่ส่ง role อีกต่อไป

  useEffect(() => {
    if (rbDatasets.length === 0) {
      setRbPreview(null)
      setRbPreviewDataset('')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/dq/dataset-preview?datasetIds=${rbDatasets.join(',')}&rows=5`)
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
  }, [rbDatasets])

  // คงตัวอย่างที่แสดงไว้กับชุดข้อมูลที่ยังเลือกอยู่ — ถ้าหลุดให้สลับไปชุดแรกที่เลือก
  useEffect(() => {
    if (rbDatasets.length === 0) return
    if (!rbPreviewDataset || !rbDatasets.includes(rbPreviewDataset)) {
      setRbPreviewDataset(rbDatasets[0])
    }
  }, [rbDatasets, rbPreviewDataset])

  /* ---------------- Data Element cascade (v0.18.0) ---------------- */
  const rbElSubOptions = useMemo(() => rbDomains.filter((d) => d.parentId === (rbElDomain || null)), [rbDomains, rbElDomain])
  const rbElementOptions = useMemo(
    () => rbElements.filter((e) => rbElSub && e.subDomainId === rbElSub),
    [rbElements, rbElSub],
  )
  const rbSelectedElement = useMemo(() => rbElements.find((e) => e.id === rbElementId) ?? null, [rbElements, rbElementId])

  /* ------------------------------ derived -------------------------------- */

  // เงื่อนไขในคลัง — แยกของระบบ / ที่ผู้ใช้สร้าง (เฉพาะที่เปิดใช้งาน สำหรับสร้างกฎ)
  const systemConditions = useMemo(() => conditions.filter((c) => c.isSystem && c.enabled), [conditions])
  const customConditions = useMemo(() => conditions.filter((c) => !c.isSystem && c.enabled), [conditions])
  // rbTemplate — เงื่อนไขที่เลือก · ของระบบใช้นิยามพารามิเตอร์ล่าสุดจากคลังกลาง CONDITIONS เสมอ
  // (anti-drift — เช่นโหมดทะเบียน referenceSetId ของ IN_LIST/REFERENCE_MATCH v0.31.0 แสดงทันทีโดยไม่พึ่ง params ค้างใน DB)
  const rbTemplate = useMemo(() => {
    const t = conditions.find((c) => c.key === rbCondition) ?? null
    if (!t) return null
    if (t.isSystem && isConditionKey(t.key)) {
      return { ...t, params: CONDITIONS[t.key].params }
    }
    return t
  }, [conditions, rbCondition])

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
        const res = await fetch(`/api/dq/dataset-preview?datasetIds=${rbRefDatasetIds.join(',')}&rows=5`)
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
  }, [rbRefDatasetIds])

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
    const refSetName = rbParams.referenceSetId
      ? rbReferenceSets.find((s) => s.id === rbParams.referenceSetId)?.name
      : undefined
    return buildRuleSentence({
      datasetNames: rbDatasetNames.length > 0 ? rbDatasetNames : undefined,
      column: rbColumn || '[Column]',
      condition: rbCondition || 'NOT_NULL',
      conditionSentence: template?.sentence,
      engineType: template?.engineType,
      refDatasetName: rbRefDatasetName,
      refSetName,
      parameters: JSON.stringify(rbParams),
      severity: rbSeverity,
      filter: rbFilter || null,
    })
  }, [rbDatasetNames, rbColumn, rbCondition, rbTemplate, rbRefDatasetName, rbParams, rbReferenceSets, rbSeverity, rbFilter])

  // คอลัมน์ที่เลือกได้ — union จากข้อมูลตัวอย่างของทุกชุดข้อมูลที่เลือก
  const rbColumnOptions = useMemo(() => rbPreview?.columns ?? [], [rbPreview])
  const rbHasSampleData = useMemo(() => (rbPreview?.datasetsWithSampleCount ?? 0) > 0, [rbPreview])
  const rbSelectedPreview = useMemo(
    () => rbPreview?.previews.find((p) => p.datasetId === rbPreviewDataset) ?? null,
    [rbPreview, rbPreviewDataset],
  )

  /* -------- Rule Builder wizard — ความถูกต้องรายขั้น + การเดินหน้า/ย้อนกลับ (v0.18.1) --------
     ขั้น 1 ต้องเลือกชุดข้อมูล ≥ 1 · ขั้น 2 ต้องเลือกคอลัมน์ · ขั้น 3 ต้องเลือกเงื่อนไข
     ไปขั้นถัดไปได้เฉพาะเมื่อทุกขั้นก่อนหน้าถูกต้อง (deny-by-default ต่อขั้นตอน) */
  const rbStepValid = useMemo<boolean[]>(
    () => [rbDatasets.length > 0, rbColumn.trim() !== '', rbCondition !== '', true],
    [rbDatasets.length, rbColumn, rbCondition],
  )
  const rbCanGoTo = useCallback(
    (step: number) => step <= 1 || rbStepValid.slice(0, step - 1).every(Boolean),
    [rbStepValid],
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

  const pendingSignals = useMemo(() => signals.filter((s) => s.status === 'PENDING_REVIEW'), [signals])

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
        threshold: Number(rbThreshold) || 95,
        filter: rbFilter,
        exceptionAction: rbExceptionAction || undefined,
        exceptionActionNote: rbExceptionActionNote || undefined,
        dataElementId: rbElementId || undefined,
        operatorEmail: actorEmail,
      },
      'create-rule',
      rbDatasets.length > 1 ? `สร้างกฎใหม่เรียบร้อย (ใช้ร่วม ${rbDatasets.length} ชุดข้อมูล)` : 'สร้างกฎใหม่เรียบร้อย',
    )
    if (ok) {
      setRbColumn('')
      setRbFilter('')
      setRbParams({})
      setRbElementId('')
      setRbExceptionAction('')
      setRbExceptionActionNote('')
      setRbStep(1) // กลับไปเริ่ม wizard ใหม่รอบถัดไป
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
        operatorEmail: actorEmail,
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
      { action: 'TOGGLE_ENABLED', operatorEmail: actorEmail },
      `cond-toggle-${c.id}`,
      c.enabled ? 'ปิดใช้งานเงื่อนไขแล้ว' : 'เปิดใช้งานเงื่อนไขแล้ว',
    )
    if (ok) refetch()
  }

  async function handleDeleteCondition(c: ApiCondition) {
    const ok = await deleteJson(
      `/api/dq/conditions/${c.id}`,
      { operatorEmail: actorEmail },
      `cond-del-${c.id}`,
      'ลบเงื่อนไขส่วนกลางแล้ว',
    )
    if (ok) refetch()
  }

  async function handleToggleRule(id: string, enabled: boolean) {
    const ok = await patchJson(
      `/api/dq/rules/${id}`,
      { action: 'TOGGLE_ENABLED', operatorEmail: actorEmail },
      `toggle-${id}`,
      enabled ? 'ปิดใช้งานกฎแล้ว' : 'เปิดใช้งานกฎแล้ว',
    )
    if (ok) refetch()
  }

  async function handleDeleteRule(id: string) {
    const ok = await patchJson(`/api/dq/rules/${id}`, { action: 'DELETE', operatorEmail: actorEmail }, `del-${id}`, 'ลบกฎแล้ว')
    if (ok) refetch()
  }

  async function handleRun() {
    setRunResult(null)
    setBusy('run')
    try {
      const res = await fetch('/api/dq/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: runDataset, operatorEmail: actorEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'รันการตรวจสอบไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      setRunResult(data as RunResponse)
      toast({
        title: 'รันตรวจสอบสำเร็จ',
        description: `ตรวจ ${data.rulesCount} กฎ บน ${data.rowsCount} แถว — คำแนะนำใหม่ ${data.newSignals} รายการ`,
      })
      refetch()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  // B2 (v0.37.0) — โหลดสรุปหลังตรวจจาก ML Studio เมื่อรันเสร็จ (ผู้ช่วยเสนอแนะ — ล้มเหลวแล้วไม่กระทบผลตรวจ)
  useEffect(() => {
    if (!runResult?.batchId) {
      setMlSummary(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/ml/run-summary?batchId=${runResult.batchId}`)
        if (!res.ok) {
          if (alive) setMlSummary(null)
          return
        }
        const data = (await res.json()) as {
          summary?: { summaryText: string; modelVersion: number | null; advice: string[]; commonCauses: Array<{ signature: string; failedRows: number; hypothesis: string }> } | null
        }
        if (alive && data?.summary) {
          setMlSummary({
            summaryText: data.summary.summaryText,
            modelVersion: data.summary.modelVersion,
            advice: data.summary.advice ?? [],
            commonCauses: data.summary.commonCauses ?? [],
          })
          setMlSummaryOpen(true)
        } else if (alive) {
          setMlSummary(null)
        }
      } catch {
        /* สรุป ML ใช้ไม่ได้ — แสดงผลตรวจปกติ */
      }
    })()
    return () => {
      alive = false
    }
  }, [runResult?.batchId])

  // B1 (v0.37.0) — คำแนะนำเงื่อนไขจาก ML Studio เมื่อเลือกคอลัมน์ใน Rule Builder (ขั้นที่ 3)
  useEffect(() => {
    if (rbStep !== 3 || !rbColumn) {
      setRbRecs(null)
      return
    }
    const datasetId = rbPreviewDataset || rbDatasets[0] || ''
    if (!datasetId) {
      setRbRecs(null)
      return
    }
    let alive = true
    setRbRecsLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/ml/recommend-rules?datasetId=${datasetId}&column=${encodeURIComponent(rbColumn)}`)
        const data = (await res.json().catch(() => null)) as {
          dataType?: string
          modelVersion?: number | null
          recommendations?: Array<{ condition: string; th: string; dimensionTh: string; confidence: string; reason: string }>
        } | null
        if (alive && res.ok && data?.recommendations) {
          setRbRecs({ dataType: data.dataType ?? 'TEXT', modelVersion: data.modelVersion ?? null, recommendations: data.recommendations })
        } else if (alive) {
          setRbRecs(null)
        }
      } catch {
        if (alive) setRbRecs(null)
      } finally {
        if (alive) setRbRecsLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [rbStep, rbColumn, rbPreviewDataset, rbDatasets])

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
      value={mode === 'library' ? libraryTab : isCoreView(activeView) ? activeView : 'rules'}
      onValueChange={(v) => {
        if (mode === 'library') setLibraryTab(v as 'rules' | 'conditions')
        else onViewChange(v as ViewKey)
      }}
      className="w-full"
    >
      {/* แถบแนะนำลำดับการใช้งาน 3 ขั้น (โหมด library) — อธิบายภาพรวมก่อนเจอฟอร์ม เพื่อลดความสับสน */}
      {mode === 'library' && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="grid gap-2 p-3 sm:grid-cols-3 sm:gap-3">
            <div className={`flex items-start gap-2.5 rounded-lg p-2 ${libraryTab === 'conditions' ? 'bg-white shadow-sm' : ''}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white" aria-hidden="true">
                1
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-900">เตรียมเงื่อนไข (must) — ข้ามได้</p>
                <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80">
                  ระบบมีเงื่อนไขมาตรฐานให้ใช้ทันที หรือสร้างเพิ่มในแท็บ “คลังเงื่อนไข”
                </p>
                <Button variant="ghost" size="sm" className="mt-1 h-6 gap-1 px-2 text-[11px] text-emerald-800 hover:text-emerald-900" onClick={() => setLibraryTab('conditions')}>
                  ไปคลังเงื่อนไข
                  <ChevronRight className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className={`flex items-start gap-2.5 rounded-lg p-2 ${libraryTab === 'rules' ? 'bg-white shadow-sm' : ''}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white" aria-hidden="true">
                2
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-900">สร้างกฎ 4 ขั้นตอน</p>
                <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80">
                  เลือกเป้าหมาย → คอลัมน์ → เงื่อนไข → ตั้งค่า แล้วบันทึก (ระบบนำทางทีละขั้น)
                </p>
                <Button variant="ghost" size="sm" className="mt-1 h-6 gap-1 px-2 text-[11px] text-emerald-800 hover:text-emerald-900" onClick={() => setLibraryTab('rules')}>
                  เริ่มสร้างกฎ
                  <ChevronRight className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg p-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white" aria-hidden="true">
                3
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-900">รันตรวจและดูผล</p>
                <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80">
                  รันตามชุดข้อมูลหรือตามโดเมน (Data Element) พร้อมคะแนน rollup — อยู่หน้า “ผลการตรวจสอบ”
                </p>
                <Button variant="ghost" size="sm" className="mt-1 h-6 gap-1 px-2 text-[11px] text-emerald-800 hover:text-emerald-900" onClick={() => onViewChange('validation-results')}>
                  ไปผลการตรวจสอบ
                  <ChevronRight className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* แท็บภายในหน้าคลังกฎ (โหมด library เท่านั้น) */}
      {mode === 'library' && (
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 sm:w-fit">
          <TabsTrigger value="rules" className="gap-1.5 data-[state=active]:bg-white">
            <GitBranch className="size-3.5" aria-hidden="true" />
            กฎตรวจสอบทั้งหมด
          </TabsTrigger>
          <TabsTrigger value="conditions" className="gap-1.5 data-[state=active]:bg-white">
            <Library className="size-3.5" aria-hidden="true" />
            คลังเงื่อนไข (must)
          </TabsTrigger>
        </TabsList>
      )}

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
                สร้างทีละขั้นตอน 4 ขั้น — ขั้นก่อนหน้าครบก่อนจึงไปขั้นถัดไปได้ · กฎ 1 ข้อ ใช้ร่วมหลายชุดข้อมูลได้
              </CardDescription>
              {/* stepper — นำทาง 4 ขั้นของการสร้างกฎ (คลิกย้อนได้ ไปหน้าได้เมื่อขั้นก่อนครบ) */}
              <ol className="grid grid-cols-4 gap-1 pt-2" aria-label="ขั้นตอนการสร้างกฎ 4 ขั้น">
                {RB_STEPS.map((s, i) => {
                  const n = i + 1
                  const active = rbStep === n
                  const done = !active && n < rbStep && rbStepValid[i]
                  const reachable = rbCanGoTo(n)
                  return (
                    <li key={s.title} aria-current={active ? 'step' : undefined}>
                      <button
                        type="button"
                        onClick={() => reachable && setRbStep(n)}
                        disabled={!reachable}
                        aria-label={`ขั้นที่ ${n} ${s.title} — ${s.desc}${active ? ' (ขั้นปัจจุบัน)' : ''}`}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${
                          active
                            ? 'border-emerald-300 bg-emerald-50'
                            : reachable
                              ? 'border-border bg-white hover:bg-slate-50'
                              : 'border-dashed bg-slate-50/60 opacity-70'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              active
                                ? 'bg-emerald-600 text-white'
                                : done
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-500'
                            }`}
                            aria-hidden="true"
                          >
                            {done ? <Check className="size-3" /> : n}
                          </span>
                          <span className={`truncate text-[11px] font-semibold ${active ? 'text-emerald-900' : 'text-slate-700'}`}>
                            {s.title}
                          </span>
                        </span>
                        <span className="mt-0.5 hidden truncate text-[10px] text-muted-foreground sm:block">{s.desc}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ขั้นที่ 1 — เป้าหมาย: ชุดข้อมูล + Data Element */}
              {rbStep === 1 && (
              <div className="space-y-4">
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

              {/* 1b) Data Element (What) — v0.18.0: ผูกกฎกับองค์ประกอบข้อมูล */}
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex items-center gap-2">
                  <Box className="size-4 text-emerald-700" aria-hidden="true" />
                  <p className="text-xs font-medium text-emerald-900">
                    Data Element (What) — เลือกได้ตามโครงสร้าง Domain → Sub Domain → Element
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ไม่บังคับ — แต่กฎที่ผูก element จะรันได้ในโหมด “รันตรวจระดับโดเมน” และมีคะแนน rollup ระดับ element (จัดการ element ได้ในหน้า Data Domain)
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select
                    value={rbElDomain}
                    onValueChange={(v) => {
                      setRbElDomain(v)
                      setRbElSub('')
                      setRbElementId('')
                    }}
                  >
                    <SelectTrigger aria-label="เลือกโดเมนหลักของ element" className="h-8 text-xs">
                      <SelectValue placeholder="โดเมนหลัก" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {rbDomains.filter((d) => !d.parentId).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={rbElSub}
                    onValueChange={(v) => {
                      setRbElSub(v)
                      setRbElementId('')
                    }}
                    disabled={!rbElDomain}
                  >
                    <SelectTrigger aria-label="เลือกโดเมนย่อยของ element" className="h-8 text-xs">
                      <SelectValue placeholder={rbElDomain ? 'โดเมนย่อย' : 'เลือกโดเมนหลักก่อน'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {rbElSubOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={rbElementId} onValueChange={setRbElementId} disabled={!rbElSub}>
                    <SelectTrigger aria-label="เลือก Data Element" className="h-8 text-xs">
                      <SelectValue placeholder={rbElSub ? 'Data Element' : 'เลือกโดเมนย่อยก่อน'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {rbElementOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">ยังไม่มี element ในโดเมนย่อยนี้</div>
                      )}
                      {rbElementOptions.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nameTh}
                          {e.isCde ? ' · CDE' : ''}
                          {e.isFinancial ? ' · การเงิน' : ''}
                          {e.pii ? ' · PII' : ''}
                          {e.status === 'DRAFT' ? ' (ร่าง)' : e.status === 'DEPRECATED' ? ' (เลิกใช้)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {rbSelectedElement && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-[11px]">
                    <span className="font-mono text-muted-foreground">{rbSelectedElement.code}</span>
                    <span className="font-medium">{rbSelectedElement.nameTh}</span>
                    {rbSelectedElement.isCde && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9.5px] font-medium text-amber-800">
                        <Star className="mr-0.5 size-2.5" aria-hidden="true" /> CDE
                      </Badge>
                    )}
                    {rbSelectedElement.isFinancial && (
                      <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[9.5px] font-medium text-teal-800">
                        <Banknote className="mr-0.5 size-2.5" aria-hidden="true" /> การเงิน
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[9.5px]">
                      {ELEMENT_DATA_TYPE_LABELS[rbSelectedElement.dataType as ElementDataType]?.th ?? rbSelectedElement.dataType}
                    </Badge>
                    {rbSelectedElement.formatPattern && <span className="text-muted-foreground">รูปแบบ: {rbSelectedElement.formatPattern}</span>}
                    {rbSelectedElement.valueDomain && <span className="text-muted-foreground">ค่าอนุญาต: {rbSelectedElement.valueDomain}</span>}
                    {rbSelectedElement.mappingCount > 0 ? (
                      <span className="text-emerald-700">แมปคอลัมน์จริง {rbSelectedElement.mappingCount} รายการ</span>
                    ) : (
                      <span className="text-amber-700">ยังไม่แมปคอลัมน์จริง (แมปได้ในหน้า Data Domain)</span>
                    )}
                    {rbSelectedElement.status === 'DRAFT' && <span className="text-amber-700">element สถานะร่าง — เปิดใช้งานที่หน้า Data Domain ก่อนรันโดเมนได้</span>}
                    {rbSelectedElement.status === 'DEPRECATED' && <span className="text-muted-foreground">element เลิกใช้ — จะไม่ถูกรันในรอบโดเมน</span>}
                  </div>
                )}
              </div>
              </div>
              )}

              {/* ขั้นที่ 2 — คอลัมน์จากตัวอย่างข้อมูลจริง */}
              {rbStep === 2 && (
              <div className="space-y-4">
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
              </div>
              )}

              {/* ขั้นที่ 3 — เงื่อนไข (must) + พารามิเตอร์ */}
              {rbStep === 3 && (
              <div className="space-y-4">
              {/* 3) เงื่อนไขจากคลังส่วนกลาง */}
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
                  <p className="text-[11px] text-muted-foreground">
                    ต้องการเงื่อนไขเฉพาะขององค์กร? สร้างได้ในแท็บ “คลังเงื่อนไข (must)” แล้วกลับมาเลือกที่นี่
                  </p>
              </div>

              {/* B1 (v0.37.0) — ML Studio แนะนำเงื่อนไขตามชนิดข้อมูล + 9 มิติ + สิ่งที่โมเดลเรียนรู้ (กดเลือกได้ทันที) */}
              {rbColumn && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                    <BrainCircuit className="size-3.5" aria-hidden="true" />
                    ML Studio แนะนำสำหรับคอลัมน์ “{rbColumn}”
                    {rbRecsLoading && <span className="font-normal text-teal-700"> — กำลังวิเคราะห์…</span>}
                    {rbRecs && !rbRecsLoading && (
                      <span className="font-normal text-teal-700">
                        (ชนิดข้อมูล {rbRecs.dataType}
                        {rbRecs.modelVersion ? ` · อ้างอิงโมเดล v${rbRecs.modelVersion}` : ' · ยังไม่มีโมเดลเทรน — แนะนำจากหลักชนิดข้อมูล'})
                      </span>
                    )}
                  </p>
                  {rbRecs && rbRecs.recommendations.length > 0 && (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {rbRecs.recommendations.map((r, i) =>
                        r.condition === '—' ? (
                          <p key={i} className="text-[11px] text-teal-800 [overflow-wrap:anywhere]">
                            {r.th}
                          </p>
                        ) : (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setRbCondition(r.condition)
                              setRbParams({})
                            }}
                            className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                              rbCondition === r.condition
                                ? 'border-teal-500 bg-white ring-1 ring-teal-400'
                                : 'border-teal-200 bg-white hover:border-teal-400'
                            }`}
                            title={r.reason}
                          >
                            <span className="font-semibold text-slate-900">{r.th}</span>{' '}
                            <span className={r.confidence === 'HIGH' ? 'text-emerald-700' : 'text-slate-500'}>
                              {r.confidence === 'HIGH' ? '· แนะนำแรง' : r.confidence === 'MEDIUM' ? '· แนะนำ' : '· พิจารณาเพิ่ม'}
                            </span>
                            <span className="block text-[10.5px] text-muted-foreground [overflow-wrap:anywhere]">{r.reason}</span>
                          </button>
                        ),
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                    ML เป็นผู้ช่วยเสนอแนะ — การตัดสินใจเลือกเงื่อนไขเป็นของผู้กำหนดกฎเสมอ
                  </p>
                </div>
              )}

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
                    // ชนิดพิเศษ (v0.31.0): เลือกทะเบียนข้อมูลอ้างอิง — โหมดทะเบียนของ IN_LIST/REFERENCE_MATCH
                    // เลือกทะเบียน → ล้างค่าที่พิมพ์ไว้ (values) เพื่อไม่สับสนว่าเอนจินใช้อะไรจริง
                    if (p.type === 'reference-set') {
                      const chosen = rbParams[p.key] ?? ''
                      return (
                        <div key={p.key} className="space-y-1.5">
                          <Label htmlFor={`rb-param-${p.key}`} className="text-xs">
                            {p.label}
                          </Label>
                          <Select
                            value={chosen ? chosen : 'RB_NO_SET'}
                            onValueChange={(v) =>
                              setRbParams((prev) => {
                                const next = { ...prev }
                                if (v === 'RB_NO_SET') {
                                  delete next[p.key]
                                } else {
                                  next[p.key] = v
                                  // ล้างค่าที่พิมพ์ไว้ — โหมดทะเบียนใช้ทะเบียนเท่านั้น
                                  for (const q of rbTemplate.params) {
                                    if (q.key === 'values') delete next[q.key]
                                  }
                                }
                                return next
                              })
                            }
                          >
                            <SelectTrigger id={`rb-param-${p.key}`}>
                              <SelectValue placeholder="— พิมพ์ค่าเอง (ไม่ใช้ทะเบียน) —" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="RB_NO_SET">— พิมพ์ค่าเอง (ไม่ใช้ทะเบียน) —</SelectItem>
                              {rbReferenceSets.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name} ({s.code} · {s.activeValueCount} ค่า)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {chosen && (
                            <p className="text-[11px] text-emerald-800">
                              โหมดทะเบียน: เอนจินจะใช้ค่า ACTIVE ล่าสุดจากทะเบียนตอนรัน — เพิ่ม/ลดค่าที่หน้า "ข้อมูลอ้างอิง" กฎไม่ต้องแก้
                            </p>
                          )}
                        </div>
                      )
                    }
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
                    // พารามิเตอร์ "values" ของเอนจินโหมดทะเบียน — เมื่อเลือกใช้ทะเบียนแล้วซ่อนช่องพิมพ์ (กันสับสน)
                    if (p.key === 'values' && rbParams.referenceSetId) {
                      return (
                        <div key={p.key} className="space-y-1.5">
                          <Label htmlFor={`rb-param-${p.key}`} className="text-xs">
                            {p.label}
                          </Label>
                          <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                            ใช้ค่าจากทะเบียนข้อมูลอ้างอิงอยู่ — จัดการค่าที่หน้า "ข้อมูลอ้างอิง" (Data Asset)
                          </p>
                        </div>
                      )
                    }
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
              </div>
              )}

              {/* ขั้นที่ 4 — ตั้งค่าและบันทึก */}
              {rbStep === 4 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-threshold">
                      ค่าผ่านขั้นต่ำ (%) <span className="text-[10px] font-normal text-muted-foreground">— แดชบอร์ดผู้บริหารจะเตือนเมื่อผ่านล่าสุดต่ำกว่าค่านี้</span>
                    </Label>
                    <Input
                      id="rb-threshold"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={rbThreshold}
                      onChange={(e) => setRbThreshold(e.target.value)}
                      aria-label="ค่าผ่านขั้นต่ำเป็นเปอร์เซ็นต์"
                    />
                  </div>
                </div>
                {/* v0.22.0 — Exception Action เมื่อกฎ fail (สรุปแสดงในหน้ารายละเอียด Data Mapping) */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-exception-action">
                      การดำเนินการเมื่อกฎไม่ผ่าน <span className="text-[10px] font-normal text-muted-foreground">— สรุปแสดงในรายละเอียด Mapping</span>
                    </Label>
                    <Select value={rbExceptionAction} onValueChange={setRbExceptionAction}>
                      <SelectTrigger id="rb-exception-action">
                        <SelectValue placeholder="ไม่ระบุ" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXCEPTION_ACTION_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {EXCEPTION_ACTIONS[k].th}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-exception-note">
                      รายละเอียดการดำเนินการ <span className="text-[10px] font-normal text-muted-foreground">— ไม่บังคับ เช่น Reject record and create DQ incident</span>
                    </Label>
                    <Input
                      id="rb-exception-note"
                      value={rbExceptionActionNote}
                      onChange={(e) => setRbExceptionActionNote(e.target.value)}
                      placeholder={rbExceptionAction === 'OTHER' ? 'จำเป็นเมื่อเลือก "อื่น ๆ"' : 'เช่น Reject record and create DQ incident'}
                      aria-label="รายละเอียดการดำเนินการเมื่อกฎไม่ผ่าน"
                    />
                  </div>
                </div>
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
                <ActorChip id="rb-operator" permission={PERMISSIONS_BY_ACTION.MANAGE_RULES} />
              </div>
              </div>
              )}

              {/* live sentence preview */}
              <div className="rounded-lg bg-slate-900 p-3.5 font-mono text-[12.5px] leading-relaxed break-words text-emerald-300" aria-live="polite">
                {previewSentence}
              </div>

              {/* สรุปสิ่งที่เลือกไว้ — คลิกกลับไปแก้ขั้นนั้นได้ */}
              {rbStep >= 2 && (
                <div
                  className="flex flex-wrap items-center gap-1.5 rounded-md border bg-slate-50/60 px-2.5 py-1.5"
                  role="status"
                  aria-label="สรุปสิ่งที่เลือกไว้ในขั้นตอนก่อนหน้า"
                >
                  <span className="text-[11px] font-medium text-slate-600">เลือกไว้:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setRbStep(1)}
                    title="คลิกเพื่อกลับไปแก้ขั้นที่ 1"
                  >
                    ชุดข้อมูล {rbDatasets.length} ชุด
                  </Button>
                  {rbSelectedElement && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={() => setRbStep(1)}
                      title={`Data Element: ${rbSelectedElement.nameTh}`}
                    >
                      <Box className="size-3" aria-hidden="true" />
                      {rbSelectedElement.code}
                    </Button>
                  )}
                  {rbStep >= 3 && rbColumn && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 font-mono text-[11px]"
                      onClick={() => setRbStep(2)}
                      title="คลิกเพื่อกลับไปแก้ขั้นที่ 2"
                    >
                      คอลัมน์: {rbColumn}
                    </Button>
                  )}
                  {rbStep >= 4 && rbCondition && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setRbStep(3)}
                      title="คลิกเพื่อกลับไปแก้ขั้นที่ 3"
                    >
                      เงื่อนไข: {rbTemplate?.name ?? rbCondition}
                    </Button>
                  )}
                </div>
              )}

              {/* นำทางขั้นตอน — ย้อนกลับ / ถัดไป / บันทึก (เฉพาะขั้นสุดท้าย) */}
              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRbStep((s) => Math.max(1, s - 1))}
                  disabled={rbStep === 1 || busy !== null}
                  className="gap-1.5"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  ย้อนกลับ
                </Button>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    ขั้นที่ {rbStep}/4
                  </span>
                  {rbStep < 4 ? (
                    <Button
                      type="button"
                      className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => setRbStep((s) => Math.min(4, s + 1))}
                      disabled={!rbStepValid[rbStep - 1] || busy !== null}
                    >
                      ถัดไป
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={handleCreateRule}
                      disabled={rbDatasets.length === 0 || !rbColumn || !rbCondition || busy !== null}
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      {busy === 'create-rule' ? 'กำลังบันทึก…' : `บันทึกกฎใหม่${rbDatasets.length > 1 ? ` (ใช้ร่วม ${rbDatasets.length} ชุดข้อมูล)` : ''}`}
                    </Button>
                  )}
                </div>
              </div>
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
                      {rule.dataElement && (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-800"
                          title={`Data Element: ${rule.dataElement.path}`}
                        >
                          <Box className="mr-0.5 size-3" aria-hidden="true" />
                          {rule.dataElement.nameTh}
                        </Badge>
                      )}
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
                            rule.lastRun.status === 'NO_DATA'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : rule.lastRun.passRate * 100 < rule.threshold
                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                : rule.lastRun.status === 'PASSED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {rule.lastRun.status === 'NO_DATA'
                            ? 'ผลรันล่าสุด: ไม่มีข้อมูล (0 แถว)'
                            : `ผลรันล่าสุด ${Math.round(rule.lastRun.passRate * 100)}%`}
                          {rule.lastRun.status !== 'NO_DATA' && rule.lastRun.passRate * 100 < rule.threshold && ` · ต่ำกว่าเกณฑ์ ${rule.threshold}%`}
                        </Badge>
                      )}
                      {!rule.lastRun && (
                        <Badge variant="outline" className="border text-[11px] bg-slate-50 text-slate-500">
                          เกณฑ์ผ่าน {rule.threshold}%
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
              <p className="text-xs font-semibold text-emerald-800">ขั้นที่ 1 — ตั้งชื่อและประโยค “must …”</p>
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
                  <Label htmlFor="cn-dimension">ขั้นที่ 2 — มิติคุณภาพข้อมูล: 9 มิติตาม DAMA-DMBOK</Label>
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
                  <Label>ขั้นที่ 3 — เอนจินประเมินผล (จัดกลุ่มตามมิติ — ครบทั้ง 9 มิติ)</Label>
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
                  <p className="text-xs font-medium text-slate-700">ขั้นที่ 4 — พารามิเตอร์ที่ผู้ใช้กรอกตอนสร้างกฎ (using)</p>
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
                <ActorChip id="cn-operator" permission={PERMISSIONS_BY_ACTION.MANAGE_RULES} />
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
        <Tabs defaultValue="dataset-mode">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 sm:w-fit">
            <TabsTrigger value="dataset-mode" className="gap-1.5 data-[state=active]:bg-white">
              <Play className="size-3.5" aria-hidden="true" />
              รันตามชุดข้อมูล
            </TabsTrigger>
            <TabsTrigger value="domain-mode" className="gap-1.5 data-[state=active]:bg-white">
              <Box className="size-3.5" aria-hidden="true" />
              รันตามโดเมน (Data Element)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dataset-mode" className="mt-4">
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
                <ActorChip id="run-operator" permission={PERMISSIONS_BY_ACTION.RUN_VALIDATION} />
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
                  {runResult.skipped ? ` · ข้าม ${runResult.skipped} กฎ (เงื่อนไขไม่พบในคลัง)` : ''} · คำแนะนำใหม่ {runResult.newSignals} รายการ
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

                {/* B2 (v0.37.0) — สรุปหลังตรวจ + ขั้นตอนถัดไปจาก ML Studio (ผู้ช่วยเสนอแนะ) */}
                {mlSummary && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                      onClick={() => setMlSummaryOpen((o) => !o)}
                      aria-expanded={mlSummaryOpen}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                        <BrainCircuit className="size-3.5" aria-hidden="true" />
                        ผู้ช่วย ML สรุปหลังตรวจ
                        {mlSummary.modelVersion ? ` (โมเดล v${mlSummary.modelVersion})` : ' (ยังไม่มีโมเดลเทรน)'}
                      </span>
                      <span className="text-[10.5px] text-teal-700">{mlSummaryOpen ? 'ซ่อน' : 'แสดง'}</span>
                    </button>
                    {mlSummaryOpen && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-teal-900 [overflow-wrap:anywhere]">{mlSummary.summaryText}</p>
                        {mlSummary.commonCauses.length > 0 && (
                          <ul className="list-inside list-disc space-y-0.5 text-[11.5px] text-slate-700">
                            {mlSummary.commonCauses.slice(0, 3).map((c) => (
                              <li key={c.signature} className="[overflow-wrap:anywhere]">
                                <span className="font-medium">{c.signature}</span> — {c.hypothesis}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-800">ขั้นตอนถัดไปที่แนะนำ</p>
                          <ul className="mt-0.5 list-inside list-disc space-y-0.5 text-[11.5px] text-amber-900">
                            {mlSummary.advice.map((a, i) => (
                              <li key={i} className="[overflow-wrap:anywhere]">
                                {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                        ) : r.status === 'NO_DATA' ? (
                          <CircleMinus className="size-4 text-amber-600" aria-label="ไม่มีข้อมูลให้ตรวจ" />
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
                        <span
                          className={`text-xs font-semibold ${
                            r.status === 'PASSED'
                              ? 'text-emerald-700'
                              : r.status === 'NO_DATA'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {r.status === 'PASSED'
                            ? 'ผ่าน'
                            : r.status === 'NO_DATA'
                              ? 'ไม่มีข้อมูลให้ตรวจ (0 แถว)'
                              : `ล้มเหลว ${r.failedRows}/${r.totalRows} แถว (${Math.round(r.passRate * 100)}%)`}
                        </span>
                      </div>
                      <p className="font-mono text-[12px] text-slate-700">{r.sentence}</p>
                      {/* คำตัดสินตามมาตรา — อ่านง่าย รู้ทันทีว่าผ่าน/ไม่ผ่านมาตราใด เพราะอะไร */}
                      <p
                        className={`mt-1.5 text-[12.5px] leading-relaxed ${
                          r.status === 'PASSED' ? 'text-emerald-800' : r.status === 'NO_DATA' ? 'text-amber-800' : 'text-rose-800'
                        }`}
                        role="note"
                      >
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

          {/* รอบการตรวจ (batch) — ประวัติย้อนหลัง + drill-down รายรอบ */}
          <BatchHistory reloadKey={reloadTick} datasets={datasets} onGoFailedRecords={() => onViewChange('failed-records')} />

          {/* คำแนะนำจาก ML (v0.36.1 — อ่านอย่างเดียว · การสอนโมเดล label/สุ่มตรวจ ทำที่ ML Studio จุดเดียว) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BrainCircuit className="size-4 text-emerald-700" aria-hidden="true" />
                    คำแนะนำจาก ML ({pendingSignals.length})
                  </CardTitle>
                  <CardDescription>
                    ผลการตรวจจับจากโมเดล ML และกฎตรวจสอบ — อ่านเพื่อพิจารณา ระบบไม่แก้ไขข้อมูลต้นทางอัตโนมัติ
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onViewChange('ml-studio')}>
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  สอนโมเดลที่ ML Studio
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <p>
                  <strong>ข้อควรทราบ:</strong> คำแนะนำจาก ML เป็นเพียงข้อแนะนำเบื้องต้น — ระบบจะไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
                  การสอนโมเดลให้แม่นขึ้น (label / สุ่มตรวจ) ทำที่ ML Studio
                </p>
              </div>

              <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                {pendingSignals.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีคำแนะนำ — ลองรันการตรวจสอบด้านบน</p>
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
                        {s.kind === 'ML_ANOMALY' ? 'คำแนะนำ ML' : 'กฎล้มเหลว'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{s.datasetName} · {fmtTime(s.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
          </TabsContent>
          <TabsContent value="domain-mode" className="mt-4">
            <DomainRunPanel runOperator={actorEmail} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* ===================== TAB 4: DASHBOARD — 5 ส่วน (ภาพรวม / รายละเอียดการตรวจ / Regulation / Risk / Data Classification) ===================== */}
      <TabsContent value="dashboard" className="mt-4">
        <DqDashboard datasets={datasets} reloadTick={reloadTick} onRefetch={refetch} onGoMlCenter={() => onViewChange('ml-studio')} onGoCompliance={() => onViewChange('compliance-assessment')} />
      </TabsContent>
    </Tabs>
  )
}
