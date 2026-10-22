'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Braces,
  Database,
  Eye,
  FileSpreadsheet,
  FolderTree,
  Loader2,
  Lock,
  PackageSearch,
  Pencil,
  RefreshCw,
  Search,
  ShieldOff,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { ROLES } from '@/lib/rbac'
import { buildDomainTree, domainColor, rollupAssetCount, type DomainItem } from '@/lib/domains'

/* ------------------------------------------------------------------ */
/* Data Inventory — คลังข้อมูล: แสดงข้อมูลที่ import เข้ามาทั้งหมด        */
/* ------------------------------------------------------------------ */

interface AssetItem {
  id: string
  name: string
  description: string
  sourceType: string
  sourceInfo: string
  piiEnabled: boolean
  domain: { id: string; name: string; color: string; parentId: string | null; parentName: string | null } | null
  rowCount: number
  columnCount: number
  status: string
  importedBy: string
  createdAt: string
  updatedAt: string
}

interface AssetColumn {
  name: string
  dataType: string
  position: number
}

interface AssetDetail {
  asset: AssetItem & { sourceInfo: Record<string, unknown> }
  columns: AssetColumn[]
  rows: Array<Record<string, unknown>>
  page: number
  pageSize: number
  total: number
  totalPages: number
  piiMasked: boolean
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

function domainChipCls(active: boolean, sub = false): string {
  if (active) return 'rounded-full border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800'
  return sub
    ? 'rounded-full border border-transparent bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted'
    : 'rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/60'
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return s
  }
}

