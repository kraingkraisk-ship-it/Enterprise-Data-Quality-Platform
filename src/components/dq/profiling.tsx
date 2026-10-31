'use client'

/**
 * Data Quality Check (v0.38.0) — จุดรันตรวจคุณภาพข้อมูลจุดเดียวของระบบ
 * flow 4 ขั้น: ① เลือกชุดข้อมูล → ② ดูโปรไฟล์ข้อมูล (สำรวจปัญหาก่อนตรวจ) →
 * ③ เลือกกฎที่จะตรวจ (จัดกลุ่มตามมิติ 9 มิติ — ค่าเริ่มต้นติ๊กกฎที่เปิดใช้งานทั้งหมด) →
 * ④ รันและสรุปผลรายมิติ · เจาะตรวจราย Sub Data Domain / Data Element ได้ (แท็บโดเมน)
 *
 * เดิมเป็นหน้า "โปรไฟล์ข้อมูล" อ่านอย่างเดียว (ไม่เคยถูกใช้ — 0 รอบตลอดชีวิตระบบ)
 * รวมจุดรันจากหน้า "ผลการตรวจสอบ" เดิมมาไว้ที่นี่ตามการออกแบบมิตินำ v0.38.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Eye,
  Info,
  Play,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  Square,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'
import { DATA_TYPE_LABELS } from '@/lib/profiling'
import { DIMENSION_ICONS } from '@/components/dimension-picker'
import { DIMENSION_KEYS, DIMENSION_META, ENGINE_SENTENCE_TH, isConditionKey, type DimensionKey } from '@/lib/dq'
import DomainRunPanel from '@/components/dq/domain-run'
import type { ViewKey } from '@/lib/views'

/* ------------------------------- types ---------------------------------- */

interface ApiDataset {
  id: string
  name: string
}

interface ProfileRunSummary {
  id: string
  datasetId: string
  datasetName?: string
  totalRows: number
  totalColumns: number
  avgCompleteness: number | null
  avgUniqueness: number | null
  piiColumnCount: number
  durationMs: number
  createdBy: string
  createdAt: string
}

interface ProfileColumn {
  id: string
  columnName: string
  dataType: string
  totalRows: number
  nullCount: number
  nullPct: number
  distinctCount: number
  distinctPct: number
  minValue: string | null
  maxValue: string | null
  meanValue: string | null
  minLength: number | null
  maxLength: number | null
  topValues: Array<{ value: string; count: number }>
  piiSuspected: boolean
}

/** กฎแบบย่อจาก /api/dq/rules — ใช้แสดง "กฎที่จะตรวจ" ให้ผู้ใช้เลือก */
interface CheckRule {
  id: string
  datasetIds: string[]
  datasetNames: string[]
  column: string
  conditionName: string
  engineType: string | null
  dimension: string | null
  enabled: boolean
  severity: string
  threshold: number
  lastRun: { status: string; passRate: number; failedRows: number; totalRows: number; at: string } | null
}

/** ผลรันแบบย่อจาก /api/dq/run (POST) — สรุปรายมิติครบตามมาตรา 1–9 */
interface CheckRunResult {
  batchId?: string
  datasetName: string
  rowsCount: number
  rulesCount: number
  skipped?: number
  newSignals: number
  overallScore: number | null
  overallGrade: { band: string; label: string; badgeClass: string; textClass: string } | null
  summary: string
  dimensionScores: Array<{
    dimension: string
    th: string
    clauseNo: number
    score: number | null
    grade: { label: string; badgeClass: string; textClass: string } | null
    rulesCount: number
    failedRules: number
  }>
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function completenessColor(pct: number | null): string {
  if (pct === null) return 'text-slate-500'
  if (pct >= 95) return 'text-emerald-700'
  if (pct >= 80) return 'text-amber-700'
  return 'text-rose-700'
}

export default function DqProfiling({ active, onViewChange }: { active: boolean; onViewChange?: (view: ViewKey) => void }) {
  const { toast } = useToast()
  const { user } = useCurrentUser()

  /* ----------------------------- data ----------------------------- */
  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [datasetId, setDatasetId] = useState('')

  // โปรไฟล์ (ขั้น 2)
  const [runs, setRuns] = useState<ProfileRunSummary[] | null>(null)
  const [current, setCurrent] = useState<{ run: ProfileRunSummary; columns: ProfileColumn[]; piiMasked: boolean } | null>(null)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // กฎ + การเลือกกฎ (ขั้น 3)
  const [rules, setRules] = useState<CheckRule[] | null>(null)
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set())

