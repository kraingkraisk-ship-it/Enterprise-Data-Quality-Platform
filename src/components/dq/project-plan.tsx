'use client'

/**
 * แผนงาน DQ (DQ Project Plan — v0.34.0)
 * แผนแม่บททวนสอบคุณภาพข้อมูลราย Data Domain ระยะ 2026–2030
 * 1) ภาพรวม Progress ถ่วงน้ำหนักทั้งแผน (Σ weight×progress / Σ weight)
 * 2) Progress รายปี 2026–2030 + สรุป "ทวนสอบปีปัจจุบัน: ครอบคลุมกี่โดเมน เหลืออีกกี่โดเมน"
 * 3) แผนที่โดเมน×ปี แบบ Gantt — แต่ละช่องคือ Task ของโดเมนนั้นในปีนั้น (Q + progress)
 * 4) รายการ Task — เพิ่ม/แก้ progress น้ำหนักคะแนน (×1–×5)/ลบ (สิทธิ์ MANAGE_PROJECT_PLAN — RBAC)
 * ทุกการแก้ไขเข้า Audit Trail (CREATE/UPDATE/DELETE_PROJECT_TASK) · ผู้ดำเนินการจาก session จริง
 */

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarRange,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'
import { ROLE_LIST, type RoleKey } from '@/lib/rbac'

/* ------------------------------- types ----------------------------------- */

type TaskStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE'

