'use client'

/**
 * DQ Dashboard — แดชบอร์ดคุณภาพข้อมูล 5 ส่วน (v0.10.0 · v0.32.0 ยุบหมวด ML ไปที่ศูนย์ ML จุดเดียว)
 * 1) ภาพรวมทั้งหมดของ Data Quality (คะแนนรวม + มาตรา 1–9 + ต่อชุดข้อมูล + PII masking)
 * 2) รายละเอียดการตรวจ Data Quality (ผลรันล่าสุดรายกฎ + คำตัดสินตามมาตรา + คำแนะนำ)
 * 3) Regulation — กรอบมาตรฐาน 5 กรอบ (DAMA-DMBOK / ISO/IEC 25012 / ISO 8000 / ISO/IEC 25024 / ISO/IEC 11179)
 *    เลือกแตกย่อยได้ และเลือก data source เพื่อประเมินสถานะจากข้อมูลจริงในระบบ
 * 4) Risk — ความเสี่ยงในมุม Data Quality Impact (โอกาส × ผลกระทบ + แผนที่ความเสี่ยง + ผลกระทบธุรกิจ)
 *    + การ์ดลิงก์ไป "ศูนย์ ML" (สัญญาณ ML ทั้ง 4 ตัว + ปรับเกณฑ์ อยู่ที่นั่นจุดเดียว — v0.32.0)
 * 5) Data Classification — การจำแนกข้อมูล 11 ประเภท และ mapping กับมาตรฐาน (ธปท./BCBS 239/PDPA/PCI DSS/ฯลฯ)
 * ข้อมูลทั้งหมดมาจาก /api/dq/analytics — คำนวณจากผลรันตรวจล่าสุดของทุกกฎที่เปิดใช้งาน
 * มุมมองบทบาท/ผู้ดำเนินการ = ผู้ใช้ปัจจุบันจาก UserSwitcher บน header (v0.32.0 — identity ศูนย์กลาง)
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
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'
import { DIMENSION_ICONS, DimensionBadge } from '@/components/dimension-picker'
import { type RoleKey } from '@/lib/rbac'
import { SEVERITY_KEYS, SEVERITY_LABELS, rolesWithPermission, type DimensionKey, type SeverityKey } from '@/lib/dq'
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
  status: 'PASSED' | 'FAILED' | 'NO_DATA'
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
      activeExceptions: number
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
  NO_DATA: 'bg-amber-50 text-amber-800 border-amber-200',
}

const STATUS_LABEL: Record<string, string> = { PASSED: 'ผ่าน', FAILED: 'ไม่ผ่าน', NO_DATA: 'ไม่มีข้อมูล (0 แถว)' }

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
  reloadTick: number
  onRefetch: () => void
  /** v0.32.0 — ลิงก์ไปศูนย์ ML (ML ทั้ง 4 ตัวอยู่ที่นั่นจุดเดียว — ลดความซ้ำซ้อน) */
  onGoMlCenter: () => void
  /** v0.34.0 — ลิงก์ไปประเมินความสอดคล้อง (ความเสี่ยงรายมาตรฐานย้ายไปรวมที่นั่นจุดเดียว) */
  onGoCompliance: () => void
}

