'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Braces,
  Database,
  FileSpreadsheet,
  FolderPlus,
  FolderTree,
  Info,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { ROLES } from '@/lib/rbac'
import {
  buildDomainTree,
  domainColor,
  DOMAIN_COLORS,
  DOMAIN_DESC_MAX,
  DOMAIN_NAME_MAX,
  NO_DOMAIN,
  rollupColumnCount,
  rollupAssetCount,
  type DomainItem,
  type DomainNode,
} from '@/lib/domains'

/* ------------------------------------------------------------------ */
/* Data Domain (v0.15.0) — หน้าจัดการโดเมนข้อมูลแยกจากคลังข้อมูล         */
/* 1) โครงสร้างโดเมนหลัก/โดเมนย่อย (สร้าง/แก้ไข/ลบ)                     */
/* 2) เลือกข้อมูลจากคลังข้อมูล → จับคู่แต่ละคอลัมน์กับโดเมนย่อย          */
/* ------------------------------------------------------------------ */

interface AssetSummary {
  id: string
  name: string
  sourceType: string
  rowCount: number
  columnCount: number
  domain: { id: string; name: string; color: string; parentId: string | null; parentName: string | null } | null
}

interface ColumnItem {
  id: string
  name: string
  dataType: string
  position: number
  domain: { id: string; name: string; color: string; parentId: string | null; parentName: string | null } | null
}

interface AssetUser {
  email: string
  name: string
  role: string
}

const MANAGE_ROLES = ['DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER', 'SYS_ADMIN']

const SOURCE_META: Record<string, { th: string; icon: typeof FileSpreadsheet; cls: string }> = {
  CSV: { th: 'ไฟล์ CSV', icon: FileSpreadsheet, cls: 'border-teal-300 bg-teal-50 text-teal-800' },
  JSON: { th: 'ไฟล์ JSON', icon: Braces, cls: 'border-violet-300 bg-violet-50 text-violet-800' },
  DATABASE: { th: 'ฐานข้อมูล', icon: Database, cls: 'border-amber-300 bg-amber-50 text-amber-800' },
}

const DATA_TYPE_LABELS: Record<string, string> = {
  TEXT: 'ข้อความ',
  INTEGER: 'จำนวนเต็ม',
  NUMBER: 'ตัวเลข',
  BOOLEAN: 'ตรรกะ',
  DATE: 'วันที่',
  DATETIME: 'วัน-เวลา',
  EMPTY: 'ว่าง',
}

/** ค่า sentinel ของ Select เมื่อยังไม่เลือก Data Asset (Radix Select ห้าม value ว่าง/undefined — กัน uncontrolled→controlled) */
const NO_ASSET = '__no_asset__'

