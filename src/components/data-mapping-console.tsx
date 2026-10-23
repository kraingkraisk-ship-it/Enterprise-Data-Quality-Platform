'use client'

/**
 * Data Mapping Console (v0.21.0) — หน้ารวมเส้นเชื่อม Data Element ต้นทาง → ปลายทาง
 * ระบุว่าเป็นข้อมูลชนิดเดียวกัน ข้ามระบบ/ข้ามโดเมน พร้อมแผนผัง lineage แบบภาพ
 * - สถิติ + ชิปนับตามประเภทการแมป (5 ประเภท ป้ายจาก MAPPING_TYPES เสมอ)
 * - ตัวกรอง: ค้นหา / สถานะ / ประเภท / โดเมน (กรอง client-side จาก GET /api/mappings ครั้งเดียว)
 * - ตาราง responsive (เลื่อนแนวนอนในกรอบตัวเองบนมือถือ 375px — ไม่ล้นหน้า)
 * - แผนผัง lineage หลายขั้น (depth 1–3) + ฟอร์มสร้าง (MappingForm ใช้ร่วมกับ Dialog element)
 * - สิทธิ์ deny-by-default: สร้าง/ส่ง/ลบ = MANAGE_DATASETS · อนุมัติ/ส่งกลับ/เลิกใช้ = APPROVE_EXCEPTIONS
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Info, Loader2, Network, Plus, RefreshCw, Search, Waypoints } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { ROLES, type RoleKey } from '@/lib/rbac'
import { MAPPING_STATUSES, MAPPING_TYPES, MAPPING_TYPE_KEYS, type MappingStatus } from '@/lib/mappings'
import { LineageDiagram } from '@/components/data-mapping/lineage-diagram'
import { MappingDetailDialog } from '@/components/data-mapping/mapping-detail-dialog'
import {
  MAPPING_STATUS_META,
  MAPPING_TYPE_OPTIONS,
  MappingActions,
  MappingStatusBadge,
  MappingTypeBadge,
} from '@/components/data-mapping/mapping-row'
import MappingForm from '@/components/data-mapping/mapping-form'
import type { ExpandedMapping, LineageResponse, OperatorUser, PickerDomain, PickerElement } from '@/components/data-mapping/types'

const MANAGE_ROLES = ['DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER', 'SYS_ADMIN']

interface UserRow extends OperatorUser {
  status?: string
}

export function DataMappingConsole({ active }: { active?: boolean }) {
  const { toast } = useToast()
  const lineageRef = useRef<HTMLDivElement>(null)

  /* ---------- ข้อมูลพื้นฐาน ---------- */
  const [mappings, setMappings] = useState<ExpandedMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserRow[]>([])
  const [domains, setDomains] = useState<PickerDomain[]>([])
  const [elements, setElements] = useState<PickerElement[]>([])
  const [operatorEmail, setOperatorEmail] = useState('preecha.engineer@company.co.th')
  const [approverEmail, setApproverEmail] = useState('')
  /* v0.22.0 — Mapping Detail Dialog (หน้ารวม): id ของ mapping ที่กำลังดูรายละเอียด */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  /* ---------- ตัวกรอง ---------- */
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [domainFilter, setDomainFilter] = useState('ALL')

  /* ---------- ฟอร์มสร้าง + แผนผัง lineage ---------- */
  const [createOpen, setCreateOpen] = useState(false)
  const [lineageElementId, setLineageElementId] = useState('')
  const [lineageDepth, setLineageDepth] = useState(2)
  const [lineage, setLineage] = useState<LineageResponse | null>(null)
  const [lineageLoading, setLineageLoading] = useState(false)

  /* ------------------------- load ------------------------- */
  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/mappings')
      const data = await res.json()
      setMappings(data?.mappings ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains')
      const data = await res.json()
      setDomains(data?.domains ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    }
  }, [])

  const loadElements = useCallback(async () => {
    try {
      const res = await fetch('/api/elements')
      const data = await res.json()
      setElements(data?.elements ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    }
  }, [])

  useEffect(() => {
    void loadMappings()
    void loadDomains()
    void loadElements()
    let alive = true
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setUsers((d?.users ?? []).filter((u: UserRow) => u.status === 'ACTIVE'))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [loadMappings, loadDomains, loadElements])

  // เปิดหน้าครั้งใดก็รีเฟรช — ข้อมูลที่เพิ่งสร้าง/อนุมัติแสดงทันที
  useEffect(() => {
    if (active) {
      void loadMappings()
      void loadElements()
    }
  }, [active, loadMappings, loadElements])

  const operators = useMemo(() => users.filter((u) => MANAGE_ROLES.includes(u.role)), [users])
  /** ผู้มีสิทธิ์อนุมัติ (APPROVE_EXCEPTIONS) — สิทธิ์เดิมของระบบ */
  const approvers = useMemo(
    () => users.filter((u) => ROLES[u.role as RoleKey]?.permissions.includes('APPROVE_EXCEPTIONS')),
    [users],
  )

  // เลือกผู้อนุมัติเริ่มต้น — ถ้าผู้ดำเนินการหน้าหลักมีสิทธิ์อนุมัติให้ใช้คนนั้น ไม่งั้นใช้รายแรก
  useEffect(() => {
    if (approvers.length === 0) return
    if (approverEmail && approvers.some((u) => u.email === approverEmail)) return
    setApproverEmail(approvers.find((u) => u.email === operatorEmail)?.email ?? approvers[0].email)
  }, [approverEmail, approvers, operatorEmail])

  /* ------------------------- แผนผัง lineage ------------------------- */
  const loadLineage = useCallback(async (elementId: string, depth: number) => {
    if (!elementId) {
      setLineage(null)
      return
    }
    setLineageLoading(true)
    try {
      const res = await fetch(`/api/mappings/lineage?elementId=${encodeURIComponent(elementId)}&depth=${depth}`)
      const data = await res.json()
      setLineage(res.ok ? (data as LineageResponse) : null)
    } catch {
      setLineage(null)
    } finally {
      setLineageLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLineage(lineageElementId, lineageDepth)
  }, [lineageElementId, lineageDepth, loadLineage])

  function refreshAll() {
    void loadMappings()
    void loadDomains()
    void loadElements()
    if (lineageElementId) void loadLineage(lineageElementId, lineageDepth)
  }

  function showLineageFor(elementId: string) {
    setLineageElementId(elementId)
    requestAnimationFrame(() => lineageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  /* ------------------------- ตัวกรอง + สถิติ ------------------------- */
  const parentDomains = useMemo(() => domains.filter((d) => !d.parentId), [domains])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mappings.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false
      if (typeFilter !== 'ALL' && m.mappingType !== typeFilter) return false
      if (domainFilter !== 'ALL') {
        const hit =
          m.source.parentDomainId === domainFilter ||
          m.source.subDomainId === domainFilter ||
          m.target.parentDomainId === domainFilter ||
          m.target.subDomainId === domainFilter
        if (!hit) return false
      }
      if (q) {
        const hay = `${m.code} ${m.source.path} ${m.source.nameTh} ${m.source.nameEn} ${m.target.path} ${m.target.nameTh} ${m.target.nameEn}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [mappings, search, statusFilter, typeFilter, domainFilter])

  const stats = useMemo(
    () => ({
      total: mappings.length,
      active: mappings.filter((m) => m.status === 'ACTIVE').length,
      pending: mappings.filter((m) => m.pendingApproval).length,
      deprecated: mappings.filter((m) => m.status === 'DEPRECATED').length,
    }),
    [mappings],
  )
  const typeCounts = useMemo(() => {
    const c = new Map<string, number>()
    for (const m of mappings) c.set(m.mappingType, (c.get(m.mappingType) ?? 0) + 1)
    return c
  }, [mappings])

  const elementsSorted = useMemo(() => [...elements].sort((a, b) => a.code.localeCompare(b.code)), [elements])
  const lineageRoot = elementsSorted.find((e) => e.id === lineageElementId)

  return (
    <div className="space-y-5">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Data Mapping · เส้นเชื่อม Data Element ต้นทาง → ปลายทาง</h2>
          <p className="text-sm text-muted-foreground">
            ระบุว่าเป็นข้อมูลชนิดเดียวกัน ข้ามระบบ/ข้ามโดเมน (เช่น CRM → DWH) พร้อมแผนผัง lineage · ทุกการเปลี่ยนแปลงบันทึก Audit Trail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={operatorEmail} onValueChange={setOperatorEmail}>
            <SelectTrigger className="h-9 w-full sm:w-60" aria-label="ผู้ดำเนินการจัดการ mapping (สิทธิ์จัดการชุดข้อมูล)">
              <SelectValue placeholder="— ผู้ดำเนินการ —" />
            </SelectTrigger>
            <SelectContent>
              {operators.map((u) => (
                <SelectItem key={u.email} value={u.email}>
                  {u.name} · {ROLES[u.role as RoleKey]?.th ?? u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={approverEmail} onValueChange={setApproverEmail}>
            <SelectTrigger className="h-9 w-full sm:w-60" aria-label="ผู้อนุมัติ mapping (สิทธิ์อนุมัติข้อยกเว้น)">
              <SelectValue placeholder="— ผู้อนุมัติ —" />
            </SelectTrigger>
            <SelectContent>
              {approvers.map((u) => (
                <SelectItem key={u.email} value={u.email}>
                  {u.name} · {ROLES[u.role as RoleKey]?.th ?? u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-9" onClick={refreshAll} aria-label="โหลดข้อมูลใหม่">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!operatorEmail}
            title={operatorEmail ? 'สร้างการแมปใหม่' : 'เลือกผู้ดำเนินการก่อน (ต้องมีสิทธิ์จัดการชุดข้อมูล)'}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" /> สร้างการแมป
          </Button>
        </div>
      </div>

      {/* สถิติ + ชิปประเภท */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Network className="size-3.5" aria-hidden="true" /> รวมทั้งหมด
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">ใช้งาน (ACTIVE)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">รออนุมัติ</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">เลิกใช้ (DEPRECATED)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-500">{stats.deprecated}</p>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">ตามประเภท:</span>
        {MAPPING_TYPE_OPTIONS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTypeFilter(typeFilter === t.key ? 'ALL' : t.key)}
            aria-pressed={typeFilter === t.key}
            title={t.desc}
          >
            <Badge
              variant="outline"
              className={
                typeFilter === t.key
                  ? 'cursor-pointer border-emerald-500 bg-emerald-50 text-[10px] text-emerald-800'
                  : 'cursor-pointer bg-muted/40 text-[10px] text-muted-foreground hover:bg-muted'
              }
            >
              {t.th} ({t.en}) · {typeCounts.get(t.key) ?? 0}
            </Badge>
          </button>
        ))}
      </div>

      {/* ตัวกรอง */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
            placeholder="ค้นหารหัส mapping หรือเส้นทาง/ชื่อ element ต้นทาง-ปลายทาง"
            aria-label="ค้นหา mapping"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-xs" aria-label="กรองตามสถานะ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">สถานะ: ทั้งหมด</SelectItem>
            {MAPPING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {MAPPING_STATUS_META[s as MappingStatus].th} ({s})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 text-xs" aria-label="กรองตามประเภทการแมป">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ประเภท: ทั้งหมด</SelectItem>
            {MAPPING_TYPE_KEYS.map((t) => (
              <SelectItem key={t} value={t}>
                {MAPPING_TYPES[t].th} ({MAPPING_TYPES[t].en})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="h-9 text-xs" aria-label="กรองตามโดเมน">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">โดเมน: ทั้งหมด</SelectItem>
            {parentDomains.map((d) => (
              <Fragment key={d.id}>
                <SelectItem value={d.id}>{d.name}</SelectItem>
                {domains
                  .filter((s) => s.parentId === d.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id} className="pl-7">
                      └ {s.name}
                    </SelectItem>
                  ))}
              </Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ตาราง mapping — มือถือเลื่อนแนวนอนในกรอบตัวเอง */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดรายการ mapping…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Network className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">{mappings.length === 0 ? 'ยังไม่มี Data Mapping ในระบบ' : 'ไม่พบ mapping ตามเงื่อนไขที่กรอง'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mappings.length === 0
              ? 'กด "สร้างการแมป" เพื่อเชื่อม Data Element ต้นทางกับปลายทาง (สร้างแล้วสถานะ DRAFT ต้องส่งขออนุมัติ)'
              : 'ลองล้างตัวกรอง หรือค้นหาด้วยคำอื่น'}
          </p>
        </div>
      ) : (
        <div className="max-h-[34rem] overflow-auto rounded-lg border">
          <Table className="min-w-[760px]">
            <TableHeader className="sticky top-0 bg-white">
              <TableRow>
                <TableHead className="w-20 text-xs">รหัส</TableHead>
                <TableHead className="text-xs">เส้นทาง (ต้นทาง → ปลายทาง)</TableHead>
                <TableHead className="w-32 text-xs">ประเภท</TableHead>
                <TableHead className="w-40 text-xs">สถานะ / ผู้อนุมัติ</TableHead>
                <TableHead className="w-52 text-xs">การดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {m.code}
                    <span className="ml-1 font-sans text-[9px] text-muted-foreground" title="เวอร์ชันสเปกการแมป">
                      v{m.version}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[24rem]">
                    <p className="truncate text-xs font-medium" title={`${m.source.path} → ${m.target.path}`}>
                      <span className="font-mono text-[11px]">{m.source.code}</span> {m.source.nameTh || m.source.nameEn}
                      <span className="mx-1 text-emerald-700" aria-hidden="true">
                        →
                      </span>
                      <span className="font-mono text-[11px]">{m.target.code}</span> {m.target.nameTh || m.target.nameEn}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground" title={`${m.source.path} → ${m.target.path}`}>
                      {m.source.path} → {m.target.path}
                    </p>
                    {(m.transformNote || m.note) && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={m.transformNote || m.note}>
                        {m.transformNote ? `การแปลง: ${m.transformNote}` : `หมายเหตุ: ${m.note}`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <MappingTypeBadge type={m.mappingType} />
                  </TableCell>
                  <TableCell>
                    <MappingStatusBadge mapping={m} />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {m.approvedBy ? `อนุมัติโดย ${m.approvedBy}` : 'ยังไม่มีการอนุมัติ'}
                    </p>
                    {m.approvedAt && <p className="text-[10px] text-muted-foreground">{fmtDateTime(m.approvedAt)}</p>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 border-emerald-300 px-2 text-[11px] text-emerald-800 hover:bg-emerald-50"
                        onClick={() => {
                          setDetailId(m.id)
                          setDetailOpen(true)
                        }}
                        title={`ดูรายละเอียดสเปกฉบับเต็มของ ${m.code}`}
                        aria-label={`ดูรายละเอียด mapping ${m.code}`}
                      >
                        <Info className="size-3" aria-hidden="true" /> ดูรายละเอียด
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => showLineageFor(m.source.id)}
                        title={`ดูแผนผัง lineage จาก ${m.source.nameTh}`}
                      >
                        <Waypoints className="size-3" aria-hidden="true" /> ดูแผนผัง
                      </Button>
                      <MappingActions mapping={m} operatorEmail={operatorEmail} approverEmail={approverEmail} onChanged={loadMappings} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* แผนผัง lineage */}
      <div ref={lineageRef} className="scroll-mt-20">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Waypoints className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> แผนผัง Lineage — ที่มา-ปลายทางแบบหลายขั้น
                </p>
                <p className="text-xs text-muted-foreground">เลือก element กึ่งกลาง แล้วระบบเดินกราฟทั้งฝั่งต้นทาง (ซ้าย) และปลายทาง (ขวา) ตามความลึก</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={lineageElementId || 'none'} onValueChange={(v) => setLineageElementId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-8 w-full text-xs sm:w-72" aria-label="เลือก element กึ่งกลางของแผนผัง">
                    <SelectValue placeholder="— เลือก Data Element —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— เลือก Data Element —</SelectItem>
                    {elementsSorted.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="font-mono text-[10px]">{e.code}</span> · {e.nameTh}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1" role="group" aria-label="เลือกความลึกของแผนผัง">
                  {[1, 2, 3].map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={lineageDepth === d ? 'default' : 'outline'}
                      className={`h-8 w-9 px-0 text-xs ${lineageDepth === d ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
                      aria-pressed={lineageDepth === d}
                      onClick={() => setLineageDepth(d)}
                      title={`ลึก ${d} ขั้น`}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {!lineageElementId ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <Waypoints className="size-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm font-medium">เลือก element หรือกด &quot;ดูแผนผัง&quot; จากตารางด้านบน</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  แผนผังแสดงเส้นทางการไหลของข้อมูล เช่น CRM.customer_master.customer_no → รหัสลูกค้า → DWH.dim_customer.customer_id
                </p>
              </div>
            ) : lineageLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดแผนผัง…
              </div>
            ) : lineage ? (
              <>
                <p className="text-xs text-muted-foreground">
                  element ที่เกี่ยว <span className="font-semibold tabular-nums text-foreground">{lineage.nodeCount}</span> · เส้นทาง{' '}
                  <span className="font-semibold tabular-nums text-foreground">{lineage.edgeCount}</span> · ลึก {lineage.depth} ขั้น
                </p>
                <LineageDiagram rootId={lineage.rootId} nodes={lineage.nodes} edges={lineage.edges} depth={lineage.depth} />
              </>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">โหลดแผนผังไม่สำเร็จ — ลองกดโหลดใหม่อีกครั้ง</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog สร้างการแมป */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>สร้าง Data Mapping ใหม่</DialogTitle>
            <DialogDescription>
              เชื่อม Data Element ต้นทาง → ปลายทาง (ต้องเป็น element สถานะ ACTIVE ทั้งคู่) — สร้างแล้วสถานะ DRAFT ต้องส่งขออนุมัติจึงจะใช้งานได้
            </DialogDescription>
          </DialogHeader>
          <MappingForm
            operators={operators}
            defaultOperator={operatorEmail}
            domains={domains}
            elements={elements}
            onCreated={(msg) => {
              toast({ title: msg })
              setCreateOpen(false)
              void loadMappings()
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* v0.22.0 — Mapping Detail Dialog (คลิก "ดูรายละเอียด" จากตาราง) */}
      <MappingDetailDialog
        mappingId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        operatorEmail={operatorEmail}
        approverEmail={approverEmail}
        onChanged={loadMappings}
      />
    </div>
  )
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default DataMappingConsole
