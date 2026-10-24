'use client'

/**
 * Audit Center — ศูนย์บันทึกตรวจสอบ (v0.30.0)
 * คลัง Audit Log ศูนย์กลางของทั้งระบบในหน้าเดียว:
 *   · การ์ดสรุป: บันทึกทั้งหมด · วันนี้ · 7 วันล่าสุด · ผู้กระทำสูงสุด
 *   · ตัวกรอง: กลุ่ม action (6 กลุ่ม ตามคลังกลาง audit-actions.ts) · ผู้กระทำ · ช่วงวันที่ · ค้นหาข้อความ
 *   · รายการแบบแบ่งหน้า (โหลดเพิ่ม) + ส่งออก CSV ของมุมมองที่กรองไว้ (ตรงกับบนจอเสมอ)
 *   · นโยบายเก็บรักษา: ตั้ง "เก็บไว้กี่วัน" + ลบของเก่าตามนโยบาย (ต้องมีสิทธิ์ MANAGE_USERS —
 *     ทุกการตั้งค่าและการลบถูกบันทึกลง Audit Log ด้วย = meta-audit)
 * แหล่งข้อมูล: GET /api/audit · GET /api/audit/export · GET|POST /api/audit/retention
 * ขอบเขต: อ่าน/จัดการ log เท่านั้น — ไม่แตะจุดเขียน log เดิมใน API อื่น
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Download,
  History,
  RotateCcw,
  ScrollText,
  Search,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { rolesWithPermission } from '@/lib/dq'
import { type RoleKey } from '@/lib/rbac'
import {
  AUDIT_GROUP_ORDER,
  AUDIT_GROUPS,
  auditBadge,
  type AuditGroupKey,
} from '@/lib/audit-actions'

/* ------------------------------- types ----------------------------------- */

interface AuditLogRow {
  id: string
  action: string
  actor: string
  target: string
  detail: string
  createdAt: string
}

interface AuditStats {
  total: number
  today: number
  last7: number
  topActor: { actor: string; count: number } | null
}

interface AuditFacets {
  actors: Array<{ actor: string; count: number }>
  byGroup: Record<string, number>
}

interface AuditPolicyInfo {
  retentionDays: number
  updatedAt: string | null
  updatedBy: string | null
  willPrune: number
  oldestAt: string | null
}

interface AuditResponse {
  logs: AuditLogRow[]
  total: number
  stats: AuditStats
  facets: AuditFacets
  policy: AuditPolicyInfo
}

interface DashUser {
  email: string
  name: string
  role: string
  status?: string
}

const PAGE_SIZE = 50

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

function fmtDay(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return iso
  }
}

/* ----------------------------- component --------------------------------- */

