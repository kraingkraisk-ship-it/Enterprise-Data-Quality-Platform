'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CircleGauge,
  Crown,
  Gauge,
  LineChart as LineChartIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Split,
  TrendingDown,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { ROLES, type RoleKey } from '@/lib/rbac'
import { domainColor } from '@/lib/domains'

/* ------------------------------------------------------------------ */
/* Executive Dashboard (v0.17.0) — ภาพรวมระดับบริหาร 7 ส่วน            */
/* 1 Overall DQ Score (ชุดข้อมูลไม่เคยรัน = 0)                          */
/* 2 คะแนนราย Data Domain (จาก Dataset.domainId)                       */
/* 3 จำนวนกฎผ่าน/ไม่ผ่าน                                                */
/* 4 Critical Issues (เลือกได้: ยังไม่ปิด / ประวัติทั้งหมด)              */
/* 5 แนวโน้มคะแนนย้อนหลัง 30/90/180/365 วัน                             */
/* 6 กฎที่ต่ำกว่า Threshold                                             */
/* 7 ปัญหาที่เกิน SLA (dueAt ที่ตั้งรายปัญหา)                           */
/* สิทธิ์: VIEW_EXEC_DASHBOARD — ตรวจจาก viewer ใน API (deny-by-default) */
/* ------------------------------------------------------------------ */

interface ApiUser {
  id: string
  email: string
  name: string
  role: RoleKey
  status: string
}

interface ExecSummary {
  viewer: { name: string; role: string; roleTh: string }
  generatedAt: string
  period: { days: number; weekly: boolean }
  overall: {
    score: number | null
    measuredScore: number | null
    grade: { band: string; label: string; badgeClass: string; textClass: string } | null
    datasetsTotal: number
    datasetsWithRun: number
    datasetsNeverRun: number
  }
  rules: { passed: number; failed: number; total: number }
  byDomain: {
    method: string
    groups: Array<{ id: string; name: string; color: string; parentName: string | null; elementCount: number; elementsMeasured: number; score: number }>
    unassigned: { datasetCount: number; score: number | null }
  }
  trend: { days: number; weekly: boolean; points: Array<{ date: string; label: string; score: number; runs: number }> }
  criticalIssues: {
    mode: 'open' | 'all'
    count: number
    openCount: number
    totalCount: number
    items: Array<{ id: string; code: string; title: string; datasetName: string; status: string; detectedAt: string; dueAt: string | null; overdue: boolean }>
  }
  belowThreshold: {
    count: number
    items: Array<{ id: string; sentence: string; datasetNames: string[]; severity: string; dimension: string | null; passRate: number; threshold: number; gap: number; at: string }>
  }
  sla: {
    overdueCount: number
    items: Array<{ id: string; code: string; title: string; datasetName: string; severity: string; status: string; dueAt: string; daysOverdue: number; assignedToName: string | null }>
  }
}

const PERIODS = [30, 90, 180, 365] as const

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return iso
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 90) return 'text-emerald-600'
  if (score >= 75) return 'text-amber-600'
  return 'text-rose-600'
}

function scoreBar(score: number | null): string {
  if (score === null) return 'bg-slate-300'
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 75) return 'bg-amber-500'
  return 'bg-rose-500'
}