interface PlanTask {
  id: string
  title: string
  detail: string
  domainLabel: string
  year: number
  quarter: number
  weight: number
  progress: number
  ownerRole: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

interface PlanData {
  currentYear: number
  planYears: number[]
  tasks: PlanTask[]
  overall: { progressPct: number; tasks: number; weighted: boolean }
  byYear: Array<{ year: number; tasks: number; done: number; inProgress: number; planned: number; progressPct: number }>
  byDomain: Array<{ domainLabel: string; tasks: PlanTask[]; progressPct: number; years: number[] }>
  currentYearSummary: {
    year: number
    progressPct: number
    tasks: number
    done: number
    inProgress: number
    planned: number
    domainsCovered: number
    domainsRemaining: string[]
  }
  domainSuggestions: string[]
  canManage: boolean
  viewer: { email: string; name: string; role: string; roleTh: string }
}

const STATUS_META: Record<TaskStatus, { th: string; badge: string; icon: typeof CircleDashed }> = {
  PLANNED: { th: 'วางแผน', badge: 'border-slate-200 bg-slate-50 text-slate-600', icon: CircleDashed },
  IN_PROGRESS: { th: 'กำลังดำเนินการ', badge: 'border-amber-200 bg-amber-50 text-amber-900', icon: TrendingUp },
  DONE: { th: 'เสร็จสิ้น', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
}

const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const

function progressColor(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500'
  if (pct > 0) return 'bg-amber-500'
  return 'bg-slate-300'
}

function pctText(pct: number): string {
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`
}

/** แถบ progress เล็ก ๆ */
function MiniBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={`h-2 min-w-10 flex-1 overflow-hidden rounded-full bg-slate-200 ${className ?? ''}`}>
      <div className={`h-full rounded-full ${progressColor(pct)}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

/* ----------------------------- component --------------------------------- */

export default function DqProjectPlan({ active }: { active: boolean }) {
  const { toast } = useToast()
  const { user } = useCurrentUser()
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PlanTask | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  /* ---------------------------- data load -------------------------------- */

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dq/project-plan', { cache: 'no-store' })
      const json = (await res.json()) as PlanData & { error?: string }
      setData(json.error ? null : json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  /* ------------------------------ actions -------------------------------- */

  async function patchTask(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      const res = await fetch('/api/dq/project-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch, operatorEmail: user?.email ?? '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: json.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: json.message ?? 'บันทึกเรียบร้อย' })
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusyId('')
    }
  }

  async function deleteTask(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/dq/project-plan?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        toast({ title: 'ลบไม่สำเร็จ', description: json.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: json.message ?? 'ลบเรียบร้อย' })
      setDeleteTarget(null)
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusyId('')
    }
  }

  /* ------------------------------ render --------------------------------- */

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดแผนงาน DQ">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <Alert variant="destructive">
        <CalendarRange className="size-4" aria-hidden="true" />
        <AlertTitle>โหลดแผนงานไม่สำเร็จ</AlertTitle>
        <AlertDescription>โปรดลองรีเฟรชอีกครั้ง — ถ้ายังไม่ได้เข้าสู่ระบบ โปรดเข้าสู่ระบบก่อนใช้งาน</AlertDescription>
      </Alert>
    )
  }

  const cur = data.currentYearSummary
  const canManage = data.canManage

  return (
    <div className="space-y-4">
      {/* ============ ภาพรวมแผนงาน (Project Plan Overview) ============ */}
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-900">ความคืบหน้ารวมของแผน (ถ่วงน้ำหนัก Task)</p>
            <p className="text-4xl font-bold tabular-nums text-emerald-700">{pctText(data.overall.progressPct)}</p>
          </div>
          <div className="text-xs leading-relaxed text-slate-600">
            <p>
              ช่วงแผน <strong>2026–2030</strong> · Task ทั้งหมด <strong>{data.overall.tasks}</strong> งาน ครอบคลุม{' '}
              <strong>{data.byDomain.length}</strong> Data Domain
            </p>
            <p className="mt-0.5">
              สูตร: Progress ถ่วงน้ำหนัก = Σ(น้ำหนัก×ความคืบหน้า)/Σ(น้ำหนัก) — Task น้ำหนักมาก (×5) มีผลต่อภาพรวมมากกว่า Task เล็ก (×1)
            </p>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {canManage && (
              <Button type="button" size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> เพิ่ม Task
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} aria-label="รีเฟรชแผนงาน">
              <RefreshCw className="size-4" aria-hidden="true" /> รีเฟรช
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============ Progress รายปี 2026–2030 ============ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.byYear.map((y) => {
          const isCurrent = y.year === data.currentYear
          return (
            <Card key={y.year} className={isCurrent ? 'border-emerald-400 ring-1 ring-emerald-400' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>ปี {y.year}</span>
                  {isCurrent && (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800">
                      ปีปัจจุบัน
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  เสร็จ {y.done} · กำลังทำ {y.inProgress} · วางแผน {y.planned} (รวม {y.tasks} งาน)
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2">
                  <MiniBar pct={y.progressPct} />
                  <span className="w-12 shrink-0 text-right font-mono text-sm font-bold text-slate-800">{pctText(y.progressPct)}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ============ ทวนสอบปีปัจจุบัน — ครบหรือยัง เหลืออีกกี่โดเมน ============ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4 text-emerald-700" aria-hidden="true" />
                ทวนสอบปี {cur.year} — ความคืบหน้าตาม Data Domain
              </CardTitle>
              <CardDescription className="mt-1">
                ภายในปี {cur.year} ต้องทวนสอบข้อมูลของโดเมนที่อยู่ในแผน (รวมงานค้างจากปีก่อนหน้า) — ตอนนี้ครอบคลุม {cur.domainsCovered} โดเมน
                {cur.domainsRemaining.length > 0 ? ` · เหลือ ${cur.domainsRemaining.length} โดเมนที่เริ่มทวนสอบในปี ${cur.year + 1} เป็นต้นไป` : ' · ครบทุกโดเมนในแผนแล้ว'}
              </CardDescription>
            </div>
            <span className="font-mono text-2xl font-bold tabular-nums text-emerald-700">{pctText(cur.progressPct)}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <MiniBar pct={cur.progressPct} />
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <p className="rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-emerald-900">
              เสร็จสิ้น <strong>{cur.done}</strong> งาน · กำลังดำเนินการ <strong>{cur.inProgress}</strong> งาน · วางแผน <strong>{cur.planned}</strong> งาน
            </p>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 sm:col-span-2">
              {cur.domainsRemaining.length > 0 ? (
                <>
                  โดเมนที่อยู่ในแผนปีถัดไป: <span className="font-medium">{cur.domainsRemaining.join(' · ')}</span>
                </>
              ) : (
                'ทุกโดเมนในแผนเริ่มทวนสอบแล้วตั้งแต่ปีนี้หรือก่อนหน้า'
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ============ แผนที่โดเมน×ปี (Gantt 2026–2030) ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">แผนแม่บทราย Data Domain × ปี (2026–2030)</CardTitle>
          <CardDescription>
            แต่ละช่องคือ Task ของโดเมนนั้นในปีนั้น (แสดงไตรมาสเริ่มต้น + ความคืบหน้า) — คอลัมน์ขวาคือ progress ถ่วงน้ำหนักรวมของโดเมน
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.byDomain.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              ยังไม่มี Task ในแผนงาน — {canManage ? 'กดปุ่ม "เพิ่ม Task" เพื่อเริ่มวางแผน' : 'ให้ผู้มีสิทธิ์จัดการแผนงานเพิ่ม Task ก่อน'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[900px] text-left text-xs">
                <caption className="sr-only">แผนแม่บททวนสอบคุณภาพข้อมูลราย Data Domain ตั้งแต่ปี 2026 ถึง 2030</caption>
                <thead className="bg-emerald-50/70 text-emerald-900">
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 bg-emerald-50/95 px-3 py-2 font-medium">
                      Data Domain
                    </th>
                    {data.planYears.map((year) => (
                      <th
                        key={year}
                        scope="col"
                        className={`px-3 py-2 text-center font-medium ${year === data.currentYear ? 'bg-emerald-100/90' : ''}`}
                      >
                        {year}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 font-medium">
                      Progress โดเมน
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDomain.map((row) => (
                    <tr key={row.domainLabel} className="border-t">
                      <th scope="row" className="sticky left-0 z-10 max-w-[220px] bg-white/95 px-3 py-2 align-top font-medium text-slate-800 [overflow-wrap:anywhere]">
                        {row.domainLabel}
                        <span className="block text-[10px] font-normal text-muted-foreground">{row.tasks.length} งาน</span>
                      </th>
                      {data.planYears.map((year) => {
                        const cell = row.tasks.filter((t) => t.year === year)
                        return (
                          <td key={year} className={`min-w-[130px] px-2 py-2 align-top ${year === data.currentYear ? 'bg-emerald-50/40' : ''}`}>
                            {cell.length === 0 ? (
                              <span className="block text-center text-slate-300">·</span>
                            ) : (
                              <div className="space-y-1.5">
                                {cell.map((t) => (
                                  <div key={t.id} className="rounded-md border border-slate-200 bg-white px-1.5 py-1">
                                    <p className="truncate text-[10.5px] font-medium text-slate-700" title={`${t.title} (น้ำหนัก ×${t.weight})`}>
                                      Q{t.quarter} · {t.title}
                                    </p>
                                    <div className="mt-0.5 flex items-center gap-1">
                                      <div className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-slate-200">
                                        <div
                                          className={`h-full rounded-full ${progressColor(t.progress)}`}
                                          style={{ width: `${t.progress}%` }}
                                        />
                                      </div>
                                      <span className="shrink-0 font-mono text-[9.5px] text-slate-500">{t.progress}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="min-w-[130px] px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          <MiniBar pct={row.progressPct} />
                          <span className="w-12 shrink-0 text-right font-mono font-bold text-slate-800">{pctText(row.progressPct)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            น้ำหนักคะแนน ×1 (งานเล็ก) ถึง ×5 (งานใหญ่/สำคัญ) — Progress รวมของโดเมนคำนวณแบบถ่วงน้ำหนัก · สถานะ: 0% = วางแผน · 1–99% = กำลังดำเนินการ · 100% = เสร็จสิ้น
          </p>
        </CardContent>
      </Card>

      {/* ============ รายการ Task (จัดการได้ตามสิทธิ์) ============ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">Task ทั้งหมดของแผน ({data.tasks.length} งาน)</CardTitle>
              <CardDescription className="mt-1">
                {canManage ? 'แก้ความคืบหน้า/น้ำหนักคะแนนได้ทันที — ทุกการแก้ไขเข้า Audit Trail' : 'บทบาทของคุณดูได้อย่างเดียว — การแก้ไขต้องเป็นบทบาท: เจ้าของข้อมูล · ผู้ดูแลข้อมูล · ผู้ดูแลระบบ'}
              </CardDescription>
            </div>
            {canManage && (
              <Button type="button" size="sm" className="shrink-0 bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> เพิ่ม Task
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {data.tasks.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มี Task ในแผนงาน</p>
            )}
            {data.tasks.map((t) => {
              const st = STATUS_META[t.status]
              const StIcon = st.icon
              const busy = busyId === t.id
              return (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <StIcon className={`size-3.5 shrink-0 ${t.status === 'DONE' ? 'text-emerald-600' : t.status === 'IN_PROGRESS' ? 'text-amber-600' : 'text-slate-400'}`} aria-hidden="true" />
                        <p className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{t.title}</p>
                        <Badge variant="outline" className={`shrink-0 text-[10px] ${st.badge}`}>
                          {st.th}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t.domainLabel} · ปี {t.year} Q{t.quarter} · น้ำหนัก ×{t.weight} · ผู้รับผิดชอบ: {ROLE_LIST.find((r) => r.key === (t.ownerRole as RoleKey))?.th ?? t.ownerRole}
                      </p>
                      {t.detail && <p className="mt-1 text-[11px] leading-relaxed text-slate-600 [overflow-wrap:anywhere]">{t.detail}</p>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Select
                          value={String(t.progress)}
                          disabled={busy}
                          onValueChange={(v) => void patchTask(t.id, { progress: Number(v) })}
                        >
                          <SelectTrigger className="h-8 w-[110px] text-xs" aria-label={`แก้ความคืบหน้าของ ${t.title}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROGRESS_STEPS.map((p) => (
                              <SelectItem key={p} value={String(p)} className="text-xs">
                                คืบหน้า {p}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={String(t.weight)} disabled={busy} onValueChange={(v) => void patchTask(t.id, { weight: Number(v) })}>
                          <SelectTrigger className="h-8 w-[96px] text-xs" aria-label={`แก้น้ำหนักของ ${t.title}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((w) => (
                              <SelectItem key={w} value={String(w)} className="text-xs">
                                น้ำหนัก ×{w}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          disabled={busy}
                          aria-label={`ลบ Task ${t.title}`}
                          onClick={() => setDeleteTarget(t)}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <MiniBar pct={t.progress} />
                    <span className="w-12 shrink-0 text-right font-mono text-xs font-bold text-slate-700">{t.progress}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ============ Dialog เพิ่ม Task ============ */}
      {canManage && (
        <AddTaskDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          currentYear={data.currentYear}
          planYears={data.planYears}
          domainSuggestions={data.domainSuggestions}
          onCreated={async (message) => {
            setAddOpen(false)
            toast({ title: message })
            await load()
          }}
          onError={(message) => toast({ title: 'เพิ่ม Task ไม่สำเร็จ', description: message, variant: 'destructive' })}
          operatorEmail={user?.email ?? ''}
        />
      )}

      {/* ============ AlertDialog ยืนยันลบ ============ */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ Task นี้ออกจากแผนงาน?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  "{deleteTarget.title}" ({deleteTarget.domainLabel} · ปี {deleteTarget.year}) จะถูกลบถาวร — การลบจะถูกบันทึกใน Audit Trail
                  และ Progress ถ่วงน้ำหนักรวมของแผนจะคำนวณใหม่ทันที
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== ''}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={busyId !== '' || !deleteTarget}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) void deleteTask(deleteTarget.id)
              }}
            >
              ลบ Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* --------------------------- AddTaskDialog -------------------------------- */

function AddTaskDialog({
  open,
  onOpenChange,
  currentYear,
  planYears,
  domainSuggestions,
  onCreated,
  onError,
  operatorEmail,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  currentYear: number
  planYears: number[]
  domainSuggestions: string[]
  onCreated: (message: string) => void
  onError: (message: string) => void
  operatorEmail: string
}) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [domainLabel, setDomainLabel] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [quarter, setQuarter] = useState('1')
  const [weight, setWeight] = useState('1')
  const [progress, setProgress] = useState('0')
  const [ownerRole, setOwnerRole] = useState<RoleKey>('DATA_STEWARD')
  const [busy, setBusy] = useState(false)

  const years = planYears.includes(currentYear) ? planYears : [...planYears, currentYear].sort((a, b) => a - b)

  function reset() {
    setTitle('')
    setDetail('')
    setDomainLabel('')
    setYear(String(currentYear))
    setQuarter('1')
    setWeight('1')
    setProgress('0')
    setOwnerRole('DATA_STEWARD')
  }

  async function submit() {
    if (!title.trim()) {
      onError('กรุณาระบุชื่อ Task')
      return
    }
    if (!domainLabel.trim()) {
      onError('กรุณาระบุ Data Domain')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/dq/project-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          detail: detail.trim(),
          domainLabel: domainLabel.trim(),
          year: Number(year),
          quarter: Number(quarter),
          weight: Number(weight),
          progress: Number(progress),
          ownerRole,
          operatorEmail,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        onError(json.error ?? `HTTP ${res.status}`)
        return
      }
      reset()
      onCreated(json.message ?? 'เพิ่ม Task เรียบร้อย')
    } catch {
      onError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>เพิ่ม Task แผนงาน DQ</DialogTitle>
          <DialogDescription>
            Task ของแผนทวนสอบราย Data Domain — ระบุปี/ไตรมาสที่ทำ และน้ำหนักคะแนน (×1–×5) ที่ใช้คำนวณ Progress ภาพรวม
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pt-title">ชื่อ Task *</Label>
            <Input
              id="pt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ทวนสอบความสมบูรณ์ทะเบียนลูกค้ารายใหญ่"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-domain">Data Domain *</Label>
            <Input id="pt-domain" value={domainLabel} onChange={(e) => setDomainLabel(e.target.value)} list="pt-domain-list" placeholder="เช่น ข้อมูลลูกค้า" />
            <datalist id="pt-domain-list">
              {domainSuggestions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <p className="text-[10.5px] text-muted-foreground">พิมพ์ชื่อโดเมน (มีชื่อจากทะเบียน Data Domain ของระบบเป็นตัวเลือกให้เลือก)</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pt-year">ปีแผนงาน</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger id="pt-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-quarter">ไตรมาสเริ่มต้น</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger id="pt-quarter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((q) => (
                    <SelectItem key={q} value={String(q)}>
                      Q{q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-weight">น้ำหนักคะแนน (×1–×5)</Label>
              <Select value={weight} onValueChange={setWeight}>
                <SelectTrigger id="pt-weight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      ×{w} {w === 5 ? '(งานใหญ่มาก)' : w === 1 ? '(งานเล็ก)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-progress">ความคืบหน้าเริ่มต้น</Label>
              <Select value={progress} onValueChange={setProgress}>
                <SelectTrigger id="pt-progress">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRESS_STEPS.map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {p}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pt-owner">บทบาทผู้รับผิดชอบหลัก</Label>
              <Select value={ownerRole} onValueChange={(v) => setOwnerRole(v as RoleKey)}>
                <SelectTrigger id="pt-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_LIST.map((r) => (
                    <SelectItem key={r.key} value={r.key} className="text-xs">
                      {r.th} ({r.en})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pt-detail">รายละเอียด (ไม่บังคับ)</Label>
              <Textarea id="pt-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} maxLength={500} placeholder="ขอบเขตงาน หลักฐานที่ต้องเก็บ ฯลฯ" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} เพิ่ม Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
