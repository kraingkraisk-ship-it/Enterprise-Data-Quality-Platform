'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  FolderPlus,
  FolderTree,
  Info,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Table2,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  rollupAssetCount,
  type DomainItem,
  type DomainNode,
} from '@/lib/domains'

/* ------------------------------------------------------------------ */
/* Data Domain Console (v0.15.0) — เมนูอิสระภายใต้กลุ่ม Data Asset      */
/* (1) จัดการโครงสร้าง Data Domain / Sub Data Domain (2 ระดับ)          */
/* (2) เลือกข้อมูลจากคลังข้อมูล แล้วระบุโดเมน/โดเมนย่อยให้แต่ละคอลัมน์   */
/* ------------------------------------------------------------------ */

interface AssetItem {
  id: string
  name: string
  description: string
  sourceType: string
  piiEnabled: boolean
  domain: { id: string; name: string; color: string; parentId: string | null; parentName: string | null } | null
  rowCount: number
  columnCount: number
}

interface AssetColumn {
  name: string
  dataType: string
  position: number
}

interface AssetUser {
  email: string
  name: string
  role: string
}

const MANAGE_ROLES = ['DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER', 'SYS_ADMIN']

const SOURCE_LABELS: Record<string, string> = {
  CSV: 'ไฟล์ CSV',
  JSON: 'ไฟล์ JSON',
  DATABASE: 'ฐานข้อมูล',
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

function domainChipCls(active: boolean, sub = false): string {
  if (active) return 'rounded-full border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800'
  return sub
    ? 'rounded-full border border-transparent bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted'
    : 'rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/60'
}

/* ------------------------- แถวโดเมนในต้นไม้ ------------------------- */

function DomainTreeRow({
  item,
  sub,
  childCount,
  onEdit,
  onAddSub,
  onDelete,
}: {
  item: DomainItem
  sub?: boolean
  childCount: number
  onEdit: () => void
  onAddSub?: () => void
  onDelete: () => void
}) {
  const col = domainColor(item.color)
  const deletable = childCount === 0 && item.assetCount === 0 && item.columnCount === 0
  const blockedReason =
    childCount > 0
      ? 'ลบโดเมนย่อยทั้งหมดก่อนจึงจะลบโดเมนนี้ได้'
      : item.assetCount > 0
        ? 'ย้ายข้อมูลออกจากโดเมนก่อนจึงจะลบได้'
        : 'นำการจัดหมวดคอลัมน์ออกจากโดเมนนี้ก่อนจึงจะลบได้'
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2 ${sub ? 'ml-6 border-dashed' : ''}`}>
      <span className={`size-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium">
          {item.name}
          {item.nameEn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{item.nameEn}</span>}
        </p>
        {item.description && <p className="truncate text-xs text-muted-foreground">{item.description}</p>}
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
        {item.assetCount} ข้อมูล · {item.columnCount} คอลัมน์
      </Badge>
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
        disabled={!deletable}
        onClick={onDelete}
        title={deletable ? 'ลบโดเมน' : blockedReason}
        aria-label={`ลบโดเมน ${item.name}`}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  )
}

/* ----------------------------- หน้าหลัก ----------------------------- */