export default function AuditCenter({ active }: { active: boolean }) {
  const { toast } = useToast()

  /* ---------- ข้อมูลหลัก ---------- */
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [facets, setFacets] = useState<AuditFacets | null>(null)
  const [policy, setPolicy] = useState<AuditPolicyInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const fetchedCountRef = useRef(0)

  /* ---------- ตัวกรอง ---------- */
  const [groups, setGroups] = useState<AuditGroupKey[]>([])
  const [actor, setActor] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')

  /* ---------- นโยบายเก็บรักษา ---------- */
  const [users, setUsers] = useState<DashUser[]>([])
  const [opEmail, setOpEmail] = useState('')
  const [retDays, setRetDays] = useState('365')
  const [busy, setBusy] = useState<string | null>(null)

  const manageRoles = useMemo(() => rolesWithPermission('MANAGE_USERS').map((r) => r.key), [])
  const operators = useMemo(
    () => users.filter((u) => u.status !== 'SUSPENDED' && manageRoles.includes(u.role as RoleKey)),
    [users, manageRoles],
  )

  /* ---------- สร้าง query จากตัวกรองปัจจุบัน (ใช้ทั้งโหลดรายการและส่งออก — ชุดเดียวกัน) ---------- */
  const buildQuery = useCallback(
    (offset: number): URLSearchParams => {
      const sp = new URLSearchParams()
      if (groups.length > 0) sp.set('groups', groups.join(','))
      if (actor !== 'all') sp.set('actor', actor)
      if (from) sp.set('from', from)
      if (to) sp.set('to', to)
      if (q) sp.set('q', q)
      sp.set('limit', String(PAGE_SIZE))
      sp.set('offset', String(offset))
      return sp
    },
    [groups, actor, from, to, q],
  )

  const applyResponse = useCallback((json: AuditResponse) => {
    setTotal(json.total ?? 0)
    setStats(json.stats ?? null)
    setFacets(json.facets ?? null)
    setPolicy(json.policy ?? null)
  }, [])

  /* ---------- โหลดครั้งแรก/เมื่อตัวกรองเปลี่ยน ---------- */
  useEffect(() => {
    if (!active) return
    let alive = true
    setLoading(true)
    fetchedCountRef.current = 0
    ;(async () => {
      try {
        const res = await fetch(`/api/audit?${buildQuery(0).toString()}`)
        const json = (await res.json()) as AuditResponse & { error?: string }
        if (!alive) return
        if (!res.ok) throw new Error(json.error ?? 'โหลดบันทึกไม่สำเร็จ')
        setLogs(json.logs ?? [])
        fetchedCountRef.current = (json.logs ?? []).length
        applyResponse(json)
      } catch {
        if (!alive) return
        setLogs([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [active, buildQuery, reloadTick, applyResponse])

  /* ---------- โหลดเพิ่ม (เก็บรายการเดิม ต่อท้าย) ---------- */
  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const offset = fetchedCountRef.current
      const res = await fetch(`/api/audit?${buildQuery(offset).toString()}`)
      const json = (await res.json()) as AuditResponse & { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'โหลดเพิ่มไม่สำเร็จ')
      const more = json.logs ?? []
      setLogs((prev) => [...(prev ?? []), ...more])
      fetchedCountRef.current = offset + more.length
      applyResponse(json)
    } catch {
      toast({ title: 'ขัดข้อง', description: 'โหลดรายการเพิ่มไม่สำเร็จ', variant: 'destructive' })
    } finally {
      setLoadingMore(false)
    }
  }

  /* ---------- ผู้ใช้ (สำหรับเลือกผู้ดำเนินการนโยบาย) ---------- */
  useEffect(() => {
    if (!active || users.length > 0) return
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((b: { users?: DashUser[] }) => {
        setUsers(b.users ?? [])
      })
      .catch(() => setUsers([]))
  }, [active, users.length])

  /* ---------- actions ---------- */
  function toggleGroup(g: AuditGroupKey) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  function clearFilters() {
    setGroups([])
    setActor('all')
    setFrom('')
    setTo('')
    setQInput('')
    setQ('')
  }

  const hasFilters = groups.length > 0 || actor !== 'all' || from !== '' || to !== '' || q !== ''

  function exportCsv() {
    const sp = buildQuery(0)
    sp.delete('limit')
    sp.delete('offset')
    const a = document.createElement('a')
    a.href = `/api/audit/export?${sp.toString()}`
    a.download = 'audit-log.csv'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function saveRetention(apply: boolean) {
    if (!opEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน (ต้องมีสิทธิ์จัดการผู้ใช้และสิทธิ์)', variant: 'destructive' })
      return
    }
    setBusy(apply ? 'prune' : 'retention')
    try {
      const body: Record<string, unknown> = { operatorEmail: opEmail, apply }
      if (!apply) body.retentionDays = Number(retDays)
      const res = await fetch('/api/audit/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'ไม่สำเร็จ', description: json.error ?? 'เกิดข้อผิดพลาด', variant: 'destructive' })
        return
      }
      if (apply) {
        toast({
          title: 'ลบตามนโยบายสำเร็จ',
          description: json.pruned > 0 ? `ลบบันทึกที่หมดอายุ ${json.pruned} รายการ (บันทึกเหตุการณ์นี้ลง Audit Log แล้ว)` : 'ไม่มีรายการที่หมดอายุให้ลบ',
        })
      } else {
        toast({ title: 'สำเร็จ', description: `ตั้งนโยบายเก็บรักษาที่ ${json.retentionDays} วัน (บันทึกลง Audit Log แล้ว)` })
      }
      setReloadTick((t) => t + 1)
    } catch {
      toast({ title: 'ขัดข้อง', description: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  /* ---------- ค่าอนุพันธ์สำหรับแสดงผล ---------- */
  const shown = logs?.length ?? 0
  const unknownCount = facets?.byGroup.__unknown ?? 0

  return (
    <div className="space-y-4" aria-label="ศูนย์บันทึกตรวจสอบ">
      {/* ------------------------- หัวหน้า ------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          ทุกการเปลี่ยนแปลงของระบบถูกบันทึกอัตโนมัติจากทุกโมดูล — ค้นหา กรอง และส่งออกเพื่อการตรวจสอบย้อนหลัง
        </p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReloadTick((t) => t + 1)}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
          รีเฟรช
        </Button>
      </div>

      {/* ------------------------- การ์ดสรุป ------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ScrollText className="size-3.5" aria-hidden="true" /> บันทึกทั้งหมด
          </div>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{stats ? stats.total.toLocaleString('th-TH') : '—'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" /> วันนี้
          </div>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{stats ? stats.today.toLocaleString('th-TH') : '—'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5" aria-hidden="true" /> 7 วันล่าสุด
          </div>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{stats ? stats.last7.toLocaleString('th-TH') : '—'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="size-3.5" aria-hidden="true" /> ผู้กระทำสูงสุด
          </div>
          {stats?.topActor ? (
            <p className="mt-1.5 truncate text-sm font-semibold" title={stats.topActor.actor}>
              {stats.topActor.actor}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">({stats.topActor.count} รายการ)</span>
            </p>
          ) : (
            <p className="mt-1.5 text-2xl font-semibold text-muted-foreground">—</p>
          )}
        </Card>
      </div>

      {/* ------------------------- ตัวกรอง ------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">ตัวกรองบันทึก</CardTitle>
          <CardDescription>เลือกกลุ่มหลายกลุ่มได้ — ตัวเลขในวงเล็บคือจำนวนบันทึกทั้งระบบของกลุ่มนั้น</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* กลุ่ม action */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามกลุ่ม action">
            <button
              type="button"
              onClick={() => setGroups([])}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                groups.length === 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              ทั้งหมด
            </button>
            {AUDIT_GROUP_ORDER.map((g) => {
              const def = AUDIT_GROUPS[g]
              const on = groups.includes(g)
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGroup(g)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    on ? def.chipActiveClass : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {def.th} ({facets?.byGroup[g] ?? 0})
                </button>
              )
            })}
            {unknownCount > 0 && (
              <Badge variant="outline" className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                อื่น ๆ ({unknownCount})
              </Badge>
            )}
          </div>

          {/* ผู้กระทำ + วันที่ */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="audit-actor" className="text-xs">ผู้กระทำ</Label>
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger id="audit-actor" className="h-9">
                  <SelectValue placeholder="ทุกคน" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">ทุกคน</SelectItem>
                  {(facets?.actors ?? []).map((a) => (
                    <SelectItem key={a.actor} value={a.actor}>
                      {a.actor} ({a.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-from" className="text-xs">ตั้งแต่วันที่</Label>
              <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-to" className="text-xs">ถึงวันที่</Label>
              <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-q" className="text-xs">ค้นหาข้อความ</Label>
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  setQ(qInput.trim())
                }}
              >
                <Input
                  id="audit-q"
                  type="search"
                  placeholder="รายละเอียด / เป้าหมาย / action"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="outline" className="h-9 shrink-0 gap-1 px-2.5" aria-label="ค้นหา">
                  <Search className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">ค้นหา</span>
                </Button>
              </form>
            </div>
          </div>

          {/* แถวปุ่มจัดการตัวกรอง */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={loading}>
              <Download className="size-3.5" aria-hidden="true" />
              ส่งออก CSV (มุมมองนี้)
            </Button>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                ล้างตัวกรอง
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {loading ? 'กำลังโหลด…' : `แสดง ${shown.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')} รายการ`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------- รายการบันทึก ------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <History className="size-4 text-emerald-700" aria-hidden="true" />
            บันทึกการตรวจสอบ (Audit Trail)
          </CardTitle>
          <CardDescription>เรียงจากใหม่ → เก่า · แสดงครั้งละ 50 รายการ</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ol className="max-h-[28rem] divide-y overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100">
            {loading && <li className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดข้อมูล…</li>}
            {!loading && logs?.length === 0 && (
              <li className="py-10 text-center text-sm text-muted-foreground">
                {hasFilters ? 'ไม่พบรายการตามเงื่อนไขที่กรอง — ลองล้างตัวกรอง' : 'ยังไม่มีรายการบันทึก'}
              </li>
            )}
            {!loading &&
              logs?.map((log) => {
                const badge = auditBadge(log.action)
                return (
                  <li
                    key={log.id}
                    className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <Badge variant="outline" className={`shrink-0 ${badge.className}`}>
                      {badge.th}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm">{log.detail}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        โดย <span className="font-medium">{log.actor}</span> · {fmtTime(log.createdAt)}
                        {log.target && log.target !== log.actor && <> · เป้าหมาย: {log.target}</>}
                      </p>
                    </div>
                  </li>
                )
              })}
          </ol>
          {logs !== null && shown < total && (
            <div className="border-t p-3 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'กำลังโหลด…' : `โหลดเพิ่ม (เหลืออีก ${(total - shown).toLocaleString('th-TH')} รายการ)`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------- นโยบายเก็บรักษา ------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">นโยบายการเก็บรักษา (Retention)</CardTitle>
          <CardDescription>
            กำหนดว่าบันทึกตรวจสอบจะเก็บไว้กี่วัน — การตั้งค่าและการลบทุกครั้งถูกบันทึกลง Audit Log ด้วย
            (meta-audit: เหตุการณ์ "การลบบันทึก" ต้องปรากฏในบันทึกเสมอ เพื่อความน่าเชื่อถือของระบบ)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* สถานะปัจจุบัน */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">นโยบายปัจจุบัน</p>
              <p className="mt-1 text-lg font-semibold">
                เก็บไว้ <span className="tabular-nums text-emerald-700">{policy?.retentionDays ?? '—'}</span> วัน
              </p>
              {policy?.updatedBy && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ปรับโดย {policy.updatedBy} · {fmtTime(policy.updatedAt)}
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">บันทึกที่หมดอายุแล้ว</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {policy ? policy.willPrune.toLocaleString('th-TH') : '—'} รายการ
              </p>
              {policy && policy.oldestAt && (
                <p className="mt-0.5 text-xs text-muted-foreground">บันทึกเก่าสุด {fmtDay(policy.oldestAt)}</p>
              )}
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">ถ้าลบตอนนี้</p>
              <p className="mt-1 text-lg font-semibold">
                จะลบก่อนวันที่{' '}
                <span className="text-rose-700">
                  {policy ? fmtDay(new Date(Date.now() - policy.retentionDays * 86_400_000).toISOString()) : '—'}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">คำนวณจากนโยบายปัจจุบัน</p>
            </div>
          </div>

          {/* ฟอร์มผู้ดำเนินการ */}
          {operators.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              ต้องการบทบาทที่มีสิทธิ์ "จัดการผู้ใช้และสิทธิ์" เพื่อตั้งนโยบายหรือลบบันทึก (ตามหลัก RBAC) — ยังไม่มีบัญชีที่มีสิทธิ์นี้
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="audit-op" className="text-xs">ผู้ดำเนินการ (สิทธิ์จัดการผู้ใช้)</Label>
                <Select value={opEmail} onValueChange={setOpEmail}>
                  <SelectTrigger id="audit-op" className="h-9">
                    <SelectValue placeholder="เลือกบัญชีผู้ดำเนินการ" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {operators.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} ({rolesWithPermission('MANAGE_USERS').find((r) => r.key === u.role)?.th ?? u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-days" className="text-xs">เก็บบันทึกไว้ (วัน)</Label>
                <Select value={retDays} onValueChange={setRetDays}>
                  <SelectTrigger id="audit-days" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['90', '180', '365', '730', '1825', '3650'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {Number(d).toLocaleString('th-TH')} วัน
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button size="sm" className="flex-1" onClick={() => saveRetention(false)} disabled={busy !== null}>
                  {busy === 'retention' ? 'กำลังบันทึก…' : 'บันทึกนโยบาย'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="flex-1" disabled={busy !== null || (policy?.willPrune ?? 0) === 0}>
                      {busy === 'prune' ? 'กำลังลบ…' : 'ลบตามนโยบายตอนนี้'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ยืนยันลบบันทึกที่หมดอายุ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        จะลบบันทึกการตรวจสอบที่เก่ากว่า {policy?.retentionDays ?? '—'} วัน จำนวน{' '}
                        <strong className="text-foreground">{policy?.willPrune.toLocaleString('th-TH') ?? 0}</strong> รายการ
                        (ก่อนวันที่ {policy ? fmtDay(new Date(Date.now() - policy.retentionDays * 86_400_000).toISOString()) : '—'})
                        การลบนี้ทำแล้วย้อนกลับไม่ได้ แต่เหตุการณ์การลบจะถูกบันทึกลง Audit Log เพื่อการตรวจสอบ
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                      <AlertDialogAction onClick={() => saveRetention(true)}>ยืนยันลบ</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
