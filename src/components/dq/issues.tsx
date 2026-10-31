'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  CalendarClock,
  CircleDot,
  Eye,
  Flag,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'
import { DimensionBadge } from '@/components/dimension-picker'
import ExceptionsPanel from '@/components/dq/exceptions-panel'
import { SEVERITY_KEYS, SEVERITY_LABELS, DIMENSION_KEYS, DIMENSION_LABELS, type DimensionKey } from '@/lib/dq'
import { ISSUE_SOURCE_LABELS, ISSUE_STATUS_META, ISSUE_TRANSITIONS } from '@/lib/issues'

/* ------------------------------------------------------------------ */
/* DQ Issues — ทะเบียนปัญหาคุณภาพข้อมูล พร้อม lifecycle                  */
/* OPEN → IN_PROGRESS → RESOLVED → CLOSE (สิทธิ์ MANAGE_ISSUES ทุกขั้น)  */
/* แท็บที่ 2 = ข้อยกเว้นกฎ (v0.36.0 — ไม่มีคิวอนุมัติ)                    */
/* ------------------------------------------------------------------ */

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
}

interface IssueItem {
  id: string
  code: string
  datasetId: string
  datasetName: string
  title: string
  description: string
  source: string
  sourceId: string
  dimension: string
  severity: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  reportedBy: string
  assignedTo: string | null
  dueAt: string | null
  resolutionNote: string
  detectedAt: string
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

interface IssueStats {
  OPEN: number
  IN_PROGRESS: number
  RESOLVED: number
  CLOSED: number
  bySeverity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

/** ปัญหาเกินวันครบกำหนด = มี dueAt + ยังไม่แก้ (OPEN/IN_PROGRESS) + เลยกำหนดแล้ว (v0.17.0) */
function daysOverdueOf(it: IssueItem): number | null {
  if (!it.dueAt || (it.status !== 'OPEN' && it.status !== 'IN_PROGRESS')) return null
  const diff = Date.now() - new Date(it.dueAt).getTime()
  return diff > 0 ? Math.max(1, Math.floor(diff / 86_400_000)) : null
}

export default function DqIssues({ active }: { active: boolean }) {
  const { toast } = useToast()
  // v0.32.0 — ผู้รายงาน/ผู้ดำเนินการ = ผู้ใช้ปัจจุบันจาก header (identity ศูนย์กลาง)
  const { user } = useCurrentUser()

  const [items, setItems] = useState<IssueItem[] | null>(null)
  const [stats, setStats] = useState<IssueStats | null>(null)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)

  // filters
  const [status, setStatus] = useState('')
  const [severity, setSeverity] = useState('')
  const [source, setSource] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')

  // data for forms
  const [users, setUsers] = useState<ApiUser[]>([])
  const [datasets, setDatasets] = useState<ApiDataset[]>([])

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [crDataset, setCrDataset] = useState('')
  const [crTitle, setCrTitle] = useState('')
  const [crDesc, setCrDesc] = useState('')
  const [crDimension, setCrDimension] = useState<DimensionKey>('COMPLETENESS')
  const [crSeverity, setCrSeverity] = useState('MEDIUM')

  // detail dialog
  const [detail, setDetail] = useState<IssueItem | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueInput, setDueInput] = useState('')

  const activeUsers = users.filter((u) => u.status === 'ACTIVE')