export default function DqDashboard({ datasets, reloadTick, onRefetch, onGoMlCenter, onGoCompliance }: DqDashboardProps) {
  const { toast } = useToast()
  const { user } = useCurrentUser()
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

  // section 4 — risk (v0.34.0 — แท็บ "รายมาตรฐาน" ย้ายไปรวมที่เมนู ประเมินความสอดคล้อง จุดเดียว)
  const [riskScope, setRiskScope] = useState<'dimension' | 'classification'>('dimension')
  const [matrixView, setMatrixView] = useState<'residual' | 'inherent'>('residual')
  const [methodologyOpen, setMethodologyOpen] = useState(true)

  // section 5 — classification (ผู้ดำเนินการ = ผู้ใช้ปัจจุบันของระบบ — v0.32.0)
  const [selectedCls, setSelectedCls] = useState(DATA_CLASSIFICATIONS[0]?.id ?? 'DATA_GOVERNANCE')
  const [clsBusy, setClsBusy] = useState(false)

  // PII masking demo (ส่วนภาพรวม) — บทบาทผู้ชม = ผู้ใช้ปัจจุบัน (v0.32.0)
  const [previewDataset, setPreviewDataset] = useState('')
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

  // PII preview (ภาพรวม) — บทบาทผู้ชมอ่านฝั่ง backend จาก session ผู้เข้าสู่ระบบ (v0.34.0 — client ไม่ส่ง role)
  useEffect(() => {
    if (!previewDataset || !user) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/dq/sample-preview?datasetId=${encodeURIComponent(previewDataset)}`)
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
  }, [previewDataset, user])

  /* ------------------------------ actions -------------------------------- */

  async function handleSetClassification(datasetId: string, value: string) {
    setClsBusy(true)
    try {
      const res = await fetch('/api/dq/classification', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, classification: value, operatorEmail: user?.email ?? '' }),
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

  /** ความเสี่ยงรายมาตรฐาน (ใช้บนการ์ดเลือกกรอบของส่วน Regulation — v0.34.0 ยุบส่วนแสดงซ้ำออก) */
  const fwRiskMap = useMemo(() => {
    const m = new Map<string, RiskInherentSummary['byFramework'][number]>()
    for (const row of inherent?.byFramework ?? []) m.set(row.frameworkId, row)
    return m
  }, [inherent])

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

  /** v0.34.0 — ความเสี่ยงรวมรายประเภทข้อมูล (แท็บ "รายประเภทข้อมูล" ของส่วน Risk — เนื้อหาต่างจากแท็บรายมิติ DQ) */
  const clsRiskRows = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; no: string; th: string; count: number; maxScore: number; maxBand: { band: string; label: string; className: string }; failedRows: number; top: RiskItem | null }
    >()
    for (const item of data?.risks.items ?? []) {
      const label = classificationLabel(item.classification ?? '')
      const band = riskBandOf(item.riskScore)
      const g = groups.get(label.th)
      if (g) {
        g.count += 1
        if (item.riskScore > g.maxScore) {
          g.maxScore = item.riskScore
          g.maxBand = { band: band.band, label: band.label, className: band.className }
          g.top = item
        }
        g.failedRows += item.failedRows
      } else {
        groups.set(label.th, { id: item.classification ?? UNCLASSIFIED, no: label.no, th: label.th, count: 1, maxScore: item.riskScore, maxBand: { band: band.band, label: band.label, className: band.className }, failedRows: item.failedRows, top: item })
      }
    }
    return [...groups.values()].sort((a, b) => b.maxScore - a.maxScore)
  }, [data])

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
                  { label: 'คำแนะนำ ML ที่เปิดอยู่', value: data.overall.totals.pendingSignals, accent: 'text-amber-700' },
                  { label: 'ข้อยกเว้นใช้งานอยู่', value: data.overall.totals.activeExceptions, accent: 'text-emerald-700' },
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
                                    {d.pendingSignals} คำแนะนำ
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
                    ตัวอย่างการปิดบัง PII (Live — ฝั่งเซิร์ฟเวอร์)
                  </CardTitle>
                  <CardDescription>
                    ข้อมูลส่วนบุคคลถูกปิดบังเป็นค่าเริ่มต้น — ตั้งแต่ v0.34.0 เห็นข้อมูลจริงได้
                    <strong className="text-slate-700">เฉพาะเจ้าของข้อมูล (Data Owner) เท่านั้น</strong> ตามหลัก least privilege สอดคล้อง PDPA
                    (ตรวจบทบาทจาก session ผู้เข้าสู่ระบบฝั่ง backend — client ปลอมไม่ได้)
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
                      {/* v0.34.0 — บทบาทผู้ชม PII อ่านจาก session ผู้เข้าสู่ระบบ (เจ้าของข้อมูลเท่านั้นที่เห็น PII) */}
                      <Label htmlFor="pv-role">มุมมองผู้ใช้ปัจจุบัน</Label>
                      <div
                        id="pv-role"
                        className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground"
                      >
                        <UserRound className="size-3.5 text-emerald-700" aria-hidden="true" />
                        <span className="truncate">
                          {user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลดผู้ใช้…'}
                        </span>
                      </div>
                      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                        บทบาทมาจากบัญชีที่เข้าสู่ระบบ (มุมขวาบนของระบบ) — มีเฉพาะบทบาท “เจ้าของข้อมูล” (Data Owner)
                        ที่เห็นข้อมูลส่วนบุคคลแบบไม่ปิดบัง · บทบาทอื่นทั้งหมดเห็นเวอร์ชันปิดบังเสมอ
                      </p>
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
                          ปิดบัง PII อยู่ — เห็นข้อมูลส่วนบุคคลได้เฉพาะเจ้าของข้อมูล (Data Owner) เท่านั้น
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                          แสดงข้อมูลจริง — คุณเข้าสู่ระบบด้วยบทบาทเจ้าของข้อมูล (บทบาทเดียวที่มีสิทธิ์เห็น PII)
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
                    {data.latestRuns.some((r) => r.status === 'NO_DATA') && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        ไม่มีข้อมูล {data.latestRuns.filter((r) => r.status === 'NO_DATA').length}
                      </Badge>
                    )}
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
                          {r.status !== 'NO_DATA' && <ScoreBar score={r.passRate * 100} className="max-w-48" />}
                          {r.status !== 'NO_DATA' && (
                            <span className={`font-mono font-semibold ${scoreColor(r.passRate * 100)}`}>
                              {(r.passRate * 100).toFixed(0)}%
                            </span>
                          )}
                          <span className="text-muted-foreground">ล้มเหลว {r.failedRows} จาก {r.totalRows} แถว</span>
                          {r.status === 'FAILED' && (
                            <Badge variant="outline" className={`text-[10.5px] ${SEVERITY_BADGE_SMALL[r.riskBand] ?? 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                              ความเสี่ยง {r.riskScore} ({r.riskBand === 'CRITICAL' ? 'สูงมาก' : r.riskBand === 'HIGH' ? 'สูง' : r.riskBand === 'MEDIUM' ? 'ปานกลาง' : 'ต่ำ'})
                            </Badge>
                          )}
                        </div>
                        <p className={`mt-1.5 text-xs leading-relaxed ${r.status === 'FAILED' ? 'text-rose-800' : r.status === 'NO_DATA' ? 'text-amber-800' : 'text-emerald-800'}`}>
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
              {/* v0.34.0 — เลือกกรอบมาตรฐานจุดเดียว: การ์ดเดียวรวมคะแนนรวมถ่วงน้ำหนัก + ความเสี่ยง Inherent→Residual
                  (เดิมมีการแสดงมาตรฐานซ้ำ 2 จุด: การ์ดเลือกด้านบน + ส่วน "ประเมินความเสี่ยงที่อ้างอิงตามแต่ละมาตรฐาน" — ยุบรวมตาม feedback ผู้ใช้) */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="เลือกกรอบมาตรฐาน">
                {regFws.map((f) => {
                  const active = f.id === fwId
                  const rk = fwRiskMap.get(f.id)
                  const bandIH = rk ? riskBandOf(rk.inherentAvg) : null
                  const bandRS = rk ? riskBandOf(rk.residualAvg) : null
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
                      {/* ความเสี่ยง Inherent → Residual ของมาตรฐานนี้ (จากกฎ DQ ที่แมปกับมาตรฐาน) */}
                      {rk && bandIH && bandRS ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${bandIH.className}`}
                            title={`Inherent ระดับ${bandIH.label} (คะแนน ${rk.inherentAvg.toFixed(1)}/25)`}
                          >
                            {bandIH.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10.5px] font-semibold text-rose-700">{rk.inherentAvg.toFixed(1)}</span>
                          <ArrowRight className="size-3 shrink-0 text-slate-400" aria-hidden="true" />
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${bandRS.className}`}
                            title={`Residual ระดับ${bandRS.label} (คะแนน ${rk.residualAvg.toFixed(1)}/25)`}
                          >
                            {bandRS.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10.5px] font-bold text-emerald-700">{rk.residualAvg.toFixed(1)}</span>
                          <span className="shrink-0 text-[9.5px] text-slate-400">/25</span>
                          {rk.reductionPct > 0 ? (
                            <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 font-mono text-[10px] text-emerald-800">
                              −{Math.round(rk.reductionPct)}%
                            </Badge>
                          ) : rk.reductionPct < 0 ? (
                            <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-900">
                              +{Math.round(-rk.reductionPct)}%
                            </Badge>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[10px] text-muted-foreground">ความเสี่ยง: ยังไม่มีกฎแมปมาตรฐานนี้</p>
                      )}
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
                  {/* v0.34.0 — ส่วน "ประเมินความเสี่ยงที่อ้างอิงตามแต่ละมาตรฐาน" ถูกยุบรวมเข้าการ์ดเลือกกรอบด้านบน (แก้มาตรฐานซ้ำ 2 จุด)
                      และความเสี่ยงรายมาตรฐานเจาะลึกรายข้ออยู่ที่เมนู "ประเมินความสอดคล้อง" จุดเดียว */}
                  <p className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    คะแนนความเสี่ยง Inherent→Residual รายมาตรฐานแสดงบนการ์ดเลือกด้านบน · เจาะลึกรายข้อกำหนดพร้อมประวัติผลรันที่เมนู{' '}
                    <span className="font-medium text-slate-700">ภาพรวม → ประเมินความสอดคล้อง</span> (จุดเดียวของระบบ) — ระดับความเสี่ยง: สูงมาก ≥15 · สูง ≥8 · ปานกลาง ≥4 · ต่ำ &lt;4 ตามเกณฑ์ใน{' '}
                    <span className="font-mono">lib/regulation.ts</span>
                  </p>

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
                  {/* v0.34.0 — ลิงก์ไปความเสี่ยงรายมาตรฐานที่เมนู ประเมินความสอดคล้อง (จุดเดียว แทนแท็บรายมาตรฐานเดิม) */}
                  <button
                    type="button"
                    onClick={onGoCompliance}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10.5px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label="ไปที่เมนู ประเมินความสอดคล้อง — ความเสี่ยงรายมาตรฐาน"
                  >
                    ความเสี่ยงรายมาตรฐาน → ประเมินความสอดคล้อง
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </button>
                </div>
              </section>

              {/* v0.34.0 — ตารางความเสี่ยงรายขอบเขต 2 มุม: มิติ DQ / ประเภทข้อมูล (มุมมาตรฐาน → เมนู ประเมินความสอดคล้อง) */}
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
                      {/* v0.34.0 — เหลือ 2 มุมมองที่เนื้อหาต่างกันชัดเจน: รายมิติ DQ (มี Risk Matrix) / รายประเภทข้อมูล
                          มุมมอง "รายมาตรฐาน" ย้ายไปรวมที่เมนู ประเมินความสอดคล้อง จุดเดียว (แก้ความซ้ำซ้อนตาม feedback ผู้ใช้) */}
                      {(
                        [
                          { id: 'dimension', label: 'รายมิติ DQ' },
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
                          {riskScope === 'dimension' ? 'มิติ DQ' : 'ประเภทข้อมูล'}
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

{/* v0.34.0 — Risk Matrix + Data Quality Impact อยู่เฉพาะแท็บ "รายมิติ DQ" (จุดเดียวของระบบ — แก้ 3 แท็บแสดงซ้ำเดิม) */}
              {riskScope === 'dimension' && (
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
              )}

              {riskScope === 'classification' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* ความเสี่ยงเด่นรายประเภทข้อมูล — ข้อมูลมุมประเภทข้อมูล (ไม่ซ้ำกับแท็บรายมิติ DQ) */}
                  <Card className="min-w-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">ความเสี่ยงเด่นรายประเภทข้อมูล</CardTitle>
                      <CardDescription>รวมกฎที่ล้มเหลวล่าสุดตามประเภทข้อมูลที่จำแนก — เรียงจากคะแนนความเสี่ยงสูงสุด</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {clsRiskRows.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีกฎที่ล้มเหลว — ไม่พบความเสี่ยงจากผลตรวจล่าสุด</p>
                      ) : (
                        <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
                          {clsRiskRows.map((g) => (
                            <div key={g.id} className="rounded-lg border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-700">
                                    {g.no !== '—' ? `${g.no} ` : ''}
                                    {g.th}
                                  </Badge>
                                  <Badge variant="outline" className={`text-[10.5px] ${g.maxBand.className}`}>
                                    {g.maxBand.label} · {g.maxScore}
                                  </Badge>
                                </div>
                                <span className="shrink-0 font-mono text-xs font-semibold text-slate-700">{g.count} กฎไม่ผ่าน</span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <ScoreBar score={Math.min(100, g.maxScore * 4)} />
                              </div>
                              {g.top && (
                                <p className="mt-1.5 truncate text-[11px] text-slate-600">
                                  เสี่ยงสูงสุด: {g.top.datasetName} · {g.top.column} — {g.top.conditionName} (ล้มเหลว {g.top.failedRows} แถว)
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        มุมประเภทข้อมูล: เหมาะสำหรับวางลำดับการแก้ไขตามมูลค่าทางธุรกิจของประเภทข้อมูล · เกณฑ์คะแนนเดียวกับแท็บรายมิติ DQ (lib/regulation.ts)
                      </p>
                    </CardContent>
                  </Card>

                  {/* ผลกระทบธุรกิจรายประเภทข้อมูล — จาก Data Classification mapping มาตรฐาน */}
                  <Card className="min-w-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">ผลกระทบธุรกิจรายประเภทข้อมูล</CardTitle>
                      <CardDescription>ผลกระทบที่อาจเกิดเมื่อข้อมูลประเภทนั้นมีคุณภาพต่ำ + คะแนนเฉลี่ยและกฎครอบคลุม</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
                        {data.classification.categories.map((c) => (
                          <div key={c.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <p className="text-sm font-medium text-slate-800">{c.no} {c.th}</p>
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-600">
                                  {c.datasetCount} ชุดข้อมูล
                                </Badge>
                              </div>
                              <span className={`shrink-0 font-mono text-sm font-bold ${scoreColor(c.avgScore)}`}>
                                {c.avgScore !== null ? c.avgScore.toFixed(0) : '—'}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {c.impacts.slice(0, 4).map((im) => (
                                <Badge key={im} variant="outline" className="border-slate-200 bg-slate-50 text-[10px] font-normal text-slate-600">
                                  {im}
                                </Badge>
                              ))}
                            </div>
                            <p className="mt-1 text-[10.5px] text-muted-foreground">
                              กฎครอบคลุมมิติโฟกัส {c.focusRulesCount} ข้อ · คะแนนมิติโฟกัส {c.focusScore !== null ? c.focusScore.toFixed(0) : '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        ผลกระทบและมิติโฟกัสมาจาก Data Classification mapping (จำแนก 11 ประเภท — แท็บ Data Classification)
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

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

              {/* v0.35.0 — ผล ML ทั้งหมดอยู่ที่ "ML Studio" (เมนู คุณภาพข้อมูล) จุดเดียว
                  — สร้างใหม่บนหลัก Train/Test แทนระบบ ML เดิม */}
              <Card className="border-teal-200 bg-teal-50/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-white text-teal-700">
                      <BrainCircuit className="size-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-teal-900">ผล ML อยู่ที่ "ML Studio" (v0.35.0)</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-teal-800/90">
                        สรุปหลังตรวจ · แนะนำกฎ · สาเหตุร่วม · แนวโน้มผิดซ้ำ — จากโมเดลที่เทรนจาก Data Asset + กฎ DQ ทุกข้อ + คนสอน
                        (ML เป็นผู้ช่วยเสนอแนะ ไม่ตัดสินแทนผลตรวจ)
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 bg-teal-700 text-white hover:bg-teal-800"
                    onClick={() => onGoMlCenter()}
                    aria-label="ไปที่ ML Studio"
                  >
                    เปิด ML Studio
                    <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================================================================ */}
          {/* ส่วนที่ 6 — Data Classification (การจำแนกประเภทข้อมูล)               */}
          {/* ================================================================ */}
          {section === 'classification' && (
            <div className="space-y-4">
              {/* ผู้ดำเนินการ = ผู้ใช้ปัจจุบันของระบบ (v0.32.0 — ย้ายไปใช้ identity ศูนย์กลางที่ header) */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
                <UserRound className="size-3.5 text-emerald-700" aria-hidden="true" />
                ผู้ดำเนินการจำแนก: <span className="font-medium text-slate-800">{user ? `${user.name} (${user.roleTh})` : 'กำลังโหลด…'}</span>
                <span className="text-muted-foreground">— ต้องมีสิทธิ์จัดการชุดข้อมูล (ตรวจสิทธิ์ที่ API เสมอ)</span>
              </div>

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
                                    {d.pendingSignals} คำแนะนำ ML
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
