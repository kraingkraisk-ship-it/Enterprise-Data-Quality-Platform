'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Printer, RefreshCw, ShieldAlert } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ROLES, type RoleKey } from '@/lib/rbac'
import { APP_VERSION } from '@/lib/views'

/* ------------------------------------------------------------------ */
/* Executive Reports (v0.17.0) — เมนูแยกสำหรับพิมพ์/บันทึก PDF          */
/* เลย์เอาต์รายงานสะอาด (พื้นขาว) — ปุ่มควบคุมถูกซ่อนตอนพิมพ์ (print:hidden) */
/* ใช้ API เดียวกับแดชบอร์ดผู้บริหาร — สิทธิ์ VIEW_EXEC_DASHBOARD          */
/* ------------------------------------------------------------------ */

interface ApiUser {
  id: string
  email: string
  name: string
  role: RoleKey
  status: string
}

interface ExecSummary {
  viewer: { name: string; roleTh: string }
  generatedAt: string
  period: { days: number; weekly: boolean }
  overall: {
    score: number | null
    measuredScore: number | null
    grade: { band: string; label: string; badgeClass: string } | null
    datasetsTotal: number
    datasetsWithRun: number
    datasetsNeverRun: number
  }
  rules: { passed: number; failed: number; skipped: number; total: number }
  byDomain: {
    method: string
    groups: Array<{ id: string; name: string; color: string; parentName: string | null; elementCount: number; elementsMeasured: number; score: number }>
    unassigned: { datasetCount: number; score: number | null }
  }
  trend: { days: number; weekly: boolean; points: Array<{ date: string; label: string; score: number; runs: number }> }
  criticalIssues: { mode: string; count: number; openCount: number; totalCount: number }
  belowThreshold: { count: number; items: Array<{ id: string; sentence: string; severity: string; passRate: number; threshold: number; gap: number }> }
  sla: { overdueCount: number; items: Array<{ id: string; code: string; title: string; datasetName: string; dueAt: string; daysOverdue: number; assignedToName: string | null }> }
}

const PERIODS = [30, 90, 180, 365] as const

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return iso
  }
}

function fmtLongDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function ExecutiveReports({ active }: { active?: boolean }) {
  const { toast } = useToast()

  const [users, setUsers] = useState<ApiUser[]>([])
  const [viewer, setViewer] = useState('')
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [data, setData] = useState<ExecSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)

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
      const res = await fetch(`/api/executive/summary?viewer=${encodeURIComponent(viewer)}&days=${days}&issuesMode=open`)
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
  }, [viewer, days, toast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  if (denied) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert className="size-10 text-rose-500" aria-hidden="true" />
          <p className="text-base font-semibold">ไม่มีสิทธิ์เข้าถึงรายงานผู้บริหาร</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{denied}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* แถบควบคุม (ไม่พิมพ์) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 print:hidden">
        <Select value={viewer} onValueChange={setViewer}>
          <SelectTrigger className="h-9 w-full sm:w-64" aria-label="ผู้เข้าชมรายงาน (ตรวจสิทธิ์ RBAC)">
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
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])}>
          <SelectTrigger className="h-9 w-36" aria-label="ช่วงเวลารายงาน">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                ย้อนหลัง {p} วัน
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="size-9" onClick={() => void load()} aria-label="โหลดข้อมูลใหม่">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
        <Button className="ml-auto bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => window.print()} disabled={!data}>
          <Printer className="size-4" aria-hidden="true" /> พิมพ์ / บันทึก PDF
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground print:hidden">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังเตรียมรายงาน…
        </div>
      ) : !data ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground print:hidden">เลือกผู้เข้าชมเพื่อเตรียมรายงาน</p>
      ) : (
        /* ------------------------- เนื้อหารายงาน (พิมพ์ได้) ------------------------- */
        <div className="rounded-lg border bg-white p-6 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" lang="th">
          {/* หัวรายงาน */}
          <header className="border-b-2 border-emerald-700 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">รายงานคุณภาพข้อมูลสำหรับผู้บริหาร</h2>
                <p className="text-sm text-slate-600">Enterprise Data Quality Report — ภาพรวมย้อนหลัง {data.period.days} วัน</p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <p>จัดทำ {fmtLongDate(data.generatedAt)}</p>
                <p>
                  จัดทำโดย {data.viewer.name} ({data.viewer.roleTh})
                </p>
                <p className="font-mono">{APP_VERSION}</p>
              </div>
            </div>
          </header>

          {/* สรุปผู้บริหาร */}
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-800">1. สรุปผู้บริหาร (Executive Summary)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-slate-500">คะแนน DQ รวม</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.overall.score === null ? '—' : data.overall.score.toFixed(1)}<span className="text-sm font-normal text-slate-500"> / 100</span></p>
                {data.overall.grade && <p className="text-[11px] text-slate-600">เกรด: {data.overall.grade.label}</p>}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-slate-500">กฎผ่าน / ไม่ผ่าน</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  <span className="text-emerald-700">{data.rules.passed.toLocaleString()}</span> / <span className="text-rose-700">{data.rules.failed.toLocaleString()}</span>
                </p>
                <p className="text-[11px] text-slate-600">จาก {data.rules.total.toLocaleString()} กฎ</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-slate-500">Critical Issues (ยังไม่ปิด)</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.criticalIssues.count}</p>
                <p className="text-[11px] text-slate-600">จากทั้งหมด {data.criticalIssues.totalCount} รายการ</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-slate-500">ปัญหาเกินกำหนด (SLA)</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.sla.overdueCount}</p>
                <p className="text-[11px] text-slate-600">ตามวันครบกำหนดรายปัญหา</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
              ข้อมูล {data.overall.datasetsTotal} ชุด · ตรวจแล้ว {data.overall.datasetsWithRun} ชุด
              {data.overall.datasetsNeverRun > 0 && ` · ยังไม่เคยรันตรวจ ${data.overall.datasetsNeverRun} ชุด (นับคะแนน 0 ตามนิยามผู้บริหาร)`}
              {data.overall.measuredScore !== null && ` · เฉลี่ยเฉพาะชุดที่ตรวจ ${data.overall.measuredScore.toFixed(1)}`}
            </p>
          </section>

          {/* แนวโน้ม */}
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-800">2. แนวโน้มคะแนนย้อนหลัง {data.period.days} วัน</h3>
            {data.trend.points.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-xs text-slate-500">ยังไม่มีรอบตรวจในช่วงเวลานี้</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend.points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(1)} คะแนน`, 'คะแนนเฉลี่ย']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Area type="monotone" dataKey="score" stroke="#059669" strokeWidth={2} fill="url(#reportTrendFill)" dot={{ r: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              เฉลี่ยคะแนนรวมของรอบตรวจที่รัน{data.period.weekly ? 'รายสัปดาห์' : 'รายวัน'} · {data.trend.points.length} จุดข้อมูล
            </p>
          </section>

          {/* คะแนนรายโดเมน */}
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-800">3. คะแนนแยกตาม Data Domain</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-700">
                  <th scope="col" className="px-3 py-2 font-semibold">โดเมนข้อมูล</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Element (วัดแล้ว/ทั้งหมด)</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">คะแนน</th>
                </tr>
              </thead>
              <tbody>
                {data.byDomain.groups.map((g) => (
                  <tr key={g.id} className="border-b text-slate-800">
                    <td className="px-3 py-2">{g.parentName && <span className="text-slate-500">{g.parentName} / </span>}{g.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.elementsMeasured}/{g.elementCount}</td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${g.score >= 90 ? 'text-emerald-700' : g.score >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
                      {g.score.toFixed(1)}
                    </td>
                  </tr>
                ))}
                {data.byDomain.unassigned.datasetCount > 0 && (
                  <tr className="border-b text-slate-500">
                    <td className="px-3 py-2">ไม่ระบุโดเมน</td>
                    <td className="px-3 py-2 text-right tabular-nums">{data.byDomain.unassigned.datasetCount}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {data.byDomain.unassigned.score === null ? '—' : data.byDomain.unassigned.score.toFixed(1)}
                    </td>
                  </tr>
                )}
                {data.byDomain.groups.length === 0 && data.byDomain.unassigned.datasetCount === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500">ยังไม่มีโดเมนที่มี Data Element</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* กฎต่ำกว่าเกณฑ์ */}
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-800">4. กฎที่ต่ำกว่าค่าผ่านขั้นต่ำ ({data.belowThreshold.count} กฎ)</h3>
            {data.belowThreshold.items.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-emerald-700">ทุกกฎผ่านค่าผ่านขั้นต่ำ — ไม่มีรายการเตือน</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-slate-700">
                    <th scope="col" className="px-3 py-2 font-semibold">กฎ</th>
                    <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">ผ่านล่าสุด</th>
                    <th scope="col" className="w-20 px-3 py-2 text-right font-semibold">เกณฑ์</th>
                    <th scope="col" className="w-20 px-3 py-2 text-right font-semibold">ห่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {data.belowThreshold.items.map((r) => (
                    <tr key={r.id} className="border-b align-top text-slate-800">
                      <td className="px-3 py-2">{r.sentence}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-rose-700">{r.passRate}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.threshold}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">-{r.gap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ปัญหาเกิน SLA */}
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-800">5. ปัญหาที่เกินกำหนด — SLA ({data.sla.overdueCount} รายการ)</h3>
            {data.sla.items.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-emerald-700">ไม่มีปัญหาเกินวันครบกำหนด</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-slate-700">
                    <th scope="col" className="px-3 py-2 font-semibold">ปัญหา</th>
                    <th scope="col" className="w-28 px-3 py-2 font-semibold">ครบกำหนด</th>
                    <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">เกินมา</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sla.items.map((i) => (
                    <tr key={i.id} className="border-b align-top text-slate-800">
                      <td className="px-3 py-2">
                        <span className="font-mono text-[10px] text-slate-500">{i.code}</span> {i.title}
                        <span className="block text-[10px] text-slate-500">{i.datasetName} · {i.assignedToName ?? 'ยังไม่มอบหมาย'}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmtDate(i.dueAt)}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-rose-700">{i.daysOverdue} วัน</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ท้ายรายงาน */}
          <footer className="mt-6 border-t pt-3 text-[10px] leading-relaxed text-slate-500">
            <p>
              รายงานนี้สร้างอัตโนมัติจาก Enterprise Data Quality Platform ({APP_VERSION}) — คะแนนคำนวณจากรอบตรวจล่าสุดของแต่ละชุดข้อมูล (ชุดที่ไม่เคยรันตรวจนับคะแนน 0) ·
              สิทธิ์การเข้าถึงตรวจตามระบบ RBAC (VIEW_EXEC_DASHBOARD) · ข้อมูลส่วนบุคคลถูกปิดบังตามบทบาทเสมอ (PDPA) · ทุกการเข้าถึงมีการตรวจสอบย้อนหลัง
            </p>
          </footer>
        </div>
      )}
    </div>
  )
}
