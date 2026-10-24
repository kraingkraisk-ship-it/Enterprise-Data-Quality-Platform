'use client'

/**
 * ประเมินความสอดคล้อง (Compliance Assessment) — v0.24.0 (Risk-first)
 * ประเมินความเสี่ยงและความสอดคล้องรายมาตรฐาน (Inherent → Residual)
 * จากเกณฑ์ตรวจที่ทำงานได้จริงของแต่ละข้อกำหนด — เลือกมาตรฐาน ชุดข้อมูล
 * และเจาะรายข้อพร้อมประวัติผลรัน 14 รอบ
 *
 * แหล่งข้อมูล: /api/dq/compliance — ถ้า backend ยังไม่พร้อม
 * → fallback ใช้ FRAMEWORKS จาก lib/regulation เป็นโครงมาตรฐาน (คะแนนว่าง ไม่ crash)
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { FRAMEWORKS } from '@/lib/regulation'

/* ------------------------------- types ----------------------------------- */

/** กฎเกณฑ์ตรวจ 1 รายการที่แมปกับข้อกำหนด (ในขอบเขตชุดข้อมูลหนึ่ง ๆ) */
interface ComplianceRuleView {
  ruleId: string
  label: string
  column: string
  conditionName: string
  severity: string
  threshold: number
  latestPassRate: number | null
  latestRunAt: string | null
  failRate: number | null
  meetsThreshold: boolean | null
  inherent: number | null
  residual: number | null
}

/** ผลประเมินของข้อกำหนด 1 ข้อ ในขอบเขตชุดข้อมูล 1 ชุด */
interface ComplianceClausePerDataset {
  datasetId: string
  datasetName: string
  status: 'PASS' | 'FAIL' | 'NOT_ASSESSED'
  score: number | null
  rulesCount: number
  measuredRules: number
  inherentAvg: number | null
  residualAvg: number | null
  reductionPct: number | null
  rules: ComplianceRuleView[]
}

/** ข้อกำหนด (ส่วนย่อย) 1 ข้อของกรอบมาตรฐาน — measurable=false = ระดับกระบวนการ (ไม่เข้าคะแนน) */
interface ComplianceClauseView {
  id: string
  th: string
  en: string
  detail: string
  category: string | null
  dimensions: string[]
  weight: number
  measurable: boolean
  assessed: boolean
  status: 'PASS' | 'FAIL' | 'NOT_ASSESSED'
  score: number | null
  passDatasets: number
  failDatasets: number
  notAssessedDatasets: number
  inherentAvg: number | null
  residualAvg: number | null
  reductionPct: number | null
  perDataset: ComplianceClausePerDataset[]
}

/** กรอบมาตรฐาน 1 กรอบ */
interface ComplianceFrameworkView {
  id: string
  no: string
  name: string
  fullName: string
  groupTh: string
  description: string
  rulesCount: number
  inherentAvg: number | null
  residualAvg: number | null
  reductionPct: number | null
  totalClauses: number
  measurableClauses: number
  assessedClauses: number
  weightedScore: number | null
  clauses: ComplianceClauseView[]
}

interface RuleHistoryEntry {
  ruleId: string
  label: string
  severity: string
  points: Array<{ at: string; passRate: number }>
}

interface ComplianceData {
  generatedAt: string
  datasets: Array<{ id: string; name: string; classification: string | null }>
  frameworks: ComplianceFrameworkView[]
  ruleHistory: RuleHistoryEntry[]
}

/** กฎที่รวมแล้วตามขอบเขต — เมื่อดูทุกชุดข้อมูล ระบุชื่อชุดข้อมูลที่กฎครอบคลุม */
type ScopedRule = ComplianceRuleView & { datasetNames: string[] }

/** ผลประเมินของข้อกำหนดตามขอบเขตชุดข้อมูลที่เลือก */
interface ClauseScope {
  score: number | null
  status: 'PASS' | 'FAIL' | 'NOT_ASSESSED'
  inherentAvg: number | null
  residualAvg: number | null
  reductionPct: number | null
}

/* ------------------------------ constants --------------------------------- */

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  HIGH: 'สูง',
  MEDIUM: 'ปานกลาง',
  LOW: 'ต่ำ',
}

