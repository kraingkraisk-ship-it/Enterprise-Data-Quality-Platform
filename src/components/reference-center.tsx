'use client'

/**
 * Reference Data Center — ศูนย์ข้อมูลอ้างอิง (v0.31.0)
 * ทะเบียนค่ามาตรฐานศูนย์กลาง (DAMA-DMBOK: Reference Data Management) ในหน้าเดียว:
 *   · การ์ดสรุป: ทะเบียนทั้งหมด · ใช้งาน (ACTIVE) · รออนุมัติ · ค่าอ้างอิงทั้งหมด
 *   · รายการทะเบียน: กรองสถานะ + ค้นหา + badge สถานะ/workflow/เวอร์ชัน + จำนวนค่า + การใช้งาน (กฎ/Element/Mapping)
 *   · รายละเอียดทะเบียน: metadata + workflow อนุมัติแบบเดียวกับ Data Element (ส่ง → อนุมัติ/ส่งกลับ → เลิกใช้)
 *   · ค่าอ้างอิง: เพิ่ม/แก้ไข/เลิกใช้/เปิดใช้ซ้ำ + นำเข้า CSV + ส่งออก CSV
 *   · สแกนค่านอกทะเบียน (orphan): เทียบข้อมูลจริงในคลังกับค่า ACTIVE ของทะเบียน
 *   · การใช้งาน: กฎโหมดทะเบียน · Element ที่ผูก · Mapping LOOKUP ที่อ้าง + Audit Trail
 * แหล่งข้อมูล: /api/reference/sets (+[id] · values · import · export · scan) · /api/domains · /api/assets · /api/rbac/users
 * สิทธิ์ deny-by-default (เหมือน Data Element): จัดการ = MANAGE_DATASETS · อนุมัติ = APPROVE_EXCEPTIONS
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookMarked,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  Search,
  ShieldQuestion,
  Upload,
  XCircle,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { rolesWithPermission } from '@/lib/dq'
import type { RoleKey } from '@/lib/rbac'
import {
  REFERENCE_IMPORT_MAX_ROWS,
  REFERENCE_STATUS_LABELS,
  REFERENCE_VALUE_STATUS_LABELS,
  REFERENCE_VALUES_CAP,
  type ReferenceSetItem,
  type ReferenceValueItem,
  type ReferenceStatus,
} from '@/lib/reference'

/* ------------------------------- types ----------------------------------- */

interface DashUser {
  email: string
  name: string
  role: string
  status?: string
}

interface DomainRow {
  id: string
  name: string
  nameEn?: string
  parentId: string | null
}

interface AssetRow {
  id: string
  name: string
  columnCount: number
  status: string
}

interface AssetDetail {
  asset: { id: string; name: string }
  /** รูปทรงจริงจาก GET /api/assets/[id] — columns อยู่ระดับบนสุด (ไม่ซ้อนใน asset) */
  columns: Array<{ name: string; dataType: string }>
}

interface UsageInfo {
  rules: Array<{ id: string; column: string; condition: string; datasetNames: string[]; enabled: boolean }>
  elements: Array<{ id: string; code: string; nameTh: string }>
  mappings: Array<{ id: string; code: string }>
}

interface PersonInfo {
  email: string
  name: string
  roleTh: string | null
}

interface DetailResponse {
  set: ReferenceSetItem & { createdBy: string; createdAt: string; updatedAt: string }
  values: ReferenceValueItem[]
  stewardship: { owner: PersonInfo | null; steward: PersonInfo | null; approvedBy: PersonInfo | null }
  usage: UsageInfo
  auditTrail: Array<{ id: string; action: string; actor: string; detail: string; createdAt: string }>
}

interface ScanResult {
  asset: { id: string; name: string }
  columnName: string
  totalRows: number
  nonEmptyRows: number
  orphanRows: number
  distinctOrphan: number
  activeValueCount: number
  top: Array<{ value: string; count: number }>
  truncated: boolean
  clean: boolean
  message: string
}

type StatusFilter = 'ALL' | 'PENDING' | ReferenceStatus

function fmtTime(iso: string | null | undefined): string {
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
    return String(iso)
  }
}

function statusChip(status: string): string {
  const def = REFERENCE_STATUS_LABELS[status as ReferenceStatus]
  return def?.chip ?? 'border-slate-300 bg-slate-100 text-slate-600'
}

