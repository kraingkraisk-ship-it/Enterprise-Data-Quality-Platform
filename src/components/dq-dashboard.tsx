'use client'

/**
 * DQ Dashboard — แดชบอร์ดคุณภาพข้อมูล 5 ส่วน (v0.10.0)
 * 1) ภาพรวมทั้งหมดของ Data Quality (คะแนนรวม + มาตรา 1–9 + ต่อชุดข้อมูล + PII masking)
 * 2) รายละเอียดการตรวจ Data Quality (ผลรันล่าสุดรายกฎ + คำตัดสินตามมาตรา + คำแนะนำ)
 * 3) Regulation — กรอบมาตรฐาน 5 กรอบ (DAMA-DMBOK / ISO/IEC 25012 / ISO 8000 / ISO/IEC 25024 / ISO/IEC 11179)
 *    เลือกแตกย่อยได้ และเลือก data source เพื่อประเมินสถานะจากข้อมูลจริงในระบบ
 * 4) Risk — ความเสี่ยงในมุม Data Quality Impact (โอกาส × ผลกระทบ + แผนที่ความเสี่ยง + ผลกระทบธุรกิจ)
 * 5) Data Classification — การจำแนกข้อมูล 11 ประเภท และ mapping กับมาตรฐาน (ธปท./BCBS 239/PDPA/PCI DSS/ฯลฯ)
 * ข้อมูลทั้งหมดมาจาก /api/dq/analytics — คำนวณจากผลรันตรวจล่าสุดของทุกกฎที่เปิดใช้งาน
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ClipboardList,
  EyeOff,
  LayoutDashboard,
  ListChecks,
  Minus,
  Network,
  RefreshCw,
  Scale,
  ShieldCheck,
  Tags,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { DIMENSION_ICONS, DimensionBadge } from '@/components/dimension-picker'
import { ROLE_LIST, type RoleKey } from '@/lib/rbac'
import { SEVERITY_KEYS, SEVERITY_LABELS, rolesWithPermission, type DimensionKey, type SeverityKey } from '@/lib/dq'
import { RISK_SCORE_MAX, SAMPLING_FOOTNOTE_TH, SAMPLING_METHOD, SAMPLING_POLICIES } from '@/lib/sampling'
import type { SamplePlanView } from '@/lib/sampling-engine'
import { mlFootnoteTh, zBandsOf } from '@/lib/ml'
import { forecastFootnoteTh } from '@/lib/forecast'
import { DEFAULT_ML_SETTINGS, type MlSettings } from '@/lib/ml-settings'
import type { ForecastEvaluation, ForecastHorizons, ForecastView } from '@/lib/forecast-engine'
import type { AnomalyView, ClusterView, MlEvaluation } from '@/lib/ml-engine'
import {
  classificationLabel,
  DATA_CLASSIFICATIONS,
  FRAMEWORKS,
  LIKELIHOOD_BANDS,
  RISK_BANDS,
  riskBandOf,
  SEVERITY_WEIGHT,
  UNCLASSIFIED,
} from '@/lib/regulation'

/* ------------------------------- types ----------------------------------- */

export interface DashboardDataset {
  id: string
  name: string
  sourceType: string
  piiEnabled: boolean
  classification: string
}

interface DashUser {
  email: string
  name: string
  role: string
  status?: string
}

interface DimScore {
  dimension: string
  th: string
  en: string
  clauseNo: number
  score: number | null
  grade: { band: string; label: string; badgeClass: string; textClass: string } | null
  rulesCount: number
  failedRules: number
}

interface GradeView {
  band: string
  label: string
  badgeClass: string
  textClass: string
}

interface RunRow {
  runId: string
  at: string
  datasetId: string
  datasetName: string
  column: string
  conditionName: string
  severity: string
  dimension: string
  clauseNo: number
  status: 'PASSED' | 'FAILED'
  totalRows: number
  failedRows: number
  passRate: number
  verdict: string
  advice: string | null
  riskScore: number
  riskBand: string
  likelihood: { level: number; label: string }
}

interface RiskItem {
  ruleId?: string
  datasetId: string
  datasetName: string
  classification: string | null
  column: string
  conditionName: string
  dimension: string
  clauseNo: number
  severity: string
  failRate: number
  failedRows: number
  totalRows: number
  riskScore: number
  likelihood: { level: number; label: string }
  level: { band: string; label: string; className: string }
  impacts: string[]
  advice: string | null
  at: string
}

/* --- ส่วนที่ 3 Regulation — โครงข้อมูลรายมาตรฐาน (จาก /api/dq/analytics key "regulation") --- */

interface RegulationGradeView {
  band: string
  label: string
  badgeClass: string
  textClass: string
}

/** คะแนนของส่วนย่อย เมื่อเลือกดูเฉพาะชุดข้อมูลใดชุดข้อมูลหนึ่ง */
interface RegulationDomainPerDataset {
  datasetId: string
  score: number | null
  rulesCount: number
}

/** ส่วนย่อย (ข้อกำหนด) ของกรอบมาตรฐาน — dimensions ว่าง = เกณฑ์ระดับกระบวนการ (ไม่เข้าการคำนวณคะแนน) */
interface RegulationDomainView {
  id: string
  th: string
  en: string
  detail: string
  category: string | null
  /** น้ำหนักของส่วนย่อยในการคำนวณคะแนนรวมของกรอบ (เช่น 1 หรือ 1.5) */
  weight: number
  dimensions: string[]
  /** คะแนนเฉลี่ยถ่วงน้ำหนักจากทุกชุดข้อมูล (ผลประเมินล่าสุด) — null = ยังไม่ได้รันตรวจ */
  score: number | null
  rulesCount: number
  perDataset: RegulationDomainPerDataset[]
}

/** แถวชุดข้อมูลใน "มุมมองชุดข้อมูล" ของแต่ละกรอบมาตรฐาน */
interface RegulationDatasetRow {
  datasetId: string
  name: string
  rulesCount: number
  /** คะแนนประเมินล่าสุด — null = ยังไม่ได้รันตรวจ */
  score: number | null
  lastRunAt: string | null
  grade: RegulationGradeView | null
}

interface RegulationFrameworkView {
  id: string
  no: string
  groupTh: string
  name: string
  fullName: string
  description: string
  totalDomains: number
  /** จำนวนส่วนย่อยที่มีเกณฑ์ตรวจ (dimensions.length > 0) และวัดคะแนนได้จริง */
  measuredDomains: number
  /** คะแนนรวมถ่วงน้ำหนักของกรอบ (ผลประเมินล่าสุด) — null = ยังวัดไม่ได้ */
  weightedScore: number | null
  domains: RegulationDomainView[]
  datasets: RegulationDatasetRow[]
}

/* --- ส่วนที่ 4 Risk — ความเสี่ยง Inherent vs Residual (key "risks.inherent") --- */

/** แถวความเสี่ยงรายขอบเขต (มิติ DQ / กรอบมาตรฐาน / ประเภทข้อมูล) */
interface RiskInherentScopeRow {
  key: string
  label: string
  sub: string
  rulesCount: number
  inherentAvg: number
  residualAvg: number
  reductionPct: number
}

interface RiskInherentSummary {
  /** จำนวนกฎ-ชุดข้อมูลที่มีผลตรวจล่าสุด (วัด Residual ได้) */
  measuredRules: number
  /** กฎที่เปิดใช้งานแต่ยังไม่เคยรันตรวจ */
  unmeasuredRules: number
  /** ค่าเฉลี่ยความเสี่ยงโดยธรรมชาติ = โอกาสระดับ 5 × ความรุนแรง (เต็ม 25) */
  inherentAvg: number
  /** ค่าเฉลี่ยความเสี่ยงคงเหลือจากอัตราการล้มเหลวจริง (เต็ม 25) */
  residualAvg: number
  /** % ความเสี่ยงที่ลดลงได้ = (inherent − residual) / inherent × 100 */
  reductionPct: number
  byDimension: Array<{ dimension: string; th: string; en: string; inherentAvg: number; residualAvg: number; reductionPct: number; rulesCount: number }>
  byFramework: Array<{ frameworkId: string; name: string; no: string; inherentAvg: number; residualAvg: number; reductionPct: number; rulesCount: number }>
  byClassification: Array<{ id: string; th: string; en: string; no: string; inherentAvg: number; residualAvg: number; reductionPct: number; rulesCount: number }>
}

interface AnalyticsData {
  overall: {
    score: number | null
    grade: GradeView | null
    totals: {
      datasetsTotal: number
      datasetsWithRun: number
      rulesEnabled: number
      conditionsEnabled: number
      totalRuns: number
      pendingSignals: number
      pendingExceptions: number
      failedRulesLatest: number
      measuredRulesLatest: number
    }
    dimensions: DimScore[]
  }
  perDataset: Array<{
    id: string
    name: string
    sourceType: string
    piiEnabled: boolean
    classification: string
    ruleCount: number
    lastRunAt: string | null
    score: number | null
    grade: GradeView | null
    pendingSignals: number
    dimensionScores: DimScore[]
  }>
  latestRuns: RunRow[]
  /** ส่วนที่ 3 — โครงข้อมูลรายมาตรฐาน (optional: รอ backend เปิดใช้ key นี้) */
  regulation?: {
    frameworks: RegulationFrameworkView[]
  }
  risks: {
    items: RiskItem[]
    counts: Record<string, number>
    byDimension: Array<{ dimension: string; th: string; en: string; count: number; maxRiskScore: number }>
    /** ส่วนที่ 4 — Inherent vs Residual (optional: รอ backend เปิดใช้ key นี้) */
    inherent?: RiskInherentSummary
  }
  classification: {
    categories: Array<{
      id: string
      no: string
      th: string
      en: string
      description: string
      focusDimensions: string[]
      impacts: string[]
      datasetCount: number
      avgScore: number | null
      focusScore: number | null
      focusRulesCount: number
      datasets: Array<{ id: string; name: string; score: number | null; lastRunAt: string | null; pendingSignals: number }>
      standards: Array<{ name: string; dimensions: string[]; rulesCount: number; score: number | null; status: string; label: string; className: string }>
    }>
    unclassified: Array<{ id: string; name: string; sourceType: string; score: number | null }>
  }
}

/* ------------------------------ helpers ---------------------------------- */

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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

/** จัดรูปแบบน้ำหนักส่วนย่อย — จำนวนเต็มแสดงเลย เศษแสดง 1 ตำแหน่ง (×1, ×1.5) */
function fmtWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1)
}

function scoreBarClass(score: number | null): string {
  if (score === null) return 'bg-slate-300'
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 75) return 'bg-amber-500'
  return 'bg-rose-500'
}

/** แถบคะแนนเล็ก ๆ ใช้ซ้ำหลายส่วน */
function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  return (
    <div className={`h-2 min-w-10 flex-1 overflow-hidden rounded-full bg-slate-200 ${className ?? ''}`}>
      <div className={`h-full rounded-full ${scoreBarClass(score)}`} style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = {
  PASSED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-800 border-rose-200',
}

const STATUS_LABEL: Record<string, string> = { PASSED: 'ผ่าน', FAILED: 'ไม่ผ่าน' }

/** บทบาทที่มีสิทธิ์ MANAGE_DATASETS — ใช้กรอกผู้ดำเนินการจำแนกประเภทข้อมูล */
const MANAGE_DATASETS_ROLES: RoleKey[] = ['DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER', 'SYS_ADMIN']

/* ------------------------- classification editor -------------------------- */

function ClassificationEditor({
  datasetId,
  current,
  busy,
  onSave,
}: {
  datasetId: string
  current: string
  busy: boolean
  onSave: (datasetId: string, value: string) => void
}) {
  // ค่าเริ่มต้นจาก current — พ่อแม่ใช้ key ที่ผูกกับ current เพื่อ reset เมื่อค่าเปลี่ยน (ไม่ต้อง sync ด้วย effect)
  const [value, setValue] = useState(current)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 w-[240px] text-xs" aria-label={`เลือกประเภทข้อมูลของ ${datasetId}`}>
          <SelectValue placeholder="เลือกประเภทข้อมูล" />
        </SelectTrigger>
        <SelectContent>
          {DATA_CLASSIFICATIONS.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.no} {c.th}
            </SelectItem>
          ))}
          <SelectItem value={UNCLASSIFIED} className="text-xs">
            ยังไม่จำแนกประเภท
          </SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 text-xs" disabled={busy || value === current} onClick={() => onSave(datasetId, value)}>
        บันทึก
      </Button>
    </div>
  )
}

/* ----------------------------- component --------------------------------- */

export type DashboardSection = 'overview' | 'checks' | 'regulation' | 'risk' | 'classification'

const SECTIONS: Array<{ id: DashboardSection; th: string; en: string; icon: typeof LayoutDashboard; desc: string }> = [
  { id: 'overview', th: 'ภาพรวมทั้งหมด', en: 'Overall', icon: LayoutDashboard, desc: 'คะแนนรวม มาตรา 1–9 และคะแนนต่อชุดข้อมูล' },
  { id: 'checks', th: 'รายละเอียดการตรวจ', en: 'Check Details', icon: ClipboardList, desc: 'ผลตรวจล่าสุดรายกฎ พร้อมคำตัดสินตามมาตรา' },
  { id: 'regulation', th: 'Regulation', en: 'Regulatory Standards', icon: Scale, desc: 'มาตรฐานอ้างอิง 5 กรอบ แตกย่อยได้ อ้างอิงข้อมูลในระบบ' },
  { id: 'risk', th: 'Risk', en: 'DQ Impact', icon: AlertTriangle, desc: 'ความเสี่ยงในมุม Data Quality Impact' },
  { id: 'classification', th: 'Data Classification', en: 'Classification', icon: Tags, desc: 'จำแนกข้อมูล 11 ประเภท และ mapping มาตรฐาน' },
]