export default function ExecutiveDashboard({ active }: { active?: boolean }) {
  const { toast } = useToast()

  const [users, setUsers] = useState<ApiUser[]>([])
  const [viewer, setViewer] = useState('')
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [issuesMode, setIssuesMode] = useState<'open' | 'all'>('open')
  const [data, setData] = useState<ExecSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)

  /* โหลดรายชื่อผู้เข้าชม — เฉพาะบทบาทที่มีสิทธิ์ VIEW_EXEC_DASHBOARD */
  useEffect(() => {
    let alive = true
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        const all: ApiUser[] = d?.users ?? []
        const canView = all.filter((u) => u.status === 'ACTIVE' && (ROLES[u.role]?.permissions ?? []).includes('VIEW_EXEC_DASHBOARD'))
        setUsers(canView)
        setViewer((prev) => prev || (canView.find((u) => u.role === 'EXECUTIVE') ?? canView[0])?.email || '')
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!viewer) return
    setLoading(true)
    setDenied(null)
    try {
      const res = await fetch(`/api/executive/summary?viewer=${encodeURIComponent(viewer)}&days=${days}&issuesMode=${issuesMode}`)
      const json = await res.json()
      if (!res.ok) {
        setDenied(json.error ?? `HTTP ${res.status}`)
        setData(null)
        return
      }
      setData(json as ExecSummary)
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [viewer, days, issuesMode, toast])

  useEffect(() => {
    void load()
  }, [load])

  // เปิดหน้าเมื่อไหร่ก็รีเฟรช
  useEffect(() => {
    if (active) void load()
  }, [active, load])

  const passRate = useMemo(() => {
    if (!data || data.rules.total === 0) return null
    return Math.round((data.rules.passed / data.rules.total) * 1000) / 10
  }, [data])

  const failRate = useMemo(() => {
    if (!data || data.rules.total === 0) return 100 - (passRate ?? 0)
    return Math.round((data.rules.failed / data.rules.total) * 1000) / 10
  }, [data, passRate])

  /* ------------------------- RBAC gate ------------------------- */
  if (denied) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert className="size-10 text-rose-500" aria-hidden="true" />
          <p className="text-base font-semibold">ไม่มีสิทธิ์เข้าถึงแดชบอร์ดผู้บริหาร</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{denied}</p>
          <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
            หลัก deny-by-default — สิทธิ์การเข้าดูถูกบังคับใช้จากระบบ RBAC ทั้งหน้าแดชบอร์ดและหน้ารายงาน
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* ตัวเลือกผู้เข้าชม + ช่วงเวลา */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={viewer} onValueChange={setViewer}>
          <SelectTrigger className="h-9 w-full sm:w-72" aria-label="ผู้เข้าชมแดชบอร์ด (ตรวจสิทธิ์ RBAC)">
            <SelectValue placeholder="— เลือกผู้เข้าชม —" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.email} value={u.email}>
                {u.name} · {ROLES[u.role]?.th ?? u.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="size-9 print:hidden" onClick={() => void load()} aria-label="โหลดข้อมูลใหม่">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            อัปเดต {fmtDate(data.generatedAt)} · {data.viewer.name} ({data.viewer.roleTh})
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดแดชบอร์ดผู้บริหาร…
        </div>
      ) : !data ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">เลือกผู้เข้าชมเพื่อโหลดแดชบอร์ด</p>
      ) : (
        <>
          {/* ------------------------- แถว KPI หลัก ------------------------- */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* 1) Overall DQ Score */}
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Gauge className="size-3.5" aria-hidden="true" /> Overall DQ Score
                </p>
                <p className={`mt-1 text-4xl font-bold tabular-nums ${scoreColor(data.overall.score)}`}>
                  {data.overall.score === null ? '—' : data.overall.score.toFixed(1)}
                  <span className="ml-1 text-base font-medium text-muted-foreground">/ 100</span>
                </p>
                {data.overall.grade && <Badge variant="outline" className={`mt-1.5 text-[10px] ${data.overall.grade.badgeClass}`}>{data.overall.grade.label}</Badge>}
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  รวม {data.overall.datasetsTotal} ชุดข้อมูล · ตรวจแล้ว {data.overall.datasetsWithRun}
                  {data.overall.datasetsNeverRun > 0 && (
                    <span className="font-medium text-amber-700"> · ยังไม่เคยรัน {data.overall.datasetsNeverRun} ชุด (นับคะแนน 0)</span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* 3) กฎผ่าน/ไม่ผ่าน */}
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Split className="size-3.5" aria-hidden="true" /> กฎผ่าน / ไม่ผ่าน (รอบล่าสุดรายชุดข้อมูล)
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  <span className="text-emerald-600">{data.rules.passed.toLocaleString()}</span>
                  <span className="mx-1.5 text-muted-foreground">/</span>
                  <span className="text-rose-600">{data.rules.failed.toLocaleString()}</span>
                  <span className="ml-2 text-sm font-medium text-muted-foreground">จาก {data.rules.total.toLocaleString()} กฎ</span>
                </p>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`ผ่าน ${passRate ?? 0}% ไม่ผ่าน ${failRate}%`}>
                  <div className="bg-emerald-500" style={{ width: `${passRate ?? 0}%` }} />
                  <div className="bg-rose-500" style={{ width: `${failRate}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  ผ่าน {passRate ?? '—'}% · ไม่ผ่าน {failRate}%
                </p>
              </CardContent>
            </Card>

            {/* 4) Critical Issues */}
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="size-3.5" aria-hidden="true" /> Critical Issues
                </p>
                <p className={`mt-1 text-4xl font-bold tabular-nums ${data.criticalIssues.count > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {data.criticalIssues.count}
                </p>
                <div className="mt-2 flex gap-1 print:hidden" role="group" aria-label="โหมดการนับ Critical Issues">
                  <button
                    type="button"
                    onClick={() => setIssuesMode('open')}
                    aria-pressed={issuesMode === 'open'}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${issuesMode === 'open' ? 'bg-rose-100 font-medium text-rose-900' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                  >
                    ยังไม่ปิด
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssuesMode('all')}
                    aria-pressed={issuesMode === 'all'}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${issuesMode === 'all' ? 'bg-rose-100 font-medium text-rose-900' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                  >
                    ประวัติทั้งหมด
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {issuesMode === 'open' ? `เปิด/กำลังดำเนินการ ${data.criticalIssues.openCount} จากทั้งหมด ${data.criticalIssues.totalCount}` : `ประวัติทั้งหมด ${data.criticalIssues.totalCount} (ยังไม่ปิด ${data.criticalIssues.openCount})`}
                </p>
              </CardContent>
            </Card>

            {/* 7) ปัญหาเกิน SLA */}
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden="true" /> ปัญหาเกินกำหนด (SLA)
                </p>
                <p className={`mt-1 text-4xl font-bold tabular-nums ${data.sla.overdueCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {data.sla.overdueCount}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  นับจากวันครบกำหนดที่ตั้งไว้รายปัญหา · สถานะเปิด/กำลังดำเนินการเท่านั้น
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------- แนวโน้ม + คะแนนรายโดเมน ------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 5) แนวโน้ม */}
            <Card className="min-w-0">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <LineChartIcon className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> แนวโน้มคะแนนย้อนหลัง
                  </p>
                  <div className="flex gap-1 print:hidden" role="group" aria-label="เลือกช่วงเวลาแนวโน้ม">
                    {PERIODS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDays(p)}
                        aria-pressed={days === p}
                        className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${days === p ? 'bg-emerald-600 font-medium text-white' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                      >
                        {p} วัน
                      </button>
                    ))}
                  </div>
                </div>
                {data.trend.points.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-12 text-sm text-muted-foreground">
                    ยังไม่มีรอบตรวจในช่วง {days} วันล่าสุด — รันการตรวจสอบเพื่อสะสมแนวโน้ม
                  </p>
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trend.points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                          <defs>
                            <linearGradient id="execTrendFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(v: number) => [`${v.toFixed(1)} คะแนน`, 'คะแนนเฉลี่ย']}
                            labelFormatter={(l) => `${data.trend.weekly ? 'สัปดาห์เริ่ม' : 'วันที่'} ${l}`}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          />
                          <Area type="monotone" dataKey="score" stroke="#059669" strokeWidth={2} fill="url(#execTrendFill)" dot={{ r: 2.5, fill: '#059669' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      เฉลี่ยคะแนนรวมของรอบตรวจ (batch) ที่รัน{data.trend.weekly ? 'รายสัปดาห์' : 'รายวัน'} · {data.trend.points.length} จุดข้อมูล
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 2) คะแนนรายโดเมน */}
            <Card className="min-w-0">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <CircleGauge className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> คะแนนแยกตาม Data Domain
                  <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">Element Rollup</span>
                </p>
                {data.byDomain.groups.length === 0 && data.byDomain.unassigned.datasetCount === 0 ? (
                  <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-12 text-sm text-muted-foreground">
                    ยังไม่มีโดเมนที่มี Data Element — จัดโครงสร้าง 4 ระดับในหน้า Data Domain ก่อน
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-2">
                    {data.byDomain.groups.map((g) => {
                      const col = domainColor(g.color)
                      return (
                        <div key={g.id} className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2">
                          <span className={`size-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {g.parentName && <span className="text-muted-foreground">{g.parentName} / </span>}
                              {g.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              {g.elementCount} element · วัดแล้ว {g.elementsMeasured}
                            </p>
                          </div>
                          <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                            <div className={`h-full ${scoreBar(g.score)}`} style={{ width: `${Math.min(100, Math.max(0, g.score))}%` }} />
                          </div>
                          <span className={`w-12 shrink-0 text-right text-sm font-bold tabular-nums ${scoreColor(g.score)}`}>{g.score.toFixed(1)}</span>
                        </div>
                      )
                    })}
                    {data.byDomain.unassigned.datasetCount > 0 && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-2.5 py-2">
                        <span className="size-2.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-muted-foreground">ไม่ระบุโดเมน</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">{data.byDomain.unassigned.datasetCount} ชุดข้อมูล</p>
                        </div>
                        <span className={`w-12 shrink-0 text-right text-sm font-bold tabular-nums ${scoreColor(data.byDomain.unassigned.score)}`}>
                          {data.byDomain.unassigned.score === null ? '—' : data.byDomain.unassigned.score.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-auto text-[11px] text-muted-foreground">
                  เรียงคะแนนแย่ที่สุดก่อน · คะแนน element = ถ่วงแถวจากผลรันล่าสุดของกฎที่ผูก element → เฉลี่ยเป็นโดเมนย่อย → โดเมนหลัก (element ยังไม่ถูกวัด นับ 0)
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------- กฎต่ำกว่าเกณฑ์ + ปัญหาเกินกำหนด ------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 6) กฎต่ำกว่า threshold */}
            <Card className="min-w-0">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <TrendingDown className="size-4 shrink-0 text-rose-600" aria-hidden="true" /> กฎที่ต่ำกว่าค่าผ่านขั้นต่ำ (Threshold)
                  </p>
                  <Badge variant="outline" className={`text-xs ${data.belowThreshold.count > 0 ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                    {data.belowThreshold.count} กฎ
                  </Badge>
                </div>
                {data.belowThreshold.items.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-12 text-sm text-emerald-700">
                    ทุกกฎผ่านค่าผ่านขั้นต่ำที่ตั้งไว้ — ไม่มีรายการเตือน
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead className="text-xs">กฎ</TableHead>
                          <TableHead className="w-24 text-right text-xs">ผ่านล่าสุด</TableHead>
                          <TableHead className="w-16 text-right text-xs">เกณฑ์</TableHead>
                          <TableHead className="w-16 text-right text-xs">ห่าง</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.belowThreshold.items.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="max-w-[16rem]">
                              <p className="line-clamp-2 text-[11px] leading-snug" title={r.sentence}>{r.sentence}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <Badge variant="outline" className={`text-[9px] ${SEVERITY_BADGE[r.severity] ?? ''}`}>{r.severity}</Badge>
                                <span className="text-[10px] text-muted-foreground">{r.datasetNames.length > 0 ? r.datasetNames[0] : '—'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold tabular-nums text-rose-600">{r.passRate}%</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{r.threshold}%</TableCell>
                            <TableCell className="text-right text-xs font-medium tabular-nums text-amber-700">-{r.gap}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="mt-auto text-[11px] text-muted-foreground">เรียงห่างจากเกณฑ์มากที่สุดก่อน (แสดงสูงสุด 10) · แก้ค่าเกณฑ์ได้ที่คลังกฎตรวจสอบ</p>
              </CardContent>
            </Card>

            {/* 7) รายการปัญหาเกินกำหนด */}
            <Card className="min-w-0">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Crown className="size-4 shrink-0 text-amber-600" aria-hidden="true" /> ปัญหาที่เกิน SLA
                  </p>
                  <Badge variant="outline" className={`text-xs ${data.sla.overdueCount > 0 ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                    {data.sla.overdueCount} รายการ
                  </Badge>
                </div>
                {data.sla.items.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-12 text-sm text-emerald-700">
                    ไม่มีปัญหาเกินวันครบกำหนด — ทุกปัญหาอยู่ในกำหนดเวลา
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead className="text-xs">ปัญหา</TableHead>
                          <TableHead className="w-24 text-xs">ครบกำหนด</TableHead>
                          <TableHead className="w-20 text-right text-xs">เกินมา</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.sla.items.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell className="max-w-[15rem]">
                              <p className="truncate text-[11px] font-medium" title={i.title}>
                                <span className="font-mono text-[10px] text-muted-foreground">{i.code}</span> {i.title}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{i.datasetName} · {i.assignedToName ?? 'ยังไม่มอบหมาย'}</p>
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{fmtDate(i.dueAt)}</TableCell>
                            <TableCell className="text-right text-xs font-bold tabular-nums text-rose-600">{i.daysOverdue} วัน</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="mt-auto text-[11px] text-muted-foreground">ตั้ง/แก้วันครบกำหนดได้ที่หน้าปัญหาคุณภาพข้อมูล (ต่อปัญหา)</p>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------- รายการ Critical Issues ------------------------- */}
          {data.criticalIssues.items.length > 0 && (
            <Card className="min-w-0">
              <CardContent className="flex flex-col gap-3 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <AlertTriangle className="size-4 shrink-0 text-rose-600" aria-hidden="true" />
                  Critical Issues — {data.criticalIssues.mode === 'open' ? 'ยังไม่ปิด' : 'ประวัติทั้งหมด'} (แสดงสูงสุด 8)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.criticalIssues.items.map((i) => (
                    <div key={i.id} className="flex items-start gap-2.5 rounded-lg border border-rose-100 bg-rose-50/40 px-3 py-2">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={i.title}>
                          <span className="font-mono text-[10px] text-muted-foreground">{i.code}</span> {i.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {i.datasetName} · ตรวจพบ {fmtDate(i.detectedAt)}
                          {i.overdue && <span className="font-medium text-rose-700"> · เกินกำหนด</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