  useEffect(() => {
    ;(async () => {
      try {
        const [u, d] = await Promise.all([
          fetch('/api/rbac/users').then((r) => r.json()),
          fetch('/api/rbac/datasets').then((r) => r.json()),
        ])
        setUsers(u.users ?? [])
        setDatasets(d.datasets ?? [])
      } catch {
        /* คงค่าว่าง */
      }
    })()
  }, [])

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (severity) qs.set('severity', severity)
      if (source) qs.set('source', source)
      if (datasetId) qs.set('datasetId', datasetId)
      if (q) qs.set('q', q)
      qs.set('page', String(page))
      const res = await fetch(`/api/dq/issues?${qs.toString()}`)
      const data = await res.json()
      if (data.error) {
        setItems([])
        return
      }
      setItems(data.items ?? [])
      setStats(data.stats ?? null)
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
    } catch {
      setItems([])
    }
  }, [status, severity, source, datasetId, q, page])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  async function createIssue() {
    setBusy('create-issue')
    try {
      const res = await fetch('/api/dq/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: crDataset,
          title: crTitle,
          description: crDesc,
          dimension: crDimension,
          severity: crSeverity,
          source: 'MANUAL',
          reportedByEmail: user?.email ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'สร้างปัญหาไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: `เปิดปัญหา ${data.issue.code} เรียบร้อย — ติดตามได้ในทะเบียนด้านล่าง` })
      setCreateOpen(false)
      setCrTitle('')
      setCrDesc('')
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function transition(item: IssueItem, action: keyof typeof ISSUE_TRANSITIONS, note?: string) {
    setBusy(`${action}-${item.id}`)
    try {
      const res = await fetch(`/api/dq/issues/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, operatorEmail: user?.email ?? '', note }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'เปลี่ยนสถานะไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: `ปัญหา ${item.code} → "${ISSUE_STATUS_META[data.issue.status]?.th ?? data.issue.status}" เรียบร้อย` })
      setDetail(null)
      setResolveNote('')
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function assignIssue(item: IssueItem) {
    if (!assignee) {
      toast({ title: 'กรุณาเลือกผู้รับผิดชอบ', variant: 'destructive' })
      return
    }
    setBusy(`ASSIGN-${item.id}`)
    try {
      const res = await fetch(`/api/dq/issues/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ASSIGN', operatorEmail: user?.email ?? '', assignedTo: assignee }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'มอบหมายไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: `มอบหมายปัญหา ${item.code} เรียบร้อย` })
      setDetail(null)
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  /** ตั้งวันครบกำหนด (SLA) — ค่าว่าง = ล้าง (v0.17.0) */
  async function saveDue(item: IssueItem) {
    setBusy(`DUE-${item.id}`)
    try {
      const res = await fetch(`/api/dq/issues/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SET_DUE', operatorEmail: user?.email ?? '', dueAt: dueInput }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'บันทึกวันครบกำหนดไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกวันครบกำหนดแล้ว' })
      setDetail((d) => (d && d.id === item.id ? { ...d, dueAt: data.issue?.dueAt ?? null } : d))
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const kpiCards = [
    { key: 'OPEN' as const, label: 'เปิดใหม่', cls: 'text-rose-700' },
    { key: 'IN_PROGRESS' as const, label: 'กำลังดำเนินการ', cls: 'text-amber-700' },
    { key: 'RESOLVED' as const, label: 'แก้ไขแล้ว (รอปิด)', cls: 'text-emerald-700' },
    { key: 'CLOSED' as const, label: 'ปิดแล้ว', cls: 'text-slate-600' },
  ]

  return (
    <Tabs defaultValue="issues" className="w-full">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 sm:w-fit">
        <TabsTrigger value="issues" className="gap-1.5 data-[state=active]:bg-white">
          <ListChecks className="size-3.5" aria-hidden="true" />
          ทะเบียนปัญหา
        </TabsTrigger>
        <TabsTrigger value="exceptions" className="gap-1.5 data-[state=active]:bg-white">
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          ข้อยกเว้นกฎ
        </TabsTrigger>
      </TabsList>

      {/* ===================== TAB 1: ISSUES ===================== */}
      <TabsContent value="issues" className="mt-4">
        <div className="space-y-4">
          {/* คำเตือน lifecycle */}
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900" role="note">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p>
              <strong>Lifecycle:</strong> เปิด → กำลังดำเนินการ → แก้ไขแล้ว → ปิด — ทุกสถานะใช้สิทธิ์ MANAGE_ISSUES เดียว (RBAC ตามบทบาทล้วน) ทุกการเปลี่ยนสถานะถูกบันทึก Audit Trail 100% และระบบไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ
            </p>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpiCards.map((k) => (
              <Card key={k.key} className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold ${stats ? k.cls : 'text-slate-400'}`}>{stats ? stats[k.key] : '…'}</p>
              </Card>
            ))}
          </div>

          {/* ตารางปัญหา */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListChecks className="size-4 text-emerald-700" aria-hidden="true" />
                    ทะเบียนปัญหาคุณภาพข้อมูล
                  </CardTitle>
                  <CardDescription>
                    รวม {total} รายการ
                    {stats && (
                      <span className="ml-2 inline-flex flex-wrap items-center gap-1">
                        ค้างแก้ตามความรุนแรง:
                        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sv) =>
                          stats.bySeverity[sv] > 0 ? (
                            <Badge key={sv} variant="outline" className={`border text-[10px] ${SEVERITY_BADGE[sv]}`}>
                              {SEVERITY_LABELS[sv]?.th ?? sv} {stats.bySeverity[sv]}
                            </Badge>
                          ) : null,
                        )}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load()} disabled={busy !== null}>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    รีเฟรช
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    เปิดปัญหาใหม่
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* ตัวกรอง */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <Label htmlFor="is-status" className="text-xs">สถานะ</Label>
                  <select
                    id="is-status"
                    aria-label="กรองตามสถานะปัญหา"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value)
                      setPage(1)
                    }}
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">ทุกสถานะ</option>
                    {Object.entries(ISSUE_STATUS_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.th}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="is-severity" className="text-xs">ความรุนแรง</Label>
                  <select
                    id="is-severity"
                    aria-label="กรองตามความรุนแรง"
                    value={severity}
                    onChange={(e) => {
                      setSeverity(e.target.value)
                      setPage(1)
                    }}
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">ทุกระดับ</option>
                    {SEVERITY_KEYS.map((sv) => (
                      <option key={sv} value={sv}>
                        {SEVERITY_LABELS[sv]?.th ?? sv}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="is-source" className="text-xs">ที่มา</Label>
                  <select
                    id="is-source"
                    aria-label="กรองตามที่มาของปัญหา"
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value)
                      setPage(1)
                    }}
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">ทุกที่มา</option>
                    {Object.entries(ISSUE_SOURCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.th}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="is-dataset" className="text-xs">ชุดข้อมูล</Label>
                  <select
                    id="is-dataset"
                    aria-label="กรองตามชุดข้อมูล"
                    value={datasetId}
                    onChange={(e) => {
                      setDatasetId(e.target.value)
                      setPage(1)
                    }}
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">ทุกชุดข้อมูล</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="is-search" className="text-xs">ค้นหา</Label>
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      setQ(qInput)
                      setPage(1)
                    }}
                  >
                    <Input
                      id="is-search"
                      value={qInput}
                      onChange={(e) => setQInput(e.target.value)}
                      placeholder="รหัส/หัวข้อปัญหา"
                      className="h-9 text-xs"
                    />
                    <Button type="submit" size="sm" variant="outline" className="gap-1 px-2.5" aria-label="ค้นหา">
                      <Search className="size-3.5" aria-hidden="true" />
                    </Button>
                  </form>
                </div>
              </div>

              {/* ตาราง */}
              {items === null && (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-2/3" />
                </div>
              )}
              {items !== null && items.length === 0 && (
                <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  ไม่มีปัญหาตามเงื่อนไขที่เลือก — เปิดปัญหาใหม่ได้จากปุ่ม &quot;เปิดปัญหาใหม่&quot; หรือจากข้อมูลที่ไม่ผ่าน
                </p>
              )}
              {items !== null && items.length > 0 && (
                <div className="max-h-96 overflow-y-auto rounded-md border">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead className="sticky top-0 bg-emerald-50/90 text-emerald-900 backdrop-blur">
                      <tr>
                        <th scope="col" className="w-8 px-2 py-2" aria-label="ขยายรายละเอียด" />
                        <th scope="col" className="px-3 py-2 font-medium">รหัส · หัวข้อ</th>
                        <th scope="col" className="px-3 py-2 font-medium">ชุดข้อมูล</th>
                        <th scope="col" className="px-3 py-2 font-medium">มิติ · ความรุนแรง</th>
                        <th scope="col" className="px-3 py-2 font-medium">ที่มา</th>
                        <th scope="col" className="px-3 py-2 font-medium">สถานะ</th>
                        <th scope="col" className="px-3 py-2 font-medium">ผู้รับผิดชอบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <Fragment key={it.id}>
                          <tr className="cursor-pointer border-t transition-colors hover:bg-slate-50" onClick={() => { setDetail(it); setDueInput(it.dueAt ? it.dueAt.slice(0, 10) : '') }}>
                            <td className="px-2 py-2">
                              <CircleDot className="size-3.5 text-slate-400" aria-hidden="true" />
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-[10.5px] text-muted-foreground">{it.code}</span>
                              <span className="block max-w-56 truncate font-medium text-slate-800" title={it.title}>{it.title}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="block max-w-40 truncate text-slate-700" title={it.datasetName}>{it.datasetName}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex flex-wrap items-center gap-1">
                                <DimensionBadge dimension={it.dimension} />
                                <Badge variant="outline" className={`border text-[10px] ${SEVERITY_BADGE[it.severity] ?? ''}`}>
                                  {SEVERITY_LABELS[it.severity as keyof typeof SEVERITY_LABELS]?.th ?? it.severity}
                                </Badge>
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={`border text-[10px] ${ISSUE_SOURCE_LABELS[it.source]?.cls ?? ''}`}>
                                <Flag className="mr-0.5 size-2.5" aria-hidden="true" />
                                {ISSUE_SOURCE_LABELS[it.source]?.th ?? it.source}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={`border text-[10.5px] ${ISSUE_STATUS_META[it.status]?.cls ?? ''}`}>
                                {ISSUE_STATUS_META[it.status]?.th ?? it.status}
                              </Badge>
                              {daysOverdueOf(it) !== null && (
                                <Badge variant="outline" className="mt-1 block w-fit border-rose-300 bg-rose-50 text-[10px] text-rose-800">
                                  <CalendarClock className="mr-0.5 size-2.5" aria-hidden="true" />
                                  เกินกำหนด {daysOverdueOf(it)} วัน
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[10.5px] text-muted-foreground">
                              {it.assignedTo ?? <span className="italic">ยังไม่มอบหมาย</span>}
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* แบ่งหน้า */}
              {pages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>หน้า {page} / {pages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                      ก่อนหน้า
                    </Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
                      ถัดไป
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ===================== TAB 2: EXCEPTIONS ===================== */}
      <TabsContent value="exceptions" className="mt-4">
        <ExceptionsPanel />
      </TabsContent>

      {/* Dialog เปิดปัญหาใหม่ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4 text-emerald-700" aria-hidden="true" />
              เปิดปัญหาคุณภาพข้อมูลใหม่
            </DialogTitle>
            <DialogDescription>
              ผู้รายงานต้องมีสิทธิ์ MANAGE_ISSUES — ระบบจะบันทึก Audit Trail และเริ่มสถานะ &quot;เปิดใหม่&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cr-dataset">ชุดข้อมูล</Label>
              <select
                id="cr-dataset"
                aria-label="เลือกชุดข้อมูลที่มีปัญหา"
                value={crDataset}
                onChange={(e) => setCrDataset(e.target.value)}
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
            <div className="space-y-1.5">
              <Label htmlFor="cr-title">หัวข้อปัญหา (อย่างน้อย 8 ตัวอักษร)</Label>
              <Input
                id="cr-title"
                value={crTitle}
                onChange={(e) => setCrTitle(e.target.value)}
                placeholder="เช่น อีเมลลูกค้าไม่ครบถ้วนในบางสาขา"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-desc">รายละเอียด (ไม่บังคับ)</Label>
              <textarea
                id="cr-desc"
                className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={crDesc}
                onChange={(e) => setCrDesc(e.target.value)}
                placeholder="อธิบายอาการ ขอบเขต และผลกระทบ"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>มิติคุณภาพข้อมูล</Label>
                <select
                  aria-label="เลือกมิติคุณภาพข้อมูล"
                  value={crDimension}
                  onChange={(e) => setCrDimension(e.target.value as DimensionKey)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {DIMENSION_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {DIMENSION_LABELS[k]?.th ?? k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>ความรุนแรง</Label>
                <select
                  aria-label="เลือกความรุนแรง"
                  value={crSeverity}
                  onChange={(e) => setCrSeverity(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {SEVERITY_KEYS.map((sv) => (
                    <option key={sv} value={sv}>
                      {SEVERITY_LABELS[sv]?.th ?? sv}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              {/* v0.32.0 — ผู้รายงาน = ผู้ใช้ปัจจุบันจาก header (สิทธิ์ MANAGE_ISSUES ตรวจที่ API) */}
              <Label>ผู้รายงาน (ต้องมีสิทธิ์ MANAGE_ISSUES)</Label>
              <div className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground">
                <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                <span className="min-w-0 truncate">{user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลด…'}</span>
              </div>
            </div>
            <Button
              className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={createIssue}
              disabled={!crDataset || crTitle.trim().length < 8 || busy !== null}
            >
              {busy === 'create-issue' ? 'กำลังบันทึก…' : 'เปิดปัญหา'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog รายละเอียดปัญหา + การเปลี่ยนสถานะ */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  <span className="font-mono text-xs text-muted-foreground">{detail.code}</span>
                  {detail.title}
                </DialogTitle>
                <DialogDescription>
                  {detail.datasetName} · รายงานโดย {detail.reportedBy} · ตรวจพบ {fmtTime(detail.detectedAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DimensionBadge dimension={detail.dimension} />
                  <Badge variant="outline" className={`border text-[10px] ${SEVERITY_BADGE[detail.severity] ?? ''}`}>
                    {SEVERITY_LABELS[detail.severity as keyof typeof SEVERITY_LABELS]?.th ?? detail.severity}
                  </Badge>
                  <Badge variant="outline" className={`border text-[10px] ${ISSUE_SOURCE_LABELS[detail.source]?.cls ?? ''}`}>
                    ที่มา: {ISSUE_SOURCE_LABELS[detail.source]?.th ?? detail.source}
                  </Badge>
                  <Badge variant="outline" className={`border text-[10.5px] ${ISSUE_STATUS_META[detail.status]?.cls ?? ''}`}>
                    {ISSUE_STATUS_META[detail.status]?.th ?? detail.status}
                  </Badge>
                </div>

                {detail.description && (
                  <p className="rounded-md border bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-700">{detail.description}</p>
                )}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border p-3 text-[11.5px]">
                  <dt className="text-muted-foreground">ผู้รับผิดชอบ</dt>
                  <dd className="font-medium text-slate-800">{detail.assignedTo ?? '— ยังไม่มอบหมาย —'}</dd>
                  <dt className="text-muted-foreground">วันครบกำหนด (SLA)</dt>
                  <dd className="font-medium text-slate-800">
                    {detail.dueAt ? detail.dueAt.slice(0, 10) : '— ยังไม่ตั้ง —'}
                    {daysOverdueOf(detail) !== null && (
                      <Badge variant="outline" className="ml-1.5 border-rose-300 bg-rose-50 text-[10px] text-rose-800">
                        เกินกำหนด {daysOverdueOf(detail)} วัน
                      </Badge>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">แก้ไขเมื่อ</dt>
                  <dd className="text-slate-700">{fmtTime(detail.resolvedAt)}</dd>
                  <dt className="text-muted-foreground">ปิดเมื่อ</dt>
                  <dd className="text-slate-700">{fmtTime(detail.closedAt)}</dd>
                  {detail.resolutionNote && (
                    <>
                      <dt className="text-muted-foreground">วิธีแก้ไข</dt>
                      <dd className="text-slate-700">{detail.resolutionNote}</dd>
                    </>
                  )}
                </dl>

                {/* การเปลี่ยนสถานะตาม lifecycle */}
                <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-900">
                    <ShieldAlert className="size-3.5" aria-hidden="true" />
                    ดำเนินการต่อ (ตาม lifecycle — ต้องมีสิทธิ์ตามขั้นตอน)
                  </p>
                  <div className="space-y-1">
                    {/* v0.32.0 — ผู้ดำเนินการเปลี่ยนสถานะ = ผู้ใช้ปัจจุบันจาก header */}
                    <Label className="text-[10.5px] text-emerald-900">ผู้ดำเนินการ (ผู้ใช้ปัจจุบัน)</Label>
                    <div className="flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-2 text-[11px] text-muted-foreground">
                      <UserRound className="size-3 shrink-0 text-emerald-700" aria-hidden="true" />
                      <span className="min-w-0 truncate">{user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลด…'}</span>
                    </div>
                  </div>
                  {detail.status === 'OPEN' && (
                    <Button
                      size="sm"
                      className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() => void transition(detail, 'START')}
                      disabled={busy !== null}
                    >
                      เริ่มดำเนินการ (→ กำลังดำเนินการ)
                    </Button>
                  )}
                  {detail.status === 'IN_PROGRESS' && (
                    <div className="space-y-2">
                      <Input
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="วิธีแก้ไข (บังคับ อย่างน้อย 5 ตัวอักษร)"
                        aria-label="วิธีแก้ไข"
                        className="h-9 text-xs"
                      />
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => void transition(detail, 'RESOLVE', resolveNote)}
                        disabled={busy !== null || resolveNote.trim().length < 5}
                      >
                        ทำเครื่องหมายแก้ไขแล้ว (→ รอปิด)
                      </Button>
                    </div>
                  )}
                  {detail.status === 'RESOLVED' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-slate-700 text-white hover:bg-slate-800"
                        onClick={() => void transition(detail, 'CLOSE')}
                        disabled={busy !== null}
                        title="ต้องมีสิทธิ์ MANAGE_ISSUES"
                      >
                        ปิดปัญหา
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void transition(detail, 'REOPEN')} disabled={busy !== null}>
                        ส่งกลับเปิดใหม่
                      </Button>
                    </div>
                  )}
                  {detail.status === 'CLOSED' && (
                    <Button size="sm" variant="outline" onClick={() => void transition(detail, 'REOPEN')} disabled={busy !== null}>
                      เปิดปัญหาใหม่อีกครั้ง
                    </Button>
                  )}
                </div>

                {/* ตั้งวันครบกำหนด (SLA) — v0.17.0 */}
                {detail.status !== 'RESOLVED' && detail.status !== 'CLOSED' && (
                  <div className="flex items-end gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor="is-due" className="flex items-center gap-1 text-xs">
                        <CalendarClock className="size-3" aria-hidden="true" />
                        วันครบกำหนดของปัญหา (ใช้แจ้งเตือน "เกิน SLA" บนแดชบอร์ดผู้บริหาร)
                      </Label>
                      <Input
                        id="is-due"
                        type="date"
                        value={dueInput}
                        onChange={(e) => setDueInput(e.target.value)}
                        className="h-9 text-xs"
                        aria-label="วันครบกำหนดของปัญหา"
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void saveDue(detail)} disabled={busy !== null}>
                      บันทึกวันครบกำหนด
                    </Button>
                  </div>
                )}

                {/* มอบหมายผู้รับผิดชอบ */}
                {detail.status !== 'CLOSED' && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="is-assignee" className="flex items-center gap-1 text-xs">
                        <Eye className="size-3" aria-hidden="true" />
                        มอบหมายผู้รับผิดชอบ
                      </Label>
                      <select
                        id="is-assignee"
                        aria-label="เลือกผู้รับผิดชอบปัญหา"
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">— เลือกผู้รับผิดชอบ —</option>
                        {activeUsers.map((u) => (
                          <option key={u.id} value={u.email}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void assignIssue(detail)} disabled={busy !== null || !assignee}>
                      มอบหมาย
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