interface DqDashboardProps {
  datasets: DashboardDataset[]
  users: DashUser[]
  reloadTick: number
  onRefetch: () => void
}

export default function DqDashboard({ datasets, users, reloadTick, onRefetch }: DqDashboardProps) {
  const { toast } = useToast()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<DashboardSection>('overview')

  // section 2 — รายละเอียดการตรวจ
  const [detailDataset, setDetailDataset] = useState('all')
  const [detailStatus, setDetailStatus] = useState('all')

  // section 3 — regulation
  const [fwId, setFwId] = useState(FRAMEWORKS[0]?.id ?? 'DAMA_DMBOK')
  const [fwDataset, setFwDataset] = useState('all')
  const [regTab, setRegTab] = useState<'datasets' | 'clauses'>('datasets')

  // section 4 — risk
  const [riskScope, setRiskScope] = useState<'dimension' | 'framework' | 'classification'>('dimension')
  const [matrixView, setMatrixView] = useState<'residual' | 'inherent'>('residual')
  const [methodologyOpen, setMethodologyOpen] = useState(true)

  // section 5 — classification
  const [selectedCls, setSelectedCls] = useState(DATA_CLASSIFICATIONS[0]?.id ?? 'DATA_GOVERNANCE')
  const [clsOperator, setClsOperator] = useState('somchai.owner@company.co.th')
  const [clsBusy, setClsBusy] = useState(false)

  // PII masking demo (ส่วนภาพรวม)
  const [previewDataset, setPreviewDataset] = useState('')
  const [previewRole, setPreviewRole] = useState<RoleKey>('BUSINESS_USER')
  const [preview, setPreview] = useState<{ datasetName: string; columns: string[]; rows: Record<string, unknown>[]; piiMasked: boolean } | null>(null)

  /* ---------------------------- data load -------------------------------- */

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/dq/analytics')
      const json = (await res.json()) as AnalyticsData & { error?: string }
      setData(json.error ? null : json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void loadAnalytics()
  }, [loadAnalytics, reloadTick])

  // PII preview (ภาพรวม)
  useEffect(() => {
    if (!previewDataset) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/dq/sample-preview?datasetId=${encodeURIComponent(previewDataset)}&role=${previewRole}`)
        const json = await res.json()
        if (!alive) return
        setPreview(json.error ? null : json)
      } catch {
        if (alive) setPreview(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [previewDataset, previewRole])

  /* ------------------------------ actions -------------------------------- */

  async function handleSetClassification(datasetId: string, value: string) {
    setClsBusy(true)
    try {
      const res = await fetch('/api/dq/classification', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, classification: value, operatorEmail: clsOperator }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'กำหนดการจำแนกไม่สำเร็จ', description: json.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: 'บันทึกการจำแนกประเภทข้อมูลเรียบร้อย', description: json.message })
      await loadAnalytics()
      onRefetch()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setClsBusy(false)
    }
  }

  /* ------------------------------ derived -------------------------------- */

  const operators = useMemo(
    () => users.filter((u) => u.status !== 'SUSPENDED' && MANAGE_DATASETS_ROLES.includes(u.role as RoleKey)),
    [users],
  )

  const filteredRuns = useMemo(() => {
    if (!data) return []
    return data.latestRuns.filter(
      (r) => (detailDataset === 'all' || r.datasetId === detailDataset) && (detailStatus === 'all' || r.status === detailStatus),
    )
  }, [data, detailDataset, detailStatus])

  // ================= ส่วนที่ 3 — Regulation: ข้อมูลรายมาตรฐานจาก API =================
  // ถ้า backend ยังไม่เปิด key "regulation" → fallback โครงมาตรฐานจาก FRAMEWORKS (คะแนนยังว่าง — ไม่ crash)
  const regFws: RegulationFrameworkView[] = useMemo(() => {
    const apiList = data?.regulation?.frameworks
    if (apiList && apiList.length > 0) return apiList
    return FRAMEWORKS.map((f) => ({
      id: f.id,
      no: f.no,
      groupTh: f.groupTh,
      name: f.name,
      fullName: f.fullName,
      description: f.description,
      totalDomains: f.domains.length,
      measuredDomains: 0,
      weightedScore: null,
      domains: f.domains.map((d) => ({
        id: d.id,
        th: d.th,
        en: d.en,
        detail: d.detail,
        category: d.category ?? null,
        weight: 1,
        dimensions: d.dimensions as string[],
        score: null,
        rulesCount: 0,
        perDataset: [],
      })),
      datasets: [],
    }))
  }, [data])
  const regFw = regFws.find((f) => f.id === fwId) ?? regFws[0]
  const regMeasuredDomains = regFw.domains.filter((d) => d.dimensions.length > 0)
  const regProcessDomains = regFw.domains.filter((d) => d.dimensions.length === 0)

  /** คะแนน/จำนวนกฎของส่วนย่อยตามขอบเขตที่เลือก — ทุกชุดข้อมูล = domain.score · เฉพาะชุด = domain.perDataset */
  function regDomainScore(dom: RegulationDomainView, datasetId: string): { score: number | null; rulesCount: number } {
    if (datasetId !== 'all') {
      const row = dom.perDataset.find((p) => p.datasetId === datasetId)
      return { score: row ? row.score : null, rulesCount: row ? row.rulesCount : 0 }
    }
    return { score: dom.score, rulesCount: dom.rulesCount }
  }

  // ตัวเลือกขอบเขตชุดข้อมูล (แท็บรายละเอียดข้อกำหนด) — ใช้ fw.datasets จาก API ก่อน ถ้ายังไม่มีใช้ perDataset เดิม
  const regDatasetOptions = useMemo(() => {
    if (regFw.datasets.length > 0) return regFw.datasets.map((d) => ({ id: d.datasetId, name: d.name }))
    return (data?.perDataset ?? []).map((d) => ({ id: d.id, name: d.name }))
  }, [regFw, data])

  // ================= ส่วนที่ 4 — Risk: Inherent vs Residual =================
  const inherent = data?.risks.inherent ?? null

  // แถวความเสี่ยงรายขอบเขต ตาม switcher — เรียงจาก Residual สูงสุดไปต่ำสุด
  const inherentScopeRows: RiskInherentScopeRow[] = useMemo(() => {
    if (!inherent) return []
    let rows: RiskInherentScopeRow[]
    if (riskScope === 'dimension') {
      rows = inherent.byDimension.map((r) => ({
        key: r.dimension,
        label: r.th,
        sub: r.en,
        rulesCount: r.rulesCount,
        inherentAvg: r.inherentAvg,
        residualAvg: r.residualAvg,
        reductionPct: r.reductionPct,
      }))
    } else if (riskScope === 'framework') {
      rows = inherent.byFramework.map((r) => ({
        key: r.frameworkId,
        label: r.name,
        sub: r.no,
        rulesCount: r.rulesCount,
        inherentAvg: r.inherentAvg,
        residualAvg: r.residualAvg,
        reductionPct: r.reductionPct,
      }))
    } else {
      rows = inherent.byClassification.map((r) => ({
        key: r.id,
        label: r.th,
        sub: r.no,
        rulesCount: r.rulesCount,
        inherentAvg: r.inherentAvg,
        residualAvg: r.residualAvg,
        reductionPct: r.reductionPct,
      }))
    }
    return [...rows].sort((a, b) => b.residualAvg - a.residualAvg)
  }, [inherent, riskScope])

  // แผนที่ความเสี่ยง — Residual: โอกาสจากอัตราการล้มเหลวจริง · Inherent: ทุกกฎถือโอกาสระดับ 5 (ก่อนมีกฎ DQ ควบคุม)
  const riskMatrix = useMemo(() => {
    const items = data?.risks.items ?? []
    const measuredRuns = data?.latestRuns ?? []
    const levels = [5, 4, 3, 2, 1]
    const sevCols = [5, 4, 3, 2] // CRITICAL, HIGH, MEDIUM, LOW
    return levels.map((level) => ({
      level,
      cells: sevCols.map((weight) => ({
        weight,
        count:
          matrixView === 'inherent'
            ? level === 5
              ? measuredRuns.filter((r) => (SEVERITY_WEIGHT[r.severity] ?? 3) === weight).length
              : 0
            : items.filter((i) => i.likelihood.level === level && (SEVERITY_WEIGHT[i.severity] ?? 3) === weight).length,
      })),
    }))
  }, [data, matrixView])

  const selectedCategory = useMemo(
    () => data?.classification.categories.find((c) => c.id === selectedCls) ?? null,
    [data, selectedCls],
  )
  const selectedClsDef = DATA_CLASSIFICATIONS.find((c) => c.id === selectedCls)

  const measuredClauses = data ? data.overall.dimensions.filter((d) => d.score !== null).length : 0

  /* ------------------------------ render --------------------------------- */

  return (
    <div className="space-y-4">
      {/* -------- ตัวเลือกส่วนของแดชบอร์ด (5 ส่วน) -------- */}
      <div
        role="tablist"
        aria-label="ส่วนของแดชบอร์ดคุณภาพข้อมูล 5 ส่วน"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const active = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(s.id)}
              title={s.desc}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                active ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500' : 'bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${
                  active ? 'border-emerald-300 bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className={`block truncate text-xs font-semibold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>{s.th}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{s.en}</span>
              </span>
            </button>
          )
        })}
      </div>

      {loading && !data && <p className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดแดชบอร์ด…</p>}

      {!loading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <AlertTriangle className="size-8 text-amber-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">โหลดข้อมูลแดชบอร์ดไม่สำเร็จ — โปรดลองรีเฟรชอีกครั้ง</p>
            <Button size="sm" variant="outline" onClick={() => void loadAnalytics()}>
              <RefreshCw className="size-4" aria-hidden="true" /> ลองอีกครั้ง
            </Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* ================================================================ */}
          {/* ส่วนที่ 1 — ภาพรวมทั้งหมดของ Data Quality                           */}
          {/* ================================================================ */}
          {section === 'overview' && (
            <div className="space-y-4">
              {/* คะแนนรวม + เกรด */}
              <Card className="border-emerald-200 bg-emerald-50/40">
                <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                  <div>
                    <p className="text-xs font-medium text-emerald-900">คะแนนคุณภาพข้อมูลรวม</p>
                    <p className={`text-4xl font-bold tabular-nums ${scoreColor(data.overall.score)}`}>
                      {data.overall.score !== null ? data.overall.score.toFixed(1) : '—'}
                      <span className="ml-1 text-base font-medium text-muted-foreground">/100</span>
                    </p>
                  </div>
                  {data.overall.grade && (
                    <Badge variant="outline" className={`px-2.5 py-1 text-sm ${data.overall.grade.badgeClass}`}>
                      เกรด {data.overall.grade.label}
                    </Badge>
                  )}
                  <p className="max-w-md text-xs leading-relaxed text-slate-600">
                    ประเมินจากมาตราที่มีข้อมูล <strong>{measuredClauses}/9</strong> มาตรา (DAMA-DMBOK) จากกฎที่เปิดใช้งาน{' '}
                    {data.overall.totals.rulesEnabled} ข้อ — ล่าสุดผ่าน {data.overall.totals.measuredRulesLatest - data.overall.totals.failedRulesLatest} ·
                    ไม่ผ่าน {data.overall.totals.failedRulesLatest} จาก {data.overall.totals.measuredRulesLatest} กฎ-ชุดข้อมูล
                  </p>
                </CardContent>
              </Card>

              {/* KPI */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'สัญญาณรอทบทวน', value: data.overall.totals.pendingSignals, accent: 'text-amber-700' },
                  { label: 'คำขอข้อยกเว้นรออนุมัติ', value: data.overall.totals.pendingExceptions, accent: 'text-emerald-700' },
                  { label: 'กฎที่เปิดใช้งาน', value: data.overall.totals.rulesEnabled, accent: 'text-slate-900' },
                  {
                    label: 'ชุดข้อมูลที่รันแล้ว',
                    value: `${data.overall.totals.datasetsWithRun}/${data.overall.totals.datasetsTotal}`,
                    accent: 'text-slate-900',
                  },
                ].map((s) => (
                  <Card key={s.label} className="p-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`mt-1 text-2xl font-bold ${s.accent}`}>{s.value ?? '…'}</p>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                {/* มาตรา 1–9 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">คะแนนตามมาตรา 1–9 (DAMA-DMBOK)</CardTitle>
                    <CardDescription>เรียงตามลำดับมาตรา — จากผลรันตรวจล่าสุดของทุกกฎที่เปิดใช้งาน</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2.5">
                      {data.overall.dimensions.map((d) => {
                        const Icon = DIMENSION_ICONS[d.dimension as DimensionKey]
                        return (
                          <div key={d.dimension} className="flex items-center gap-2 text-xs">
                            {Icon && <Icon className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />}
                            <span className="w-44 shrink-0 truncate" title={d.en}>
                              <span className="font-mono text-[10px] text-muted-foreground">ม.{d.clauseNo}</span> {d.th}
                            </span>
                            {d.score !== null ? (
                              <>
                                <ScoreBar score={d.score} />
                                <span className={`w-10 text-right font-mono font-semibold ${scoreColor(d.score)}`}>{d.score.toFixed(0)}</span>
                              </>
                            ) : (
                              <span className="flex-1 rounded-md border border-dashed px-2 py-0.5 text-center text-[10.5px] text-muted-foreground">
                                ยังไม่ได้ประเมิน (ไม่มีกฎในมาตรานี้)
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* ต่อชุดข้อมูล */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">คะแนนต่อชุดข้อมูล</CardTitle>
                    <CardDescription>พร้อมประเภทข้อมูลที่จำแนกไว้ (Data Classification)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                      {data.perDataset.map((d) => {
                        const cls = classificationLabel(d.classification)
                        return (
                          <div key={d.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <p className="truncate text-sm font-medium">{d.name}</p>
                                <Badge variant="outline" className="text-[10.5px]">
                                  {d.ruleCount} กฎ
                                </Badge>
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-600">
                                  {cls.no !== '—' ? `${cls.no} ` : ''}
                                  {cls.th}
                                </Badge>
                                {d.pendingSignals > 0 && (
                                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10.5px] text-amber-900">
                                    {d.pendingSignals} สัญญาณ
                                  </Badge>
                                )}
                              </div>
                              <span className={`font-mono text-lg font-bold ${scoreColor(d.score)}`}>
                                {d.score !== null ? d.score.toFixed(0) : '—'}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <ScoreBar score={d.score} />
                              {d.grade && (
                                <Badge variant="outline" className={`shrink-0 text-[10px] ${d.grade.badgeClass}`}>
                                  {d.grade.label}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {d.lastRunAt ? `รันล่าสุด ${fmtTime(d.lastRunAt)}` : 'ยังไม่เคยรันตรวจสอบ'}
                            </p>
                          </div>
                        )
                      })}
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
                  <CardDescription>ข้อมูลส่วนบุคคลถูกปิดบังเป็นค่าเริ่มต้น — ประเมินฝั่ง backend ตามบทบาท สอดคล้อง PDPA</CardDescription>
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
                          {ROLE_LIST.map((r) => (
                            <SelectItem key={r.key} value={r.key}>
                              {r.th}
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
          )}

          {/* ================================================================ */}
          {/* ส่วนที่ 2 — รายละเอียดการตรวจ Data Quality                          */}
          {/* ================================================================ */}
          {section === 'checks' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ผลการตรวจล่าสุดรายกฎ</CardTitle>
                <CardDescription>
                  ผลรันล่าสุดของแต่ละกฎ-ชุดข้อมูล พร้อมคำตัดสินตามมาตรา DAMA-DMBOK และคำแนะนำเมื่อไม่ผ่าน
                </CardDescription>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="dt-dataset" className="text-xs text-muted-foreground">
                      ชุดข้อมูล
                    </Label>
                    <Select value={detailDataset} onValueChange={setDetailDataset}>
                      <SelectTrigger id="dt-dataset" className="h-8 w-[230px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">
                          ทุกชุดข้อมูล
                        </SelectItem>
                        {data.perDataset.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="text-xs">
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="dt-status" className="text-xs text-muted-foreground">
                      สถานะ
                    </Label>
                    <Select value={detailStatus} onValueChange={setDetailStatus}>
                      <SelectTrigger id="dt-status" className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">
                          ทั้งหมด
                        </SelectItem>
                        <SelectItem value="PASSED" className="text-xs">
                          ผ่าน
                        </SelectItem>
                        <SelectItem value="FAILED" className="text-xs">
                          ไม่ผ่าน
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      ผ่าน {data.latestRuns.filter((r) => r.status === 'PASSED').length}
                    </Badge>
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
                      ไม่ผ่าน {data.latestRuns.filter((r) => r.status === 'FAILED').length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredRuns.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    ยังไม่มีผลตรวจตามเงื่อนไขที่เลือก — ไปที่เมนู “รันตรวจสอบ” เพื่อประเมินตามมาตรา 1–9
                  </p>
                ) : (
                  <div className="max-h-[34rem] space-y-2.5 overflow-y-auto pr-1">
                    {filteredRuns.map((r) => (
                      <div key={r.runId} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className={`text-[10.5px] ${STATUS_BADGE[r.status]}`}>
                              {STATUS_LABEL[r.status]}
                            </Badge>
                            <DimensionBadge dimension={r.dimension} />
                            <Badge variant="outline" className="text-[10.5px]">
                              มาตราที่ {r.clauseNo}
                            </Badge>
                            <span className="truncate text-sm font-medium">{r.datasetName}</span>
                            <span className="text-xs text-muted-foreground">
                              · {r.column} — {r.conditionName}
                            </span>
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{fmtTime(r.at)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <ScoreBar score={r.passRate * 100} className="max-w-48" />
                          <span className={`font-mono font-semibold ${scoreColor(r.passRate * 100)}`}>
                            {(r.passRate * 100).toFixed(0)}%
                          </span>
                          <span className="text-muted-foreground">
                            ล้มเหลว {r.failedRows} จาก {r.totalRows} แถว
                          </span>
                          {r.status === 'FAILED' && (
                            <Badge variant="outline" className={`text-[10.5px] ${SEVERITY_BADGE_SMALL[r.riskBand] ?? 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                              ความเสี่ยง {r.riskScore} ({r.riskBand === 'CRITICAL' ? 'สูงมาก' : r.riskBand === 'HIGH' ? 'สูง' : r.riskBand === 'MEDIUM' ? 'ปานกลาง' : 'ต่ำ'})
                            </Badge>
                          )}
                        </div>
                        <p className={`mt-1.5 text-xs leading-relaxed ${r.status === 'FAILED' ? 'text-rose-800' : 'text-emerald-800'}`}>
                          {r.verdict}
                        </p>
                        {r.advice && (
                          <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-900">
                            คำแนะนำ: {r.advice} (เป็นข้อแนะนำ — การแก้ไขข้อมูลต้องดำเนินการโดยมนุษย์)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ================================================================ */}
          {/* ส่วนที่ 3 — Regulation (มาตรฐานอ้างอิง 5 กรอบ)                       */}
          {/* ================================================================ */}
          {section === 'regulation' && (
            <div className="space-y-4">
              {/* เลือกกรอบมาตรฐาน — แสดงคะแนนรวมถ่วงน้ำหนักจากการประเมินล่าสุด + จำนวนข้อกำหนดที่วัดได้รายกรอบ */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="เลือกกรอบมาตรฐาน">
                {regFws.map((f) => {
                  const active = f.id === fwId
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setFwId(f.id)
                        setFwDataset('all')
                      }}
                      className={`rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        active ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500' : 'bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-muted-foreground">{f.no}</p>
                          <p className={`truncate text-sm font-semibold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>{f.name}</p>
                          <p className="truncate text-[10.5px] text-muted-foreground" title={f.groupTh}>
                            {f.groupTh}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 font-mono text-base font-bold ${scoreColor(f.weightedScore)}`}
                          title="คะแนนรวมถ่วงน้ำหนักจากการประเมินล่าสุด"
                        >
                          {f.weightedScore !== null ? f.weightedScore.toFixed(1) : '—'}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        วัดได้ {f.measuredDomains}/{f.totalDomains} ข้อกำหนด
                      </p>
                    </button>
                  )
                })}
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <h3 className="text-base font-semibold leading-none text-slate-900">
                    {regFw.no} {regFw.groupTh}: {regFw.name}
                  </h3>
                  <CardDescription className="mt-1">{regFw.fullName}</CardDescription>
                  <p className="pt-1 text-xs leading-relaxed text-slate-600">{regFw.description}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      ข้อกำหนด {regFw.totalDomains} ข้อ
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      วัดได้ {regFw.measuredDomains} ข้อ
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-white font-mono text-slate-800">
                      คะแนนรวม {regFw.weightedScore !== null ? `${regFw.weightedScore.toFixed(1)}/100` : '—'}
                    </Badge>
                    {!data.regulation && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                        รอข้อมูลวิเคราะห์รายมาตรฐานจากเซิร์ฟเวอร์ — แสดงโครงมาตรฐานอย่างเดียว
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* v0.24.2 — ประเมินความเสี่ยงที่อ้างอิงตามแต่ละมาตรฐาน (แทนสรุปคะแนนก่อน–หลังตั้งกฎ DQ เดิม)
                      Inherent/Residual คำนวณจาก lib/regulation.ts — chip ระดับความเสี่ยงจาก riskBandOf คลิกเลือกมาตรฐานได้ */}
                  {inherent && inherent.byFramework.length > 0 ? (
                    <section
                      aria-label="ประเมินความเสี่ยงที่อ้างอิงตามแต่ละมาตรฐาน"
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <h4 className="text-xs font-semibold text-slate-800">
                        ประเมินความเสี่ยงที่อ้างอิงตามแต่ละมาตรฐาน
                      </h4>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        ค่าเฉลี่ยความเสี่ยง (เต็ม 25) ของกฎ DQ ที่แมปกับแต่ละมาตรฐาน — Inherent = ความเสี่ยงตั้งต้น · Residual = ความเสี่ยงคงเหลือจากผลตรวจล่าสุด · คลิกรายการเพื่อเลือกดูรายละเอียดมาตรฐาน
                      </p>
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {inherent.byFramework.map((row) => {
                          const bandIH = riskBandOf(row.inherentAvg)
                          const bandRS = riskBandOf(row.residualAvg)
                          const selected = row.frameworkId === fwId
                          return (
                            <li key={row.frameworkId}>
                              <button
                                type="button"
                                onClick={() => setFwId(row.frameworkId)}
                                aria-pressed={selected}
                                aria-label={`ประเมินความเสี่ยง ${row.name} — Inherent ${row.inherentAvg.toFixed(1)} ระดับ${bandIH.label}, Residual ${row.residualAvg.toFixed(1)} ระดับ${bandRS.label}`}
                                className={`w-full rounded-md border bg-white px-2.5 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                  selected ? 'border-emerald-300 ring-2 ring-emerald-300' : 'hover:border-emerald-200'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-slate-800" title={`${row.no} ${row.name}`}>
                                      {row.name}
                                    </p>
                                    <p className="truncate font-mono text-[10px] text-muted-foreground">{row.no}</p>
                                  </div>
                                  {row.reductionPct > 0 ? (
                                    <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 font-mono text-[10px] text-emerald-800">
                                      ลดลง −{Math.round(row.reductionPct)}%
                                    </Badge>
                                  ) : row.reductionPct === 0 ? (
                                    <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                      ทรงตัว
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-900">
                                      เพิ่มขึ้น +{Math.round(-row.reductionPct)}%
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                  <span
                                    className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${bandIH.className}`}
                                    title={`Inherent ระดับ${bandIH.label} (คะแนน ${row.inherentAvg.toFixed(1)}/25)`}
                                  >
                                    {bandIH.label}
                                  </span>
                                  <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-rose-700">
                                    {row.inherentAvg.toFixed(1)}
                                  </span>
                                  <ArrowRight className="size-3 shrink-0 text-slate-400" aria-hidden="true" />
                                  <span
                                    className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${bandRS.className}`}
                                    title={`Residual ระดับ${bandRS.label} (คะแนน ${row.residualAvg.toFixed(1)}/25)`}
                                  >
                                    {bandRS.label}
                                  </span>
                                  <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-emerald-700">
                                    {row.residualAvg.toFixed(1)}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-slate-400">/25</span>
                                </div>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        ระดับความเสี่ยง: สูงมาก ≥15 · สูง ≥8 · ปานกลาง ≥4 · ต่ำ &lt;4 — เกณฑ์ทั้งหมดอยู่ใน{' '}
                        <span className="font-mono">lib/regulation.ts</span> · ดูรายละเอียดรายข้อที่เมนู{' '}
                        <span className="font-medium text-slate-700">ภาพรวม → ประเมินความสอดคล้อง</span>
                      </p>
                    </section>
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      ยังไม่มีข้อมูลประเมินความเสี่ยงรายมาตรฐาน — เพิ่มกฎ DQ ที่อ้างอิงมาตรฐานและรันตรวจเพื่อเริ่มประเมิน
                    </p>
                  )}

                  {/* sub-tabs 2 มุมมอง: ชุดข้อมูล (default) / รายละเอียดข้อกำหนด */}
                  <div role="tablist" aria-label="มุมมองของมาตรฐานที่เลือก" className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-slate-50 p-0.5">
                    <button
                      type="button"
                      role="tab"
                      id="reg-tab-datasets"
                      aria-selected={regTab === 'datasets'}
                      aria-controls="reg-panel-datasets"
                      onClick={() => setRegTab('datasets')}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        regTab === 'datasets' ? 'bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200' : 'text-slate-600 hover:text-emerald-800'
                      }`}
                    >
                      มุมมองชุดข้อมูล
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="reg-tab-clauses"
                      aria-selected={regTab === 'clauses'}
                      aria-controls="reg-panel-clauses"
                      onClick={() => setRegTab('clauses')}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        regTab === 'clauses' ? 'bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200' : 'text-slate-600 hover:text-emerald-800'
                      }`}
                    >
                      รายละเอียดข้อกำหนด
                    </button>
                  </div>

                  {regTab === 'datasets' && (
                    <div role="tabpanel" id="reg-panel-datasets" aria-labelledby="reg-tab-datasets" className="space-y-2">
                      {regFw.datasets.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          กรอบมาตรฐานนี้ยังไม่มีชุดข้อมูลที่ผูกกับกฎ DQ — เพิ่มกฎที่อ้างอิงชุดข้อมูลและรันตรวจเพื่อเริ่มวัดคะแนนรายมาตรฐาน
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full min-w-[560px] text-left text-xs">
                            <caption className="sr-only">
                              ตารางคะแนนรายชุดข้อมูลของ {regFw.name} — คะแนนประเมินล่าสุดจากผลรันตรวจ พร้อมจำนวนกฎที่ครอบคลุมและเวลารันล่าสุด
                            </caption>
                            <thead className="bg-emerald-50/70 text-emerald-900">
                              <tr>
                                <th scope="col" className="px-3 py-2 font-medium">
                                  ชุดข้อมูล
                                </th>
                                <th scope="col" className="px-3 py-2 text-center font-medium">
                                  กฎครอบคลุม
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                  คะแนนประเมินล่าสุด
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">
                                  รันล่าสุด
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {regFw.datasets.map((ds) => {
                                const grade = ds.grade ?? gradeOfClient(ds.score)
                                return (
                                  <tr key={ds.datasetId} className="border-t">
                                    <th scope="row" className="px-3 py-2 text-left font-medium text-slate-800">
                                      {ds.name}
                                    </th>
                                    <td className="px-3 py-2 text-center tabular-nums">{ds.rulesCount}</td>
                                    <td className="px-3 py-2">
                                      {ds.score !== null ? (
                                        <div className="flex items-center gap-2">
                                          <ScoreBar score={ds.score} className="max-w-28" />
                                          <span className={`w-10 shrink-0 text-right font-mono font-semibold ${scoreColor(ds.score)}`}>
                                            {ds.score.toFixed(1)}
                                          </span>
                                          {grade && (
                                            <Badge variant="outline" className={`shrink-0 text-[10px] ${grade.badgeClass}`}>
                                              {grade.label}
                                            </Badge>
                                          )}
                                        </div>
                                      ) : (
                                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                                          ยังไม่ได้รันตรวจ
                                        </Badge>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtTime(ds.lastRunAt)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        มุมชุดข้อมูลรายมาตรฐาน: คะแนนจากผลรันตรวจล่าสุดของแต่ละชุดข้อมูล — ชุดข้อมูลที่ยังไม่ได้รันตรวจจะแสดงสถานะ "รอการประเมิน"
                      </p>
                    </div>
                  )}

                  {regTab === 'clauses' && (
                    <div role="tabpanel" id="reg-panel-clauses" aria-labelledby="reg-tab-clauses" className="space-y-3">
                      {/* ขอบเขตชุดข้อมูล */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor="fw-dataset" className="text-xs text-muted-foreground">
                          ขอบเขตชุดข้อมูล
                        </Label>
                        <Select value={fwDataset} onValueChange={setFwDataset}>
                          <SelectTrigger id="fw-dataset" className="h-8 w-[240px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">
                              ทุกชุดข้อมูล (รวมทั้งระบบ)
                            </SelectItem>
                            {regDatasetOptions.map((d) => (
                              <SelectItem key={d.id} value={d.id} className="text-xs">
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* ข้อกำหนดที่วัดคะแนนได้ (มีเกณฑ์ตรวจ) */}
                      <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                        {regMeasuredDomains.length === 0 && (
                          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                            กรอบนี้ยังไม่มีข้อกำหนดที่แมปกับมิติ DQ ที่ตรวจได้ในระบบ
                          </p>
                        )}
                        {regMeasuredDomains.map((dom) => {
                          const st = regDomainScore(dom, fwDataset)
                          return (
                            <div key={dom.id} className="rounded-lg border p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="text-sm font-medium text-slate-800">
                                    {dom.th} <span className="text-xs font-normal text-muted-foreground">({dom.en})</span>
                                  </h4>
                                  {dom.category && <p className="text-[10px] text-muted-foreground">{dom.category}</p>}
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-800">
                                    น้ำหนัก ×{fmtWeight(dom.weight)}
                                  </Badge>
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                    กฎครอบคลุม {st.rulesCount} ข้อ
                                  </Badge>
                                </div>
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600">{dom.detail}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {dom.dimensions.map((d) => (
                                  <DimensionBadge key={d} dimension={d} />
                                ))}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                {st.score !== null ? (
                                  <>
                                    <span className="text-muted-foreground">
                                      คะแนนประเมินล่าสุด{' '}
                                      <span className={`font-mono font-bold ${scoreColor(st.score)}`}>{st.score.toFixed(1)}</span>
                                      <span className="ml-0.5 text-[10px] text-slate-400">/100</span>
                                    </span>
                                    <ScoreBar score={st.score} className="max-w-36" />
                                  </>
                                ) : (
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                                    {fwDataset === 'all' ? 'ยังไม่ได้รันตรวจ' : 'ชุดข้อมูลนี้ยังไม่มีผลตรวจในข้อกำหนดนี้'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* ข้อกำหนดระดับกระบวนการ — ไม่มีเกณฑ์ตรวจ จึงไม่เข้าการคำนวณคะแนน */}
                      {regProcessDomains.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                          <h4 className="text-xs font-semibold text-amber-900">ข้อกำหนดระดับกระบวนการ (ไม่เข้าการคำนวณคะแนน)</h4>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/90">
                            เกณฑ์เชิงกระบวนการ/การกำกับดูแล — ระบบครอบคลุมผ่าน RBAC รายชุดข้อมูล · การปิดบัง PII ตามบทบาท · Audit Trail ทุกการดำเนินการ
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {regProcessDomains.map((dom) => (
                              <li key={dom.id} className="rounded-md border border-amber-200/70 bg-white/70 px-2.5 py-1.5">
                                <p className="text-xs font-medium text-slate-800">
                                  {dom.th} <span className="font-normal text-muted-foreground">({dom.en})</span>
                                </p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{dom.detail}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================================================================ */}
          {/* ส่วนที่ 4 — Risk (ความเสี่ยงในมุม Data Quality Impact)               */}
          {/* ================================================================ */}
          {section === 'risk' && (
            <div className="space-y-4">
              {/* Hero — Inherent (ก่อนมีกฎ DQ) → ลดลง % → Residual (หลังมีกฎ DQ) */}
              <section aria-label="สรุปความเสี่ยงโดยธรรมชาติ (Inherent) เทียบความเสี่ยงคงเหลือ (Residual)">
                <div className="grid gap-3 md:grid-cols-3">
                  <dl className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600">
                        <AlertTriangle className="size-4" aria-hidden="true" />
                      </span>
                      <dt className="text-xs font-medium text-rose-900">ความเสี่ยงโดยธรรมชาติ (Inherent)</dt>
                    </div>
                    <dd className="mt-2">
                      <span className="text-3xl font-bold tabular-nums text-rose-700">{inherent ? inherent.inherentAvg.toFixed(1) : '—'}</span>
                      <span className="ml-1 text-xs text-rose-700/80">/25</span>
                    </dd>
                    <dd className="mt-0.5 text-[11px] leading-relaxed text-rose-800/90">
                      ก่อนมีกฎ DQ — ทุกกฎถือว่ามีโอกาสเกิดระดับ 5 (สูงมาก) × ความรุนแรงของกฎ
                    </dd>
                  </dl>
                  <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <TrendingDown className="size-5 text-emerald-600" aria-hidden="true" />
                    <p className="text-2xl font-bold tabular-nums text-emerald-700">
                      {inherent ? `ลดลง ${Math.round(inherent.reductionPct)}%` : 'ลดลง —'}
                    </p>
                    <p className="text-center text-[11px] text-muted-foreground">จากการตั้งกฎ DQ ครอบคลุมและรันตรวจจริง</p>
                  </div>
                  <dl className="rounded-xl border border-emerald-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                      </span>
                      <dt className="text-xs font-medium text-emerald-900">ความเสี่ยงคงเหลือ (Residual)</dt>
                    </div>
                    <dd className="mt-2">
                      <span className="text-3xl font-bold tabular-nums text-emerald-700">{inherent ? inherent.residualAvg.toFixed(1) : '—'}</span>
                      <span className="ml-1 text-xs text-emerald-800/70">/25</span>
                    </dd>
                    <dd className="mt-0.5 text-[11px] leading-relaxed text-emerald-900/90">
                      หลังมีกฎ DQ — คำนวณจากอัตราการล้มเหลวจริงของผลตรวจล่าสุด
                    </dd>
                  </dl>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10.5px] text-teal-800">
                    วัดแล้ว {inherent ? inherent.measuredRules : '—'} กฎ
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-600">
                    ยังไม่วัด {inherent ? inherent.unmeasuredRules : '—'} กฎ
                  </Badge>
                  {!inherent && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10.5px] text-amber-900">
                      รอข้อมูลสรุปความเสี่ยง Inherent/Residual จากเซิร์ฟเวอร์
                    </Badge>
                  )}
                </div>
              </section>

              {/* ตารางความเสี่ยงรายขอบเขต 3 มุม: มิติ DQ / มาตรฐาน / ประเภทข้อมูล */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold leading-none text-slate-900">ความเสี่ยงรายขอบเขต (Inherent vs Residual)</h3>
                      <CardDescription className="mt-1">
                        ค่าเฉลี่ยความเสี่ยงก่อนควบคุม (Inherent) เทียบความเสี่ยงคงเหลือ (Residual) — เรียงจากความเสี่ยงคงเหลือสูงสุดไปต่ำสุด
                      </CardDescription>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="เลือกขอบเขตการแบ่งกลุ่มความเสี่ยง"
                      className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-lg border bg-slate-50 p-0.5"
                    >
                      {(
                        [
                          { id: 'dimension', label: 'รายมิติ DQ' },
                          { id: 'framework', label: 'รายมาตรฐาน' },
                          { id: 'classification', label: 'รายประเภทข้อมูล' },
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={riskScope === s.id}
                          onClick={() => setRiskScope(s.id)}
                          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                            riskScope === s.id ? 'bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200' : 'text-slate-600 hover:text-emerald-800'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {inherentScopeRows.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      ยังไม่มีข้อมูลความเสี่ยงรายขอบเขต — จะแสดงเมื่อมีกฎ DQ ที่เปิดใช้งานและผลรันตรวจล่าสุด
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <caption className="sr-only">
                          ตารางความเสี่ยงราย
                          {riskScope === 'dimension' ? 'มิติ DQ' : riskScope === 'framework' ? 'มาตรฐาน' : 'ประเภทข้อมูล'}
                          — เทียบค่าเฉลี่ย Inherent กับ Residual และ % ความเสี่ยงที่ลดลง
                        </caption>
                        <thead className="bg-slate-50 text-slate-700">
                          <tr>
                            <th scope="col" className="px-3 py-2 font-medium">
                              ขอบเขต
                            </th>
                            <th scope="col" className="px-3 py-2 text-center font-medium">
                              กฎ
                            </th>
                            <th scope="col" className="px-3 py-2 text-center font-medium">
                              Inherent (เฉลี่ย)
                            </th>
                            <th scope="col" className="px-3 py-2 text-center font-medium">
                              Residual (เฉลี่ย)
                            </th>
                            <th scope="col" className="px-3 py-2 text-center font-medium">
                              ลดลง
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              สัดส่วน Residual/Inherent
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {inherentScopeRows.map((row, idx) => {
                            const highlight = idx === 0 && row.residualAvg >= 8
                            return (
                              <tr key={row.key} className={`border-t ${highlight ? 'bg-rose-50' : ''}`}>
                                <th scope="row" className="px-3 py-2 text-left font-medium text-slate-800">
                                  {row.label}
                                  <span className="block text-[10px] font-normal text-muted-foreground">{row.sub}</span>
                                </th>
                                <td className="px-3 py-2 text-center tabular-nums">{row.rulesCount}</td>
                                <td className="px-3 py-2 text-center font-mono font-semibold text-rose-700">{row.inherentAvg.toFixed(1)}</td>
                                <td
                                  className={`px-3 py-2 text-center font-mono font-bold ${
                                    row.residualAvg >= 8 ? 'text-rose-700' : row.residualAvg >= 4 ? 'text-amber-700' : 'text-emerald-700'
                                  }`}
                                >
                                  {row.residualAvg.toFixed(1)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-center">
                                  <span className="font-mono text-emerald-700">−{(row.inherentAvg - row.residualAvg).toFixed(1)}</span>
                                  <span className="ml-1 text-emerald-700/80">(−{Math.round(row.reductionPct)}%)</span>
                                </td>
                                <td className="px-3 py-2">
                                  <div
                                    className="h-1.5 w-full min-w-20 overflow-hidden rounded-full bg-slate-200"
                                    role="img"
                                    aria-label={`Residual ${row.residualAvg.toFixed(1)} จาก Inherent ${row.inherentAvg.toFixed(1)} (เต็ม 25)`}
                                    title={`Inherent ${row.inherentAvg.toFixed(1)} · Residual ${row.residualAvg.toFixed(1)} (เต็ม 25)`}
                                  >
                                    <div
                                      className="h-full rounded-full bg-rose-300"
                                      style={{ width: `${Math.min(100, (row.inherentAvg / 25) * 100)}%` }}
                                    >
                                      <div
                                        className="h-full rounded-full bg-emerald-600"
                                        style={{ width: `${row.inherentAvg > 0 ? Math.min(100, (row.residualAvg / row.inherentAvg) * 100) : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    สูตร: Inherent = โอกาสระดับ 5 (ก่อนมีกฎ DQ) × ความรุนแรงของกฎ (เต็ม 25) · Residual = โอกาสจากอัตราการล้มเหลวจริงล่าสุด × ความรุนแรง ·
                    ลดลง = Inherent − Residual (จำนวน และ %) — แถวเน้นสี = ความเสี่ยงคงเหลือสูงสุดที่ Residual ≥ 8 · เป็นข้อมูลประกอบการตัดสินใจของมนุษย์เสมอ
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">ความเสี่ยงรวม (กฎที่ไม่ผ่าน)</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{data.risks.items.length}</p>
                </Card>
                {[
                  { band: 'CRITICAL', label: 'สูงมาก', cls: 'text-rose-700' },
                  { band: 'HIGH', label: 'สูง', cls: 'text-orange-700' },
                  { band: 'MEDIUM', label: 'ปานกลาง', cls: 'text-amber-700' },
                  { band: 'LOW', label: 'ต่ำ', cls: 'text-slate-700' },
                ].map((b) => (
                  <Card key={b.band} className="p-4">
                    <p className="text-xs text-muted-foreground">ระดับ{b.label}</p>
                    <p className={`mt-1 text-2xl font-bold ${b.cls}`}>{data.risks.counts[b.band] ?? 0}</p>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                {/* แผนที่ความเสี่ยง */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold leading-none text-slate-900">แผนที่ความเสี่ยง (Risk Matrix)</h3>
                        <CardDescription className="mt-1">
                          {matrixView === 'residual'
                            ? 'คะแนนความเสี่ยง = โอกาสเกิด (จากอัตราการล้มเหลว 1–5) × ผลกระทบ (จากความรุนแรงของกฎ 2–5)'
                            : 'มุมมอง Inherent (ก่อนมีกฎ DQ) — ทุกกฎที่วัดได้ถือว่ามีโอกาสเกิดระดับ 5 (สูงมาก) · คะแนน = 5 × ความรุนแรงของกฎ (2–5)'}
                        </CardDescription>
                      </div>
                      <div role="radiogroup" aria-label="เลือกมุมมองแผนที่ความเสี่ยง" className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-lg border bg-slate-50 p-0.5">
                        {(
                          [
                            { id: 'residual', label: 'Residual' },
                            { id: 'inherent', label: 'Inherent' },
                          ] as const
                        ).map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={matrixView === v.id}
                            onClick={() => setMatrixView(v.id)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                              matrixView === v.id ? 'bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200' : 'text-slate-600 hover:text-emerald-800'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] border-separate border-spacing-0.5 text-xs">
                        <thead>
                          <tr>
                            <th scope="col" className="p-1.5 text-left text-[10px] font-medium text-muted-foreground">
                              โอกาส \ ผลกระทบ
                            </th>
                            {['CRITICAL วิกฤต', 'HIGH สูง', 'MEDIUM ปานกลาง', 'LOW ต่ำ'].map((h) => (
                              <th key={h} scope="col" className="p-1.5 text-center text-[10px] font-medium text-muted-foreground">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {riskMatrix.map((row) => (
                            <tr key={row.level}>
                              <th scope="row" className="p-1.5 text-left text-[10.5px] font-medium text-slate-600">
                                {row.level} — {row.level === 5 ? 'สูงมาก' : row.level === 4 ? 'สูง' : row.level === 3 ? 'ปานกลาง' : row.level === 2 ? 'ต่ำ' : 'หายาก'}
                              </th>
                              {row.cells.map((cell) => {
                                const band = riskBandOf(cell.weight * row.level)
                                const filled = cell.count > 0
                                return (
                                  <td
                                    key={cell.weight}
                                    className={`rounded-md border p-2 text-center font-mono text-sm font-bold ${
                                      MATRIX_CELL[band.band] ?? 'bg-slate-50'
                                    } ${filled ? '' : 'opacity-30'}`}
                                    title={`คะแนนความเสี่ยง ${cell.weight * row.level} — ${band.label}`}
                                  >
                                    {cell.count > 0 ? cell.count : '·'}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {matrixView === 'residual' ? (
                      <div className="mt-3 space-y-1.5">
                        {data.risks.byDimension
                          .filter((d) => d.count > 0)
                          .sort((a, b) => b.count - a.count)
                          .map((d) => (
                            <div key={d.dimension} className="flex items-center gap-2 text-xs">
                              <DimensionBadge dimension={d.dimension} />
                              <ScoreBar score={Math.min(100, d.count * 20)} />
                              <span className="w-16 shrink-0 text-right text-muted-foreground">{d.count} กฎ</span>
                            </div>
                          ))}
                        {data.risks.items.length === 0 && (
                          <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีกฎที่ล้มเหลว — ยังไม่พบความเสี่ยงจากผลตรวจล่าสุด</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-800">
                        มุมมอง Inherent: แต่ละเซลล์ = จำนวนกฎ-ชุดข้อมูลที่วัดได้ในความรุนแรงนั้น ที่แถวโอกาสระดับ 5 —
                        แสดงความเสี่ยงสูงสุดหากยังไม่มีกฎ DQ ครอบคลุม (เทียบกับมุมมอง Residual ที่โอกาสลดตามผลตรวจจริง)
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* รายการความเสี่ยงหลัก */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">ความเสี่ยงหลัก (Data Quality Impact)</CardTitle>
                    <CardDescription>เรียงจากคะแนนความเสี่ยงสูงสุด — พร้อมผลกระทบทางธุรกิจและคำแนะนำ</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[34rem] space-y-2.5 overflow-y-auto pr-1">
                      {data.risks.items.slice(0, 10).map((r, i) => (
                        <div key={`${r.datasetId}-${r.ruleId}-${i}`} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={`text-[10.5px] ${r.level.className}`}>
                                {r.level.label} · {r.riskScore}
                              </Badge>
                              <DimensionBadge dimension={r.dimension} />
                              <span className="truncate text-sm font-medium">{r.datasetName}</span>
                              <span className="text-xs text-muted-foreground">
                                · {r.column} — {r.conditionName}
                              </span>
                            </div>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{fmtTime(r.at)}</span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-600">
                            ล้มเหลว <strong className="text-rose-700">{r.failedRows}</strong> จาก {r.totalRows} แถว ({(r.failRate * 100).toFixed(0)}%) — โอกาสเกิด:
                            ระดับ {r.likelihood.level} ({r.likelihood.label})
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.impacts.slice(0, 4).map((im) => (
                              <Badge key={im} variant="outline" className="border-slate-200 bg-slate-50 text-[10px] font-normal text-slate-600">
                                {im}
                              </Badge>
                            ))}
                          </div>
                          {r.advice && (
                            <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-900">
                              คำแนะนำ: {r.advice}
                            </p>
                          )}
                        </div>
                      ))}
                      {data.risks.items.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการความเสี่ยง</p>
                      )}
                    </div>
                    <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      ประเมินโดยอัตโนมัติจากผลตรวจล่าสุด + ระดับความรุนแรงของกฎ — เป็นข้อมูลประกอบการตัดสินใจของมนุษย์เสมอ
                      ระบบไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* v0.24.1 — วิธีการประเมินความเสี่ยง (Risk Methodology): เกณฑ์ทุกขั้นที่ระบบใช้ตัดสิน
                  แสดงค่าจาก LIKELIHOOD_BANDS / SEVERITY_WEIGHT / RISK_BANDS ใน lib/regulation.ts โดยตรง
                  เพื่อให้ "ตัวเลขที่คำนวณ" กับ "ตัวเลขที่แสดง" เป็นชุดเดียวกันเสมอ (Single Source of Truth) */}
              <Collapsible open={methodologyOpen} onOpenChange={setMethodologyOpen}>
                <Card className="border-slate-200">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      aria-expanded={methodologyOpen}
                      className="flex w-full items-center justify-between gap-3 rounded-t-xl p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700">
                          <Scale className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">วิธีการประเมินความเสี่ยง (Risk Methodology)</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            เกณฑ์ทุกขั้นที่ระบบใช้ตัดสิน — คะแนนความเสี่ยง = โอกาสเกิด (1–5) × ผลกระทบ (2–5) เต็ม 25 · นิยามเดียวใน lib/regulation.ts
                          </span>
                        </span>
                      </span>
                      <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-slate-500 transition-transform ${methodologyOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="grid gap-3 md:grid-cols-3">
                        {/* ① โอกาสเกิด */}
                        <div className="rounded-lg border bg-white p-3">
                          <p className="text-xs font-semibold text-slate-800">① โอกาสเกิด (Likelihood) — ระดับ 1–5</p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">จากอัตราการล้มเหลวของผลตรวจล่าสุดรายกฎ</p>
                          <table className="mt-2 w-full text-left text-[11px]">
                            <caption className="sr-only">ตารางระดับโอกาสเกิด 1–5 จากช่วงอัตราการล้มเหลว</caption>
                            <thead>
                              <tr className="text-[10px] text-muted-foreground">
                                <th scope="col" className="py-1 font-medium">ระดับ</th>
                                <th scope="col" className="py-1 text-right font-medium">อัตราการล้มเหลว</th>
                              </tr>
                            </thead>
                            <tbody>
                              {LIKELIHOOD_BANDS.map((band, i) => {
                                const isLast = i === LIKELIHOOD_BANDS.length - 1
                                const range = isLast
                                  ? `< ${Math.round(LIKELIHOOD_BANDS[i - 1].minFailRate * 100)}%`
                                  : `≥ ${Math.round(band.minFailRate * 100)}%`
                                return (
                                  <tr key={band.level} className="border-t">
                                    <td className="py-1.5">
                                      <span className="font-mono font-bold text-slate-700">{band.level}</span>
                                      <span className="ml-1.5 font-medium text-slate-800">{band.label}</span>
                                      <span className="ml-1 text-[10px] text-muted-foreground">{band.en}</span>
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-slate-700">{range}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">ยิ่งล้มเหลวมาก โอกาสเกิดยิ่งสูง</p>
                        </div>

                        {/* ② ผลกระทบ */}
                        <div className="rounded-lg border bg-white p-3">
                          <p className="text-xs font-semibold text-slate-800">② ผลกระทบ (Impact) — น้ำหนัก 2–5</p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">จากระดับความรุนแรง (severity) ของกฎ — ตั้ง/แก้ได้ใน Rule Builder</p>
                          <table className="mt-2 w-full text-left text-[11px]">
                            <caption className="sr-only">ตารางน้ำหนักผลกระทบตามระดับความรุนแรงของกฎ</caption>
                            <thead>
                              <tr className="text-[10px] text-muted-foreground">
                                <th scope="col" className="py-1 font-medium">ความรุนแรง</th>
                                <th scope="col" className="py-1 text-right font-medium">น้ำหนัก</th>
                              </tr>
                            </thead>
                            <tbody>
                              {SEVERITY_KEYS.map((s: SeverityKey) => (
                                <tr key={s} className="border-t">
                                  <td className="py-1.5">
                                    <Badge variant="outline" className={`text-[10px] font-medium ${SEVERITY_LABELS[s].className}`}>
                                      {s} · {SEVERITY_LABELS[s].th}
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 text-right font-mono font-bold text-slate-700">{SEVERITY_WEIGHT[s]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">ยิ่งรุนแรงสูง ผลกระทบทางธุรกิจยิ่งหนัก</p>
                        </div>

                        {/* ③ ระดับความเสี่ยง */}
                        <div className="rounded-lg border bg-white p-3">
                          <p className="text-xs font-semibold text-slate-800">③ ระดับความเสี่ยง (Risk Band) — คะแนน 2–25</p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">คะแนน = โอกาสเกิด × น้ำหนักผลกระทบ แล้วจัดระดับตามตารางนี้</p>
                          <table className="mt-2 w-full text-left text-[11px]">
                            <caption className="sr-only">ตารางจัดระดับความเสี่ยงจากคะแนน</caption>
                            <thead>
                              <tr className="text-[10px] text-muted-foreground">
                                <th scope="col" className="py-1 font-medium">ระดับ</th>
                                <th scope="col" className="py-1 text-right font-medium">ช่วงคะแนน</th>
                              </tr>
                            </thead>
                            <tbody>
                              {RISK_BANDS.map((band, i) => {
                                const isLast = i === RISK_BANDS.length - 1
                                return (
                                  <tr key={band.band} className="border-t">
                                    <td className="py-1.5">
                                      <Badge variant="outline" className={`text-[10px] font-medium ${band.className}`}>
                                        {band.label}
                                      </Badge>
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-slate-700">
                                      {isLast ? `< ${RISK_BANDS[i - 1].minScore}` : `≥ ${band.minScore}`}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">แถบสีตรงกับเซลล์ในแผนที่ความเสี่ยงด้านบน</p>
                        </div>
                      </div>

                      {/* สูตรสองมุมมอง */}
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[11px] leading-relaxed text-rose-900">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                          <span>
                            <strong>Inherent (ก่อนมีกฎ DQ)</strong> = สมมติโอกาสเกิดระดับ 5 (สูงมาก) × น้ำหนักความรุนแรง — ค่าความเสี่ยงสูงสุดหากยังไม่มีการควบคุม
                          </span>
                        </p>
                        <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] leading-relaxed text-emerald-900">
                          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span>
                            <strong>Residual (หลังมีกฎ DQ)</strong> = โอกาสจากอัตราการล้มเหลวจริงล่าสุด × น้ำหนักความรุนแรง — ยิ่งผ่านมาก ความเสี่ยงยิ่งลด
                          </span>
                        </p>
                      </div>

                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        นิยามเกณฑ์ทั้งหมดอยู่ใน <span className="font-mono">src/lib/regulation.ts</span> (LIKELIHOOD_BANDS · SEVERITY_WEIGHT · RISK_BANDS) —
                        ทุกหน้าจอและทุก API (analytics · compliance) ใช้ตรรกะชุดเดียวกัน จึงตรวจสอบย้อนได้ทุกตัวเลข · เป็นข้อมูลประกอบการตัดสินใจของมนุษย์เสมอ
                      </p>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* v0.25.0 — ① ML Anomaly Detection: ความผิดปกติข้ามรอบ (เรียนรู้ baseline จากประวัติจริง) */}
              <MlAnomalyPanel />

              {/* v0.25.0 — ④ ML Root Cause Clustering: สมมติฐานสาเหตุร่วมของรอบล่าสุด */}
              <MlClusterCard />

              {/* v0.27.0 — ③ ML Quality Trend Forecasting: พยากรณ์แนวโน้มอัตราล้มเหลว 1/3/5 รอบข้างหน้า */}
              <ForecastPanel />

              {/* v0.26.0 — ② Risk-based Sampling: จัดสรรงบการทบทวนตามความเสี่ยง */}
              <SamplingPanel users={users} />
            </div>
          )}

          {/* ================================================================ */}
          {/* ส่วนที่ 5 — Data Classification (การจำแนกประเภทข้อมูล)               */}
          {/* ================================================================ */}
          {section === 'classification' && (
            <div className="space-y-4">
              {/* เลือกผู้ดำเนินการ */}
              <Card className="border-slate-200">
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <Label htmlFor="cls-operator" className="text-xs text-muted-foreground">
                    ผู้ดำเนินการจำแนก (ต้องมีสิทธิ์จัดการชุดข้อมูล)
                  </Label>
                  <Select value={clsOperator} onValueChange={setClsOperator}>
                    <SelectTrigger id="cls-operator" className="h-8 w-[300px] text-xs">
                      <SelectValue placeholder="เลือกผู้ดำเนินการ" />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((u) => (
                        <SelectItem key={u.email} value={u.email} className="text-xs">
                          {u.name} · {ROLE_LIST.find((r) => r.key === u.role)?.th ?? u.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* การ์ด 11 ประเภท */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="radiogroup" aria-label="เลือกประเภทข้อมูล">
                {data.classification.categories.map((c) => {
                  const active = c.id === selectedCls
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedCls(c.id)}
                      className={`rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        active ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500' : 'bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-muted-foreground">{c.no}</p>
                          <p className={`truncate text-sm font-semibold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>{c.th}</p>
                          <p className="truncate text-[10.5px] text-muted-foreground" title={c.en}>
                            {c.en}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {c.datasetCount} ชุด
                          </Badge>
                          {c.avgScore !== null && (
                            <span className={`font-mono text-sm font-bold ${scoreColor(c.avgScore)}`}>{c.avgScore.toFixed(0)}</span>
                          )}
                        </div>
                      </div>
                      <p className="mt-1.5 truncate text-[10.5px] text-muted-foreground">{c.standards.length} มาตรฐานที่เกี่ยวข้อง</p>
                    </button>
                  )
                })}
              </div>

              {/* รายละเอียดประเภทที่เลือก — mapping กับมาตรฐาน */}
              {selectedCategory && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {selectedCategory.no} {selectedCategory.th} ({selectedCategory.en})
                    </CardTitle>
                    <CardDescription>{selectedCategory.description}</CardDescription>
                    {selectedCategory.impacts.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedCategory.impacts.map((im) => (
                          <Badge key={im} variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-normal text-amber-900">
                            ผลกระทบ: {im}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Mapping มาตรฐาน */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-700">มาตรฐานที่เกี่ยวข้อง — สถานะความครอบคลุมจากข้อมูลในระบบ</p>
                      <div className="space-y-2">
                        {selectedCategory.standards.map((s) => (
                          <div key={s.name} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-800">{s.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className={`text-[10px] ${s.className}`}>
                                  {s.label}
                                </Badge>
                                {s.score !== null && (
                                  <span className={`font-mono text-sm font-bold ${scoreColor(s.score)}`}>{s.score.toFixed(0)}</span>
                                )}
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {s.dimensions.map((d) => (
                                <DimensionBadge key={d} dimension={d} />
                              ))}
                              <span className="text-[10.5px] text-muted-foreground">· มีกฎครอบคลุม {s.rulesCount} ข้อ</span>
                            </div>
                            {s.score !== null && <ScoreBar score={s.score} className="mt-2" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ชุดข้อมูลในประเภทนี้ */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-700">ชุดข้อมูลที่จำแนกในประเภทนี้</p>
                      {selectedCategory.datasets.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                          ยังไม่มีชุดข้อมูลในประเภทนี้ — จำแนกจากแถวด้านล่างของหน้านี้
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {selectedCategory.datasets.map((d) => (
                            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium">{d.name}</p>
                                {d.score !== null && (
                                  <Badge variant="outline" className={`text-[10.5px] ${scoreColor(d.score)}`}>
                                    คะแนน {d.score.toFixed(0)}
                                  </Badge>
                                )}
                                {d.pendingSignals > 0 && (
                                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10.5px] text-amber-900">
                                    {d.pendingSignals} สัญญาณรอทบทวน
                                  </Badge>
                                )}
                                <span className="text-[11px] text-muted-foreground">{d.lastRunAt ? `รันล่าสุด ${fmtTime(d.lastRunAt)}` : 'ยังไม่เคยรัน'}</span>
                              </div>
                              <ClassificationEditor key={`${d.id}-${selectedCategory.id}`} datasetId={d.id} current={selectedCategory.id} busy={clsBusy} onSave={handleSetClassification} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ชุดข้อมูลที่ยังไม่จำแนก */}
              {data.classification.unclassified.length > 0 && (
                <Card className="border-amber-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">ชุดข้อมูลที่ยังไม่จำแนกประเภท</CardTitle>
                    <CardDescription>กำหนดประเภทข้อมูลเพื่อแมปกับมาตรฐานที่เกี่ยวข้อง (บันทึกใน Audit Trail ทุกครั้ง)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.classification.unclassified.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{d.name}</p>
                            <Badge variant="outline" className="text-[10px]">
                              {d.sourceType}
                            </Badge>
                            {d.score !== null && (
                              <Badge variant="outline" className={`text-[10.5px] ${scoreColor(d.score)}`}>
                                คะแนน {d.score.toFixed(0)}
                              </Badge>
                            )}
                          </div>
                          <ClassificationEditor key={`${d.id}-${UNCLASSIFIED}`} datasetId={d.id} current={UNCLASSIFIED} busy={clsBusy} onSave={handleSetClassification} />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <p className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                การจำแนกประเภท 11 ประเภท อ้างอิงจากกรอบที่องค์กรกำหนด (ธปท. · DAMA-DMBOK · DCAM · BCBS 239 · Thailand PDPA · PCI DSS ·
                SWIFT CSCF · ปปง./FATF · TFRS/IFRS · กฎหมายข้อมูลเครดิต · ISO 22301 · ISO/IEC 27001 · NIST CSF · หลักเกณฑ์ Outsourcing/Cloud) —
                สถานะความครอบคลุมคำนวณจากกฎที่เปิดใช้งานและผลรันตรวจล่าสุดของชุดข้อมูลในแต่ละประเภท
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* สีเซลล์แผนที่ความเสี่ยง */
const MATRIX_CELL: Record<string, string> = {
  CRITICAL: 'border-rose-700 bg-rose-600 text-white',
  HIGH: 'border-orange-500 bg-orange-400 text-white',
  MEDIUM: 'border-amber-300 bg-amber-200 text-amber-950',
  LOW: 'border-emerald-200 bg-emerald-100 text-emerald-900',
}

/* สีป้ายความเสี่ยงเล็กในส่วนรายละเอียดการตรวจ */
const SEVERITY_BADGE_SMALL: Record<string, string> = {
  CRITICAL: 'border-rose-200 bg-rose-50 text-rose-800',
  HIGH: 'border-orange-200 bg-orange-50 text-orange-800',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-900',
  LOW: 'border-slate-200 bg-slate-50 text-slate-600',
}

/** จัดเกรดฝั่ง client ตามเกณฑ์เดียวกันทั้งระบบ (lib/dama GRADE_DEFS) */
function gradeOfClient(score: number | null): { band: string; label: string; badgeClass: string; textClass: string } | null {
  if (score === null || Number.isNaN(score)) return null
  if (score >= 95) return { band: 'EXCELLENT', label: 'ดีเยี่ยม', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200', textClass: 'text-emerald-700' }
  if (score >= 85) return { band: 'GOOD', label: 'ดี', badgeClass: 'bg-teal-50 text-teal-800 border-teal-200', textClass: 'text-teal-700' }
  if (score >= 70) return { band: 'FAIR', label: 'ต้องปรับปรุง', badgeClass: 'bg-amber-50 text-amber-900 border-amber-200', textClass: 'text-amber-700' }
  return { band: 'POOR', label: 'วิกฤต', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200', textClass: 'text-rose-700' }
}

/* ==========================================================================
   ML Panels (v0.25.0) — ① Anomaly Detection + ④ Root Cause Clustering
   อ่านจาก /api/dq/ml/* — เกณฑ์ทุกตัวแสดงจากตารางค่าคงที่ src/lib/ml.ts โดยตรง
   (single source of truth เดียวกับที่ engine ใช้คำนวณ — anti-drift ต่อยอด v0.24.1)
   ========================================================================== */

/** โหลดผล ML แบบอิสระต่อแผง — loading/error จัดการในแผงของตัวเอง ไม่กระทบส่วนอื่นของแดชบอร์ด */
function useMlEvaluation(endpoint: 'anomalies' | 'clusters') {
  const [data, setData] = useState<MlEvaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dq/ml/${endpoint}`)
      const body = (await res.json().catch(() => ({}))) as MlEvaluation & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'โหลดผล ML ไม่สำเร็จ')
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดผล ML ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [endpoint])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loading, error, reload }
}

/** เกณฑ์ ML ปัจจุบันจาก /api/dq/ml/settings — แผงแสดงเกณฑ์เดียวกับที่ engine ใช้คำนวณ (v0.28.0) */
function useMlSettings(): MlSettings {
  const [s, setS] = useState<MlSettings>(DEFAULT_ML_SETTINGS)
  useEffect(() => {
    let live = true
    fetch('/api/dq/ml/settings')
      .then((r) => r.json())
      .then((b: { settings?: MlSettings }) => {
        if (live && b?.settings) setS(b.settings)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return s
}

/** ป้ายโหมดการประเมิน — โปร่งใสว่าตัวเลขมาจาก batch ที่บันทึกหรือโหมดสด */
function MlModeBadge({ mode, batchAt }: { mode: string; batchAt: string | null }) {
  if (mode === 'BATCH') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
        บันทึกจาก batch ล่าสุด · {fmtTime(batchAt)}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-900">
      โหมดสด — ยังไม่มี batch (ประเมินจากผลรันล่าสุดรายกฎ ไม่บันทึก)
    </Badge>
  )
}

/** กราฟประวัติอัตราล้มเหลว (SVG บริสุทธิ์ — ไม่พึ่งไลบรารีกราฟ) + เส้น baseline ประ */
function MlSparkline({ history, baseline }: { history: Array<{ failRate: number }>; baseline: number }) {
  const w = 120
  const h = 30
  const pad = 2
  const rates = history.map((p) => p.failRate)
  const max = Math.max(...rates, baseline, 0.05)
  const xOf = (i: number) => (rates.length > 1 ? pad + (i * (w - 2 * pad)) / (rates.length - 1) : w / 2)
  const yOf = (r: number) => h - pad - (r / max) * (h - 2 * pad)
  const points = rates.map((r, i) => `${xOf(i).toFixed(1)},${yOf(r).toFixed(1)}`).join(' ')
  const baseY = yOf(baseline).toFixed(1)
  const last = rates.length > 0 ? rates[rates.length - 1] : null
  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label={`ประวัติอัตราล้มเหลว ${rates.length} จุด เทียบ baseline ${(baseline * 100).toFixed(1)}%`}
      className="shrink-0"
    >
      <line x1={pad} x2={w - pad} y1={baseY} y2={baseY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
      {points && <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="1.5" strokeLinejoin="round" />}
      {last !== null && <circle cx={xOf(rates.length - 1)} cy={yOf(last)} r="2.5" fill={last > baseline ? '#e11d48' : '#0f766e'} />}
    </svg>
  )
}

/** ① ความผิดปกติข้ามรอบ — เรียนรู้ baseline รายกฎจากประวัติจริง (v0.25.0) */
function MlAnomalyPanel() {
  const { data, loading, error, reload } = useMlEvaluation('anomalies')
  const s = useMlSettings()
  const bands = zBandsOf(s)
  const anomalies = data?.anomalies ?? []
  const counts = {
    CRITICAL: anomalies.filter((a) => a.level === 'CRITICAL').length,
    HIGH: anomalies.filter((a) => a.level === 'HIGH').length,
    MEDIUM: anomalies.filter((a) => a.level === 'MEDIUM').length,
    BETTER: anomalies.filter((a) => a.better).length,
    NORMAL: anomalies.filter((a) => a.level === 'NORMAL' && !a.better).length,
    INSUFFICIENT: anomalies.filter((a) => a.level === 'INSUFFICIENT_HISTORY').length,
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <BrainCircuit className="h-4 w-4 text-teal-700" aria-hidden />
              ความผิดปกติข้ามรอบที่ ML ตรวจพบ (Anomaly Detection)
            </CardTitle>
            <CardDescription className="mt-1">
              เรียนรู้ baseline ของแต่ละกฎจากประวัติรันจริง — รอบที่อัตราล้มเหลวห่างจาก baseline เกินเกณฑ์จะถูกแจ้งเตือน
              แม้ยังไม่ทะลุ threshold เดิม (ML เป็นสัญญาณรอทบทวน ไม่ตัดสินแทนเกณฑ์ผ่าน/ไม่ผ่าน)
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" onClick={() => void reload()} aria-label="โหลดผลประเมิน ML ใหม่">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            โหลดใหม่
          </Button>
        </div>
        {data && <div className="pt-1">{<MlModeBadge mode={data.mode} batchAt={data.batchAt} />}</div>}
      </CardHeader>
      <CardContent>
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">กำลังประเมินความผิดปกติจากประวัติรัน…</p>}
        {error && !loading && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && data && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="สรุปจำนวนตามระดับ">
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">สูงมาก {counts.CRITICAL}</Badge>
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800">สูง {counts.HIGH}</Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">ปานกลาง {counts.MEDIUM}</Badge>
              {counts.BETTER > 0 && (
                <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-800">ดีขึ้นผิดปกติ {counts.BETTER}</Badge>
              )}
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">ปกติ {counts.NORMAL}</Badge>
              {counts.INSUFFICIENT > 0 && (
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">ยังไม่ประเมิน {counts.INSUFFICIENT}</Badge>
              )}
            </div>
            {anomalies.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีผลรันในระบบ — รัน validation แล้ว ML จะประเมินอัตโนมัติ</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1" role="list" aria-label="รายการความผิดปกติรายกฎ">
                {anomalies.map((a) => (
                  <MlAnomalyRow key={`${a.ruleId}-${a.datasetId}`} a={a} minHistory={s.mlMinHistory} />
                ))}
              </div>
            )}
            {/* เกณฑ์แสดงจาก settings ปัจจุบัน (v0.28.0) — สิ่งที่ engine ใช้คือสิ่งที่เห็นบนจอ ปรับได้ที่ศูนย์ ML */}
            <div className="mt-3 space-y-1.5 rounded-md bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] font-medium text-slate-700">
                เกณฑ์ระดับจากคะแนน z:{' '}
                {bands
                  .slice()
                  .reverse()
                  .map((z) => `z ≥ ${z.minZ} = ${z.label}`)
                  .join(' · ')}{' '}
                · ต่ำกว่า {bands[bands.length - 1].minZ} = ปกติ
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{mlFootnoteTh(s)}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ประเมินอัตโนมัติหลังรัน validation ทุกครั้ง — ระดับ สูง/สูงมาก ถูกส่งเข้ากล่องสัญญาณ (รอมนุษย์ทบทวน) ·
                นิยามอยู่ใน <span className="font-mono">src/lib/ml.ts</span> + <span className="font-mono">src/lib/ml-engine.ts</span> ตรวจย้อนได้ทุกตัวเลข
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MlAnomalyRow({ a, minHistory }: { a: AnomalyView; minHistory: number }) {
  const insufficient = a.level === 'INSUFFICIENT_HISTORY'
  return (
    <div role="listitem" className={`rounded-lg border p-3 ${insufficient ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10.5px] ${a.badgeClass}`}>
            {insufficient ? 'ยังไม่ประเมิน' : `${a.label} · z ${a.zScore.toFixed(1)}`}
          </Badge>
          <DimensionBadge dimension={a.dimension as DimensionKey} />
          <span className="truncate text-sm font-medium">{a.datasetName}</span>
          <span className="truncate text-xs text-muted-foreground">
            · {a.column} — {a.conditionName}
          </span>
        </div>
        {a.drift && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-900">
            <TrendingDown className="mr-1 h-3 w-3 rotate-180" aria-hidden />
            แนวโน้มแย่ลงต่อเนื่อง
          </Badge>
        )}
      </div>
      {insufficient ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          ประวัติไม่พอ — มี {a.windowSize}/{minHistory} รอบ (ระบบจะเริ่มประเมินเมื่อประวัติครบ {minHistory} รอบ เพื่อความน่าเชื่อถือของ baseline)
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            รอบนี้ <strong className="text-slate-900">{(a.failRate * 100).toFixed(1)}%</strong> · baseline {(a.baseline * 100).toFixed(1)}% (มัธยฐาน{' '}
            {a.windowSize} รอบ) · MAD {(a.mad * 100).toFixed(2)}%
            {a.better && (
              <span className="text-teal-700"> — อัตราล้มเหลวลดต่ำกว่ารูปแบบเดิมมาก (ไม่นับเป็นความเสี่ยง แต่แนะให้ตรวจว่าไม่ใช่ข้อมูลหาย)</span>
            )}
          </p>
          <MlSparkline history={a.history} baseline={a.baseline} />
        </div>
      )}
    </div>
  )
}

/** ④ สมมติฐานสาเหตุร่วม — จัดกลุ่ม exact-match ตามลายเซ็น (v0.25.0) */
function MlClusterCard() {
  const { data, loading, error, reload } = useMlEvaluation('clusters')
  const s = useMlSettings()
  const clusters = data?.clusters ?? []
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Network className="h-4 w-4 text-teal-700" aria-hidden />
              สมมติฐานสาเหตุร่วมของรอบล่าสุด (Root Cause Clustering)
            </CardTitle>
            <CardDescription className="mt-1">
              รวมความล้มเหลวของรอบด้วยลายเซ็น &quot;แหล่งข้อมูล · ชุดข้อมูล · มิติ&quot; แบบ exact-match — ทุกกลุ่มระบุสมาชิกได้ครบ
              (ตั้งใจไม่ใช้โมเดลกล่องดำ เพื่อให้ตรวจสอบย้อนได้ทุกกลุ่ม)
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" onClick={() => void reload()} aria-label="โหลดกลุ่มสาเหตุร่วมใหม่">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            โหลดใหม่
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <MlModeBadge mode={data.mode} batchAt={data.batchAt} />
            {data.totalFailedRows > 0 && (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-700">
                แถวล้มรวมรอบล่าสุด {data.totalFailedRows}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">กำลังจัดกลุ่มสาเหตุร่วม…</p>}
        {error && !loading && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && data && (
          <>
            {clusters.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีความล้มเหลวในรอบล่าสุด — ไม่มีอะไรให้จัดกลุ่ม (ผลดี)</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1" role="list" aria-label="กลุ่มสาเหตุร่วม">
                {clusters.map((c) => (
                  <MlClusterRow key={c.signatureKey} c={c} />
                ))}
              </div>
            )}
            <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              เกณฑ์เสนอสมมติฐาน: กลุ่มครอบ ≥ {Math.round(s.clusterShareMin * 100)}% ของความล้มเหลวทั้งรอบ (clusterShareMin — ปรับได้ที่ศูนย์ ML) ·
              นับแถวจากผลรันจริงรายกฎ — เป็นข้อเสนอให้มนุษย์เริ่มตรวจจุดที่ใช่ที่สุดก่อนเสมอ ไม่ใช่การสรุปสาเหตุแทนผู้เชี่ยวชาญ
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MlClusterRow({ c }: { c: ClusterView }) {
  return (
    <div role="listitem" className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-700">
            {c.sourceType || 'ไม่ระบุแหล่ง'}
          </Badge>
          <span className="truncate text-sm font-medium">{c.datasetName}</span>
          <span className="text-xs text-muted-foreground">· มิติ {c.dimensionTh}</span>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold text-rose-700">{c.sharePct.toFixed(0)}%</span>
      </div>
      <ScoreBar score={c.sharePct} className="mt-2" />
      <p className="mt-1.5 text-xs text-slate-600">
        แถวล้ม {c.groupFailedRows} จาก {c.totalFailedRows} ทั้งรอบ · สมาชิก {c.members.length} กฎ:{' '}
        {c.members.slice(0, 4).map((m) => `${m.column} (${m.failedRows} แถว)`).join(' · ')}
        {c.members.length > 4 ? ` · +${c.members.length - 4} กฎ` : ''}
      </p>
      {c.hypothesis && (
        <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-900">
          {c.hypothesis}
        </p>
      )}
    </div>
  )
}

/** ③ พยากรณ์แนวโน้มคุณภาพข้อมูล — linear trend ของอัตราล้มเหลว 10 รอบล่าสุด → คาด 1/3/5 รอบข้างหน้า (v0.27.0) */
function useForecastData() {
  const [data, setData] = useState<ForecastEvaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dq/ml/forecasts')
      const body = (await res.json().catch(() => ({}))) as ForecastEvaluation & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'โหลดผลพยากรณ์ไม่สำเร็จ')
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดผลพยากรณ์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loading, error, reload }
}

function ForecastPanel() {
  const { data, loading, error, reload } = useForecastData()
  const s = useMlSettings()
  const rows = data?.forecasts ?? []
  const counts = {
    WORSE: rows.filter((f) => f.direction.key === 'WORSE').length,
    BETTER: rows.filter((f) => f.direction.key === 'BETTER').length,
    STABLE: rows.filter((f) => f.direction.key === 'STABLE' && f.windowSize >= s.mlMinHistory).length,
    SIGNAL: rows.filter((f) => f.signalLevel !== null).length,
    INSUFFICIENT: rows.filter((f) => f.windowSize < s.mlMinHistory).length,
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-teal-700" aria-hidden />
              พยากรณ์แนวโน้มคุณภาพข้อมูล (Quality Trend Forecasting)
            </CardTitle>
            <CardDescription className="mt-1">
              ต่อยอดเส้น trend เดิมของ ML — คาดอัตราล้มเหลวของแต่ละกฎในอีก 1/3/5 รอบข้างหน้าจากความชันของ 10 รอบล่าสุด
              เพื่อให้มนุษย์ลงมือก่อนที่คุณภาพจะแย่ถึง threshold (พยากรณ์เป็นสัญญาณล่วงหน้า ไม่ตัดสินแทนเกณฑ์ผ่าน/ไม่ผ่าน)
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" onClick={() => void reload()} aria-label="โหลดผลพยากรณ์ใหม่">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            โหลดใหม่
          </Button>
        </div>
        {data && <div className="pt-1">{<MlModeBadge mode={data.mode} batchAt={data.batchAt} />}</div>}
      </CardHeader>
      <CardContent>
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">กำลังพยากรณ์แนวโน้มจากประวัติรัน…</p>}
        {error && !loading && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && data && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="สรุปจำนวนตามทิศทางของแนวโน้ม">
              {counts.WORSE > 0 && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">แย่ลง {counts.WORSE}</Badge>}
              {counts.BETTER > 0 && <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-800">ดีขึ้น {counts.BETTER}</Badge>}
              {counts.STABLE > 0 && <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">ทรงตัว {counts.STABLE}</Badge>}
              {counts.SIGNAL > 0 && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">สัญญาณล่วงหน้า {counts.SIGNAL}</Badge>}
              {counts.INSUFFICIENT > 0 && <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">ยังไม่พอประเมิน {counts.INSUFFICIENT}</Badge>}
            </div>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีผลรันในระบบ — รัน validation แล้วระบบจะพยากรณ์อัตโนมัติ</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1" role="list" aria-label="รายการพยากรณ์แนวโน้มรายกฎ">
                {rows.map((f) => (
                  <ForecastRow key={`${f.ruleId}-${f.datasetId}`} f={f} minHistory={s.mlMinHistory} />
                ))}
              </div>
            )}
            {/* เกณฑ์แสดงจาก settings ปัจจุบัน (v0.28.0) — สิ่งที่ engine ใช้คือสิ่งที่เห็นบนจอ ปรับได้ที่ศูนย์ ML */}
            <div className="mt-3 space-y-1.5 rounded-md bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">{forecastFootnoteTh(s)}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ส่งสัญญาณล่วงหน้า (kind <span className="font-mono">ML_FORECAST</span>) เฉพาะ: ทิศแย่ลง · R² ≥ {s.driftR2Min} · ค่าคาดรอบถัดไปอยู่แถวโอกาสขั้นต่ำ{' '}
                {s.fMinSignalBand} (ปานกลาง = ≥ 10% ตาม LIKELIHOOD_BANDS) — ระดับสัญญาณจากแถวโอกาสของค่าคาด (แถว 5 = วิกฤต / 4 = สูง / 3 = ปานกลาง)
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                พยากรณ์อัตโนมัติหลังรัน validation ทุกครั้ง — นิยามอยู่ใน <span className="font-mono">src/lib/forecast.ts</span> +{' '}
                <span className="font-mono">src/lib/forecast-engine.ts</span> ตรวจย้อนได้ทุกตัวเลข
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ForecastRow({ f, minHistory }: { f: ForecastView; minHistory: number }) {
  const insufficient = f.windowSize < minHistory
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`)
  const slopePct = (f.slope * 100).toFixed(2)
  return (
    <div role="listitem" className={`rounded-lg border p-3 ${insufficient ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10.5px] ${f.direction.badgeClass}`}>
            {f.direction.key === 'WORSE' ? (
              <TrendingUp className="mr-1 h-3 w-3" aria-hidden />
            ) : f.direction.key === 'BETTER' ? (
              <TrendingDown className="mr-1 h-3 w-3" aria-hidden />
            ) : (
              <Minus className="mr-1 h-3 w-3" aria-hidden />
            )}
            {f.direction.label}
          </Badge>
          <Badge variant="outline" className={`text-[10.5px] ${f.confidence.badgeClass}`}>
            {f.confidence.label} · R² {f.r2.toFixed(2)}
          </Badge>
          <DimensionBadge dimension={f.dimension as DimensionKey} />
          <span className="truncate text-sm font-medium">{f.datasetName}</span>
          <span className="truncate text-xs text-muted-foreground">
            · {f.column} — {f.conditionName}
          </span>
        </div>
        {f.signalLevel && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-900">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
            สัญญาณล่วงหน้า: {f.signalLevel === 'CRITICAL' ? 'วิกฤต' : f.signalLevel === 'HIGH' ? 'สูง' : 'ปานกลาง'}
          </Badge>
        )}
      </div>
      {insufficient ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          ประวัติไม่พอ — มี {f.windowSize}/{minHistory} รอบ (ระบบจะเริ่มพยากรณ์เมื่อประวัติครบ {minHistory} รอบ เพื่อความน่าเชื่อถือของเส้น trend)
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            รอบนี้ <strong className="text-slate-900">{pct(f.failRate)}</strong> → คาดรอบถัดไป{' '}
            <strong className={f.direction.key === 'WORSE' ? 'text-rose-700' : 'text-slate-900'}>{pct(f.forecasts[1])}</strong> · อีก 3 รอบ {pct(f.forecasts[3])} · อีก 5 รอบ{' '}
            {pct(f.forecasts[5])} · ความชัน {f.slope >= 0 ? '+' : ''}
            {slopePct} จุด% ต่อรอบ (หน้าต่าง {f.windowSize} รอบ)
          </p>
          <ForecastSparkline history={f.history} forecasts={f.forecasts} direction={f.direction.key} />
        </div>
      )}
    </div>
  )
}

/** กราฟประวัติ + เส้น projection ถึงจุดคาด 1/3/5 รอบ (SVG บริสุทธิ์ — สีตามทิศทางของแนวโน้ม) */
function ForecastSparkline({ history, forecasts, direction }: { history: Array<{ failRate: number }>; forecasts: ForecastHorizons; direction: string }) {
  const w = 150
  const h = 30
  const pad = 2
  const rates = history.map((p) => p.failRate)
  const n = rates.length
  const lastIndex = n - 1
  const proj = [1, 3, 5]
    .map((k) => ({ k, i: lastIndex + k, rate: forecasts[k as 1 | 3 | 5] }))
    .filter((p): p is { k: number; i: number; rate: number } => p.rate !== null)
  const maxI = lastIndex + 5
  const max = Math.max(...rates, ...proj.map((p) => p.rate), 0.05)
  const xOf = (i: number) => pad + (i * (w - 2 * pad)) / maxI
  const yOf = (r: number) => h - pad - (r / max) * (h - 2 * pad)
  const histPoints = rates.map((r, i) => `${xOf(i).toFixed(1)},${yOf(r).toFixed(1)}`).join(' ')
  const projPoints = [...(n > 0 ? [{ i: lastIndex, rate: rates[lastIndex] }] : []), ...proj]
    .map((p) => `${xOf(p.i).toFixed(1)},${yOf(p.rate).toFixed(1)}`)
    .join(' ')
  const color = direction === 'WORSE' ? '#e11d48' : direction === 'BETTER' ? '#0f766e' : '#64748b'
  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label={`ประวัติอัตราล้มเหลว ${n} จุด + จุดคาดอีก ${proj.length} จุด (1/3/5 รอบ) — แนวโน้ม${direction === 'WORSE' ? 'แย่ลง' : direction === 'BETTER' ? 'ดีขึ้น' : 'ทรงตัว'}`}
      className="shrink-0"
    >
      {histPoints && <polyline points={histPoints} fill="none" stroke="#0f766e" strokeWidth="1.5" strokeLinejoin="round" />}
      {projPoints && <polyline points={projPoints} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" strokeLinejoin="round" />}
      {proj.map((p) => (
        <circle key={p.k} cx={xOf(p.i)} cy={yOf(p.rate)} r="2.5" fill={color} />
      ))}
    </svg>
  )
}

/** ② แผนสุ่มตรวจตามความเสี่ยง — จัดสรรงบการทบทวนรายกฎ×ชุดข้อมูล สุ่มแบบทำซ้ำได้ (v0.26.0) */
function SamplingPanel({ users }: { users: DashUser[] }) {
  const { toast } = useToast()
  const reviewRoles = useMemo(() => rolesWithPermission('REVIEW_SIGNALS').map((r) => r.key), [])
  const [operator, setOperator] = useState('')
  const [policy, setPolicy] = useState<'FULL' | 'P10' | 'P5' | 'P1'>('P10')
  const [plan, setPlan] = useState<SamplePlanView | null>(null)
  const [planMessage, setPlanMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ผู้ดำเนินการเริ่มต้น — บัญชีแรกที่ ACTIVE และมีสิทธิ์ REVIEW_SIGNALS
  useEffect(() => {
    if (operator) return
    const first = users.find((u) => u.status !== 'SUSPENDED' && reviewRoles.includes(u.role as RoleKey))
    if (first) setOperator(first.email)
  }, [users, reviewRoles, operator])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dq/sampling')
      const body = (await res.json().catch(() => ({}))) as { plan: SamplePlanView | null; message?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'โหลดแผนสุ่มตรวจไม่สำเร็จ')
      setPlan(body.plan)
      setPlanMessage(body.plan ? null : (body.message ?? 'ยังไม่ได้สร้างแผนสุ่มตรวจสำหรับรอบนี้'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดแผนสุ่มตรวจไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    if (!operator) {
      toast({ title: 'กรุณาเลือกผู้ดำเนินการ (ต้องมีสิทธิ์ทบทวนสัญญาณ)', variant: 'destructive' })
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/dq/sampling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: operator, policy }),
      })
      const body = (await res.json().catch(() => ({}))) as { plan: SamplePlanView | null; message?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setPlan(body.plan)
      if (body.plan) {
        setPlanMessage(null)
        toast({
          title: 'สร้างแผนสุ่มตรวจแล้ว',
          description: `นโยบาย ${body.plan.policyLabel} — งบ ${body.plan.summary.budgetRows} แถว · ครอบคลุมความเสี่ยง ${body.plan.summary.riskCoveragePct}%`,
        })
      } else {
        setPlanMessage(body.message ?? 'สร้างแผนไม่สำเร็จ')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'สร้างแผนสุ่มตรวจไม่สำเร็จ'
      setError(msg)
      toast({ title: 'สร้างแผนสุ่มตรวจไม่สำเร็จ', description: msg, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const s = plan?.summary
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-teal-700" aria-hidden />
              แผนสุ่มตรวจตามความเสี่ยง (Risk-based Sampling)
            </CardTitle>
            <CardDescription className="mt-1">
              เมื่อแถวที่ล้มเหลวมีมากจนทบทวนไม่ไหว — ระบบจัดสรร &quot;งบการทบทวน&quot; ให้กลุ่มที่ความเสี่ยงสูงสุดก่อน
              (validation ยังรันตรวจครบทุกแถวเหมือนเดิม แผนนี้ช่วยตอบว่า &quot;มนุษย์ควรเปิดดูแถวไหนก่อน&quot; เท่านั้น)
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1 text-xs"
            onClick={() => void load()}
            aria-label="โหลดแผนสุ่มตรวจใหม่"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            โหลดใหม่
          </Button>
        </div>
        {plan && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
              บันทึกจาก batch ล่าสุด · {fmtTime(plan.batchAt)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-700">
              นโยบาย {plan.policyLabel}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* ตัวเลือกนโยบาย + ผู้ดำเนินการ (ตาม RBAC — REVIEW_SIGNALS) */}
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="เลือกนโยบายงบการทบทวน">
          {SAMPLING_POLICIES.map((p) => (
            <Button
              key={p.key}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={policy === p.key}
              className={`h-8 gap-1 text-xs ${policy === p.key ? 'border-teal-500 bg-teal-50 text-teal-900 ring-1 ring-teal-500' : ''}`}
              onClick={() => setPolicy(p.key)}
            >
              {p.label}
            </Button>
          ))}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Select value={operator} onValueChange={setOperator}>
              <SelectTrigger aria-label="ผู้ดำเนินการสร้างแผน (ต้องมีสิทธิ์ทบทวนสัญญาณ)" className="h-8 w-[280px] text-xs">
                <SelectValue placeholder="เลือกผู้ดำเนินการ" />
              </SelectTrigger>
              <SelectContent>
                {users
                  .filter((u) => u.status !== 'SUSPENDED' && reviewRoles.includes(u.role as RoleKey))
                  .map((u) => (
                    <SelectItem key={u.email} value={u.email} className="text-xs">
                      {u.name} ({ROLE_LIST.find((r) => r.key === u.role)?.th ?? u.role})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => void generate()} disabled={generating}>
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              {generating ? 'กำลังสร้างแผน…' : 'สร้างแผนสุ่มตรวจ'}
            </Button>
          </div>
        </div>

        {loading && <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลดแผนสุ่มตรวจ…</p>}
        {error && !loading && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && !plan && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-muted-foreground">
            {planMessage ?? 'ยังไม่ได้สร้างแผนสุ่มตรวจสำหรับรอบนี้ — เลือกนโยบายแล้วกด "สร้างแผนสุ่มตรวจ"'}
          </div>
        )}
        {!loading && !error && plan && s && (
          <>
            {/* สรุปงบการทบทวน */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="สรุปงบการทบทวน">
              <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-900">
                งบทบทวน {s.budgetRows} แถว
              </Badge>
              <Badge variant="outline" className="max-w-full whitespace-normal border-slate-200 bg-slate-50 text-slate-700">
                แถวล้มทั้งรอบ {s.totalFailedRows} · เก็บทบทวนได้ {s.reviewableRows} (จำกัด snapshot 200 แถว/กฎ)
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                กลุ่มที่รวม {s.includedGroups}/{s.totalGroups}
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                ครอบคลุมความเสี่ยง {s.riskCoveragePct}%
              </Badge>
            </div>

            {plan.groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีกลุ่มความล้มเหลวให้จัดสรร (ผลดี)</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1" role="list" aria-label="รายการกลุ่มตามความเสี่ยง">
                {plan.groups.map((g) => (
                  <SamplingGroupRow key={`${g.ruleId}-${g.datasetId}`} g={g} />
                ))}
              </div>
            )}

            {/* เกณฑ์แสดงจากตารางค่าคงที่ src/lib/sampling.ts โดยตรง — สิ่งที่ engine ใช้คือสิ่งที่เห็นบนจอ */}
            <div className="mt-3 space-y-1.5 rounded-md bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] font-medium text-slate-700">
                วิธีจัดสรร: <span className="font-mono">{SAMPLING_METHOD}</span> · เพดานคะแนน {RISK_SCORE_MAX}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{SAMPLING_FOOTNOTE_TH}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                สุ่มรายแถวแบบทำซ้ำได้ (seed จาก batch + นโยบาย + กลุ่ม) — สร้างแผนซ้ำด้วยนโยบายเดิมเมื่อสถานะแถวไม่เปลี่ยน จะได้ชุดแถวเดิมเป๊ะ
                ตรวจย้อนได้ · แถวที่ถูกเลือกมีสถานะ NEW ก่อนเสมอ · นิยามอยู่ใน{' '}
                <span className="font-mono">src/lib/sampling.ts</span> + <span className="font-mono">src/lib/sampling-engine.ts</span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SamplingGroupRow({ g }: { g: SamplePlanView['groups'][number] }) {
  const f = g.factors
  const boosts = [
    f.mlBoost > 0 ? `ML +${f.mlBoost}` : '',
    f.driftBoost > 0 ? `แนวโน้มแย่ลง +${f.driftBoost}` : '',
    f.piiBoost > 0 ? `PII +${f.piiBoost}` : '',
  ].filter(Boolean)
  const rowNos = g.picked.map((p) => p.rowNo)
  return (
    <div role="listitem" className={`rounded-lg border p-3 ${g.included ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10.5px] ${g.riskBand.className}`}>
            {g.riskBand.label} · {g.riskScore}/{RISK_SCORE_MAX}
          </Badge>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
            {g.sourceType || 'ไม่ระบุแหล่ง'}
          </Badge>
          <span className="truncate text-sm font-medium">{g.datasetName}</span>
          <span className="truncate text-xs text-muted-foreground">
            · {g.column} — {g.conditionName} · มิติ{g.dimensionTh}
          </span>
        </div>
        {g.included ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
            สุ่มให้ทบทวน {g.sampleSize} แถว
          </Badge>
        ) : (
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">
            ไม่ได้อยู่ในงบนี้
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2" aria-label={`คะแนนความเสี่ยง ${g.riskScore} จาก ${RISK_SCORE_MAX}`}>
        <div className="h-2 min-w-10 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, (g.riskScore / RISK_SCORE_MAX) * 100)}%` }} />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-slate-600">
        คะแนน = โอกาส {f.likelihood} ({f.likelihoodLabel}) × ผลกระทบ {f.impact} ({g.severity})
        {boosts.length > 0 && <span className="text-amber-800"> + {boosts.join(' · ')}</span>} · อัตราล้มเหลว{' '}
        {(g.failRate * 100).toFixed(1)}%
      </p>
      <p className="mt-0.5 text-xs text-slate-600">
        แถวล้ม {g.failedRows} · เก็บทบทวนได้ {g.reviewableRows} แถว
        {g.included && g.picked.length > 0 && (
          <>
            {' '}
            · สถานะแถวที่เลือก: NEW {g.statusCounts.NEW} / FIXED {g.statusCounts.FIXED} / IGNORED {g.statusCounts.IGNORED} · แถวที่เลือก:{' '}
            {rowNos.slice(0, 6).map((n) => `#${n}`).join(', ')}
            {rowNos.length > 6 ? ` … +${rowNos.length - 6}` : ''}
          </>
        )}
      </p>
    </div>
  )
}