const CLAUSE_STATUS: Record<string, { label: string; className: string }> = {
  PASS: { label: 'ผ่าน', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  FAIL: { label: 'ไม่ผ่าน', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  NOT_ASSESSED: { label: 'ยังไม่ได้ตรวจ', className: 'bg-slate-50 text-slate-600 border-slate-200' },
}

/* ------------------------------ helpers ----------------------------------- */

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

/** จำนวนเต็มแสดงเลย เศษแสดง 1 ตำแหน่ง (×1, ×1.5) */
function fmtWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1)
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 90) return 'text-emerald-700'
  if (score >= 75) return 'text-amber-700'
  return 'text-rose-700'
}

function scoreBarClass(score: number | null): string {
  if (score === null) return 'bg-slate-300'
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 75) return 'bg-amber-500'
  return 'bg-rose-500'
}

/** แถบคะแนนเล็ก ๆ ใช้ในตารางหลัก */
function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  return (
    <div className={`h-2 min-w-10 flex-1 overflow-hidden rounded-full bg-slate-200 ${className ?? ''}`}>
      <div className={`h-full rounded-full ${scoreBarClass(score)}`} style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
    </div>
  )
}

/** จัดเกรดฝั่ง client ตามเกณฑ์เดียวกันทั้งระบบ (lib/dama GRADE_DEFS) */
function gradeOfClient(score: number | null): { band: string; label: string; badgeClass: string } | null {
  if (score === null || Number.isNaN(score)) return null
  if (score >= 95) return { band: 'EXCELLENT', label: 'ดีเยี่ยม', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
  if (score >= 85) return { band: 'GOOD', label: 'ดี', badgeClass: 'bg-teal-50 text-teal-800 border-teal-200' }
  if (score >= 70) return { band: 'FAIR', label: 'ต้องปรับปรุง', badgeClass: 'bg-amber-50 text-amber-900 border-amber-200' }
  return { band: 'POOR', label: 'วิกฤต', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200' }
}

/** สีตัวเลขความเสี่ยง (เต็ม 25) — สอดคล้อง riskBand ของระบบ */
function riskColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 8) return 'text-rose-700'
  if (score >= 4) return 'text-amber-700'
  return 'text-emerald-700'
}

/** โครงมาตรฐาน fallback เมื่อ API ยังไม่พร้อม — ใช้ FRAMEWORKS เป็นแหล่งเดียวกับระบบ */
function fallbackFrameworks(): ComplianceFrameworkView[] {
  return FRAMEWORKS.map((f) => ({
    id: f.id,
    no: f.no,
    name: f.name,
    fullName: f.fullName,
    groupTh: f.groupTh,
    description: f.description,
    rulesCount: 0,
    inherentAvg: null,
    residualAvg: null,
    reductionPct: null,
    totalClauses: f.domains.length,
    measurableClauses: f.domains.filter((d) => d.dimensions.length > 0).length,
    assessedClauses: 0,
    weightedScore: null,
    clauses: f.domains.map((d) => ({
      id: d.id,
      th: d.th,
      en: d.en,
      detail: d.detail,
      category: d.category ?? null,
      dimensions: d.dimensions as string[],
      weight: d.weight,
      measurable: d.dimensions.length > 0,
      assessed: false,
      status: 'NOT_ASSESSED' as const,
      score: null,
      passDatasets: 0,
      failDatasets: 0,
      notAssessedDatasets: 0,
      inherentAvg: null,
      residualAvg: null,
      reductionPct: null,
      perDataset: [],
    })),
  }))
}

/* --------------------------- rule mini chart ------------------------------ */