  // ผลรัน (ขั้น 4)
  const [runResult, setRunResult] = useState<CheckRunResult | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [d, r] = await Promise.all([
          fetch('/api/rbac/datasets').then((res) => res.json()),
          fetch('/api/dq/rules').then((res) => res.json()),
        ])
        setDatasets(d.datasets ?? [])
        setRules(r.rules ?? [])
      } catch {
        /* คงค่าว่าง */
      }
    })()
  }, [])

  /* --------------------- โปรไฟล์ (ของเดิม ครบ) --------------------- */
  const loadRuns = useCallback(async (dsId: string) => {
    if (!dsId) {
      setRuns([])
      setCurrent(null)
      return
    }
    setRuns(null)
    try {
      const res = await fetch(`/api/dq/profile?datasetId=${encodeURIComponent(dsId)}`)
      const data = await res.json()
      setRuns(data.runs ?? [])
      if (data.runs?.[0]?.id) {
        await openRun(data.runs[0].id)
      } else {
        setCurrent(null)
      }
    } catch {
      setRuns([])
    }
  }, [])

  useEffect(() => {
    if (active && datasetId) void loadRuns(datasetId)
  }, [active, datasetId, loadRuns])

  async function openRun(id: string) {
    setLoadingColumns(true)
    try {
      const qs = user ? `?operatorEmail=${encodeURIComponent(user.email)}` : ''
      const res = await fetch(`/api/dq/profile/${id}${qs}`)
      const data = await res.json()
      if (data.error) {
        toast({ title: 'โหลดผลโปรไฟล์ไม่สำเร็จ', description: data.error, variant: 'destructive' })
        return
      }
      setCurrent({ run: data.run, columns: data.columns ?? [], piiMasked: data.piiMasked ?? true })
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setLoadingColumns(false)
    }
  }

  // เปลี่ยนผู้ใช้ปัจจุบัน (header) → โหลดผลล่าสุดใหม่ด้วยบทบาทใหม่ (v0.32.0)
  useEffect(() => {
    if (current?.run.id) void openRun(current.run.id)
  }, [user?.email])

  async function runProfile() {
    if (!datasetId) {
      toast({ title: 'กรุณาเลือกชุดข้อมูลก่อน', variant: 'destructive' })
      return
    }
    setBusy('run-profile')
    try {
      const res = await fetch('/api/dq/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, operatorEmail: user?.email ?? '' }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'รันโปรไฟล์ไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: `โปรไฟล์สำเร็จ — ${data.run.totalColumns} คอลัมน์ / ${data.run.totalRows} แถว (${data.run.durationMs} ms)` })
      await loadRuns(datasetId)
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  /* ------------------- กฎของชุดข้อมูลที่เลือก (ขั้น 3) ------------------- */
  const datasetRules = useMemo(() => (rules ?? []).filter((r) => r.datasetIds.includes(datasetId)), [rules, datasetId])

  /** กฎจัดกลุ่มตามมิติ — เฉพาะมิติที่มีกฎ เรียงตามลำดับมิติมาตรฐาน */
  const rulesByDimension = useMemo(() => {
    const groups = new Map<DimensionKey, CheckRule[]>()
    for (const r of datasetRules) {
      if (!r.dimension || !(DIMENSION_KEYS as string[]).includes(r.dimension)) continue
      const k = r.dimension as DimensionKey
      const list = groups.get(k) ?? []
      list.push(r)
      groups.set(k, list)
    }
    return DIMENSION_KEYS.filter((k) => groups.has(k)).map((k) => ({ dimension: k, rules: groups.get(k)! }))
  }, [datasetRules])

  const uncoveredDimensions = useMemo(
    () =>
      DIMENSION_KEYS.filter((k) => !rulesByDimension.some((g) => g.dimension === k) && datasetRules.length > 0).filter((k) => {
        // มิติทั้ง 9 ยังไม่มีกฎเลย = แจ้งทุกมิติ · ถ้ามีกฎบ้างแล้ว แจ้งเฉพาะมิติที่ว่าง
        return rulesByDimension.length > 0 || (k === 'ACCURACY' || k === 'COMPLETENESS' || k === 'VALIDITY')
      }),
    [rulesByDimension, datasetRules.length],
  )

  // ค่าเริ่มต้น: ติ๊กกฎที่เปิดใช้งานทั้งหมดของชุดข้อมูล (ตามการออกแบบ — รันครบก่อน ผู้ใช้ค่อยปรับ)
  useEffect(() => {
    setSelectedRuleIds(new Set(datasetRules.filter((r) => r.enabled).map((r) => r.id)))
    setRunResult(null)
  }, [datasetId, rules])

  function toggleRule(id: string) {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCount = datasetRules.filter((r) => selectedRuleIds.has(r.id)).length
  const selectedDimensions = new Set(datasetRules.filter((r) => selectedRuleIds.has(r.id) && r.dimension).map((r) => r.dimension))

  /* ------------------------- รันตรวจ (ขั้น 4) ------------------------- */
  async function handleRunCheck() {
    if (!datasetId || selectedCount === 0) return
    setBusy('run-check')
    try {
      const res = await fetch('/api/dq/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, ruleIds: Array.from(selectedRuleIds), operatorEmail: user?.email ?? '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'รันการตรวจสอบไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      setRunResult(data as CheckRunResult)
      toast({
        title: 'รันตรวจสอบสำเร็จ',
        description: `ตรวจ ${data.rulesCount} กฎ บน ${data.rowsCount} แถว — คำแนะนำใหม่ ${data.newSignals} รายการ`,
      })
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const kpis = [
    { label: 'ความสมบูรณ์เฉลี่ย', value: current ? `${current.run.avgCompleteness ?? '—'}%` : '…', cls: completenessColor(current?.run.avgCompleteness ?? null) },
    { label: 'ความไม่ซ้ำเฉลี่ย', value: current ? `${current.run.avgUniqueness ?? '—'}%` : '…', cls: 'text-teal-700' },
    { label: 'คอลัมน์สงสัย PII', value: current ? String(current.run.piiColumnCount) : '…', cls: current && current.run.piiColumnCount > 0 ? 'text-amber-700' : 'text-slate-600' },
    { label: 'รอบที่โปรไฟล์แล้ว', value: runs ? String(runs.length) : '…', cls: 'text-slate-700' },
  ]

  const selectedDataset = datasets.find((d) => d.id === datasetId)

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="space-y-4">
      {/* หัวหน้า — อธิบาย flow 4 ขั้นให้เห็นภาพก่อนใช้ */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900" role="note">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p>
            <strong>Data Quality Check — จุดรันตรวจจุดเดียวของระบบ:</strong> เลือกชุดข้อมูล → ดูโปรไฟล์ → เลือกกฎตามมิติ → รัน ·
            ทำงานบน snapshot sandbox อ่านอย่างเดียวเท่านั้น (ไม่แตะข้อมูลต้นทาง) · ค่าที่พบบ่อยปิดบัง PII ตามบทบาทผู้ชม ตามหลัก PDPA
          </p>
          <ol className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-4" aria-label="ขั้นตอนการตรวจ 4 ขั้น">
            <li className="rounded-md bg-white px-2 py-1"><strong>1.</strong> เลือกชุดข้อมูล</li>
            <li className="rounded-md bg-white px-2 py-1"><strong>2.</strong> ดูโปรไฟล์ข้อมูล</li>
            <li className="rounded-md bg-white px-2 py-1"><strong>3.</strong> เลือกกฎตามมิติ</li>
            <li className="rounded-md bg-white px-2 py-1"><strong>4.</strong> รันและดูสรุปรายมิติ</li>
          </ol>
        </div>
      </div>

      <Tabs defaultValue="dataset">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 sm:w-fit">
          <TabsTrigger value="dataset" className="gap-1.5 data-[state=active]:bg-white">
            <ScanSearch className="size-3.5" aria-hidden="true" />
            ตรวจตามชุดข้อมูล
          </TabsTrigger>
          <TabsTrigger value="element" className="gap-1.5 data-[state=active]:bg-white">
            <ClipboardList className="size-3.5" aria-hidden="true" />
            เจาะตาม Data Element (Domain)
          </TabsTrigger>
        </TabsList>

        {/* ============ โหมด 1: ตรวจตามชุดข้อมูล (4 ขั้น) ============ */}
        <TabsContent value="dataset" className="mt-4 space-y-4">
          {/* KPI โปรไฟล์ล่าสุด */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label} className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold ${k.cls}`}>{k.value}</p>
              </Card>
            ))}
          </div>

          {/* ขั้น 1 — เป้าหมาย + ขั้น 2 — โปรไฟล์ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanSearch className="size-4 text-emerald-700" aria-hidden="true" />
                ขั้นที่ 1–2 · เลือกชุดข้อมูล และรันโปรไฟล์ (สำรวจข้อมูลก่อนตรวจ)
              </CardTitle>
              <CardDescription>โปรไฟล์ช่วยให้เห็นค่าว่าง/ค่าซ้ำ/ช่วงค่าจริงก่อนเลือกกฎ — แนะนำให้รันทุกครั้งก่อนตรวจ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="pf-dataset">ชุดข้อมูล (เป้าหมายการตรวจ)</Label>
                  <select
                    id="pf-dataset"
                    aria-label="เลือกชุดข้อมูลที่จะตรวจ"
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">— เลือกชุดข้อมูล —</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>ผู้ดำเนินการ (ต้องมีสิทธิ์ RUN_VALIDATION)</Label>
                  <div className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground">
                    <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                    <span className="min-w-0 truncate">{user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลด…'}</span>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={runProfile}
                    disabled={!datasetId || busy !== null}
                  >
                    <Play className="size-4" aria-hidden="true" />
                    {busy === 'run-profile' ? 'กำลังโปรไฟล์…' : 'รันโปรไฟล์'}
                  </Button>
                  <Button size="icon" variant="outline" aria-label="รีเฟรชผลโปรไฟล์" onClick={() => datasetId && void loadRuns(datasetId)} disabled={busy !== null}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  <Eye className="size-3" aria-hidden="true" />
                  ผู้ชม (PII ตามบทบาท)
                </Label>
                <div className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground">
                  <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span className="min-w-0 truncate">{user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลด…'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ผลโปรไฟล์รายคอลัมน์ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ผลโปรไฟล์รายคอลัมน์</CardTitle>
              <CardDescription>
                {current
                  ? `${current.run.datasetName} · ${current.run.totalRows} แถว / ${current.run.totalColumns} คอลัมน์ · รันเมื่อ ${fmtTime(current.run.createdAt)} โดย ${current.run.createdBy}${current.piiMasked ? ' · ปิดบัง PII ตามบทบาทผู้ชม' : ''}`
                  : 'เลือกชุดข้อมูลแล้วกด "รันโปรไฟล์" — หรือเลือกจากประวัติด้านล่าง'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingColumns && (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-2/3" />
                </div>
              )}
              {!loadingColumns && !current && (
                <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  ยังไม่มีผลโปรไฟล์ — เลือกชุดข้อมูลที่มีตัวอย่างข้อมูลแล้วกด &quot;รันโปรไฟล์&quot;
                </p>
              )}
              {!loadingColumns && current && current.columns.length === 0 && (
                <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">รอบนี้ไม่มีคอลัมน์ให้แสดง</p>
              )}
              {!loadingColumns && current && current.columns.length > 0 && (
                <div className="max-h-96 overflow-y-auto rounded-md border">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="sticky top-0 bg-emerald-50/90 text-emerald-900 backdrop-blur">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">คอลัมน์</th>
                        <th scope="col" className="px-3 py-2 font-medium">ชนิดข้อมูล</th>
                        <th scope="col" className="px-3 py-2 font-medium">ค่าว่าง</th>
                        <th scope="col" className="px-3 py-2 font-medium">ไม่ซ้ำ</th>
                        <th scope="col" className="px-3 py-2 font-medium">ช่วงค่า / ค่าเฉลี่ย</th>
                        <th scope="col" className="px-3 py-2 font-medium">ค่าที่พบบ่อย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.columns.map((c) => {
                        const typeMeta = DATA_TYPE_LABELS[c.dataType] ?? DATA_TYPE_LABELS.TEXT
                        return (
                          <tr key={c.id} className="border-t align-top transition-colors hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <span className="block max-w-44 truncate font-mono text-[11px] font-medium text-slate-800" title={c.columnName}>
                                {c.columnName}
                              </span>
                              {c.piiSuspected && (
                                <Badge variant="outline" className="mt-1 border-amber-300 bg-amber-50 text-[10px] text-amber-900">
                                  <Info className="mr-0.5 size-2.5" aria-hidden="true" />
                                  PII
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={`border text-[10.5px] ${typeMeta.cls}`}>{typeMeta.th}</Badge>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`font-medium ${completenessColor(100 - c.nullPct)}`}>{c.nullPct}%</span>
                              <span className="block text-[10px] text-muted-foreground">{c.nullCount}/{c.totalRows} แถว</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-medium text-slate-700">{c.distinctPct}%</span>
                              <span className="block text-[10px] text-muted-foreground">{c.distinctCount} ค่า</span>
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-600">
                              {(c.dataType === 'INTEGER' || c.dataType === 'NUMBER') && c.meanValue !== null ? (
                                <>
                                  <span className="block">ต่ำสุด {c.minValue} · สูงสุด {c.maxValue}</span>
                                  <span className="block text-muted-foreground">เฉลี่ย {c.meanValue}</span>
                                </>
                              ) : c.minValue !== null ? (
                                <>
                                  <span className="block max-w-40 truncate" title={c.minValue}>ต่ำสุด {c.minValue}</span>
                                  <span className="block max-w-40 truncate text-muted-foreground" title={c.maxValue ?? ''}>สูงสุด {c.maxValue}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {c.topValues.length > 0 ? (
                                <div className="flex max-w-56 flex-wrap gap-1">
                                  {c.topValues.slice(0, 3).map((t) => (
                                    <Badge key={`${t.value}-${t.count}`} variant="outline" className="max-w-40 truncate border-slate-200 bg-slate-50 text-[10px] font-normal text-slate-700" title={`${t.value} (${t.count} ครั้ง)`}>
                                      {t.value} <span className="text-slate-400">×{t.count}</span>
                                    </Badge>
                                  ))}
                                  {c.topValues.length > 3 && (
                                    <span className="text-[10px] text-muted-foreground">+{c.topValues.length - 3}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10.5px] text-muted-foreground">ไม่มีค่า</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ประวัติรอบโปรไฟล์ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ประวัติรอบโปรไฟล์</CardTitle>
              <CardDescription>คลิกเพื่อเปิดผลของรอบนั้น (เก็บย้อนหลัง 12 รอบล่าสุดต่อชุดข้อมูล)</CardDescription>
            </CardHeader>
            <CardContent>
              {runs === null && datasetId && (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              )}
              {runs !== null && runs.length === 0 && (
                <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  {datasetId ? 'ยังไม่มีประวัติโปรไฟล์ของชุดข้อมูลนี้' : 'เลือกชุดข้อมูลก่อนเพื่อดูประวัติ'}
                </p>
              )}
              {runs !== null && runs.length > 0 && (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => void openRun(r.id)}
                        className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-emerald-50/60 ${current?.run.id === r.id ? 'border-emerald-300 bg-emerald-50/60' : ''}`}
                      >
                        <span className="font-medium text-slate-800">{fmtTime(r.createdAt)}</span>
                        <span className="text-muted-foreground">
                          {r.totalRows} แถว · {r.totalColumns} คอลัมน์ · สมบูรณ์ <span className={`font-medium ${completenessColor(r.avgCompleteness)}`}>{r.avgCompleteness ?? '—'}%</span> · PII {r.piiColumnCount} · {r.createdBy}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ขั้น 3 — เลือกกฎที่จะตรวจ (จัดกลุ่มตามมิติ) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">ขั้นที่ 3 · เลือกกฎที่จะตรวจ (จัดกลุ่มตามมิติ 9 มิติ)</CardTitle>
                {datasetId && datasetRules.length > 0 && (
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => setSelectedRuleIds(new Set(datasetRules.filter((r) => r.enabled).map((r) => r.id)))}
                    >
                      <CheckSquare className="size-3" aria-hidden="true" />
                      ติ๊กทั้งหมดที่เปิดใช้
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setSelectedRuleIds(new Set())}>
                      <Square className="size-3" aria-hidden="true" />
                      ล้าง
                    </Button>
                  </div>
                )}
              </div>
              <CardDescription>
                {datasetId
                  ? datasetRules.length > 0
                    ? `เลือกแล้ว ${selectedCount}/${datasetRules.length} กฎ · ครอบคลุม ${selectedDimensions.size}/9 มิติ — ค่าเริ่มต้นติ๊กกฎที่เปิดใช้งานทั้งหมด (ปลดได้)`
                    : 'ชุดข้อมูลนี้ยังไม่มีกฎผูกอยู่ — สร้างกฎได้ที่หน้า Data Quality Rules'
                  : 'เลือกชุดข้อมูลก่อน เพื่อดูกฎที่จะใช้ตรวจ'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!datasetId && <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">— รอเลือกชุดข้อมูล —</p>}

              {datasetId && rules === null && (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-2/3" />
                </div>
              )}

              {datasetId && datasetRules.length === 0 && rules !== null && (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">ยังไม่มีกฎผูกกับชุดข้อมูลนี้</p>
                  {onViewChange && (
                    <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => onViewChange('rule-library')}>
                      ไปสร้างกฎที่ Data Quality Rules
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}

              {rulesByDimension.map((group) => {
                const Icon = DIMENSION_ICONS[group.dimension]
                const meta = DIMENSION_META[group.dimension]
                const enabledInGroup = group.rules.filter((r) => selectedRuleIds.has(r.id)).length
                return (
                  <div key={group.dimension} className="rounded-lg border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50/70 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <Icon className="size-3.5 text-emerald-700" aria-hidden="true" />
                        {meta.th} <span className="font-normal text-muted-foreground">({meta.en})</span>
                      </p>
                      <span className="text-[11px] text-muted-foreground" aria-live="polite">
                        เลือก {enabledInGroup}/{group.rules.length} กฎ
                      </span>
                    </div>
                    <ul className="divide-y">
                      {group.rules.map((r) => {
                        const selected = selectedRuleIds.has(r.id)
                        return (
                          <li key={r.id} className={`flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${r.enabled ? '' : 'bg-slate-50/60 opacity-70'}`}>
                            <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
                              <Checkbox
                                className="mt-0.5"
                                checked={selected}
                                onCheckedChange={() => toggleRule(r.id)}
                                disabled={!r.enabled}
                                aria-label={`เลือกกฎ ${r.conditionName} คอลัมน์ ${r.column}`}
                              />
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-[11px] font-semibold text-slate-800">{r.column}</span>
                                  <Badge variant="outline" className="text-[10px] text-slate-600">{r.conditionName}</Badge>
                                  {!r.enabled && (
                                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[9.5px] text-amber-800">ปิดใช้งาน</Badge>
                                  )}
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                                  {r.engineType && isConditionKey(r.engineType) ? ENGINE_SENTENCE_TH[r.engineType] : 'ตรวจตามเงื่อนไขของกฎ'}
                                </span>
                              </span>
                            </label>
                            <span className="shrink-0 text-[10.5px] text-muted-foreground sm:text-right">
                              {r.lastRun ? (
                                <>
                                  ผลล่าสุด{' '}
                                  <span className={`font-semibold ${r.lastRun.passRate * 100 < r.threshold ? 'text-rose-700' : 'text-emerald-700'}`}>
                                    {Math.round(r.lastRun.passRate * 100)}%
                                  </span>{' '}
                                  · {fmtTime(r.lastRun.at)}
                                </>
                              ) : (
                                'ยังไม่เคยรัน'
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}

              {/* มิติที่ยังไม่มีกฎ — เตือนให้ครอบคลุมครบตามหลัก 9 มิติ */}
              {datasetId && datasetRules.length > 0 && uncoveredDimensions.length > 0 && (
                <p className="text-[11px] text-amber-800" role="note">
                  <strong>มิติที่ยังไม่มีกฎตรวจ:</strong>{' '}
                  {uncoveredDimensions.map((k) => DIMENSION_META[k].th).join(' · ')} — พิจารณาเพิ่มกฎในมิติเหล่านี้เพื่อความครอบคลุมตาม DAMA-DMBOK
                </p>
              )}
            </CardContent>
          </Card>

          {/* ขั้น 4 — รันและสรุปรายมิติ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ขั้นที่ 4 · รันการตรวจ</CardTitle>
              <CardDescription>รันเฉพาะกฎที่ติ๊กเลือก บนข้อมูลตัวอย่าง sandbox — ไม่แตะข้อมูลต้นทางจริงเสมอ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleRunCheck}
                  disabled={!datasetId || selectedCount === 0 || busy !== null}
                >
                  <Play className="size-4" aria-hidden="true" />
                  {busy === 'run-check' ? 'กำลังรัน…' : `รันตรวจ ${selectedCount} กฎ`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {datasetId ? `เป้าหมาย: ${selectedDataset?.name ?? ''}` : 'เลือกชุดข้อมูลก่อน'}
                </span>
              </div>

              {runResult && (
                <div className="space-y-3 rounded-lg border bg-emerald-50/40 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        ผลการตรวจ — {runResult.datasetName} · {runResult.rowsCount} แถว · {runResult.rulesCount} กฎ
                        {runResult.skipped ? ` · ข้าม ${runResult.skipped} กฎ` : ''} · คำแนะนำใหม่ {runResult.newSignals}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{runResult.summary}</p>
                    </div>
                    {runResult.overallScore !== null && (
                      <div className="shrink-0 text-right">
                        <p className={`text-2xl font-bold ${runResult.overallGrade?.textClass ?? 'text-slate-800'}`}>{runResult.overallScore.toFixed(1)}/100</p>
                        {runResult.overallGrade && (
                          <Badge variant="outline" className={runResult.overallGrade.badgeClass}>
                            เกรด {runResult.overallGrade.label}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* สรุปรายมิติ — 9 ช่อง */}
                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-9">
                    {runResult.dimensionScores.map((d) => {
                      const Icon = DIMENSION_ICONS[d.dimension as DimensionKey]
                      const meta = DIMENSION_META[d.dimension as DimensionKey]
                      return (
                        <div
                          key={d.dimension}
                          className={`rounded-md border p-2 text-center ${d.score === null ? 'border-dashed bg-white opacity-70' : 'bg-white'}`}
                          title={`${meta?.th ?? d.th} — คะแนน ${d.score ?? 'ยังไม่ประเมิน'}`}
                        >
                          {Icon && <Icon className="mx-auto size-3.5 text-slate-500" aria-hidden="true" />}
                          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-700">{meta?.th ?? d.th}</p>
                          <p className={`text-sm font-bold ${d.score === null ? 'text-slate-300' : (d.grade?.textClass ?? 'text-slate-800')}`}>
                            {d.score === null ? '—' : d.score.toFixed(0)}
                          </p>
                          <p className="text-[9.5px] text-muted-foreground">
                            {d.rulesCount > 0 ? `${d.rulesCount - d.failedRules}/${d.rulesCount} ผ่าน` : 'ไม่มีกฎ'}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {onViewChange && (
                    <Button size="sm" variant="outline" className="h-auto whitespace-normal gap-1 text-left" onClick={() => onViewChange('validation-results')}>
                      ดูรายละเอียดรอบตรวจและประวัติที่หน้า “ผลการตรวจสอบ”
                      <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ โหมด 2: เจาะตาม Data Element (Domain → Element → เลือกกฎ → rollup) ============ */}
        <TabsContent value="element" className="mt-4">
          <DomainRunPanel runOperator={user?.email ?? ''} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