export default function ReferenceCenter({ active }: { active: boolean }) {
  const { toast } = useToast()

  /* ---------- ข้อมูลหลัก ---------- */
  const [sets, setSets] = useState<ReferenceSetItem[]>([])
  const [stats, setStats] = useState<{ total: number; active: number; pending: number; valuesTotal: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  /* ---------- ตัวกรอง ---------- */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')

  /* ---------- รายละเอียด ---------- */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /* ---------- ผู้ใช้ / ผู้ดำเนินการ ---------- */
  const [users, setUsers] = useState<DashUser[]>([])
  const manageRoles = useMemo(() => rolesWithPermission('MANAGE_DATASETS').map((r) => r.key), [])
  const approveRoles = useMemo(() => rolesWithPermission('APPROVE_EXCEPTIONS').map((r) => r.key), [])
  const operators = useMemo(() => users.filter((u) => u.status !== 'SUSPENDED' && manageRoles.includes(u.role as RoleKey)), [users, manageRoles])
  const approvers = useMemo(() => users.filter((u) => u.status !== 'SUSPENDED' && approveRoles.includes(u.role as RoleKey)), [users, approveRoles])
  const [opEmail, setOpEmail] = useState('') // ผู้ดำเนินการฝั่งจัดการ (รายละเอียด)
  const [approverEmail, setApproverEmail] = useState('') // ผู้ดำเนินการฝั่งอนุมัติ (รายละเอียด)
  const [createOpEmail, setCreateOpEmail] = useState('') // ผู้ดำเนินการใน dialog สร้าง
  const [busy, setBusy] = useState<string | null>(null)

  /* ---------- โดเมน (dialog สร้าง) ---------- */
  const [domains, setDomains] = useState<DomainRow[]>([])
  const subDomains = useMemo(
    () =>
      domains
        .filter((d) => d.parentId !== null)
        .map((d) => ({ ...d, parentName: domains.find((p) => p.id === d.parentId)?.name ?? '' })),
    [domains],
  )

  /* ---------- Dialog สร้างทะเบียน ---------- */
  const [createOpen, setCreateOpen] = useState(false)
  const [cName, setCName] = useState('')
  const [cNameEn, setCNameEn] = useState('')
  const [cDesc, setCDesc] = useState('')
  const [cSubDomain, setCSubDomain] = useState('')
  const [cOwner, setCOwner] = useState('none')
  const [cSteward, setCSteward] = useState('none')
  const [cCsv, setCcsv] = useState('')
  const [createNote, setCreateNote] = useState('')

  /* ---------- เพิ่มค่า / แก้ค่า ---------- */
  const [vValue, setVValue] = useState('')
  const [vLabelTh, setVLabelTh] = useState('')
  const [vLabelEn, setVLabelEn] = useState('')
  const [vDefinition, setVDefinition] = useState('')
  const [editValue, setEditValue] = useState<ReferenceValueItem | null>(null)

  /* ---------- นำเข้า CSV ---------- */
  const [importOpen, setImportOpen] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importNote, setImportNote] = useState('')

  /* ---------- สแกนค่านอกทะเบียน ---------- */
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [scanAssetId, setScanAssetId] = useState('')
  const [scanColumn, setScanColumn] = useState('')
  const [scanColumns, setScanColumns] = useState<Array<{ name: string; dataType: string }>>([])
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  /* ---------- โหลดรายการทะเบียน ---------- */
  useEffect(() => {
    if (!active) return
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/reference/sets')
        const json = (await res.json()) as { sets?: ReferenceSetItem[]; stats?: typeof stats; error?: string }
        if (!alive) return
        if (!res.ok) throw new Error(json.error ?? 'โหลดรายการไม่สำเร็จ')
        setSets(json.sets ?? [])
        setStats(json.stats ?? null)
      } catch {
        if (!alive) return
        setSets([])
        setStats(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [active, reloadTick])

  /* ---------- โหลดผู้ใช้ / โดเมน / ข้อมูล (ครั้งเดียว) ---------- */
  useEffect(() => {
    if (!active) return
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((b: { users?: DashUser[] }) => setUsers(b.users ?? []))
      .catch(() => setUsers([]))
    fetch('/api/domains')
      .then((r) => r.json())
      .then((b: { domains?: DomainRow[] }) => setDomains(b.domains ?? []))
      .catch(() => setDomains([]))
    fetch('/api/assets')
      .then((r) => r.json())
      .then((b: { assets?: AssetRow[] }) => setAssets((b.assets ?? []).filter((a) => a.status === 'ACTIVE')))
      .catch(() => setAssets([]))
  }, [active])

  /* ---------- โหลดรายละเอียดเมื่อเลือก ---------- */
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/reference/sets/${id}`)
      const json = (await res.json()) as DetailResponse & { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'โหลดรายละเอียดไม่สำเร็จ')
      setDetail(json)
    } catch (e) {
      setDetail(null)
      toast({ title: 'ขัดข้อง', description: e instanceof Error ? e.message : 'โหลดรายละเอียดไม่สำเร็จ', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!active || !selectedId) return
    void loadDetail(selectedId)
  }, [active, selectedId, loadDetail, reloadTick])

  /* ---------- คอลัมน์ของ asset ที่เลือกสแกน ---------- */
  useEffect(() => {
    if (!scanAssetId) {
      setScanColumns([])
      setScanColumn('')
      return
    }
    let alive = true
    fetch(`/api/assets/${scanAssetId}?role=SYS_ADMIN`)
      .then((r) => r.json())
      .then((b: AssetDetail) => {
        if (!alive) return
        const cols = (b.columns ?? []).map((c) => ({ name: c.name, dataType: c.dataType }))
        setScanColumns(cols)
        setScanColumn('')
      })
      .catch(() => {
        if (alive) setScanColumns([])
      })
    return () => {
      alive = false
    }
  }, [scanAssetId])

  /* ---------- ตัวกรองรายการ (client-side) ---------- */
  const filteredSets = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sets.filter((s) => {
      if (statusFilter === 'PENDING' && !s.pendingApproval) return false
      if (statusFilter !== 'ALL' && statusFilter !== 'PENDING' && s.status !== statusFilter) return false
      if (needle) {
        const hay = `${s.code} ${s.name} ${s.nameEn} ${s.description} ${s.subDomainName}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [sets, statusFilter, q])

  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { ALL: sets.length, PENDING: 0, DRAFT: 0, ACTIVE: 0, DEPRECATED: 0 }
    for (const s of sets) {
      if (s.pendingApproval) c.PENDING += 1
      if (s.status === 'DRAFT') c.DRAFT += 1
      if (s.status === 'ACTIVE') c.ACTIVE += 1
      if (s.status === 'DEPRECATED') c.DEPRECATED += 1
    }
    return c
  }, [sets])

  /* ---------- actions ---------- */
  async function postJson(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, okTitle: string) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (!res.ok) {
      toast({ title: 'ไม่สำเร็จ', description: json.error ?? 'เกิดข้อผิดพลาด', variant: 'destructive' })
      return false
    }
    toast({ title: okTitle, description: json.message ?? 'บันทึกลง Audit Log แล้ว' })
    return true
  }

  function resetCreate() {
    setCName('')
    setCNameEn('')
    setCDesc('')
    setCSubDomain('')
    setCOwner('none')
    setCSteward('none')
    setCcsv('')
    setCreateNote('')
    setCreateOpEmail('')
  }

  async function createSet() {
    if (!createOpEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    if (!cName.trim() || !cSubDomain) {
      setCreateNote('กรุณาระบุชื่อทะเบียนและเลือกโดเมนย่อย')
      return
    }
    setBusy('create')
    const ok = await postJson(
      '/api/reference/sets',
      'POST',
      {
        operatorEmail: createOpEmail,
        name: cName,
        nameEn: cNameEn,
        description: cDesc,
        subDomainId: cSubDomain,
        ownerId: cOwner === 'none' ? '' : cOwner,
        stewardId: cSteward === 'none' ? '' : cSteward,
        initialCsv: cCsv,
      },
      'สร้างทะเบียนสำเร็จ',
    )
    setBusy(null)
    if (!ok) return
    setCreateOpen(false)
    resetCreate()
    reload()
  }

  async function setAction(action: 'SUBMIT_APPROVAL' | 'APPROVE' | 'REJECT_APPROVAL' | 'DEPRECATE' | 'DELETE', note = '') {
    if (!detail) return
    const isApproveSide = action === 'APPROVE' || action === 'REJECT_APPROVAL' || action === 'DEPRECATE'
    const email = isApproveSide ? approverEmail : opEmail
    if (!email) {
      toast({
        title: 'ข้อมูลไม่ครบ',
        description: isApproveSide ? 'เลือกผู้อนุมัติก่อน (ต้องมีสิทธิ์อนุมัติข้อยกเว้น)' : 'เลือกผู้ดำเนินการก่อน (ต้องมีสิทธิ์จัดการชุดข้อมูล)',
        variant: 'destructive',
      })
      return
    }
    setBusy(action)
    const ok = await postJson(
      `/api/reference/sets/${detail.set.id}`,
      'PATCH',
      { operatorEmail: email, action, note },
      'ดำเนินการสำเร็จ',
    )
    setBusy(null)
    if (!ok) return
    reload()
  }

  async function updateMetadata() {
    if (!detail) return
    if (!opEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    setBusy('update')
    const ok = await postJson(
      `/api/reference/sets/${detail.set.id}`,
      'PATCH',
      {
        operatorEmail: opEmail,
        action: 'UPDATE',
        name: detail.set.name,
        nameEn: detail.set.nameEn,
        description: detail.set.description,
        ownerId: detail.set.ownerId ?? '',
        stewardId: detail.set.stewardId ?? '',
      },
      'บันทึกสำเร็จ',
    )
    setBusy(null)
    if (!ok) return
    reload()
  }

  async function addValue() {
    if (!detail) return
    if (!opEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    if (!vValue.trim()) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'กรุณาระบุค่า (value)', variant: 'destructive' })
      return
    }
    setBusy('addValue')
    const ok = await postJson(
      `/api/reference/sets/${detail.set.id}/values`,
      'POST',
      { operatorEmail: opEmail, value: vValue, labelTh: vLabelTh, labelEn: vLabelEn, definition: vDefinition },
      'เพิ่มค่าสำเร็จ',
    )
    setBusy(null)
    if (!ok) return
    setVValue('')
    setVLabelTh('')
    setVLabelEn('')
    setVDefinition('')
    reload()
  }

  async function valueAction(valueId: string, action: 'UPDATE' | 'RETIRE' | 'REACTIVATE') {
    if (!detail) return
    if (!opEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    setBusy(`value-${valueId}`)
    const body: Record<string, unknown> =
      action === 'UPDATE' && editValue
        ? { operatorEmail: opEmail, valueId, action, value: editValue.value, labelTh: editValue.labelTh, labelEn: editValue.labelEn, definition: editValue.definition, sortOrder: editValue.sortOrder }
        : { operatorEmail: opEmail, valueId, action }
    const ok = await postJson(`/api/reference/sets/${detail.set.id}/values`, 'PATCH', body, 'ดำเนินการสำเร็จ')
    setBusy(null)
    if (!ok) return
    setEditValue(null)
    reload()
  }

  async function doImportCsv() {
    if (!detail) return
    if (!opEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    if (!importCsv.trim()) {
      setImportNote('กรุณาวางข้อความ CSV')
      return
    }
    setBusy('import')
    const ok = await postJson(
      `/api/reference/sets/${detail.set.id}/import`,
      'POST',
      { operatorEmail: opEmail, csv: importCsv },
      'นำเข้าสำเร็จ',
    )
    setBusy(null)
    if (!ok) return
    setImportOpen(false)
    setImportCsv('')
    setImportNote('')
    reload()
  }

  function exportCsv() {
    if (!detail) return
    const a = document.createElement('a')
    a.href = `/api/reference/sets/${detail.set.id}/export`
    a.download = `${detail.set.code}.csv`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function runScan() {
    if (!detail) return
    if (!opEmail) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    if (!scanAssetId || !scanColumn) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'เลือกข้อมูลและคอลัมน์ที่ต้องการสแกน', variant: 'destructive' })
      return
    }
    setBusy('scan')
    try {
      const res = await fetch(`/api/reference/sets/${detail.set.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: opEmail, assetId: scanAssetId, columnName: scanColumn }),
      })
      const json = (await res.json()) as ScanResult & { error?: string }
      if (!res.ok) {
        toast({ title: 'ไม่สำเร็จ', description: json.error ?? 'สแกนไม่สำเร็จ', variant: 'destructive' })
        return
      }
      setScanResult(json)
      toast({ title: 'สแกนเสร็จ', description: json.message })
    } catch {
      toast({ title: 'ขัดข้อง', description: 'สแกนไม่สำเร็จ', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const canManage = operators.length > 0
  const canApprove = approvers.length > 0

  /* ------------------------------- render ---------------------------------- */

  return (
    <section aria-label="ศูนย์ข้อมูลอ้างอิง" className="space-y-4">
      {/* หัวหน้า */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BookMarked className="size-5 text-teal-700" aria-hidden="true" />
                ข้อมูลอ้างอิง — ทะเบียนค่ามาตรฐานศูนย์กลาง
                <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-800">
                  v0.31.0
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                ค่ามาตรฐานขององค์กร (สกุลเงิน · รหัสประเทศ · กลุ่มลูกค้า · สถานะ) อยู่ที่เดียว — กฎ IN_LIST/REFERENCE_MATCH ที่เลือกทะเบียนจะใช้ค่าล่าสุดทันที
                ผูก valueDomain ของ Data Element และ Mapping แบบ LOOKUP ได้ · workflow อนุมัติเดียวกับ Data Element
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={reload} aria-label="โหลดข้อมูลใหม่">
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1">โหลดใหม่</span>
              </Button>
              <Button size="sm" className="bg-teal-700 hover:bg-teal-800" onClick={() => setCreateOpen(true)} disabled={!canManage}>
                <Plus className="size-4" aria-hidden="true" />
                สร้างทะเบียน
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="สรุปทะเบียนข้อมูลอ้างอิง">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ทะเบียนทั้งหมด</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats ? stats.total : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ใช้งานอยู่ (ACTIVE)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{stats ? stats.active : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">รออนุมัติ</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">{stats ? stats.pending : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ค่าอ้างอิงทั้งหมด</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-700">{stats ? stats.valuesTotal : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* ตัวกรอง */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div role="group" aria-label="กรองตามสถานะ" className="flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', 'ทั้งหมด'],
                ['PENDING', 'รออนุมัติ'],
                ['DRAFT', 'ร่าง'],
                ['ACTIVE', 'ใช้งาน'],
                ['DEPRECATED', 'เลิกใช้'],
              ] as Array<[StatusFilter, string]>
            ).map(([key, th]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                aria-pressed={statusFilter === key}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'border-teal-400 bg-teal-100 text-teal-900'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {th} <span className="tabular-nums opacity-70">{statusCounts[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-1 gap-2 sm:justify-end">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQ(qInput)
                }}
                placeholder="ค้นหาชื่อ/รหัสทะเบียน — กด Enter"
                aria-label="ค้นหาทะเบียนข้อมูลอ้างอิง"
                className="pl-8"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setQ(qInput)}>
              ค้นหา
            </Button>
            {(statusFilter !== 'ALL' || q !== '') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('ALL')
                  setQInput('')
                  setQ('')
                }}
              >
                ล้าง
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* รายการทะเบียน */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">รายการทะเบียน ({filteredSets.length})</CardTitle>
          <CardDescription className="text-xs">กดที่แถวเพื่อเปิดรายละเอียด — จัดการค่า ส่งอนุมัติ สแกนค่านอกทะเบียน</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังโหลด…
            </div>
          ) : filteredSets.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {sets.length === 0
                ? 'ยังไม่มีทะเบียนข้อมูลอ้างอิง — เริ่มจากปุ่ม "สร้างทะเบียน" เช่น ทะเบียนสกุลเงินมาตรฐาน (ISO 4217)'
                : 'ไม่มีทะเบียนตรงตัวกรอง — ลองล้างตัวกรอง'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">รายการทะเบียนข้อมูลอ้างอิงทั้งหมด</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส · ชื่อทะเบียน</TableHead>
                    <TableHead className="hidden md:table-cell">โดเมนย่อย</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">ค่า (ACTIVE)</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">ใช้งานโดย</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">เวอร์ชัน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSets.map((s) => (
                    <TableRow
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`cursor-pointer ${selectedId === s.id ? 'bg-teal-50/60' : 'hover:bg-muted/50'}`}
                      aria-selected={selectedId === s.id}
                    >
                      <TableCell className="min-w-0">
                        <p className="truncate font-medium">
                          <span className="font-mono text-xs text-muted-foreground">{s.code}</span> {s.name}
                        </p>
                        {s.nameEn && <p className="truncate text-xs text-muted-foreground">{s.nameEn}</p>}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {s.parentDomainName ? `${s.parentDomainName} / ` : ''}
                        {s.subDomainName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className={statusChip(s.status)}>
                            {REFERENCE_STATUS_LABELS[s.status as ReferenceStatus]?.th ?? s.status}
                          </Badge>
                          {s.pendingApproval && (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                              <ShieldQuestion className="mr-1 size-3" aria-hidden="true" />
                              รออนุมัติ
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.activeValueCount} <span className="text-xs text-muted-foreground">/ {s.valueCount}</span>
                      </TableCell>
                      <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">
                        {s.ruleCount === 0 && s.elementCount === 0 && s.mappingCount === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span>
                            กฎ {s.ruleCount} · Element {s.elementCount} · Mapping {s.mappingCount}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs lg:table-cell">{s.version}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* รายละเอียดทะเบียนที่เลือก */}
      {selectedId && (
        <Card aria-label="รายละเอียดทะเบียน">
          <CardHeader className="pb-3">
            {detailLoading || !detail ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังโหลดรายละเอียด…
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <span className="font-mono text-xs text-muted-foreground">{detail.set.code}</span>
                      {detail.set.name}
                      <Badge variant="outline" className={statusChip(detail.set.status)}>
                        {REFERENCE_STATUS_LABELS[detail.set.status as ReferenceStatus]?.th ?? detail.set.status}
                      </Badge>
                      {detail.set.pendingApproval && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                          รออนุมัติ
                        </Badge>
                      )}
                      <Badge variant="outline" className="font-mono text-muted-foreground">
                        v{detail.set.version}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {detail.set.parentDomainName ? `${detail.set.parentDomainName} / ` : ''}
                      {detail.set.subDomainName}
                      {detail.set.description ? ` — ${detail.set.description}` : ''}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setDetail(null); setScanResult(null) }}>
                    ปิดรายละเอียด
                  </Button>
                </div>

                {/* ผู้ดำเนินการ */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="rc-op" className="text-xs">
                      ผู้ดำเนินการ (จัดการ — MANAGE_DATASETS)
                    </Label>
                    <Select value={opEmail} onValueChange={setOpEmail}>
                      <SelectTrigger id="rc-op" className="mt-1 h-9">
                        <SelectValue placeholder="เลือกบัญชีผู้ดำเนินการ" />
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.name} ({manageRoles.includes(u.role as RoleKey) ? rolesWithPermission('MANAGE_DATASETS').find((r) => r.key === u.role)?.th ?? u.role : u.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="rc-appr" className="text-xs">
                      ผู้อนุมัติ (APPROVE_EXCEPTIONS)
                    </Label>
                    <Select value={approverEmail} onValueChange={setApproverEmail}>
                      <SelectTrigger id="rc-appr" className="mt-1 h-9">
                        <SelectValue placeholder="เลือกบัญชีผู้อนุมัติ" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvers.map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.name} ({approveRoles.includes(u.role as RoleKey) ? rolesWithPermission('APPROVE_EXCEPTIONS').find((r) => r.key === u.role)?.th ?? u.role : u.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Workflow อนุมัติ (แบบเดียวกับ Data Element) */}
                <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                  {!detail.set.pendingApproval && detail.set.status === 'DRAFT' && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setAction('SUBMIT_APPROVAL')}>
                        {busy === 'SUBMIT_APPROVAL' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                        ส่งขออนุมัติ
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" disabled={busy !== null}>
                            ลบทะเบียน
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ลบทะเบียน &quot;{detail.set.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              ลบได้เฉพาะทะเบียนสถานะร่าง (DRAFT) ที่ยังไม่ถูกใช้งาน — พร้อมค่าอ้างอิงทั้งหมด {detail.set.valueCount} ค่า
                              การลบบันทึกลง Audit Log แล้ว ไม่สามารถย้อนกลับได้
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-rose-700 hover:bg-rose-800"
                              onClick={(e) => {
                                e.preventDefault()
                                void setAction('DELETE')
                              }}
                            >
                              ยืนยันลบ
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                  {detail.set.pendingApproval && (
                    <>
                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" disabled={busy !== null} onClick={() => setAction('APPROVE')}>
                        {busy === 'APPROVE' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                        อนุมัติ (ACTIVE)
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setAction('REJECT_APPROVAL')}>
                        {busy === 'REJECT_APPROVAL' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
                        ส่งกลับ (ไม่อนุมัติ)
                      </Button>
                    </>
                  )}
                  {!detail.set.pendingApproval && detail.set.status === 'ACTIVE' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-rose-700 hover:bg-rose-50" disabled={busy !== null}>
                          เลิกใช้ทะเบียน
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>เลิกใช้ทะเบียน &quot;{detail.set.name}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            ทะเบียนจะเปลี่ยนเป็น DEPRECATED — กฎโหมดทะเบียนที่ชี้มาจะไม่ถูกประเมินในรอบตรวจถัดไป (ปรากฏเป็นกฎถูกข้าม)
                            เหมาะเมื่อค่ามาตรฐานชุดนี้หมดอายุการใช้งาน
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-rose-700 hover:bg-rose-800"
                            onClick={(e) => {
                              e.preventDefault()
                              void setAction('DEPRECATE')
                            }}
                          >
                            ยืนยันเลิกใช้
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {!detail.set.pendingApproval && detail.set.status === 'DEPRECATED' && (
                    <span className="text-xs text-muted-foreground">
                      ทะเบียนเลิกใช้ — กด &quot;ส่งขออนุมัติ&quot; ใหม่ไม่ได้จากหน้านี้ (สร้างทะเบียนใหม่แทน เพื่อคงประวัติ)
                    </span>
                  )}
                  {detail.set.approvedBy && (
                    <span className="ml-auto self-center text-xs text-muted-foreground">
                      อนุมัติล่าสุดโดย {detail.stewardship.approvedBy?.name ?? detail.set.approvedBy} · {fmtTime(detail.set.approvedAt)}
                    </span>
                  )}
                </div>
              </>
            )}
          </CardHeader>
          {detail && !detailLoading && (
            <CardContent className="space-y-4">
              {/* Metadata (แก้ได้เมื่อไม่รออนุมัติ) */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rc-name" className="text-xs">
                    ชื่อทะเบียน
                  </Label>
                  <Input
                    id="rc-name"
                    value={detail.set.name}
                    disabled={detail.set.pendingApproval}
                    onChange={(e) => setDetail({ ...detail, set: { ...detail.set, name: e.target.value } })}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-nameEn" className="text-xs">
                    ชื่อภาษาอังกฤษ
                  </Label>
                  <Input
                    id="rc-nameEn"
                    value={detail.set.nameEn}
                    disabled={detail.set.pendingApproval}
                    onChange={(e) => setDetail({ ...detail, set: { ...detail.set, nameEn: e.target.value } })}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-owner" className="text-xs">
                    เจ้าของข้อมูล
                  </Label>
                  <Select
                    value={detail.set.ownerId ?? 'none'}
                    disabled={detail.set.pendingApproval}
                    onValueChange={(v) => setDetail({ ...detail, set: { ...detail.set, ownerId: v === 'none' ? null : v } })}
                  >
                    <SelectTrigger id="rc-owner" className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                      {users
                        .filter((u) => u.status !== 'SUSPENDED')
                        .map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="rc-steward" className="text-xs">
                    ผู้ดูแลข้อมูล
                  </Label>
                  <Select
                    value={detail.set.stewardId ?? 'none'}
                    disabled={detail.set.pendingApproval}
                    onValueChange={(v) => setDetail({ ...detail, set: { ...detail.set, stewardId: v === 'none' ? null : v } })}
                  >
                    <SelectTrigger id="rc-steward" className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                      {users
                        .filter((u) => u.status !== 'SUSPENDED')
                        .map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="rc-desc" className="text-xs">
                    คำอธิบาย
                  </Label>
                  <Textarea
                    id="rc-desc"
                    rows={2}
                    value={detail.set.description}
                    disabled={detail.set.pendingApproval}
                    onChange={(e) => setDetail({ ...detail, set: { ...detail.set, description: e.target.value } })}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button size="sm" variant="outline" disabled={busy !== null || detail.set.pendingApproval} onClick={updateMetadata}>
                    {busy === 'update' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    บันทึกข้อมูลทะเบียน
                  </Button>
                  <span className="ml-2 text-xs text-muted-foreground">
                    เจ้าของ: {detail.stewardship.owner?.name ?? '—'} · ผู้ดูแล: {detail.stewardship.steward?.name ?? '—'} · สร้างโดย {detail.set.createdBy}
                  </span>
                </div>
              </div>

              {/* ค่าอ้างอิง */}
              <div className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                  <p className="text-sm font-medium">
                    ค่าอ้างอิง ({detail.set.activeValueCount} ใช้งาน / {detail.set.valueCount} ทั้งหมด)
                    <span className="ml-2 text-xs font-normal text-muted-foreground">เอนจินกฎใช้เฉพาะค่าใช้งาน (ACTIVE)</span>
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={detail.set.pendingApproval || !canManage}>
                      <Upload className="size-4" aria-hidden="true" />
                      นำเข้า CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportCsv}>
                      <Download className="size-4" aria-hidden="true" />
                      ส่งออก CSV
                    </Button>
                  </div>
                </div>
                {/* ฟอร์มเพิ่มค่า */}
                <div className="grid gap-2 border-b p-3 sm:grid-cols-[1fr_1fr_1fr_2fr_auto]">
                  <div>
                    <Label htmlFor="rc-v" className="text-xs">
                      ค่า (value)
                    </Label>
                    <Input id="rc-v" value={vValue} onChange={(e) => setVValue(e.target.value)} placeholder="USD" className="mt-1 h-9 font-mono" />
                  </div>
                  <div>
                    <Label htmlFor="rc-vth" className="text-xs">
                      ชื่อไทย
                    </Label>
                    <Input id="rc-vth" value={vLabelTh} onChange={(e) => setVLabelTh(e.target.value)} placeholder="ดอลลาร์สหรัฐ" className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label htmlFor="rc-ven" className="text-xs">
                      ชื่ออังกฤษ
                    </Label>
                    <Input id="rc-ven" value={vLabelEn} onChange={(e) => setVLabelEn(e.target.value)} placeholder="US Dollar" className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label htmlFor="rc-vdef" className="text-xs">
                      นิยาม (ไม่บังคับ)
                    </Label>
                    <Input id="rc-vdef" value={vDefinition} onChange={(e) => setVDefinition(e.target.value)} className="mt-1 h-9" />
                  </div>
                  <div className="flex items-end">
                    <Button size="sm" className="bg-teal-700 hover:bg-teal-800" disabled={busy !== null || detail.set.pendingApproval || !canManage} onClick={addValue}>
                      {busy === 'addValue' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                      เพิ่มค่า
                    </Button>
                  </div>
                </div>
                {detail.set.pendingApproval && (
                  <p className="px-3 pt-2 text-xs text-amber-800">ทะเบียนอยู่ในสถานะรออนุมัติ — ผู้อนุมัติต้องตัดสินก่อนจึงแตะค่าได้</p>
                )}
                {/* ตารางค่า */}
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <caption className="sr-only">ค่าอ้างอิงในทะเบียน {detail.set.name}</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ค่า</TableHead>
                        <TableHead className="hidden sm:table-cell">ชื่อไทย</TableHead>
                        <TableHead className="hidden md:table-cell">ชื่ออังกฤษ</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.values.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                            ยังไม่มีค่า — เพิ่มรายค่า หรือนำเข้า CSV (value,labelTh,labelEn,definition)
                          </TableCell>
                        </TableRow>
                      ) : (
                        detail.values.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs font-medium">{v.value}</TableCell>
                            <TableCell className="hidden text-xs sm:table-cell">{v.labelTh || '—'}</TableCell>
                            <TableCell className="hidden text-xs md:table-cell">{v.labelEn || '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={REFERENCE_VALUE_STATUS_LABELS[v.status as 'ACTIVE' | 'RETIRED']?.chip ?? ''}>
                                {REFERENCE_VALUE_STATUS_LABELS[v.status as 'ACTIVE' | 'RETIRED']?.th ?? v.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {v.status === 'ACTIVE' ? (
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs"
                                    disabled={detail.set.pendingApproval || !canManage || busy !== null}
                                    onClick={() => setEditValue(v)}
                                  >
                                    แก้ไข
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs text-rose-700 hover:bg-rose-50"
                                    disabled={detail.set.pendingApproval || !canManage || busy !== null}
                                    onClick={() => void valueAction(v.id, 'RETIRE')}
                                  >
                                    เลิกใช้
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs"
                                  disabled={detail.set.pendingApproval || !canManage || busy !== null}
                                  onClick={() => void valueAction(v.id, 'REACTIVATE')}
                                >
                                  เปิดใช้ซ้ำ
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* สแกนค่านอกทะเบียน */}
              <div className="rounded-lg border">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <Radar className="size-4 text-teal-700" aria-hidden="true" />
                  <p className="text-sm font-medium">สแกนค่านอกทะเบียน (orphan scan)</p>
                </div>
                <div className="space-y-3 p-3">
                  <p className="text-xs text-muted-foreground">
                    เทียบค่าจริงในคอลัมน์ของข้อมูลในคลังกับค่าใช้งาน (ACTIVE) ของทะเบียน — เจอค่าที่ระบบต้นทางใช้นอกมาตรฐานทันที
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <Label htmlFor="rc-scan-asset" className="text-xs">
                        ข้อมูลจากคลัง
                      </Label>
                      <Select
                        value={scanAssetId}
                        onValueChange={(v) => {
                          setScanAssetId(v)
                          setScanResult(null)
                        }}
                      >
                        <SelectTrigger id="rc-scan-asset" className="mt-1 h-9">
                          <SelectValue placeholder="เลือกข้อมูล" />
                        </SelectTrigger>
                        <SelectContent>
                          {assets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="rc-scan-col" className="text-xs">
                        คอลัมน์
                      </Label>
                      <Select value={scanColumn} onValueChange={(v) => { setScanColumn(v); setScanResult(null) }} disabled={!scanAssetId}>
                        <SelectTrigger id="rc-scan-col" className="mt-1 h-9">
                          <SelectValue placeholder={scanAssetId ? 'เลือกคอลัมน์' : 'เลือกข้อมูลก่อน'} />
                        </SelectTrigger>
                        <SelectContent>
                          {scanColumns.map((c) => (
                            <SelectItem key={c.name} value={c.name}>
                              {c.name} ({c.dataType})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" className="bg-teal-700 hover:bg-teal-800" disabled={busy !== null || !canManage} onClick={runScan}>
                        {busy === 'scan' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Radar className="size-4" aria-hidden="true" />}
                        สแกน
                      </Button>
                    </div>
                  </div>
                  {scanResult && (
                    <div className="space-y-2 rounded-lg border bg-background p-3" aria-live="polite">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {scanResult.clean ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                            <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                            สะอาด
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800">
                            <XCircle className="mr-1 size-3" aria-hidden="true" />
                            พบค่านอกทะเบียน
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {scanResult.asset.name} · คอลัมน์ {scanResult.columnName} · แถวทั้งหมด {scanResult.totalRows} · มีค่า {scanResult.nonEmptyRows} ·
                          นอกทะเบียน {scanResult.orphanRows} แถว ({scanResult.distinctOrphan} ค่า) · ทะเบียนมี {scanResult.activeValueCount} ค่า
                        </span>
                      </div>
                      {!scanResult.clean && scanResult.top.length > 0 && (
                        <div className="max-h-48 overflow-y-auto rounded border">
                          <Table>
                            <caption className="sr-only">ค่านอกทะเบียนเรียงตามจำนวนแถว</caption>
                            <TableHeader>
                              <TableRow>
                                <TableHead>ค่าที่พบ</TableHead>
                                <TableHead className="text-right">จำนวนแถว</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {scanResult.top.map((t) => (
                                <TableRow key={t.value}>
                                  <TableCell className="font-mono text-xs">{t.value}</TableCell>
                                  <TableCell className="text-right tabular-nums">{t.count}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                      {scanResult.truncated && (
                        <p className="text-xs text-muted-foreground">แสดง {scanResult.top.length} ค่าแรก (เรียงตามจำนวนแถวมาก → น้อย)</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* การใช้งาน + Audit Trail */}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Gauge className="size-4 text-teal-700" aria-hidden="true" />
                    การใช้งานทะเบียน
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    <li>
                      กฎโหมดทะเบียน: <strong>{detail.usage.rules.length}</strong> ข้อ
                      {detail.usage.rules.length > 0 && (
                        <span className="text-muted-foreground">
                          {' '}
                          — {detail.usage.rules.map((r) => `${r.column} (${r.condition})`).join(', ')}
                        </span>
                      )}
                    </li>
                    <li>
                      Data Element ที่ valueDomain ผูก: <strong>{detail.usage.elements.length}</strong> รายการ
                      {detail.usage.elements.length > 0 && (
                        <span className="text-muted-foreground"> — {detail.usage.elements.map((e) => `${e.code} ${e.nameTh}`).join(', ')}</span>
                      )}
                    </li>
                    <li>
                      Mapping แบบ LOOKUP ที่อ้าง: <strong>{detail.usage.mappings.length}</strong> เส้น
                      {detail.usage.mappings.length > 0 && (
                        <span className="text-muted-foreground"> — {detail.usage.mappings.map((m) => m.code).join(', ')}</span>
                      )}
                    </li>
                  </ul>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">ตรวจย้อนหลัง (Audit Trail ล่าสุด 8 รายการ)</p>
                  <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs" aria-label="ประวัติการทำรายการของทะเบียนนี้">
                    {detail.auditTrail.length === 0 ? (
                      <li className="text-muted-foreground">ยังไม่มีประวัติ</li>
                    ) : (
                      detail.auditTrail.map((a) => (
                        <li key={a.id} className="border-b pb-1.5 last:border-b-0">
                          <span className="font-medium">{a.detail}</span>
                          <span className="block text-muted-foreground">{fmtTime(a.createdAt)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Dialog สร้างทะเบียน */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>สร้างทะเบียนข้อมูลอ้างอิง</DialogTitle>
            <DialogDescription>
              ทะเบียนใหม่เริ่มที่สถานะร่าง (DRAFT) — เพิ่มค่าแล้วส่งขออนุมัติ ผู้มีสิทธิ์อนุมัติตัดสินจึงจะใช้งานได้ (ACTIVE)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rc-c-name" className="text-xs">
                  ชื่อทะเบียน *
                </Label>
                <Input id="rc-c-name" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="สกุลเงินมาตรฐานสากล (ISO 4217)" className="mt-1 h-9" />
              </div>
              <div>
                <Label htmlFor="rc-c-nameEn" className="text-xs">
                  ชื่อภาษาอังกฤษ
                </Label>
                <Input id="rc-c-nameEn" value={cNameEn} onChange={(e) => setCNameEn(e.target.value)} placeholder="Currency (ISO 4217)" className="mt-1 h-9" />
              </div>
            </div>
            <div>
              <Label htmlFor="rc-c-sub" className="text-xs">
                โดเมนย่อย (เจ้าของทะเบียน) *
              </Label>
              <Select value={cSubDomain} onValueChange={setCSubDomain}>
                <SelectTrigger id="rc-c-sub" className="mt-1 h-9">
                  <SelectValue placeholder="เลือกโดเมนย่อย" />
                </SelectTrigger>
                <SelectContent>
                  {subDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.parentName ? `${d.parentName} / ` : ''}
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subDomains.length === 0 && <p className="mt-1 text-xs text-amber-700">ยังไม่มีโดเมนย่อย — สร้างในหน้า Data Domain ก่อน</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rc-c-owner" className="text-xs">
                  เจ้าของข้อมูล
                </Label>
                <Select value={cOwner} onValueChange={setCOwner}>
                  <SelectTrigger id="rc-c-owner" className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    {users
                      .filter((u) => u.status !== 'SUSPENDED')
                      .map((u) => (
                        <SelectItem key={u.email} value={u.email}>
                          {u.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rc-c-steward" className="text-xs">
                  ผู้ดูแลข้อมูล
                </Label>
                <Select value={cSteward} onValueChange={setCSteward}>
                  <SelectTrigger id="rc-c-steward" className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    {users
                      .filter((u) => u.status !== 'SUSPENDED')
                      .map((u) => (
                        <SelectItem key={u.email} value={u.email}>
                          {u.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="rc-c-desc" className="text-xs">
                คำอธิบาย
              </Label>
              <Textarea id="rc-c-desc" rows={2} value={cDesc} onChange={(e) => setCDesc(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="rc-c-csv" className="text-xs">
                ค่าเริ่มต้นจาก CSV (ไม่บังคับ — value,labelTh,labelEn,definition)
              </Label>
              <Textarea
                id="rc-c-csv"
                rows={4}
                value={cCsv}
                onChange={(e) => setCcsv(e.target.value)}
                placeholder={'value,labelTh,labelEn,definition\nUSD,ดอลลาร์สหรัฐ,US Dollar,\nTHB,บาท,Thai Baht,'}
                className="mt-1 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                สูงสุด {REFERENCE_VALUES_CAP} ค่าต่อทะเบียน · นำเข้าเพิ่มภายหลังได้ทีละ {REFERENCE_IMPORT_MAX_ROWS} แถว
              </p>
            </div>
            <div>
              <Label htmlFor="rc-c-op" className="text-xs">
                ผู้ดำเนินการ (MANAGE_DATASETS) *
              </Label>
              <Select value={createOpEmail} onValueChange={setCreateOpEmail}>
                <SelectTrigger id="rc-c-op" className="mt-1 h-9">
                  <SelectValue placeholder="เลือกบัญชีผู้ดำเนินการ" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((u) => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createNote && <p className="text-xs text-rose-700">{createNote}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="bg-teal-700 hover:bg-teal-800" disabled={busy !== null} onClick={createSet}>
              {busy === 'create' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              สร้างทะเบียน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog นำเข้า CSV */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>นำเข้าค่าอ้างอิงจาก CSV</DialogTitle>
            <DialogDescription>
              รูปแบบแต่ละแถว: value,labelTh,labelEn,definition — ข้าม header อัตโนมัติ · ค่าที่มีอยู่แล้วจะถูกข้าม (ไม่ทับของเดิม) ·
              สูงสุด {REFERENCE_IMPORT_MAX_ROWS} แถวต่อครั้ง
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={8}
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              placeholder={'value,labelTh,labelEn,definition\nUSD,ดอลลาร์สหรัฐ,US Dollar,\nEUR,ยูโร,Euro,\nJPY,เยน,Japanese Yen,'}
              className="font-mono text-xs"
              aria-label="ข้อความ CSV ของค่าอ้างอิง"
            />
            <div>
              <Label htmlFor="rc-i-op" className="text-xs">
                ผู้ดำเนินการ (MANAGE_DATASETS)
              </Label>
              <Select value={opEmail} onValueChange={setOpEmail}>
                <SelectTrigger id="rc-i-op" className="mt-1 h-9">
                  <SelectValue placeholder="เลือกบัญชีผู้ดำเนินการ" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((u) => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {importNote && <p className="text-xs text-rose-700">{importNote}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="bg-teal-700 hover:bg-teal-800" disabled={busy !== null} onClick={doImportCsv}>
              {busy === 'import' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
              นำเข้า
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog แก้ไขค่า */}
      <Dialog open={editValue !== null} onOpenChange={(open) => !open && setEditValue(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขค่าอ้างอิง</DialogTitle>
            <DialogDescription>แก้ชื่อเรียก/นิยาม หรือแก้ตัวค่า (ห้ามซ้ำกับค่าอื่นในทะเบียน)</DialogDescription>
          </DialogHeader>
          {editValue && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rc-e-v" className="text-xs">
                    ค่า (value)
                  </Label>
                  <Input
                    id="rc-e-v"
                    value={editValue.value}
                    onChange={(e) => setEditValue({ ...editValue, value: e.target.value })}
                    className="mt-1 h-9 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-e-sort" className="text-xs">
                    ลำดับการแสดง
                  </Label>
                  <Input
                    id="rc-e-sort"
                    type="number"
                    value={String(editValue.sortOrder)}
                    onChange={(e) => setEditValue({ ...editValue, sortOrder: Number(e.target.value) || 0 })}
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rc-e-th" className="text-xs">
                    ชื่อไทย
                  </Label>
                  <Input
                    id="rc-e-th"
                    value={editValue.labelTh}
                    onChange={(e) => setEditValue({ ...editValue, labelTh: e.target.value })}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-e-en" className="text-xs">
                    ชื่ออังกฤษ
                  </Label>
                  <Input
                    id="rc-e-en"
                    value={editValue.labelEn}
                    onChange={(e) => setEditValue({ ...editValue, labelEn: e.target.value })}
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="rc-e-def" className="text-xs">
                  นิยาม
                </Label>
                <Input
                  id="rc-e-def"
                  value={editValue.definition}
                  onChange={(e) => setEditValue({ ...editValue, definition: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditValue(null)}>
              ยกเลิก
            </Button>
            <Button
              className="bg-teal-700 hover:bg-teal-800"
              disabled={busy !== null || editValue === null}
              onClick={() => editValue && void valueAction(editValue.id, 'UPDATE')}
            >
              {busy?.startsWith('value-') ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