/** กราฟแท่งเล็กประวัติผลรัน (เก่า→ใหม่) — สีตามเกณฑ์ผ่าน/ไม่ผ่านของแต่ละรอบ */
function RuleHistoryBars({ points, threshold }: { points: Array<{ at: string; passRate: number }>; threshold: number | null }) {
  if (points.length === 0) {
    return <p className="text-[11px] text-muted-foreground">ยังไม่มีประวัติการรันตรวจของกฎนี้</p>
  }
  const first = points[0].passRate * 100
  const last = points[points.length - 1].passRate * 100
  return (
    <div className="flex items-end gap-3">
      <div
        className="flex h-10 min-w-0 flex-1 items-end gap-[3px]"
        role="img"
        aria-label={`ประวัติผลรัน ${points.length} รอบ — รอบแรก ${first.toFixed(1)}% ล่าสุด ${last.toFixed(1)}%`}
      >
        {points.map((p, i) => {
          const pct = Math.max(0, Math.min(100, p.passRate * 100))
          const ok = threshold !== null ? p.passRate * 100 >= threshold : pct >= 95
          return (
            <div
              key={i}
              title={`รอบ ${i + 1}/${points.length}: ${pct.toFixed(1)}%`}
              className={`w-1.5 shrink-0 rounded-sm ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ height: `${Math.max(6, pct)}%` }}
            />
          )
        })}
      </div>
      <p className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
        รอบแรก <span className="font-mono font-semibold text-rose-600">{first.toFixed(1)}%</span>
        <span className="mx-1">→</span>
        ล่าสุด <span className={`font-mono font-bold ${last >= (threshold ?? 95) ? 'text-emerald-700' : 'text-rose-700'}`}>{last.toFixed(1)}%</span>
      </p>
    </div>
  )
}

/* ----------------------------- component ---------------------------------- */

export default function ComplianceAssessment({ active }: { active: boolean }) {
  const [data, setData] = useState<ComplianceData | null>(null)
  const [apiOk, setApiOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fwId, setFwId] = useState(FRAMEWORKS[0]?.id ?? 'DAMA_DMBOK')
  const [datasetId, setDatasetId] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  /* ---------------------------- data load -------------------------------- */
  // ดึงข้อมูลเมื่อเปิดหน้า (active) — เปิดซ้ำเมื่อไหร่ก็รีเฟรช / ไม่พร้อม → fallback โครงมาตรฐาน
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dq/compliance')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Partial<ComplianceData> & { error?: string }
      if (json.error || !Array.isArray(json.frameworks) || json.frameworks.length === 0) {
        setApiOk(false)
        setData(null)
      } else {
        setApiOk(true)
        setData(json as ComplianceData)
      }
    } catch (e) {
      setApiOk(false)
      setData(null)
      setError(e instanceof Error ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  /* ------------------------------ derived -------------------------------- */

  const frameworks = useMemo(() => {
    const list = data?.frameworks
    return list && list.length > 0 ? list : fallbackFrameworks()
  }, [data])
  const fw = frameworks.find((f) => f.id === fwId) ?? frameworks[0]
  const datasets = data?.datasets ?? []
  const ruleHistory = data?.ruleHistory ?? []

  // ข้อกำหนดแยก 2 กลุ่ม: วัดคะแนนได้ (มีเกณฑ์ตรวจ) / ระดับกระบวนการ (ตรวจด้วยหลักฐาน)
  const measurableClauses = fw.clauses.filter((c) => c.measurable)
  const processClauses = fw.clauses.filter((c) => !c.measurable)

  const historyByRule = useMemo(() => {
    const m = new Map<string, RuleHistoryEntry>()
    for (const h of ruleHistory) m.set(h.ruleId, h)
    return m
  }, [ruleHistory])

  // เกณฑ์ผ่านขั้นต่ำ (%) รายกฎ — ใช้ระบายสีกราฟเมื่อ backend ไม่ส่ง meetsThreshold มาเอง
  const thresholdByRule = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of frameworks) for (const c of f.clauses) for (const pd of c.perDataset) for (const r of pd.rules) m.set(r.ruleId, r.threshold)
    return m
  }, [frameworks])

  // chip หัวหน้า: จำนวนกฎวัดได้ = กฎที่แมปกับข้อกำหนดมาตรฐาน (unique ข้ามมาตรฐาน)
  const measuredRuleIds = useMemo(() => {
    const ids = new Set<string>()
    for (const f of frameworks) for (const c of f.clauses) for (const pd of c.perDataset) for (const r of pd.rules) ids.add(r.ruleId)
    return ids
  }, [frameworks])

  /** ผลประเมินของข้อกำหนดตามขอบเขตชุดข้อมูลที่เลือก */
  function clauseScope(clause: ComplianceClauseView): ClauseScope {
    if (datasetId !== 'all') {
      const pd = clause.perDataset.find((p) => p.datasetId === datasetId)
      if (pd) {
        return { score: pd.score ?? null, status: pd.status, inherentAvg: pd.inherentAvg ?? null, residualAvg: pd.residualAvg ?? null, reductionPct: pd.reductionPct ?? null }
      }
      return { score: null, status: 'NOT_ASSESSED', inherentAvg: null, residualAvg: null, reductionPct: null }
    }
    return { score: clause.score ?? null, status: clause.status, inherentAvg: clause.inherentAvg ?? null, residualAvg: clause.residualAvg ?? null, reductionPct: clause.reductionPct ?? null }
  }

  /** เกณฑ์ตรวจของข้อกำหนดตามขอบเขต — ทุกชุด = union รายกฎ (unique ข้ามชุดข้อมูล) / เฉพาะชุด = กฎของชุดนั้น */
  function scopedRules(clause: ComplianceClauseView): ScopedRule[] {
    if (datasetId !== 'all') {
      const pd = clause.perDataset.find((p) => p.datasetId === datasetId)
      return pd ? pd.rules.map((r) => ({ ...r, datasetNames: [pd.datasetName] })) : []
    }
    const byId = new Map<string, ScopedRule>()
    for (const pd of clause.perDataset) {
      for (const r of pd.rules) {
        const found = byId.get(r.ruleId)
        if (found) {
          if (!found.datasetNames.includes(pd.datasetName)) found.datasetNames.push(pd.datasetName)
        } else {
          byId.set(r.ruleId, { ...r, datasetNames: [pd.datasetName] })
        }
      }
    }
    return [...byId.values()]
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  /* ------------------------------ states --------------------------------- */

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดข้อมูลประเมินความสอดคล้อง">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            กำลังโหลดข้อมูลประเมินความสอดคล้อง…
          </div>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  if (error && !apiOk) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive" className="border-rose-200">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>โหลดข้อมูลประเมินความสอดคล้องไม่สำเร็จ</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ ({error}) — แสดงโครงมาตรฐานอย่างเดียวจนกว่าจะเชื่อมต่อได้
            </span>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-300 text-rose-800 hover:bg-rose-50" onClick={() => void load()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              ลองใหม่
            </Button>
          </AlertDescription>
        </Alert>
        <FrameworkFallbackNotice frameworks={frameworks} fw={fw} fwId={fwId} onPick={setFwId} />
      </div>
    )
  }

  const grade = gradeOfClient(fw.weightedScore)

  return (
    <div className="space-y-4">
      {/* ============================ หัวหน้า ============================ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold leading-none text-slate-900">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-700">
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                </span>
                ประเมินความสอดคล้อง
              </h2>
              <CardDescription className="mt-2">
                ประเมินความเสี่ยงและความสอดคล้องรายมาตรฐาน (Inherent → Residual) จากเกณฑ์ตรวจที่ทำงานได้จริงของแต่ละข้อกำหนด — เลือกมาตรฐาน ชุดข้อมูล และเจาะรายข้อพร้อมประวัติผลรัน
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => void load()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              รีเฟรช
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10.5px] text-teal-800">
              กฎวัดได้ {apiOk && measuredRuleIds.size > 0 ? measuredRuleIds.size : '—'}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-700">
              มาตรฐาน {frameworks.length}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10.5px] text-slate-700">
              ชุดข้อมูล {apiOk && datasets.length > 0 ? datasets.length : '—'}
            </Badge>
            {!apiOk && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10.5px] text-amber-900">
                ยังไม่เชื่อมต่อข้อมูล — แสดงโครงมาตรฐานอย่างเดียว
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* ==================== เลือกกรอบมาตรฐาน (radiogroup) ==================== */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="เลือกมาตรฐานที่จะประเมิน">
        {frameworks.map((f) => {
          const activeFw = f.id === fw.id
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={activeFw}
              onClick={() => {
                setFwId(f.id)
                setExpanded({})
              }}
              className={`min-w-0 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                activeFw ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500' : 'bg-white hover:border-emerald-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-muted-foreground">{f.no}</p>
                  <p className={`truncate text-sm font-semibold ${activeFw ? 'text-emerald-900' : 'text-slate-800'}`}>{f.name}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground" title={f.groupTh}>
                    {f.groupTh}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-base font-bold ${scoreColor(f.weightedScore)}`}
                  title="คะแนนความสอดคล้องถ่วงน้ำหนัก"
                >
                  {f.weightedScore !== null ? f.weightedScore.toFixed(1) : '—'}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {f.reductionPct !== null ? (
                  <span className="font-mono text-emerald-700">ลดลง {Math.round(f.reductionPct)}%</span>
                ) : (
                  <span>ลดลง —</span>
                )}
                <span className="mx-1">·</span>
                วัดได้ {f.measurableClauses}/{f.totalClauses} ข้อ
              </p>
            </button>
          )
        })}
      </div>

      {/* ==================== Hero — การ์ดสรุป 4 ใบ ==================== */}
      <section aria-label="สรุปความเสี่ยงและความสอดคล้องของมาตรฐานที่เลือก">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-none text-slate-900">
                {fw.no} {fw.groupTh}: {fw.name}
              </h3>
              <CardDescription className="mt-1">{fw.fullName}</CardDescription>
              <p className="pt-1 text-xs leading-relaxed text-slate-600">{fw.description}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {/* ① Inherent — ก่อนมีกฎ DQ */}
              <dl className="min-w-0 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                  </span>
                  <dt className="text-xs font-medium text-rose-900">ความเสี่ยงโดยธรรมชาติ (Inherent)</dt>
                </div>
                <dd className="mt-2">
                  <span className="text-3xl font-bold tabular-nums text-rose-700">{fw.inherentAvg !== null ? fw.inherentAvg.toFixed(1) : '—'}</span>
                  <span className="ml-1 text-xs text-rose-700/80">/25</span>
                </dd>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-rose-800/90">ก่อนมีกฎ DQ — ทุกกฎถือว่ามีโอกาสเกิดระดับ 5 (สูงมาก) × ความรุนแรงของกฎ</dd>
              </dl>

              {/* ② ลดลง % */}
              <div className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                <TrendingDown className="size-5 text-orange-600" aria-hidden="true" />
                <p className="text-2xl font-bold tabular-nums text-orange-700">
                  {fw.reductionPct !== null ? `ลดลง ${Math.round(fw.reductionPct)}%` : 'ลดลง —'}
                </p>
                <p className="text-center text-[11px] text-muted-foreground">ความเสี่ยงที่ลดลงได้จากการตั้งกฎ DQ และรันตรวจจริง</p>
              </div>

              {/* ③ Residual — หลังมีกฎ DQ */}
              <dl className="min-w-0 rounded-xl border border-emerald-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                  </span>
                  <dt className="text-xs font-medium text-emerald-900">ความเสี่ยงคงเหลือ (Residual)</dt>
                </div>
                <dd className="mt-2">
                  <span className="text-3xl font-bold tabular-nums text-emerald-700">{fw.residualAvg !== null ? fw.residualAvg.toFixed(1) : '—'}</span>
                  <span className="ml-1 text-xs text-emerald-800/70">/25</span>
                </dd>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-emerald-900/90">หลังมีกฎ DQ — คำนวณจากอัตราการล้มเหลวจริงของผลตรวจล่าสุด</dd>
              </dl>

              {/* ④ ความสอดคล้อง (weightedScore) */}
              <dl className="min-w-0 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-white text-teal-700">
                    <BadgeCheck className="size-4" aria-hidden="true" />
                  </span>
                  <dt className="text-xs font-medium text-teal-900">ความสอดคล้อง (ถ่วงน้ำหนัก)</dt>
                </div>
                <dd className="mt-2 flex flex-wrap items-baseline gap-1.5">
                  <span className={`text-3xl font-bold tabular-nums ${scoreColor(fw.weightedScore)}`}>
                    {fw.weightedScore !== null ? fw.weightedScore.toFixed(1) : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                  {grade && (
                    <Badge variant="outline" className={`text-[10px] ${grade.badgeClass}`}>
                      {grade.label}
                    </Badge>
                  )}
                </dd>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-teal-900/90">
                  ข้อวัดได้ {fw.measurableClauses}/{fw.totalClauses} · ตรวจแล้ว {fw.assessedClauses} ข้อ
                </dd>
              </dl>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ==================== ตารางข้อกำหนด ==================== */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-none text-slate-900">ข้อกำหนดรายข้อของ {fw.name}</h3>
              <CardDescription className="mt-1">
                คลิกแถวเพื่อดูเกณฑ์ตรวจรายกฎ ผลรันล่าสุด ความเสี่ยงรายกฎ และประวัติผลรันย้อนหลัง
              </CardDescription>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Label htmlFor="compliance-dataset" className="shrink-0 text-xs text-muted-foreground">
                ขอบเขตชุดข้อมูล
              </Label>
              <Select value={datasetId} onValueChange={(v) => { setDatasetId(v); setExpanded({}) }}>
                <SelectTrigger id="compliance-dataset" className="h-8 w-[240px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    ทุกชุดข้อมูล (ภาพรวม)
                  </SelectItem>
                  {datasets.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {measurableClauses.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              มาตรฐานนี้ยังไม่มีข้อกำหนดที่แมปกับเกณฑ์ตรวจอัตโนมัติ — ข้อกำหนดระดับกระบวนการจะแสดงในกล่องท้ายตาราง
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-left text-xs">
                <caption className="sr-only">
                  ตารางประเมินข้อกำหนดของ {fw.name} — เกณฑ์ตรวจ คะแนน สถานะ และความเสี่ยง Inherent → Residual ตามขอบเขตชุดข้อมูลที่เลือก
                </caption>
                <thead className="bg-emerald-50/70 text-emerald-900">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      ข้อกำหนด
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      เกณฑ์ตรวจ
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      คะแนน
                    </th>
                    <th scope="col" className="px-3 py-2 text-center font-medium">
                      สถานะ
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      ความเสี่ยง (Inherent → Residual)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {measurableClauses.map((clause) => {
                    const st = clauseScope(clause)
                    const rules = scopedRules(clause)
                    const isOpen = !!expanded[clause.id]
                    const statusBadge = CLAUSE_STATUS[st.status] ?? CLAUSE_STATUS.NOT_ASSESSED
                    return (
                      <Fragment key={clause.id}>
                        <tr
                          className={`cursor-pointer border-t transition-colors hover:bg-emerald-50/40 ${isOpen ? 'bg-emerald-50/50' : ''}`}
                          onClick={() => toggleExpand(clause.id)}
                        >
                          <th scope="row" className="px-3 py-2.5 align-top font-normal">
                            <div className="flex items-start gap-1.5">
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={`clause-detail-${clause.id}`}
                                aria-label={`${isOpen ? 'ย่อ' : 'ขยาย'}รายละเอียดข้อกำหนด ${clause.th}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleExpand(clause.id)
                                }}
                                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-emerald-100 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                              >
                                {isOpen ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
                              </button>
                              <div className="min-w-0">
                                <p className="font-medium leading-snug text-slate-800">{clause.th}</p>
                                <p className="text-[10.5px] leading-snug text-muted-foreground">{clause.en}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-800">
                                    น้ำหนัก ×{fmtWeight(clause.weight)}
                                  </Badge>
                                  {clause.category && (
                                    <Badge variant="outline" className="max-w-52 border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                      <span className="truncate">{clause.category}</span>
                                    </Badge>
                                  )}
                                  {st.status === 'FAIL' && (
                                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-800">
                                      ไม่ผ่าน {datasetId === 'all' ? `${clause.failDatasets} ชุดข้อมูล` : 'ชุดข้อมูลนี้'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </th>
                          <td className="px-3 py-2.5 align-top">
                            {rules.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">ยังไม่มีเกณฑ์ตรวจในขอบเขตนี้</span>
                            ) : (
                              <>
                                {datasetId === 'all' && (
                                  <Badge variant="outline" className="mb-1 border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                    รวม {rules.length} เกณฑ์
                                  </Badge>
                                )}
                                <ul className="space-y-0.5">
                                  {rules.map((r) => (
                                    <li key={r.ruleId} className="leading-snug text-slate-700">
                                      <span className="font-mono text-[10.5px] text-slate-500">{r.column}</span>
                                      <span className="mx-1 text-slate-300">·</span>
                                      {r.label}
                                      <span className="font-mono text-[10.5px] text-slate-500"> ≥{r.threshold}%</span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            {st.score !== null ? (
                              <div className="flex items-center gap-2">
                                <ScoreBar score={st.score} className="max-w-24" />
                                <span className={`w-10 shrink-0 text-right font-mono font-semibold ${scoreColor(st.score)}`}>
                                  {st.score.toFixed(1)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center align-top">
                            <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                              {statusBadge.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            {st.inherentAvg !== null && st.residualAvg !== null ? (
                              <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                                <span className="font-mono font-semibold text-rose-700">{st.inherentAvg.toFixed(1)}</span>
                                <span className="text-slate-400">→</span>
                                <span className={`font-mono font-bold ${riskColor(st.residualAvg)}`}>{st.residualAvg.toFixed(1)}</span>
                                <span className="text-[10px] text-slate-400">/25</span>
                                {st.reductionPct !== null && (
                                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-mono text-[10px] text-emerald-800">
                                    ลดลง −{Math.round(st.reductionPct)}%
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr id={`clause-detail-${clause.id}`}>
                            <td colSpan={5} className="border-t bg-slate-50/70 p-0">
                              <div className="space-y-2.5 p-3">
                                <h4 className="text-xs font-semibold text-slate-800">
                                  เกณฑ์ตรวจรายกฎ — {clause.th}
                                  <span className="ml-1.5 font-normal text-muted-foreground">
                                    ({rules.length} กฎ{datasetId === 'all' ? ' — รวมทุกชุดข้อมูล' : ` — เฉพาะ ${datasets.find((d) => d.id === datasetId)?.name ?? ''}`})
                                  </span>
                                </h4>
                                {rules.length === 0 ? (
                                  <p className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-muted-foreground">
                                    ยังไม่มีกฎ DQ ที่แมปกับข้อกำหนดนี้ในขอบเขตที่เลือก — เพิ่มกฎที่ Rule Library แล้วรันตรวจเพื่อเริ่มประเมิน
                                  </p>
                                ) : (
                                  rules.map((r) => {
                                    const history = historyByRule.get(r.ruleId)
                                    const meets = r.meetsThreshold ?? (r.latestPassRate !== null ? r.latestPassRate * 100 >= r.threshold : null)
                                    return (
                                      <div key={r.ruleId} className="rounded-lg border bg-white p-3">
                                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="text-xs font-medium leading-snug text-slate-800">
                                              <span className="font-mono text-[10.5px] text-slate-500">{r.column}</span>
                                              <span className="mx-1 text-slate-300">·</span>
                                              {r.label}
                                            </p>
                                            <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                                              เงื่อนไข: {r.conditionName}
                                              {datasetId === 'all' && r.datasetNames.length > 0 && (
                                                <>
                                                  <span className="mx-1">·</span>ชุดข้อมูล: {r.datasetNames.join(', ')}
                                                </>
                                              )}
                                            </p>
                                          </div>
                                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                            <Badge variant="outline" className={`text-[10px] ${SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.LOW}`}>
                                              {SEVERITY_LABEL[r.severity] ?? r.severity}
                                            </Badge>
                                            <Badge variant="outline" className="border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-600">
                                              เกณฑ์ ≥{r.threshold}%
                                            </Badge>
                                            {meets !== null && (
                                              <Badge variant="outline" className={`text-[10px] ${meets ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                                                {meets ? 'ผ่านเกณฑ์' : 'ต่ำกว่าเกณฑ์'}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                                          <span className="text-muted-foreground">
                                            ผลล่าสุด{' '}
                                            <span className={`font-mono font-bold ${(r.latestPassRate ?? 0) * 100 >= r.threshold ? 'text-emerald-700' : 'text-rose-700'}`}>
                                              {r.latestPassRate !== null ? `${(r.latestPassRate * 100).toFixed(1)}%` : '—'}
                                            </span>
                                          </span>
                                          <span className="text-muted-foreground">
                                            ความเสี่ยง{' '}
                                            <span className="font-mono font-semibold text-rose-600">{r.inherent !== null ? r.inherent.toFixed(1) : '—'}</span>
                                            <span className="mx-1 text-slate-300">→</span>
                                            <span className={`font-mono font-bold ${riskColor(r.residual)}`}>{r.residual !== null ? r.residual.toFixed(1) : '—'}</span>
                                            <span className="text-[10px] text-slate-400">/25</span>
                                          </span>
                                          <span className="text-muted-foreground">รันล่าสุด {fmtTime(r.latestRunAt)}</span>
                                        </div>
                                        <div className="mt-2 border-t pt-2">
                                          <RuleHistoryBars
                                            points={history?.points ?? []}
                                            threshold={r.threshold ?? thresholdByRule.get(r.ruleId) ?? null}
                                          />
                                        </div>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ข้อกำหนดระดับกระบวนการ — ตรวจด้วยหลักฐาน ไม่เข้าการคำนวณคะแนน */}
          {processClauses.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <h4 className="text-xs font-semibold text-amber-900">ข้อกำหนดระดับกระบวนการ (ตรวจด้วยหลักฐาน — ไม่เข้าคะแนน)</h4>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/90">
                เกณฑ์เชิงกระบวนการ/การกำกับดูแล — ระบบครอบคลุมผ่าน RBAC รายชุดข้อมูล · การปิดบัง PII ตามบทบาท · Audit Trail ทุกการดำเนินการ
              </p>
              <ul className="mt-2 space-y-1.5">
                {processClauses.map((clause) => (
                  <li key={clause.id} className="rounded-md border border-amber-200/70 bg-white/70 px-2.5 py-1.5">
                    <p className="text-xs font-medium text-slate-800">
                      {clause.th} <span className="font-normal text-muted-foreground">({clause.en})</span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{clause.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            สูตร: Inherent = โอกาสระดับ 5 (ก่อนมีกฎ DQ) × ความรุนแรงของกฎ (เต็ม 25) · Residual = โอกาสจากอัตราการล้มเหลวจริงล่าสุด × ความรุนแรง ·
            คะแนนความสอดคล้อง = คะแนนเฉลี่ยถ่วงน้ำหนักเฉพาะข้อที่มีเกณฑ์ตรวจ — เป็นข้อมูลประกอบการตัดสินใจของมนุษย์เสมอ
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ----------------------- error-state fallback view ------------------------ */

/** เมื่อโหลดไม่สำเร็จ — แสดงเลือกมาตรฐานแบบย่อเพื่อยืนยันว่า UI ยังใช้ได้แม้ API ไม่พร้อม */
function FrameworkFallbackNotice({
  frameworks,
  fw,
  fwId,
  onPick,
}: {
  frameworks: ComplianceFrameworkView[]
  fw: ComplianceFrameworkView
  fwId: string
  onPick: (id: string) => void
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">โครงมาตรฐาน (ยังไม่มีข้อมูลประเมิน)</CardTitle>
        <CardDescription>เลือกมาตรฐานเพื่อดูข้อกำหนด — คะแนนและความเสี่ยงจะแสดงเมื่อเชื่อมต่อข้อมูลสำเร็จ</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="เลือกมาตรฐาน (โหมดออฟไลน์)">
          {frameworks.map((f) => {
            const activeFw = f.id === fw.id
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={activeFw || f.id === fwId}
                onClick={() => onPick(f.id)}
                className={`min-w-0 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  activeFw ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500' : 'bg-white hover:border-emerald-300'
                }`}
              >
                <p className="font-mono text-[10px] text-muted-foreground">{f.no}</p>
                <p className={`truncate text-sm font-semibold ${activeFw ? 'text-emerald-900' : 'text-slate-800'}`}>{f.name}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">วัดได้ {f.measurableClauses}/{f.totalClauses} ข้อ</p>
              </button>
            )
          })}
        </div>
        <p className="mt-3 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {fw.no} {fw.name}: {fw.description}
        </p>
      </CardContent>
    </Card>
  )
}
