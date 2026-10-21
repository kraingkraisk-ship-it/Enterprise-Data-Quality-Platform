'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  FileWarning,
  Flag,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  Wrench,
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
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { DimensionBadge } from '@/components/dimension-picker'
import { SEVERITY_LABELS } from '@/lib/dq'

/* ------------------------------------------------------------------ */
/* Failed Records — รายการข้อมูลรายแถวที่ไม่ผ่านการตรวจ                 */
/* snapshot จากรอบการตรวจ · PII masking ตามบทบาทผู้ชม (PDPA-first)      */
/* ------------------------------------------------------------------ */

interface FailureItem {
  id: string
  batchId: string
  datasetId: string
  datasetName: string
  ruleId: string
  ruleColumn: string
  conditionName: string
  dimension: string
  severity: string
  rowNo: number
  reason: string
  status: 'NEW' | 'FIXED' | 'IGNORED'
  statusBy: string | null
  statusAt: string | null
  createdAt: string
  data: Record<string, string>
  piiMasked: boolean
}

interface ApiUser {
  id: string
  email: string
  name: string
  role: string
  status: 'ACTIVE' | 'SUSPENDED'
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  NEW: { label: 'ยังไม่แก้ไข', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200' },
  FIXED: { label: 'แก้ไขแล้ว', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  IGNORED: { label: 'ยกเว้น', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' },
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

interface FailedRecordsProps {
  /** โหลดข้อมูลใหม่ทุกครั้งที่เปิดหน้า */
  active: boolean
}

export default function DqFailedRecords({ active }: FailedRecordsProps) {
  const { toast } = useToast()
  const [items, setItems] = useState<FailureItem[] | null>(null)
  const [stats, setStats] = useState<{ NEW: number; FIXED: number; IGNORED: number } | null>(null)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)

  // filters
  const [status, setStatus] = useState('')
  const [severity, setSeverity] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // ผู้ชม — กำหนดบทบาทเพื่อดู PII ตามสิทธิ์ (PDPA)
  const [users, setUsers] = useState<ApiUser[]>([])
  const [viewerEmail, setViewerEmail] = useState('')

  // dialog
  const [detail, setDetail] = useState<FailureItem | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/rbac/users')
        const data = (await res.json()) as { users?: ApiUser[] }
        setUsers((data.users ?? []).filter((u) => u.status === 'ACTIVE'))
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
      if (search) qs.set('search', search)
      if (viewerEmail) qs.set('operatorEmail', viewerEmail)
      qs.set('page', String(page))
      const res = await fetch(`/api/dq/failures?${qs.toString()}`)
      const data = (await res.json()) as {
        items?: FailureItem[]
        total?: number
        pages?: number
        stats?: { NEW: number; FIXED: number; IGNORED: number }
        error?: string
      }
      if (data.error) {
        setItems([])
        return
      }
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
      setStats(data.stats ?? null)
    } catch {
      setItems([])
    }
  }, [status, severity, search, viewerEmail, page])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  async function changeStatus(item: FailureItem, next: 'NEW' | 'FIXED' | 'IGNORED') {
    if (item.status === next) return
    const operator = viewerEmail || users[0]?.email || ''
    if (!operator) {
      toast({ title: 'กรุณาเลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    setBusy(item.id)
    try {
      const res = await fetch(`/api/dq/failures/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, operatorEmail: operator }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        toast({ title: 'เปลี่ยนสถานะไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: `ทำเครื่องหมายเป็น "${STATUS_META[next].label}" เรียบร้อย` })
      await load()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const kpiCards = [
    { key: 'NEW' as const, label: 'ยังไม่แก้ไข', cls: 'text-rose-700' },
    { key: 'FIXED' as const, label: 'แก้ไขแล้ว', cls: 'text-emerald-700' },
    { key: 'IGNORED' as const, label: 'ยกเว้น', cls: 'text-slate-600' },
  ]

  /** เปิดแถวที่ล้มเหลวเป็นปัญหาคุณภาพข้อมูล (DQ Issue) — ผู้รายงานต้องมีสิทธิ์ MANAGE_ISSUES */
  async function openAsIssue(item: FailureItem) {
    const reporter = viewerEmail || users.find((u) => u.role === 'DATA_OWNER')?.email || ''
    if (!reporter) {
      toast({ title: 'กรุณาเลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    setBusy(`issue-${item.id}`)
    try {
      const res = await fetch('/api/dq/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: item.datasetId,
          title: `แถว #${item.rowNo} ไม่ผ่านกฎ ${item.ruleColumn}`,
          description: `เปิดจากข้อมูลที่ไม่ผ่าน — เหตุผล: ${item.reason}`,
          dimension: item.dimension,
          severity: item.severity,
          source: 'FAILURE',
          sourceId: item.id,
          reportedByEmail: reporter,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'เปิดปัญหาไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      if (data.existing) {
        toast({ title: `ปัญหา ${data.issue.code} เปิดไว้แล้วสำหรับแถวนี้ — ติดตามที่เมนูปัญหาคุณภาพข้อมูล` })
      } else {
        toast({ title: `เปิดปัญหา ${data.issue.code} จากแถว #${item.rowNo} เรียบร้อย — ติดตามที่เมนูปัญหาคุณภาพข้อมูล` })
      }
      setDetail(null)
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* คำเตือนหลักการ */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p>
          <strong>ข้อควรทราบ:</strong> รายการนี้คือ snapshot ของแถวที่ล้มเหลวจากรอบการตรวจ (สูงสุด 200 แถวต่อกฎต่อรอบ) — การทำเครื่องหมายสถานะเป็นการบันทึกการจัดการเท่านั้น ระบบไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ และค่าในข้อมูลถูกปิดบัง PII ตามบทบาทผู้ชม (PDPA)
        </p>
      </div>

      {/* KPI สถานะ */}
      <div className="grid grid-cols-3 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.key} className="p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${stats ? k.cls : 'text-slate-400'}`}>
              {stats ? stats[k.key] : '…'}
              <span className="ml-1 text-xs font-normal text-muted-foreground">แถว</span>
            </p>
          </Card>
        ))}
      </div>

      {/* ตัวกรอง */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileWarning className="size-4 text-emerald-700" aria-hidden="true" />
                รายการข้อมูลที่ไม่ผ่าน (Failed Records)
              </CardTitle>
              <CardDescription>รวม {total} แถว — กรองตามสถานะ ความรุนแรง หรือค้นหาค่าในข้อมูล</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load()} disabled={busy !== null}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              รีเฟรช
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="fr-status" className="text-xs">สถานะ</Label>
              <select
                id="fr-status"
                aria-label="กรองตามสถานะ"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setPage(1)
                }}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="">ทุกสถานะ</option>
                <option value="NEW">ยังไม่แก้ไข</option>
                <option value="FIXED">แก้ไขแล้ว</option>
                <option value="IGNORED">ยกเว้น</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-severity" className="text-xs">ความรุนแรง</Label>
              <select
                id="fr-severity"
                aria-label="กรองตามความรุนแรง"
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value)
                  setPage(1)
                }}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="">ทุกระดับ</option>
                <option value="CRITICAL">วิกฤต (CRITICAL)</option>
                <option value="HIGH">สูง (HIGH)</option>
                <option value="MEDIUM">ปานกลาง (MEDIUM)</option>
                <option value="LOW">ต่ำ (LOW)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-search" className="text-xs">ค้นหาค่าในข้อมูล</Label>
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  setSearch(searchInput)
                  setPage(1)
                }}
              >
                <Input
                  id="fr-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="เช่น เชียงใหม่"
                  className="h-9 text-xs"
                />
                <Button type="submit" size="sm" variant="outline" className="gap-1 px-2.5" aria-label="ค้นหา">
                  <Search className="size-3.5" aria-hidden="true" />
                </Button>
              </form>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fr-viewer" className="flex items-center gap-1 text-xs">
                <Eye className="size-3" aria-hidden="true" />
                ผู้ชม (PII ตามบทบาท)
              </Label>
              <select
                id="fr-viewer"
                aria-label="เลือกผู้ชมเพื่อดูข้อมูลตามสิทธิ์บทบาท"
                value={viewerEmail}
                onChange={(e) => setViewerEmail(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="">ปิดบังเข้มสุด (แนะนำ)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
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
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              ไม่มีข้อมูลที่ไม่ผ่านตามเงื่อนไขที่เลือก — ข้อมูลคุณภาพดีตามกฎที่ตั้งไว้ 🎉
            </p>
          )}
          {items !== null && items.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 bg-emerald-50/90 text-emerald-900 backdrop-blur">
                  <tr>
                    <th scope="col" className="w-8 px-2 py-2" aria-label="ขยายรายละเอียด" />
                    <th scope="col" className="px-3 py-2 font-medium">ชุดข้อมูล · แถว</th>
                    <th scope="col" className="px-3 py-2 font-medium">กฎที่ล้มเหลว</th>
                    <th scope="col" className="px-3 py-2 font-medium">มิติ · ความรุนแรง</th>
                    <th scope="col" className="px-3 py-2 font-medium">สถานะ</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <Fragment key={f.id}>
                      <tr className="border-t transition-colors hover:bg-slate-50">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            aria-label={f.status === 'NEW' ? `ดูข้อมูลแถวที่ ${f.rowNo}` : `ดูข้อมูลแถวที่ ${f.rowNo}`}
                            onClick={() => setDetail(f)}
                            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-slate-100"
                          >
                            <ChevronRight className="size-3.5 text-slate-500" aria-hidden="true" />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" className="text-left" onClick={() => setDetail(f)}>
                            <span className="block max-w-40 truncate font-medium text-slate-800" title={f.datasetName}>{f.datasetName}</span>
                            <span className="text-[10.5px] text-muted-foreground">แถว #{f.rowNo} · {fmtTime(f.createdAt)}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block max-w-48 truncate font-mono text-[11px] text-slate-700" title={f.ruleColumn}>{f.ruleColumn}</span>
                          <span className="text-[10.5px] text-muted-foreground">{f.conditionName}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <DimensionBadge dimension={f.dimension} />
                            <Badge variant="outline" className={`border text-[10px] ${SEVERITY_BADGE[f.severity] ?? ''}`}>
                              {SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS]?.th ?? f.severity}
                            </Badge>
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`border text-[10.5px] ${STATUS_META[f.status]?.badgeClass ?? ''}`}>
                            {STATUS_META[f.status]?.label ?? f.status}
                          </Badge>
                          {f.statusBy && <span className="mt-0.5 block text-[10px] text-muted-foreground">{f.statusBy}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 border-emerald-200 px-2 text-[10.5px] text-emerald-800 hover:bg-emerald-50"
                              onClick={() => void changeStatus(f, 'FIXED')}
                              disabled={busy !== null || f.status === 'FIXED'}
                              title="ทำเครื่องหมายว่าแก้ไขแล้ว"
                            >
                              <Wrench className="size-3" aria-hidden="true" />
                              แก้แล้ว
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-[10.5px] text-slate-600 hover:bg-slate-100"
                              onClick={() => void changeStatus(f, 'IGNORED')}
                              disabled={busy !== null || f.status === 'IGNORED'}
                              title="ขอยกเว้นแถวนี้"
                            >
                              <Eye className="size-3" aria-hidden="true" />
                              ยกเว้น
                            </Button>
                            {f.status !== 'NEW' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-1.5 text-[10.5px] text-slate-500 hover:bg-slate-100"
                                onClick={() => void changeStatus(f, 'NEW')}
                                disabled={busy !== null}
                                title="กลับเป็นยังไม่แก้ไข"
                              >
                                <RotateCcw className="size-3" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
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

      {/* Dialog รายละเอียดแถว */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  <FileWarning className="size-4 text-rose-600" aria-hidden="true" />
                  แถว #{detail.rowNo} — {detail.datasetName}
                </DialogTitle>
                <DialogDescription>
                  กฎ: {detail.ruleColumn} — {detail.conditionName} · {fmtTime(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-900" role="note">
                  <strong>เหตุผลที่ล้มเหลว:</strong> {detail.reason}
                </p>
                <div className="rounded-md border">
                  <p className="flex items-center gap-1.5 border-b bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-700">
                    <UserCheck className="size-3.5" aria-hidden="true" />
                    ข้อมูลในแถว {detail.piiMasked ? '(ปิดบัง PII ตามบทบาทผู้ชม)' : '(แสดงเต็ม — บทบาทผู้ชมมีสิทธิ์)'}
                  </p>
                  <dl className="max-h-64 divide-y overflow-y-auto">
                    {Object.entries(detail.data).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[1fr_1.4fr] gap-2 px-3 py-1.5 text-[11.5px]">
                        <dt className="truncate font-mono text-slate-500" title={k}>{k}</dt>
                        <dd className="break-words font-medium text-slate-800">{v === '' ? <span className="italic text-slate-400">(ค่าว่าง)</span> : v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-amber-300 text-amber-900 hover:bg-amber-50"
                    onClick={() => {
                      void openAsIssue(detail)
                    }}
                    disabled={busy !== null}
                    title="เปิดเป็นปัญหาในทะเบียน DQ Issues (ผู้รายงานต้องมีสิทธิ์ MANAGE_ISSUES)"
                  >
                    <Flag className="size-3.5" aria-hidden="true" />
                    {busy === `issue-${detail.id}` ? 'กำลังเปิด…' : 'เปิดเป็น Issue'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                    onClick={() => {
                      void changeStatus(detail, 'FIXED')
                      setDetail(null)
                    }}
                    disabled={busy !== null}
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    ทำเครื่องหมายแก้ไขแล้ว
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