export function DataDomainConsole({ active }: { active?: boolean }) {
  const { toast } = useToast()

  /* ---------- ข้อมูลพื้นฐาน ---------- */
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [users, setUsers] = useState<AssetUser[]>([])
  const [operatorEmail, setOperatorEmail] = useState('preecha.engineer@company.co.th')

  /* ---------- ฟอร์มโดเมน (สร้าง/แก้ไข/ลบ) ---------- */
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

  /* ---------- จัดหมวดรายคอลัมน์ ---------- */
  const [assetId, setAssetId] = useState<string>('')
  const [columns, setColumns] = useState<AssetColumn[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [assign, setAssign] = useState<Record<string, string>>({}) // columnName → domainId ('' = ไม่ระบุ)
  const [savedAssign, setSavedAssign] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [assetDomainId, setAssetDomainId] = useState<string>('')
  const [settingAssetDomain, setSettingAssetDomain] = useState(false)

  /* ------------------------- load ------------------------- */
  const loadDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains')
      const data = await res.json()
      setDomains(data?.domains ?? [])
    } catch {
      toast({ title: 'โหลดรายการโดเมนไม่สำเร็จ', variant: 'destructive' })
    } finally {
      setDomainsLoading(false)
    }
  }, [toast])

  const loadAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/assets')
      const data = await res.json()
      setAssets(data?.assets ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    }
  }, [])

  useEffect(() => {
    void loadDomains()
    void loadAssets()
  }, [loadDomains, loadAssets])

  // เปิดหน้าครั้งใดก็รีเฟรช — ให้ข้อมูลที่เพิ่งนำเข้า/แก้ไขแสดงทันที
  useEffect(() => {
    if (active) {
      void loadDomains()
      void loadAssets()
    }
  }, [active, loadDomains, loadAssets])

  useEffect(() => {
    let alive = true
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

  const operators = useMemo(() => users.filter((u) => MANAGE_ROLES.includes(u.role)), [users])

  /* ------------------------- โหลดคอลัมน์ + การจัดหมวดเดิมของ asset ------------------------- */
  const loadAssetDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const [colRes, asgRes] = await Promise.all([
        fetch(`/api/assets/${id}?pageSize=5&role=DATA_STEWARD`),
        fetch(`/api/domains/assignments?assetId=${encodeURIComponent(id)}`),
      ])
      const colData = await colRes.json()
      const asgData = await asgRes.json()
      if (!colRes.ok) {
        toast({ title: 'โหลดโครงสร้างคอลัมน์ไม่สำเร็จ', description: colData.error, variant: 'destructive' })
        return
      }
      setColumns(colData?.columns ?? [])
      const map: Record<string, string> = {}
      for (const a of asgData?.assignments ?? []) map[a.columnName] = a.domainId
      setAssign(map)
      setSavedAssign(map)
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  useEffect(() => {
    const asset = assets.find((a) => a.id === assetId)
    setAssetDomainId(asset?.domain?.id ?? '')
    if (assetId) void loadAssetDetail(assetId)
    else {
      setColumns([])
      setAssign({})
      setSavedAssign({})
    }
  }, [assetId, assets, loadAssetDetail])

  /* ------------------------- สรุปต้นไม้ + ตัวเลข ------------------------- */
  const domainTree = useMemo(() => buildDomainTree(domains), [domains])
  const selectedAsset = assets.find((a) => a.id === assetId) ?? null
  const assignedCount = useMemo(() => columns.filter((c) => assign[c.name]).length, [columns, assign])
  const dirtyCount = useMemo(
    () => columns.filter((c) => (assign[c.name] ?? '') !== (savedAssign[c.name] ?? '')).length,
    [columns, assign, savedAssign],
  )
  const totalColumnsAssigned = useMemo(() => domains.reduce((s, d) => s + (d.columnCount ?? 0), 0), [domains])
  const assetsWithDomain = useMemo(() => assets.filter((a) => a.domain).length, [assets])

  /* ------------------------- domain CRUD ------------------------- */
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
      await Promise.all([loadDomains(), assetId ? loadAssetDetail(assetId) : Promise.resolve()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setDomainBusy(false)
    }
  }

  /* ------------------------- บันทึกการจัดหมวดรายคอลัมน์ ------------------------- */
  async function saveAssignments() {
    if (!assetId || columns.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/domains/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail,
          assetId,
          items: columns.map((c) => ({ columnName: c.name, domainId: assign[c.name] || null })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกแล้ว' })
      await loadAssetDetail(assetId)
      await loadDomains()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------- โดเมนระดับชุดข้อมูล (ทั้งไฟล์) ------------------------- */
  async function setAssetDomain(domainId: string) {
    if (!assetId) return
    setSettingAssetDomain(true)
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
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
      setAssetDomainId(domainId)
      await Promise.all([loadAssets(), loadDomains()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setSettingAssetDomain(false)
    }
  }

  /* ------------------------- ตัวเลือกโดเมนใน Select (หลัก + ย่อยแบบย่อหน้า) ------------------------- */
  function renderDomainOptions() {
    return (
      <>
        <SelectItem value={NO_DOMAIN}>— ไม่ระบุโดเมน —</SelectItem>
        {domainTree.map((n) => (
          <Fragment key={n.id}>
            <SelectItem value={n.id}>
              <span className="flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${domainColor(n.color).dot}`} aria-hidden="true" />
                {n.name}
              </span>
            </SelectItem>
            {n.children.map((c) => (
              <SelectItem key={c.id} value={c.id} className="pl-7">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="opacity-50">└</span>
                  <span className={`inline-block size-2 rounded-full ${domainColor(c.color).dot}`} aria-hidden="true" />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </Fragment>
        ))}
      </>
    )
  }

  return (
    <div className="space-y-5">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Data Domain &amp; Sub Data Domain</h2>
          <p className="text-sm text-muted-foreground">
            จัดโครงสร้างหมวดหมู่ข้อมูล 2 ระดับ (โดเมนหลัก → โดเมนย่อย) — เลือกข้อมูลจากคลังข้อมูลแล้วระบุโดเมนให้แต่ละคอลัมน์ ทุกการเปลี่ยนแปลงบันทึก Audit Trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={operatorEmail} onValueChange={setOperatorEmail}>
            <SelectTrigger className="h-9 w-full sm:w-64" aria-label="ผู้ดำเนินการจัดการโดเมน">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((u) => (
                <SelectItem key={u.email} value={u.email}>
                  {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => {
              void loadDomains()
              void loadAssets()
            }}
            aria-label="โหลดข้อมูลใหม่"
          >
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
            <p className="mt-1 text-2xl font-bold tabular-nums">{domainTree.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderPlus className="size-3.5" aria-hidden="true" /> โดเมนย่อย
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{Math.max(0, domains.length - domainTree.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PackageSearch className="size-3.5" aria-hidden="true" /> ข้อมูลจัดโดเมนแล้ว
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {assetsWithDomain}
              <span className="ml-1 text-sm font-medium text-muted-foreground">/ {assets.length} รายการ</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Table2 className="size-3.5" aria-hidden="true" /> คอลัมน์ถูกจัดหมวดแล้ว
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{totalColumnsAssigned.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* เนื้อหาหลัก 2 คอลัมน์ */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------- แผงซ้าย: โครงสร้างโดเมน ------------------------- */}
        <Card className="min-w-0 lg:col-span-2">
          <CardContent className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <FolderTree className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> โครงสร้างโดเมนข้อมูล
                </p>
                <p className="text-xs text-muted-foreground">โดเมนหลัก → โดเมนย่อย (รองรับ 2 ระดับ)</p>
              </div>
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openCreateDomain('', '')}>
                <Plus className="size-3.5" aria-hidden="true" /> เพิ่มโดเมนหลัก
              </Button>
            </div>

            {domainsLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด…
              </div>
            ) : domainTree.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <FolderTree className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">ยังไม่มีโดเมนข้อมูล</p>
                <p className="mt-1 text-xs text-muted-foreground">สร้างโดเมนหลักเพื่อเริ่มจัดหมวดหมู่ข้อมูลในคลัง เช่น ลูกค้า การเงิน การปฏิบัติตามกฎเกณฑ์</p>
              </div>
            ) : (
              <div className="max-h-[26rem] space-y-1.5 overflow-x-hidden overflow-y-auto rounded-lg border p-2" role="list" aria-label="ต้นไม้โดเมนข้อมูล">
                {domainTree.map((n) => (
                  <div key={n.id} className="space-y-1.5" role="listitem">
                    <DomainTreeRow
                      item={n}
                      childCount={n.children.length}
                      onEdit={() => openEditDomain(n)}
                      onAddSub={() => openCreateDomain(n.id, n.name)}
                      onDelete={() => setDeleteDomainId(n.id)}
                    />
                    {n.children.map((c) => (
                      <DomainTreeRow
                        key={c.id}
                        item={c}
                        sub
                        childCount={0}
                        onEdit={() => openEditDomain(c)}
                        onDelete={() => setDeleteDomainId(c.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            <p className="mt-auto flex items-start gap-1.5 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              ลบได้เฉพาะโดเมนที่ว่าง (ไม่มีโดเมนย่อย · ไม่มีข้อมูลผูก · ไม่มีคอลัมน์จัดหมวดอยู่) — ทุกการสร้าง/แก้ไข/ลบต้องมีสิทธิ์จัดการข้อมูล
            </p>
          </CardContent>
        </Card>

        {/* ------------------------- แผงขวา: จัดหมวดรายคอลัมน์ ------------------------- */}
        <Card className="min-w-0 lg:col-span-3">
          <CardContent className="flex h-full flex-col gap-3 p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Table2 className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> จัดหมวดรายคอลัมน์ — เลือกข้อมูลจากคลังข้อมูล
              </p>
              <p className="text-xs text-muted-foreground">เลือก Data Asset แล้วระบุโดเมน / โดเมนย่อยให้แต่ละคอลัมน์ กดบันทึกครั้งเดียวทั้งชุด</p>
            </div>

            {/* เลือก Data Asset */}
            <div className="grid gap-1.5">
              <Label htmlFor="pick-asset">ข้อมูลจากคลังข้อมูล (Data Asset)</Label>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger id="pick-asset" className="w-full" aria-label="เลือกข้อมูลจากคลังข้อมูล">
                  <SelectValue placeholder="— เลือกข้อมูลจากคลังข้อมูล —" />
                </SelectTrigger>
                <SelectContent>
                  {assets.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">ยังไม่มีข้อมูลในคลัง — นำเข้าข้อมูลก่อนที่เมนู &quot;นำเข้าข้อมูล&quot;</div>
                  )}
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {SOURCE_LABELS[a.sourceType] ?? a.sourceType} · {a.columnCount} คอลัมน์
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {assetId && selectedAsset && (
              <>
                {/* โดเมนระดับชุดข้อมูล (ทั้งไฟล์) */}
                <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-3">
                  <Label htmlFor="asset-domain" className="text-xs">
                    โดเมนระดับชุดข้อมูล (ทั้งไฟล์) — ใช้แสดงบนการ์ดในคลังข้อมูล
                  </Label>
                  <Select
                    value={assetDomainId || NO_DOMAIN}
                    onValueChange={(v) => void setAssetDomain(v === NO_DOMAIN ? '' : v)}
                    disabled={settingAssetDomain}
                  >
                    <SelectTrigger id="asset-domain" className="h-8 w-full text-xs sm:max-w-md" aria-label="โดเมนระดับชุดข้อมูล">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{renderDomainOptions()}</SelectContent>
                  </Select>
                </div>

                {domainTree.length === 0 ? (
                  <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    ยังไม่มีโดเมนข้อมูล — สร้างโดเมนหลักและโดเมนย่อยในแผง &quot;โครงสร้างโดเมนข้อมูล&quot; ด้านซ้ายก่อนจึงจะจัดหมวดรายคอลัมน์ได้
                  </p>
                ) : detailLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดคอลัมน์…
                  </div>
                ) : (
                  <>
                    {/* ตารางจัดหมวดรายคอลัมน์ */}
                    <div className="max-h-[24rem] overflow-y-auto rounded-lg border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white">
                          <TableRow>
                            <TableHead className="w-12 text-xs">#</TableHead>
                            <TableHead className="text-xs">ชื่อคอลัมน์</TableHead>
                            <TableHead className="hidden w-28 text-xs sm:table-cell">ชนิดข้อมูล</TableHead>
                            <TableHead className="w-[15rem] text-xs sm:w-[17rem]">โดเมน / โดเมนย่อย</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {columns.map((c, i) => (
                            <TableRow key={c.name}>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                              <TableCell className="font-mono text-xs">{c.name}</TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-[10px]">
                                  {DATA_TYPE_LABELS[c.dataType] ?? c.dataType}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={assign[c.name] || NO_DOMAIN}
                                  onValueChange={(v) => setAssign((prev) => ({ ...prev, [c.name]: v === NO_DOMAIN ? '' : v }))}
                                >
                                  <SelectTrigger
                                    className="h-8 w-full text-xs"
                                    aria-label={`ระบุโดเมนให้คอลัมน์ ${c.name}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>{renderDomainOptions()}</SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                          {columns.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                ไม่พบคอลัมน์ของ Data Asset นี้
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* สรุป + บันทึก */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        ระบุโดเมนแล้ว <span className="font-semibold tabular-nums text-foreground">{assignedCount}</span> / {columns.length} คอลัมน์
                        {dirtyCount > 0 && <span className="ml-2 font-medium text-amber-700">มี {dirtyCount} รายการรอบันทึก</span>}
                      </p>
                      <Button
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={saving || dirtyCount === 0 || !operatorEmail}
                        onClick={() => void saveAssignments()}
                      >
                        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                        บันทึกการจัดหมวด
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {!assetId && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
                <PackageSearch className="size-10 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm font-medium">เลือกข้อมูลจากคลังข้อมูลก่อน</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  ระบบจะโหลดรายชื่อคอลัมน์ทั้งหมดของข้อมูลที่เลือก แล้วให้คุณระบุโดเมน / โดเมนย่อยให้แต่ละคอลัมน์ได้ทีละรายการ
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------- Dialog ฟอร์มโดเมน (สร้าง/แก้ไข) ------------------------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? (formParentId ? 'เพิ่มโดเมนย่อย' : 'เพิ่มโดเมนหลัก') : 'แก้ไขโดเมน'}</DialogTitle>
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

export default DataDomainConsole