/** แถวโดเมนในต้นไม้ — แสดงจำนวนข้อมูล + คอลัมน์ที่จับคู่ */
function DomainTreeRow({
  item,
  sub,
  onEdit,
  onAddSub,
  onDelete,
}: {
  item: DomainItem
  sub?: boolean
  onEdit: () => void
  onAddSub?: () => void
  onDelete: () => void
}) {
  const col = domainColor(item.color)
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-card px-3 py-2 ${sub ? 'ml-6 border-dashed' : ''}`}>
      <span className={`size-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.name}
          {item.nameEn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{item.nameEn}</span>}
        </p>
        {item.description && <p className="truncate text-xs text-muted-foreground">{item.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
          {item.assetCount} ข้อมูล
        </Badge>
        {sub && item.columnCount > 0 && (
          <Badge variant="outline" className="shrink-0 border-emerald-300 bg-emerald-50 text-[10px] tabular-nums text-emerald-800">
            {item.columnCount} คอลัมน์
          </Badge>
        )}
        {!sub && (
          <Button size="icon" variant="ghost" className="size-7" onClick={onAddSub} title="เพิ่มโดเมนย่อย" aria-label={`เพิ่มโดเมนย่อยใน ${item.name}`}>
            <FolderPlus className="size-3.5" aria-hidden="true" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="size-7" onClick={onEdit} aria-label={`แก้ไขโดเมน ${item.name}`}>
          <Pencil className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35"
          disabled={item.assetCount > 0 || item.columnCount > 0}
          onClick={onDelete}
          title={
            item.assetCount > 0
              ? 'ย้ายข้อมูลออกจากโดเมนก่อนจึงจะลบได้'
              : item.columnCount > 0
                ? 'นำการจับคู่คอลัมน์ออกก่อนจึงจะลบได้'
                : 'ลบโดเมน'
          }
          aria-label={`ลบโดเมน ${item.name}`}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

export function DataDomains({ active, onGoImport }: { active?: boolean; onGoImport?: () => void }) {
  const { toast } = useToast()

  const [assets, setAssets] = useState<AssetSummary[]>([])
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AssetUser[]>([])
  const [operatorEmail, setOperatorEmail] = useState('preecha.engineer@company.co.th')

  // ---------- การเลือกข้อมูล + รายละเอียดคอลัมน์ ----------
  const [selectedId, setSelectedId] = useState<string>('')
  const [columns, setColumns] = useState<ColumnItem[]>([])
  const [assetDomain, setAssetDomain] = useState<AssetSummary['domain']>(null)
  const [assetMeta, setAssetMeta] = useState<{ name: string; sourceType: string; rowCount: number; columnCount: number } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ---------- ร่างการจับคู่ (columnId → domainId | null) ----------
  const [drafts, setDrafts] = useState<Record<string, string | null>>({})
  const [savingMappings, setSavingMappings] = useState(false)

  // ---------- โดเมนของ asset ทั้งชุด ----------
  const [assignRoot, setAssignRoot] = useState<string>(NO_DOMAIN)
  const [assignSub, setAssignSub] = useState<string>(NO_DOMAIN)
  const [assignBusy, setAssignBusy] = useState(false)

  // ---------- ฟอร์มโดเมน (สร้าง/แก้ไข) ----------
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formEditId, setFormEditId] = useState<string | null>(null)
  const [formParentId, setFormParentId] = useState('')
  const [formParentName, setFormParentName] = useState('')
  const [formName, setFormName] = useState('')
  const [formNameEn, setFormNameEn] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formColor, setFormColor] = useState('emerald')
  const [formBusy, setFormBusy] = useState(false)
  const [deleteDomainId, setDeleteDomainId] = useState<string | null>(null)
  const [domainBusy, setDomainBusy] = useState(false)

  /* ------------------------- load ------------------------- */
  const loadAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/assets')
      const data = await res.json()
      setAssets(data?.assets ?? [])
    } catch {
      /* แสดงรายการเดิม */
    }
  }, [])

  const loadDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains')
      const data = await res.json()
      setDomains(data?.domains ?? [])
    } catch {
      /* แสดงรายการเดิม */
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      setLoading(true)
      await Promise.all([loadAssets(), loadDomains()])
      if (alive) setLoading(false)
    })()
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setUsers((d?.users ?? []).filter((u: AssetUser & { status?: string }) => u.status === 'ACTIVE'))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // เปิดหน้าใดก็รีเฟรช — ให้ข้อมูลล่าสุดจากคลัง/หน้าอื่นแสดงทันที
  useEffect(() => {
    if (active) {
      void loadAssets()
      void loadDomains()
    }
  }, [active, loadAssets, loadDomains])

  const operators = useMemo(() => users.filter((u) => MANAGE_ROLES.includes(u.role)), [users])

  // โหลดคอลัมน์ของ asset ที่เลือก + เติมร่างการจับคู่จากค่าที่บันทึกไว้
  useEffect(() => {
    if (!selectedId) {
      setColumns([])
      setAssetDomain(null)
      setAssetMeta(null)
      setDrafts({})
      return
    }
    let alive = true
    setDetailLoading(true)
    fetch(`/api/assets/${selectedId}?role=DATA_STEWARD`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        if (data?.columns) {
          setColumns(data.columns as ColumnItem[])
          const nextDrafts: Record<string, string | null> = {}
          for (const c of data.columns as ColumnItem[]) nextDrafts[c.id] = c.domain?.id ?? null
          setDrafts(nextDrafts)
        }
        setAssetDomain((data?.asset?.domain as AssetSummary['domain']) ?? null)
        setAssetMeta({
          name: data?.asset?.name ?? '',
          sourceType: data?.asset?.sourceType ?? '',
          rowCount: data?.asset?.rowCount ?? 0,
          columnCount: data?.asset?.columnCount ?? 0,
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setDetailLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selectedId])

  // prefill โดเมนของ asset ทั้งชุดเมื่อโหลดเสร็จ
  useEffect(() => {
    if (assetDomain?.parentId) {
      setAssignRoot(assetDomain.parentId)
      setAssignSub(assetDomain.id)
    } else if (assetDomain) {
      setAssignRoot(assetDomain.id)
      setAssignSub(NO_DOMAIN)
    } else {
      setAssignRoot(NO_DOMAIN)
      setAssignSub(NO_DOMAIN)
    }
  }, [assetDomain])

  /* ------------------------- derived ------------------------- */
  const domainTree = useMemo(() => buildDomainTree(domains), [domains])
  const selectedAsset = assets.find((a) => a.id === selectedId) ?? null

  const totalColumns = columns.length
  const mappedColumns = useMemo(() => columns.filter((c) => (drafts[c.id] ?? null) !== null).length, [columns, drafts])
  const dirtyCount = useMemo(
    () => columns.filter((c) => (drafts[c.id] ?? null) !== (c.domain?.id ?? null)).length,
    [columns, drafts],
  )
  const totalMappedInSystem = useMemo(() => domains.reduce((s, d) => s + d.columnCount, 0), [domains])

  /* ------------------------- actions ------------------------- */
  async function saveMappings() {
    if (!selectedId || dirtyCount === 0) return
    const mappings = columns
      .filter((c) => (drafts[c.id] ?? null) !== (c.domain?.id ?? null))
      .map((c) => ({ columnId: c.id, domainId: drafts[c.id] ?? null }))
    if (mappings.length === 0) return
    setSavingMappings(true)
    try {
      const res = await fetch(`/api/assets/${selectedId}/columns`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail, mappings }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกการจับคู่ไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      // อัปเดตคอลัมน์จาก response (ที่มีโดเมนล่าสุด) → ร่างตรงกับค่าบันทึกพอดี
      if (Array.isArray(data.columns)) {
        setColumns(data.columns as ColumnItem[])
        const nextDrafts: Record<string, string | null> = {}
        for (const c of data.columns as ColumnItem[]) nextDrafts[c.id] = c.domain?.id ?? null
        setDrafts(nextDrafts)
      }
      toast({ title: 'บันทึกการจับคู่แล้ว', description: data.message })
      await loadDomains()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setSavingMappings(false)
    }
  }

  function resetDrafts() {
    const nextDrafts: Record<string, string | null> = {}
    for (const c of columns) nextDrafts[c.id] = c.domain?.id ?? null
    setDrafts(nextDrafts)
  }

  async function saveAssetDomain() {
    if (!selectedId) return
    const domainId = assignSub !== NO_DOMAIN ? assignSub : assignRoot !== NO_DOMAIN ? assignRoot : ''
    setAssignBusy(true)
    try {
      const res = await fetch(`/api/assets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail, action: 'SET_DOMAIN', domainId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกแล้ว' })
      // รีเฟรชรายการ asset + โดเมนของ asset ที่เลือก (ให้ prefill ตรงกับที่บันทึก)
      const refreshed = await fetch('/api/assets').then((r) => r.json())
      const list = (refreshed?.assets as AssetSummary[]) ?? []
      setAssets(list)
      setAssetDomain(list.find((a) => a.id === selectedId)?.domain ?? null)
      await loadDomains()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setAssignBusy(false)
    }
  }

  /* ------------------------- domain CRUD (โครงสร้าง) ------------------------- */
  function openCreateDomain(parentId = '', parentName = '') {
    setFormMode('create')
    setFormEditId(null)
    setFormParentId(parentId)
    setFormParentName(parentName)
    setFormName('')
    setFormNameEn('')
    setFormDesc('')
    setFormColor('emerald')
    setFormOpen(true)
  }

  function openEditDomain(d: DomainItem) {
    setFormMode('edit')
    setFormEditId(d.id)
    setFormParentId(d.parentId ?? '')
    setFormParentName(d.parentId ? (domains.find((p) => p.id === d.parentId)?.name ?? '') : '')
    setFormName(d.name)
    setFormNameEn(d.nameEn)
    setFormDesc(d.description)
    setFormColor(d.color)
    setFormOpen(true)
  }

  async function submitDomainForm() {
    if (!formName.trim()) return
    setFormBusy(true)
    try {
      const isEdit = formMode === 'edit' && formEditId
      const res = await fetch(isEdit ? `/api/domains/${formEditId}` : '/api/domains', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail,
          ...(isEdit ? { action: 'UPDATE' } : {}),
          name: formName.trim(),
          nameEn: formNameEn.trim(),
          description: formDesc.trim(),
          color: formColor,
          ...(isEdit ? {} : { parentId: formParentId || undefined }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกแล้ว' })
      setFormOpen(false)
      await loadDomains()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setFormBusy(false)
    }
  }

  async function doDeleteDomain() {
    if (!deleteDomainId) return
    setDomainBusy(true)
    try {
      const res = await fetch(`/api/domains/${deleteDomainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail, action: 'DELETE' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'ลบไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'ลบแล้ว' })
      setDeleteDomainId(null)
      await Promise.all([loadDomains(), loadAssets()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setDomainBusy(false)
    }
  }

  /* ------------------------- render ------------------------- */
  const mainDomainCount = domainTree.length
  const subDomainCount = domains.length - domainTree.length
  const assetWithDomain = assets.filter((a) => a.domain).length

  return (
    <div className="space-y-5">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">โดเมนข้อมูล (Data Domain)</h2>
          <p className="text-sm text-muted-foreground">
            จัดหมวดหมู่ข้อมูลแบบ 2 ระดับ: โดเมนหลัก → โดเมนย่อย (Sub Data Domain) พร้อมจับคู่แต่ละคอลัมน์กับโดเมนย่อย
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={operatorEmail} onValueChange={setOperatorEmail}>
            <SelectTrigger className="h-9 w-full text-xs sm:w-60" aria-label="ผู้ดำเนินการจัดการโดเมน">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((u) => (
                <SelectItem key={u.email} value={u.email} className="text-xs">
                  {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-9" onClick={() => { void loadAssets(); void loadDomains() }} aria-label="โหลดรายการใหม่">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* สรุปรวม */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderTree className="size-3.5" aria-hidden="true" /> โดเมนหลัก
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : mainDomainCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">โดเมนย่อย (Sub Data Domain)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : subDomainCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ข้อมูลผูกโดเมน</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {loading ? '—' : `${assetWithDomain}`}
              <span className="ml-1 text-sm font-medium text-muted-foreground">/ {assets.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="size-3.5" aria-hidden="true" /> คอลัมน์จับคู่แล้ว
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : totalMappedInSystem}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------- ซ้าย: โครงสร้างโดเมน ------------------------- */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FolderTree className="size-4 text-emerald-600" aria-hidden="true" /> โครงสร้างโดเมนข้อมูล
              </CardTitle>
              <Button size="sm" className="h-8 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openCreateDomain('', '')}>
                <Plus className="size-3.5" aria-hidden="true" /> เพิ่มโดเมนหลัก
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              รองรับลึก 2 ระดับ — ลบได้เฉพาะโดเมนที่ว่าง (ไม่มีโดเมนย่อย ข้อมูลผูกอยู่ หรือคอลัมน์จับคู่) ทุกการเปลี่ยนแปลงบันทึก Audit Trail
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด…
              </div>
            ) : domainTree.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <FolderTree className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">ยังไม่มีโดเมนข้อมูล</p>
                <p className="mt-1 text-xs text-muted-foreground">สร้างโดเมนหลักเพื่อเริ่มจัดหมวดหมู่ เช่น ลูกค้า การเงิน การปฏิบัติตามกฎเกณฑ์ แล้วเพิ่มโดเมนย่อยภายใต้มัน</p>
              </div>
            ) : (
              <div className="max-h-[30rem] space-y-1.5 overflow-y-auto rounded-lg border p-2 pr-2" role="list" aria-label="ต้นไม้โดเมนข้อมูล">
                {domainTree.map((n: DomainNode) => (
                  <div key={n.id} className="space-y-1.5" role="listitem">
                    <DomainTreeRow
                      item={n}
                      onEdit={() => openEditDomain(n)}
                      onAddSub={() => openCreateDomain(n.id, n.name)}
                      onDelete={() => setDeleteDomainId(n.id)}
                    />
                    {n.children.map((c) => (
                      <DomainTreeRow
                        key={c.id}
                        item={c}
                        sub
                        onEdit={() => openEditDomain(c)}
                        onDelete={() => setDeleteDomainId(c.id)}
                      />
                    ))}
                    {n.children.length === 0 && (
                      <p className="ml-6 text-[11px] text-muted-foreground">ยังไม่มีโดเมนย่อย — เพิ่มโดเมนย่อยเพื่อใช้จับคู่คอลัมน์</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ------------------------- ขวา: จับคู่คอลัมน์ ------------------------- */}
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Link2 className="size-4 text-emerald-600" aria-hidden="true" /> จับคู่คอลัมน์กับโดเมนย่อย
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              เลือกข้อมูลจากคลังข้อมูล แล้วระบุโดเมนย่อยให้แต่ละคอลัมน์ — ละเอียดกว่าการจัดโดเมนทั้งชุด (คอลัมน์จับคู่กับโดเมนย่อยเท่านั้น)
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {domainTree.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ยังไม่มีโดเมนข้อมูล — สร้างโดเมนหลักและโดเมนย่อยที่แผงด้านซ้ายก่อน จึงจะจับคู่คอลัมน์ได้
              </div>
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Database className="size-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm font-medium">ยังไม่มีข้อมูลในคลัง</p>
                <p className="text-xs text-muted-foreground">นำเข้าข้อมูลจากเมนู &quot;นำเข้าข้อมูล&quot; ก่อน จึงจะเลือกมาจับคู่คอลัมน์ได้</p>
                {onGoImport && (
                  <Button size="sm" variant="outline" className="mt-1" onClick={onGoImport}>
                    ไปที่นำเข้าข้อมูล
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* ขั้นที่ 1 — เลือกข้อมูลจากคลัง */}
                <div className="grid gap-1.5">
                  <Label htmlFor="pick-asset">1 · เลือกข้อมูลจากคลังข้อมูล</Label>
                  <Select value={selectedId || NO_ASSET} onValueChange={(v) => setSelectedId(v === NO_ASSET ? '' : v)}>
                    <SelectTrigger id="pick-asset" className="w-full min-w-0 [&>span]:min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ASSET}>— เลือก Data Asset —</SelectItem>
                      {assets.map((a) => {
                        const meta = SOURCE_META[a.sourceType] ?? SOURCE_META.CSV
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="min-w-0 flex-1 truncate">{a.name}</span>
                            <span className="hidden text-[11px] text-muted-foreground sm:inline">
                              · {meta.th} · {a.rowCount.toLocaleString()} แถว / {a.columnCount} คอลัมน์
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {detailLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดคอลัมน์…
                  </div>
                ) : !selectedId ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Link2 className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium">เลือกข้อมูลเพื่อเริ่มจับคู่คอลัมน์</p>
                    <p className="mt-1 text-xs text-muted-foreground">คอลัมน์ทั้งหมดของข้อมูลที่เลือกจะแสดงด้านล่างพร้อมโดเมนย่อยปัจจุบัน</p>
                  </div>
                ) : (
                  <>
                    {/* โดเมนของข้อมูลทั้งชุด */}
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                        <p className="text-xs font-medium">โดเมนของข้อมูลทั้งชุด {assetMeta ? `· ${assetMeta.name}` : ''}</p>
                        {assetDomain && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${domainColor(assetDomain.color).chip}`}>
                            <span className={`size-1.5 rounded-full ${domainColor(assetDomain.color).dot}`} aria-hidden="true" />
                            {assetDomain.parentName ? `${assetDomain.parentName} / ${assetDomain.name}` : assetDomain.name}
                          </span>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <div className="grid gap-1">
                          <Label htmlFor="asset-root" className="text-[11px] text-muted-foreground">โดเมนหลัก</Label>
                          <Select
                            value={assignRoot}
                            onValueChange={(v) => {
                              setAssignRoot(v)
                              setAssignSub(NO_DOMAIN)
                            }}
                          >
                            <SelectTrigger id="asset-root" className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_DOMAIN}>— ไม่ระบุโดเมน —</SelectItem>
                              {domainTree.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  {n.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="asset-sub" className="text-[11px] text-muted-foreground">โดเมนย่อย (ไม่บังคับ)</Label>
                          <Select value={assignSub} onValueChange={setAssignSub} disabled={assignRoot === NO_DOMAIN}>
                            <SelectTrigger id="asset-sub" className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_DOMAIN}>— ไม่มี —</SelectItem>
                              {(domainTree.find((n) => n.id === assignRoot)?.children ?? []).map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            disabled={assignBusy}
                            onClick={() => void saveAssetDomain()}
                          >
                            {assignBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null} บันทึกโดเมนทั้งชุด
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* ขั้นที่ 2 — จับคู่แต่ละคอลัมน์ */}
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-xs font-medium">2 · ระบุโดเมนย่อยให้แต่ละคอลัมน์</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            จับคู่แล้ว {mappedColumns} / {totalColumns} คอลัมน์
                          </span>
                          {dirtyCount > 0 && (
                            <Badge className="border-amber-300 bg-amber-50 text-[10px] text-amber-800" variant="outline">
                              แก้ไขยังไม่บันทึก {dirtyCount} รายการ
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="max-h-[26rem] overflow-auto rounded-lg border">
                        <Table>
                          <TableHeader className="sticky top-0 bg-white">
                            <TableRow>
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">ชื่อคอลัมน์</TableHead>
                              <TableHead className="text-xs">ชนิดข้อมูล</TableHead>
                              <TableHead className="min-w-56 text-xs">โดเมนย่อย (Sub Data Domain)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {columns.map((c, i) => {
                              const draft = drafts[c.id] ?? null
                              const saved = c.domain?.id ?? null
                              const changed = draft !== saved
                              const activeDomain = domains.find((d) => d.id === draft)
                              return (
                                <TableRow key={c.id}>
                                  <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                  <TableCell className="font-mono text-xs">{c.name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[11px]">
                                      {DATA_TYPE_LABELS[c.dataType] ?? c.dataType}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      <Select
                                        value={draft ?? NO_DOMAIN}
                                        onValueChange={(v) => setDrafts((prev) => ({ ...prev, [c.id]: v === NO_DOMAIN ? null : v }))}
                                      >
                                        <SelectTrigger className="h-8 w-full min-w-44 text-xs" aria-label={`โดเมนย่อยของคอลัมน์ ${c.name}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value={NO_DOMAIN}>— ไม่ระบุ —</SelectItem>
                                          {domainTree.map((n) => {
                                            const subs = n.children
                                            if (subs.length === 0) return null
                                            return (
                                              <SelectGroup key={n.id}>
                                                <SelectLabel className="text-[11px] text-muted-foreground">{n.name}</SelectLabel>
                                                {subs.map((sc) => (
                                                  <SelectItem key={sc.id} value={sc.id}>
                                                    {sc.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectGroup>
                                            )
                                          })}
                                        </SelectContent>
                                      </Select>
                                      {activeDomain && (
                                        <span
                                          className={`hidden size-2 shrink-0 rounded-full lg:inline-block ${domainColor(activeDomain.color).dot}`}
                                          aria-hidden="true"
                                        />
                                      )}
                                      {changed && <span className="text-[10px] font-medium text-amber-700" aria-label="ยังไม่บันทึก">●</span>}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                            {columns.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                  ข้อมูลนี้ไม่มีคอลัมน์
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          การบันทึกจะส่งเฉพาะคอลัมน์ที่แก้ไข — บันทึกใน Audit Trail ทุกครั้ง
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={dirtyCount === 0 || savingMappings} onClick={resetDrafts}>
                            เริ่มใหม่
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={dirtyCount === 0 || savingMappings}
                            onClick={() => void saveMappings()}
                          >
                            {savingMappings ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} บันทึกการจับคู่
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------- Dialog ฟอร์มโดเมน (สร้าง/แก้ไข) ------------------------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formMode === 'create' ? (formParentId ? 'เพิ่มโดเมนย่อย' : 'เพิ่มโดเมนหลัก') : 'แก้ไขโดเมน'}
            </DialogTitle>
            <DialogDescription>
              {formMode === 'create' && formParentId
                ? `สร้างโดเมนย่อยภายใต้ "${formParentName}" — ระบบรองรับโดเมนลึกสุด 2 ระดับ`
                : 'ตั้งชื่อให้สื่อหมวดหมู่ข้อมูล เช่น ลูกค้า การเงิน การปฏิบัติตามกฎเกณฑ์'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="domain-name">
                ชื่อโดเมน <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="domain-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={DOMAIN_NAME_MAX}
                placeholder="เช่น ลูกค้า"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="domain-name-en">ชื่อภาษาอังกฤษ (ไม่บังคับ)</Label>
              <Input
                id="domain-name-en"
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                maxLength={DOMAIN_NAME_MAX}
                placeholder="เช่น Customer"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="domain-desc">คำอธิบาย (ไม่บังคับ)</Label>
              <Input
                id="domain-desc"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                maxLength={DOMAIN_DESC_MAX}
                placeholder="อธิบายขอบเขตของโดเมนสั้น ๆ"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>สีป้ายกำกับ</Label>
              <div className="flex flex-wrap gap-1.5">
                {DOMAIN_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFormColor(c.key)}
                    aria-pressed={formColor === c.key}
                    aria-label={c.th}
                    title={c.th}
                    className={`size-7 rounded-full transition ${c.swatch} ${
                      formColor === c.key ? 'ring-2 ring-foreground ring-offset-2' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={formBusy || !formName.trim()} onClick={() => void submitDomainForm()}>
              {formBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- ยืนยันลบโดเมน ------------------------- */}
      <AlertDialog open={deleteDomainId !== null} onOpenChange={(o) => { if (!o) setDeleteDomainId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบโดเมน</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบโดเมน &quot;{domains.find((d) => d.id === deleteDomainId)?.name ?? ''}&quot; หรือไม่? (ลบได้เฉพาะโดเมนที่ว่าง — การลบถูกบันทึกใน Audit Trail)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={(e) => { e.preventDefault(); void doDeleteDomain() }}>
              {domainBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default DataDomains