export function AssetInventory({
  active,
  reloadTick,
  onGoDomains,
}: {
  active?: boolean
  reloadTick?: number
  /** ปุ่มไปหน้าจัดการ Data Domain (เมนูอิสระ v0.15.0) */
  onGoDomains?: () => void
}) {
  const { toast } = useToast()
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewerRole, setViewerRole] = useState('BUSINESS_USER')
  const [users, setUsers] = useState<AssetUser[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [queryInput, setQueryInput] = useState('')

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renameDesc, setRenameDesc] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [operatorEmail, setOperatorEmail] = useState('preecha.engineer@company.co.th')

  // ---------- โดเมนข้อมูล (v0.15.0 — คงไว้เพื่อกรอง/แสดงป้าย การจัดการย้ายไปเมนู Data Domain) ----------
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [domainFilter, setDomainFilter] = useState<string>('ALL') // ALL | NONE | domainId

  /* ------------------------- load ------------------------- */
  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/assets')
      const data = await res.json()
      setAssets(data?.assets ?? [])
    } catch {
      toast({ title: 'โหลดรายการไม่สำเร็จ', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets, reloadTick])

  // เปิดหน้าครั้งใดก็รีเฟรชรายการ — ให้ข้อมูลที่เพิ่ง import แสดงทันที
  useEffect(() => {
    if (active) void loadAssets()
  }, [active, loadAssets])

  /* ------------------------- domains ------------------------- */
  const loadDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains')
      const data = await res.json()
      setDomains(data?.domains ?? [])
    } catch {
      // โหลดโดเมนไม่ได้ไม่บล็อกการใช้งานคลัง — แสดงเป็น "ทั้งหมด" เฉย ๆ
    }
  }, [])

  useEffect(() => {
    void loadDomains()
  }, [loadDomains, reloadTick])

  useEffect(() => {
    if (active) void loadDomains()
  }, [active, loadDomains])

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

  const loadDetail = useCallback(
    async (assetId: string, p: number, q: string) => {
      setDetailLoading(true)
      try {
        const params = new URLSearchParams({ role: viewerRole, page: String(p), pageSize: '25' })
        if (q) params.set('q', q)
        const res = await fetch(`/api/assets/${assetId}?${params.toString()}`)
        const data = await res.json()
        if (!res.ok) {
          toast({ title: 'โหลดรายละเอียดไม่สำเร็จ', description: data.error, variant: 'destructive' })
          return
        }
        setDetail(data)
      } catch {
        toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
      } finally {
        setDetailLoading(false)
      }
    },
    [viewerRole, toast],
  )

  function openDetail(a: AssetItem) {
    setSelectedId(a.id)
    setPage(1)
    setQuery('')
    setQueryInput('')
    void loadDetail(a.id, 1, '')
  }

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId, page, query)
  }, [page, query, viewerRole])

  /* ------------------------- actions ------------------------- */
  async function patchAsset(action: string, extra: Record<string, unknown>, okTitle: string) {
    if (!selectedId) return false
    setBusy(true)
    try {
      const res = await fetch(`/api/assets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail, action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return false
      }
      toast({ title: okTitle, description: data.message })
      await loadAssets()
      await loadDetail(selectedId, page, query)
      return true
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    const ok = await patchAsset('DELETE', {}, 'ลบข้อมูลแล้ว')
    if (ok) {
      setDeleteOpen(false)
      setSelectedId(null)
      setDetail(null)
    }
  }

  /* ------------------------- summary ------------------------- */
  const totalRows = useMemo(() => assets.reduce((s, a) => s + a.rowCount, 0), [assets])
  const byType = useMemo(
    () => ({
      CSV: assets.filter((a) => a.sourceType === 'CSV').length,
      JSON: assets.filter((a) => a.sourceType === 'JSON').length,
      DATABASE: assets.filter((a) => a.sourceType === 'DATABASE').length,
    }),
    [assets],
  )

  const domainTree = useMemo(() => buildDomainTree(domains), [domains])
  const unassignedCount = useMemo(() => assets.filter((a) => !a.domain).length, [assets])

  const filteredAssets = useMemo(() => {
    if (domainFilter === 'ALL') return assets
    if (domainFilter === 'NONE') return assets.filter((a) => !a.domain)
    const chosen = domains.find((d) => d.id === domainFilter)
    if (!chosen) return assets
    if (!chosen.parentId) {
      const root = domainTree.find((n) => n.id === chosen.id)
      const subIds = new Set((root?.children ?? []).map((c) => c.id))
      return assets.filter((a) => a.domain && (a.domain.id === chosen.id || subIds.has(a.domain.id)))
    }
    return assets.filter((a) => a.domain?.id === chosen.id)
  }, [assets, domains, domainTree, domainFilter])

  const selectedAsset = assets.find((a) => a.id === selectedId) ?? null

  return (
    <div className="space-y-5">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">คลังข้อมูล (Data Inventory)</h2>
          <p className="text-sm text-muted-foreground">ข้อมูลที่นำเข้ามาทั้งหมดในระบบ — กดที่รายการเพื่อสำรวจคอลัมน์และพรีวิวข้อมูล</p>
        </div>
        <div className="flex items-center gap-2">
          {onGoDomains && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onGoDomains}>
              <FolderTree className="size-4" aria-hidden="true" /> จัดการ Data Domain
            </Button>
          )}
          <Select value={viewerRole} onValueChange={setViewerRole}>
            <SelectTrigger className="h-9 w-full sm:w-64" aria-label="ดูข้อมูลในมุมมองบทบาท">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLES).map(([key, def]) => (
                <SelectItem key={key} value={key}>
                  {def.th}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-9" onClick={() => void loadAssets()} aria-label="โหลดรายการใหม่">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* สรุปรวม */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Data Asset ทั้งหมด</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{assets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderTree className="size-3.5" aria-hidden="true" /> โดเมนข้อมูล
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {domainTree.length}
              <span className="ml-1 text-sm font-medium text-muted-foreground">หลัก</span>
              {domains.length > domainTree.length && (
                <span className="ml-1.5 text-sm font-medium text-muted-foreground">+ {domains.length - domainTree.length} ย่อย</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">แถวข้อมูลรวม</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{totalRows.toLocaleString()}</p>
          </CardContent>
        </Card>
        {(['CSV', 'JSON', 'DATABASE'] as const).map((t) => {
          const meta = SOURCE_META[t]
          return (
            <Card key={t}>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <meta.icon className="size-3.5" aria-hidden="true" /> {meta.th}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{byType[t]}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* แถวกรองตามโดเมนข้อมูล */}
      {domainTree.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองรายการตามโดเมนข้อมูล">
          <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <FolderTree className="size-3.5" aria-hidden="true" /> โดเมน:
          </span>
          <button type="button" onClick={() => setDomainFilter('ALL')} className={domainChipCls(domainFilter === 'ALL')} aria-pressed={domainFilter === 'ALL'}>
            ทั้งหมด
          </button>
          {domainTree.map((n) => (
            <Fragment key={n.id}>
              <button
                type="button"
                onClick={() => setDomainFilter(n.id)}
                className={domainChipCls(domainFilter === n.id)}
                aria-pressed={domainFilter === n.id}
              >
                <span className={`mr-1 inline-block size-1.5 rounded-full ${domainColor(n.color).dot}`} aria-hidden="true" />
                {n.name}
                <span className="ml-1 tabular-nums opacity-60">{rollupAssetCount(n)}</span>
              </button>
              {n.children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDomainFilter(c.id)}
                  className={`${domainChipCls(domainFilter === c.id, true)} pl-1.5`}
                  aria-pressed={domainFilter === c.id}
                >
                  <span aria-hidden="true" className="mr-0.5 opacity-50">└</span>
                  {c.name}
                  <span className="ml-1 tabular-nums opacity-60">{c.assetCount}</span>
                </button>
              ))}
            </Fragment>
          ))}
          {unassignedCount > 0 && (
            <button type="button" onClick={() => setDomainFilter('NONE')} className={domainChipCls(domainFilter === 'NONE')} aria-pressed={domainFilter === 'NONE'}>
              ไม่ระบุ ({unassignedCount})
            </button>
          )}
        </div>
      )}

      {/* รายการ asset */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด…
        </div>
      ) : filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <PackageSearch className="size-10 text-muted-foreground/40" aria-hidden="true" />
            {assets.length === 0 ? (
              <>
                <p className="font-medium">ยังไม่มีข้อมูลในคลัง</p>
                <p className="text-sm text-muted-foreground">เริ่มต้นด้วยการนำเข้าข้อมูลจากเมนู &quot;นำเข้าข้อมูล&quot;</p>
              </>
            ) : (
              <>
                <p className="font-medium">ไม่พบข้อมูลในโดเมนที่เลือก</p>
                <Button variant="outline" size="sm" onClick={() => setDomainFilter('ALL')}>
                  แสดงทั้งหมด
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredAssets.map((a) => {
            const meta = SOURCE_META[a.sourceType] ?? SOURCE_META.CSV
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => openDetail(a)}
                className={`rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 ${
                  selectedId === a.id ? 'border-emerald-500 ring-1 ring-emerald-500' : ''
                }`}
                aria-label={`เปิดดูข้อมูล ${a.name}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                    <meta.icon className="size-3" aria-hidden="true" /> {meta.th}
                  </span>
                  {a.piiEnabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                      <Lock className="size-3" aria-hidden="true" /> PII ปิดบัง
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-semibold">{a.name}</p>
                {a.domain && (
                  <span
                    className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${domainColor(a.domain.color).chip}`}
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${domainColor(a.domain.color).dot}`} aria-hidden="true" />
                    <span className="truncate">{a.domain.parentName ? `${a.domain.parentName} / ${a.domain.name}` : a.domain.name}</span>
                  </span>
                )}
                {a.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{a.rowCount.toLocaleString()} แถว</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{a.columnCount} คอลัมน์</span>
                </div>
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                  นำเข้า {fmtDate(a.createdAt)} · {a.importedBy}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* ------------------------- Dialog รายละเอียด ------------------------- */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
            setDetail(null)
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
              {selectedAsset && (
                <>
                  {(() => {
                    const meta = SOURCE_META[selectedAsset.sourceType] ?? SOURCE_META.CSV
                    const Icon = meta.icon
                    return (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${meta.cls}`}>
                        <Icon className="size-3" aria-hidden="true" /> {meta.th}
                      </span>
                    )
                  })()}
                  <span className="min-w-0 break-words">{selectedAsset?.name}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {detail && (
                <>
                  <span className="tabular-nums">{detail.asset.rowCount.toLocaleString()} แถว · {detail.asset.columnCount} คอลัมน์</span>
                  <span aria-hidden="true">·</span>
                  <span>นำเข้าโดย {detail.asset.importedBy}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fmtDate(detail.asset.createdAt)}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* ปุ่มจัดการ + ค้นหา */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={operatorEmail} onValueChange={setOperatorEmail}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-56" aria-label="ผู้ดำเนินการจัดการข้อมูล">
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
            <Button size="sm" variant="outline" onClick={() => {
              setRenameName(selectedAsset?.name ?? '')
              setRenameDesc(selectedAsset?.description ?? '')
              setRenameOpen(true)
            }}>
              <Pencil className="size-3.5" aria-hidden="true" /> เปลี่ยนชื่อ
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void patchAsset('TOGGLE_PII', {}, 'บันทึกแล้ว')}
              title={detail?.asset.piiEnabled ? 'ปิดการปิดบัง PII (สำหรับข้อมูลไม่ใช่ส่วนบุคคล)' : 'เปิดการปิดบัง PII'}
            >
              <ShieldOff className="size-3.5" aria-hidden="true" />
              {detail?.asset.piiEnabled ? 'PII ปิดบัง: เปิด' : 'PII ปิดบัง: ปิด'}
            </Button>
            <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-3.5" aria-hidden="true" /> ลบ
            </Button>
            <form
              className="ml-auto flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                setPage(1)
                setQuery(queryInput.trim())
              }}
            >
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="ค้นหาในข้อมูล…"
                className="h-8 w-40 text-xs sm:w-52"
                aria-label="ค้นหาข้อความในข้อมูล"
              />
              <Button size="sm" variant="outline" type="submit" className="size-8 p-0" aria-label="ค้นหา">
                <Search className="size-3.5" aria-hidden="true" />
              </Button>
            </form>
          </div>

          {detail?.piiMasked && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              กำลังแสดงในมุมมองบทบาท &quot;{ROLES[viewerRole as keyof typeof ROLES]?.th ?? viewerRole}&quot; — ข้อมูลส่วนบุคคลถูกปิดบังตามหลัก PDPA เปลี่ยนบทบาทด้านบนเพื่อดูมุมมองอื่น
            </p>
          )}

          {/* เนื้อหา: คอลัมน์ / ข้อมูล */}
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดข้อมูล…
            </div>
          ) : (
            <Tabs defaultValue="data" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsList className="w-fit">
                <TabsTrigger value="data">ข้อมูล ({detail.total.toLocaleString()} แถว)</TabsTrigger>
                <TabsTrigger value="columns">โครงสร้างคอลัมน์ ({detail.columns.length})</TabsTrigger>
                <TabsTrigger value="info">รายละเอียดแหล่งข้อมูล</TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="min-h-0 flex-1 overflow-hidden">
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead className="w-12 text-xs">#</TableHead>
                        {detail.columns.map((c) => (
                          <TableHead key={c.name} className="whitespace-nowrap text-xs">
                            {c.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={detail.columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                            ไม่พบแถวที่ตรงกับคำค้นหา
                          </TableCell>
                        </TableRow>
                      )}
                      {detail.rows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">{(detail.page - 1) * detail.pageSize + i + 1}</TableCell>
                          {detail.columns.map((c) => (
                            <TableCell key={c.name} className="max-w-52 break-words text-xs">
                              {String(row[c.name] ?? '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* แบ่งหน้า */}
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    หน้า {detail.page} / {detail.totalPages} · แถว {(detail.page - 1) * detail.pageSize + 1}–
                    {Math.min(detail.page * detail.pageSize, detail.total)} จาก {detail.total.toLocaleString()}
                  </span>
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={detail.page <= 1 || detailLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      ก่อนหน้า
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={detail.page >= detail.totalPages || detailLoading}
                      onClick={() => setPage((p) => Math.min(detail.totalPages, p + 1))}
                    >
                      ถัดไป
                    </Button>
                  </span>
                </div>
              </TabsContent>

              <TabsContent value="columns" className="min-h-0 flex-1 overflow-auto">
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">ชื่อคอลัมน์</TableHead>
                        <TableHead className="text-xs">ชนิดข้อมูล (อนุมาน)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.columns.map((c, i) => (
                        <TableRow key={c.name}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{c.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[11px]">
                              {DATA_TYPE_LABELS[c.dataType] ?? c.dataType}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="info" className="min-h-0 flex-1 overflow-auto">
                <div className="max-h-72 space-y-3 overflow-auto rounded-lg border p-4 text-sm">
                  <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2">
                    <span className="text-muted-foreground">ชื่อ</span>
                    <span className="font-medium break-words">{detail.asset.name}</span>
                    <span className="text-muted-foreground">คำอธิบาย</span>
                    <span className="break-words">{detail.asset.description || '—'}</span>
                    <span className="text-muted-foreground">โดเมนข้อมูล</span>
                    <span>
                      {detail.asset.domain ? (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${domainColor(detail.asset.domain.color).chip}`}>
                          <span className={`size-1.5 rounded-full ${domainColor(detail.asset.domain.color).dot}`} aria-hidden="true" />
                          {detail.asset.domain.parentName ? `${detail.asset.domain.parentName} / ${detail.asset.domain.name}` : detail.asset.domain.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">ไม่ระบุ</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">แหล่งข้อมูล</span>
                    <span>{SOURCE_META[detail.asset.sourceType]?.th ?? detail.asset.sourceType}</span>
                    <span className="text-muted-foreground">สถานะ PII</span>
                    <span>{detail.asset.piiEnabled ? 'เปิดการปิดบังตามบทบาท (PDPA)' : 'ปิดการปิดบัง'}</span>
                    <span className="text-muted-foreground">นำเข้าเมื่อ</span>
                    <span>{fmtDate(detail.asset.createdAt)}</span>
                    <span className="text-muted-foreground">ผู้นำเข้า</span>
                    <span>{detail.asset.importedBy}</span>
                  </div>
                  <div>
                    <p className="mb-1.5 font-medium">รายละเอียดแหล่งที่มา</p>
                    <pre className="overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                      {JSON.stringify(detail.asset.sourceInfo, null, 2)}
                    </pre>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* เปลี่ยนชื่อ */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เปลี่ยนชื่อ Data Asset</DialogTitle>
            <DialogDescription>แก้ไขชื่อหรือคำอธิบาย — การเปลี่ยนแปลงถูกบันทึกใน Audit Trail</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rename-name">ชื่อใหม่</Label>
              <Input id="rename-name" value={renameName} onChange={(e) => setRenameName(e.target.value)} maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rename-desc">คำอธิบาย</Label>
              <Input id="rename-desc" value={renameDesc} onChange={(e) => setRenameDesc(e.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={busy || !renameName.trim()}
              onClick={async () => {
                const ok = await patchAsset('RENAME', { name: renameName.trim(), description: renameDesc.trim() }, 'บันทึกแล้ว')
                if (ok) setRenameOpen(false)
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ยืนยันลบ */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ Data Asset</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ &quot;{selectedAsset?.name}&quot; หรือไม่? ข้อมูล {selectedAsset?.rowCount.toLocaleString()} แถวจะถูกลบถาวร
              (การลบถูกบันทึกใน Audit Trail)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={(e) => { e.preventDefault(); void doDelete() }}>
              ลบถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AssetInventory
