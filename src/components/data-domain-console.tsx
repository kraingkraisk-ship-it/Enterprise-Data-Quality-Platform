'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  Banknote,
  Box,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FolderTree,
  HelpCircle,
  History,
  ListTree,
  Info,
  Link2,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Waypoints,
  XCircle,
  UserRound,
} from 'lucide-react'
import { useCurrentUser } from '@/components/user-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { ROLES } from '@/lib/rbac'
import {
  buildDomainTree,
  domainColor,
  DOMAIN_COLORS,
  DOMAIN_DESC_MAX,
  DOMAIN_NAME_MAX,
  NO_DOMAIN,
  type DomainItem,
} from '@/lib/domains'
import {
  ELEMENT_DATA_TYPES,
  ELEMENT_DATA_TYPE_LABELS,
  ELEMENT_NAME_MAX,
  ELEMENT_STATUSES,
  ELEMENT_STATUS_LABELS,
  ELEMENT_TEXT_MAX,
  OP_UPDATE_FREQUENCIES,
  OP_UPDATE_FREQUENCY_LABELS,
  type ElementDataType,
  type ElementStatus,
  type OpUpdateFrequency,
} from '@/lib/elements'
import { DATA_CLASSIFICATIONS, UNCLASSIFIED } from '@/lib/regulation'
import { buildElementPath } from '@/lib/mappings'
import MappingForm from '@/components/data-mapping/mapping-form'
import { LineageDiagram } from '@/components/data-mapping/lineage-diagram'
import { MappingDetailDialog } from '@/components/data-mapping/mapping-detail-dialog'
import { MappingSideRow } from '@/components/data-mapping/mapping-row'
import type { ExpandedMapping, LineageResponse } from '@/components/data-mapping/types'

/* ------------------------------------------------------------------ */
/* Data Catalog (v0.39.0 — เดิมชื่อ Data Domain Console) — เมนูอิสระภายใต้กลุ่ม Data Asset */
/* สารบัญข้อมูลองค์กร (Data Inventory · Data Dictionary) — โครงสร้าง 4 ระดับ:            */
/*   Data Domain (เลือก Data Asset เข้ามา) > Sub Data Domain > Data Element (อ้างอิงคอลัมน์) */
/*   > Meta Data (ISO/IEC 11179)                                                          */
/* (1) แคตตาล็อกแบบลำดับชั้น ค้นหา/ตรวจสอบชนิดข้อมูล รายละเอียด ประเภทข้อมูล             */
/* (2) Meta Data ราย element + คอลัมน์อ้างอิง (reference) จาก Data Asset จริง             */
/* (3) v0.40.0 — ตัดแท็บเครื่องมือเสริม (จัดหมวดคอลัมน์ / ชุดข้อมูล DQ) ออกตามคำสั่งผู้ใช้      */
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

/** Data Element จาก API /api/elements (รายการ) */
interface ElementRow {
  id: string
  code: string
  subDomainId: string
  subDomainName: string
  parentDomainId: string | null
  nameTh: string
  nameEn: string
  definition: string
  examples: string
  dataType: string
  formatPattern: string
  valueDomain: string
  referenceSetId: string | null
  referenceSet: { id: string; code: string; name: string; status: string } | null
  maxLength: number | null
  unit: string
  ownerId: string | null
  pii: boolean
  classification: string
  isCde: boolean
  isFinancial: boolean
  status: string
  position: number
  ruleCount: number
  mappingCount: number
  /** v0.39.0 — คอลัมน์อ้างอิงจาก Data Asset (แสดงบนแคตตาล็อกว่า element นี้นำมาจากข้อมูลที่ไหน) */
  columnMappings: Array<{ assetId: string; assetName: string; columnName: string; note: string }>
  createdAt: string
  updatedAt: string
}

/** Data Element จาก API /api/elements/[id] (รายละเอียดเต็ม — meta 4 กลุ่ม v0.20.0) */
interface ElementDetail {
  id: string
  code: string
  subDomainId: string
  nameTh: string
  nameEn: string
  definition: string
  examples: string
  dataType: string
  formatPattern: string
  valueDomain: string
  referenceSetId: string | null
  referenceSet: { id: string; code: string; name: string; status: string } | null
  maxLength: number | null
  unit: string
  ownerId: string | null
  stewardId: string | null
  custodianId: string | null
  pii: boolean
  classification: string
  isCde: boolean
  isFinancial: boolean
  status: string
  opUpdateFrequency: string
  opNotes: string
  customFields: string
  createdBy: string
  createdAt: string
  updatedAt: string
  subDomain: { id: string; name: string; nameEn: string; parentId: string | null; parent?: { id: string; name: string; color: string } | null }
  columnMappings: Array<{ id: string; assetId: string; columnName: string; note: string; asset: { id: string; name: string } }>
  rules: Array<{ id: string; column: string; condition: string; conditionName: string; dimension: string; severity: string; threshold: number }>
}

/** ผู้รับผิดชอบ (resolve จากบัญชีผู้ใช้จริง) */
interface StewardPerson {
  email: string
  name: string
  roleTh: string | null
}

/** ค่าจริงจากระบบ (เชิงปฏิบัติการ — อ่านอย่างเดียว) */
interface OperationalActual {
  mappingCount: number
  assetCount: number
  ruleCount: number
  datasetCount: number
  datasetNames: string[]
  lastRunAt: string | null
  lastScore: number | null
  lastRows: number
  lastFailedRules: number
}

interface AuditEntry {
  id: string
  action: string
  actor: string
  target: string
  detail: string
  createdAt: string
}

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-rose-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-slate-400',
}

/* ------------------------- ชิปคอลัมน์อ้างอิง (v0.39.0) ------------------------- */

/** ชิป "asset · column" — บอกว่า Data Element นี้นำมาจากข้อมูลที่ไหน (reference) */
function ReferenceChip({ assetName, columnName }: { assetName: string; columnName: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-900"
      title={`นำมาจาก Data Asset "${assetName}" คอลัมน์ "${columnName}"`}
    >
      <PackageSearch className="size-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate font-mono">{assetName}</span>
      <span className="shrink-0 opacity-50">·</span>
      <span className="shrink-0 font-mono">{columnName}</span>
    </span>
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
  // v0.33.0 — ผู้ดำเนินการ = ผู้เข้าสู่ระบบเสมอ (session) — ไม่ให้เลือก/ปลอมบัญชีอื่น
  const { user: sessionUser } = useCurrentUser()
  const operatorEmail = sessionUser?.email ?? ''

  /* ---------- แคตตาล็อก (v0.40.0 — master–detail) ---------- */
  const [activeDomainId, setActiveDomainId] = useState('') // v0.40.0 — โดเมนที่เลือกดูรายละเอียด
  const [guideOpen, setGuideOpen] = useState(false) // v0.40.0 — dialog วิธีใช้งาน
  const [selectedDomainId, setSelectedDomainId] = useState<string>('') // โดเมนย่อยที่กำลังสร้าง element (ใช้ในฟอร์ม)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}) // key: d:<domainId> · s:<subId> · e:<elementId>
  const toggleCatalogNode = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  /* ---------- จัดการ Data Asset ในโดเมน (v0.39.0) ---------- */
  const [manageAssetsOpen, setManageAssetsOpen] = useState(false)
  const [manageAssetDomain, setManageAssetDomain] = useState<DomainItem | null>(null)
  const [manageAssetIds, setManageAssetIds] = useState<string[]>([])
  const [manageAssetsBusy, setManageAssetsBusy] = useState(false)

  /* ---------- ค่า Meta Data จากทะเบียนอ้างอิง (โหลดเมื่อกาง element — v0.39.0) ---------- */
  const [metaValues, setMetaValues] = useState<Record<string, Array<{ id: string; value: string; labelTh: string; definition: string; status: string }>>>({})

  /* ---------- Data Element (v0.18.0) ---------- */
  const [elements, setElements] = useState<ElementRow[]>([])
  const [elementsLoading, setElementsLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ElementDetail | null>(null)
  const [detailStewardship, setDetailStewardship] = useState<{ owner: StewardPerson | null; steward: StewardPerson | null; custodian: StewardPerson | null } | null>(null)
  const [detailOps, setDetailOps] = useState<OperationalActual | null>(null)
  const [detailAudit, setDetailAudit] = useState<AuditEntry[]>([])
  const [detailTab, setDetailTab] = useState<'business' | 'technical' | 'operational' | 'governance' | 'mapping'>('business')
  const [detailLoading, setElementDetailLoading] = useState(false)
  const [deleteElementId, setDeleteElementId] = useState<string | null>(null)
  const [elementBusy, setElementBusy] = useState(false)
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [workflowNote, setWorkflowNote] = useState('')

  /* ---------- Data Mapping ของ element (แท็บ 5 — v0.21.0) ---------- */
  const [detailMappings, setDetailMappings] = useState<ExpandedMapping[]>([])
  const [detailMappingsLoading, setDetailMappingsLoading] = useState(false)
  const [detailLineage, setDetailLineage] = useState<LineageResponse | null>(null)
  const [mapAddOpen, setMapAddOpen] = useState(false)
  /* v0.22.0 — Mapping Detail Dialog (แท็บ 5): id ของ mapping ที่กำลังดูรายละเอียด */
  const [mappingDetailId, setMappingDetailId] = useState<string | null>(null)
  const [mappingDetailOpen, setMappingDetailOpen] = useState(false)

  /* ---------- ฟอร์ม element (สร้าง/แก้ไข) ---------- */
  const [elFormOpen, setElFormOpen] = useState(false)
  const [elFormMode, setElFormMode] = useState<'create' | 'edit'>('create')
  const [elFormId, setElFormId] = useState<string | null>(null)
  const [elName, setElName] = useState('')
  const [elNameEn, setElNameEn] = useState('')
  const [elDefinition, setElDefinition] = useState('')
  const [elExamples, setElExamples] = useState('')
  const [elDataType, setElDataType] = useState<string>('TEXT')
  const [elFormat, setElFormat] = useState('')
  const [elValueDomain, setElValueDomain] = useState('')
  /* ทะเบียนข้อมูลอ้างอิง (v0.31.0) — ผูก valueDomain กับทะเบียนค่ามาตรฐานแทนข้อความอิสระ */
  const [elRefSet, setElRefSet] = useState('')
  const [refSets, setRefSets] = useState<Array<{ id: string; code: string; name: string; status: string }>>([])
  const [elMaxLength, setElMaxLength] = useState('')
  const [elUnit, setElUnit] = useState('')
  const [elOwner, setElOwner] = useState('')
  const [elSteward, setElSteward] = useState('')
  const [elCustodian, setElCustodian] = useState('')
  const [elPii, setElPii] = useState(false)
  const [elStatus, setElStatus] = useState<string>('ACTIVE') // สถานะปัจจุบันของ element ที่กำลังแก้ (อ่านอย่างเดียว — workflow เป็นเจ้าของ)
  const [elCde, setElCde] = useState(false)
  const [elFinancial, setElFinancial] = useState(false)
  const [elOpFreq, setElOpFreq] = useState<string>('')
  const [elOpNotes, setElOpNotes] = useState('')
  const [elClassification, setElClassification] = useState<string>(UNCLASSIFIED)
  const [elCustom, setElCustom] = useState('')
  const [elFormBusy, setElFormBusy] = useState(false)
  /* v0.39.0 — คอลัมน์อ้างอิงในฟอร์ม element (เลือก column จาก Data Asset พร้อม reference) */
  const [elFormSubLabel, setElFormSubLabel] = useState('')
  const [elRefAssetId, setElRefAssetId] = useState('')
  const [elRefColumns, setElRefColumns] = useState<AssetColumn[]>([])
  const [elRefLoading, setElRefLoading] = useState(false)
  const [elRefDraft, setElRefDraft] = useState<Array<{ assetId: string; columnName: string; note?: string }>>([])

  /* ---------- mapping editor ---------- */
  const [mapAssetId, setMapAssetId] = useState('')
  const [mapColumns, setMapColumns] = useState<AssetColumn[]>([])
  const [mapLoading, setMapLoading] = useState(false)
  const [mapDraft, setMapDraft] = useState<Array<{ assetId: string; columnName: string; note?: string }>>([])
  const [mapSaving, setMapSaving] = useState(false)

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
  const [formAssetIds, setFormAssetIds] = useState<string[]>([]) // v0.39.0 — เลือก Data Asset เข้ามาตอนสร้างโดเมนหลัก
  const [formBusy, setFormBusy] = useState(false)
  const [deleteDomainId, setDeleteDomainId] = useState<string | null>(null)
  const [domainBusy, setDomainBusy] = useState(false)

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

  const loadElements = useCallback(async () => {
    try {
      const res = await fetch('/api/elements')
      const data = await res.json()
      setElements(data?.elements ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    } finally {
      setElementsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDomains()
    void loadAssets()
    void loadElements()
  }, [loadDomains, loadAssets, loadElements])

  // เปิดหน้าครั้งใดก็รีเฟรช — ให้ข้อมูลที่เพิ่งนำเข้า/แก้ไขแสดงทันที
  useEffect(() => {
    if (active) {
      void loadDomains()
      void loadAssets()
      void loadElements()
    }
  }, [active, loadDomains, loadAssets, loadElements])

  useEffect(() => {
    let alive = true
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setUsers((d?.users ?? []).filter((u: AssetUser & { status?: string }) => u.status === 'ACTIVE'))
      })
      .catch(() => undefined)
    // ทะเบียนข้อมูลอ้างอิง (v0.31.0) — ตัวเลือกผูก valueDomain (เฉพาะทะเบียนที่อนุมัติแล้ว)
    fetch('/api/reference/sets')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setRefSets((d?.sets ?? []).filter((s: { status: string }) => s.status === 'ACTIVE'))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const operators = useMemo(() => users.filter((u) => MANAGE_ROLES.includes(u.role)), [users])

  /* ------------------------- Data Mapping ของ element (แท็บ 5 — v0.21.0) ------------------------- */
  const loadDetailMappings = useCallback(async (id: string) => {
    setDetailMappingsLoading(true)
    try {
      const [mRes, lRes] = await Promise.all([
        fetch(`/api/mappings?elementId=${encodeURIComponent(id)}`),
        fetch(`/api/mappings/lineage?elementId=${encodeURIComponent(id)}&depth=2`),
      ])
      const mData = await mRes.json()
      const lData = lRes.ok ? await lRes.json() : null
      setDetailMappings(mData?.mappings ?? [])
      setDetailLineage(lData && lRes.ok ? (lData as LineageResponse) : null)
    } catch {
      setDetailMappings([])
      setDetailLineage(null)
    } finally {
      setDetailMappingsLoading(false)
    }
  }, [])

  // เปิด Dialog element ครั้งใด (หรือเปลี่ยน element) ให้โหลด mapping + lineage ของ element นั้นทันที
  useEffect(() => {
    if (detailOpen && detail?.id) {
      void loadDetailMappings(detail.id)
    } else if (!detailOpen) {
      setDetailMappings([])
      setDetailLineage(null)
      setMapAddOpen(false)
    }
  }, [detailOpen, detail?.id, loadDetailMappings])

  /** เส้นทางเต็มของ element ที่เปิดอยู่ (โดเมนหลัก.โดเมนย่อย.ชื่อ) — ใช้ในฟอร์มเพิ่มการแมป */
  const detailElementPath = detail
    ? buildElementPath({ parentDomainName: detail.subDomain.parent?.name ?? '', subDomainName: detail.subDomain.name, elementName: detail.nameTh })
    : ''

  /* ---------- สรุปต้นไม้ + ตัวเลข (v0.40.0 — master–detail) ---------- */
  const domainTree = useMemo(() => buildDomainTree(domains), [domains])
  const assetsWithDomain = useMemo(() => assets.filter((a) => a.domain).length, [assets])

  /** กรองรายการโดเมนตามคำค้น (ชื่อโดเมน/โดเมนย่อย หรือ element ชื่อ/รหัส/นิยาม) */
  const q = catalogSearch.trim().toLowerCase()
  const catalogDomains = useMemo(() => {
    if (!q) return domainTree
    const hitDomain = (d: DomainItem) => `${d.name} ${d.nameEn} ${d.description}`.toLowerCase().includes(q)
    const hitElement = (e: ElementRow) =>
      `${e.nameTh} ${e.nameEn} ${e.code} ${e.definition}`.toLowerCase().includes(q)
    return domainTree
      .map((n) => {
        if (hitDomain(n)) return n
        const children = n.children.filter((c) => hitDomain(c) || elements.some((e) => e.subDomainId === c.id && hitElement(e)))
        return children.length > 0 ? { ...n, children } : null
      })
      .filter((n): n is (typeof domainTree)[number] => n !== null)
  }, [domainTree, q, elements])

  /** โดเมนที่เลือกดูรายละเอียด (จากต้นไม้ระดับบน) + ข้อมูลที่ผูก */
  const activeDomain = domainTree.find((n) => n.id === activeDomainId) ?? null
  const activeCol = domainColor(activeDomain?.color ?? 'emerald')
  const activeAssets = useMemo(() => assets.filter((a) => a.domain?.id === activeDomainId), [assets, activeDomainId])
  const activeElementTotal = useMemo(
    () => (activeDomain ? activeDomain.children.reduce((s2, c) => s2 + elements.filter((e) => e.subDomainId === c.id).length, 0) : 0),
    [activeDomain, elements],
  )
  const activeDomainDeletable = Boolean(
    activeDomain &&
      activeDomain.children.length === 0 &&
      activeDomain.assetCount === 0 &&
      (activeDomain.datasetCount ?? 0) === 0 &&
      activeDomain.columnCount === 0 &&
      (activeDomain.elementCount ?? 0) === 0,
  )

  /* v0.40.0 — desktop (≥1024px): เปิดหน้าเลือกโดเมนแรกให้อัตโนมัติ และเมื่อค้นหาให้สลับไปผลลัพธ์แรกที่ตรง
     (mobile ไม่กระโดด — พิมพ์ค้นแล้วกรองรายการเฉย ๆ เพราะช่องค้นหาแสดงเมื่อยังไม่เลือกโดเมน) */
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    if (q && catalogDomains.length > 0 && !catalogDomains.some((n) => n.id === activeDomainId)) {
      setActiveDomainId(catalogDomains[0].id)
      return
    }
    if (!q && !activeDomainId && domainTree.length > 0) {
      setActiveDomainId(domainTree[0].id)
    }
  }, [domainTree, catalogDomains, activeDomainId, q])

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
    setFormAssetIds([]) // v0.39.0 — เริ่มใหม่ทุกครั้ง
    setFormOpen(true)
  }

  function openManageAssets(d: DomainItem) {
    setManageAssetDomain(d)
    setManageAssetIds(assets.filter((a) => a.domain?.id === d.id).map((a) => a.id))
    setManageAssetsOpen(true)
  }

  function toggleFormAsset(id: string) {
    setFormAssetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleManageAsset(id: string) {
    setManageAssetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
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
          ...(isEdit ? {} : { parentId: formParentId || undefined, assetIds: formParentId ? [] : formAssetIds }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกแล้ว' })
      setFormOpen(false)
      await Promise.all([loadDomains(), loadAssets()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setFormBusy(false)
    }
  }

  /** v0.39.0 — บันทึกชุด Data Asset ของโดเมน (replace-all) */
  async function saveDomainAssets() {
    if (!manageAssetDomain) return
    setManageAssetsBusy(true)
    try {
      const res = await fetch(`/api/domains/${manageAssetDomain.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail, action: 'SET_ASSETS', assetIds: manageAssetIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกแล้ว' })
      setManageAssetsOpen(false)
      setManageAssetDomain(null)
      await Promise.all([loadDomains(), loadAssets()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setManageAssetsBusy(false)
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
      if (deleteDomainId === activeDomainId) setActiveDomainId('')
      setDeleteDomainId(null)
      await Promise.all([loadDomains(), loadElements()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setDomainBusy(false)
    }
  }

  /* ------------------------- Data Element: โหลดรายละเอียด + CRUD ------------------------- */
  const loadElementDetail = useCallback(async (id: string): Promise<ElementDetail | null> => {
    setElementDetailLoading(true)
    try {
      const res = await fetch(`/api/elements/${id}`)
      const data = await res.json()
      if (!res.ok) return null
      setDetail(data?.element ?? null)
      setDetailStewardship(data?.stewardship ?? null)
      setDetailOps(data?.operational ?? null)
      setDetailAudit(data?.auditTrail ?? [])
      return (data?.element as ElementDetail) ?? null
    } catch {
      return null
    } finally {
      setElementDetailLoading(false)
    }
  }, [])

  function openElementDetail(e: ElementRow) {
    setDetail(null)
    setDetailStewardship(null)
    setDetailOps(null)
    setDetailAudit([])
    setDetailTab('business')
    setDetailOpen(true)
    setMapAssetId('')
    setMapColumns([])
    void loadElementDetail(e.id).then((d) => {
      if (d) setMapDraft(d.columnMappings.map((m) => ({ assetId: m.assetId, columnName: m.columnName, note: m.note })))
    })
  }

  /** v0.39.0 — เปิดฟอร์มสร้าง element จากแคตตาล็อก (ระบุโดเมนย่อยปลายทางชัดเจน) */
  function openCreateElement(subDomainId: string, subLabel: string) {
    if (!subDomainId) {
      toast({ title: 'เลือก "Sub Data Domain" ก่อน', description: 'Data Element ต้องแขวนใต้โดเมนย่อยเท่านั้น', variant: 'destructive' })
      return
    }
    setSelectedDomainId(subDomainId)
    setElFormSubLabel(subLabel)
    setElFormMode('create')
    setElFormId(null)
    setElName('')
    setElNameEn('')
    setElDefinition('')
    setElExamples('')
    setElDataType('TEXT')
    setElFormat('')
    setElValueDomain('')
    setElRefSet('')
    setElMaxLength('')
    setElUnit('')
    setElOwner('')
    setElSteward('')
    setElCustodian('')
    setElPii(false)
    setElStatus('DRAFT')
    setElCde(false)
    setElFinancial(false)
    setElOpFreq('')
    setElOpNotes('')
    setElClassification(UNCLASSIFIED)
    setElCustom('')
    setElRefAssetId('') // v0.39.0 — คอลัมน์อ้างอิงเริ่มว่าง
    setElRefColumns([])
    setElRefDraft([])
    setElFormOpen(true)
  }

  function openEditElementFromDetail() {
    if (!detail) return
    setElFormMode('edit')
    setElFormId(detail.id)
    setElName(detail.nameTh)
    setElNameEn(detail.nameEn)
    setElDefinition(detail.definition)
    setElExamples(detail.examples)
    setElDataType(detail.dataType)
    setElFormat(detail.formatPattern)
    setElValueDomain(detail.valueDomain)
    setElRefSet(detail.referenceSetId ?? '')
    setElMaxLength(detail.maxLength !== null ? String(detail.maxLength) : '')
    setElUnit(detail.unit)
    setElOwner(detail.ownerId ?? '')
    setElSteward(detail.stewardId ?? '')
    setElCustodian(detail.custodianId ?? '')
    setElPii(detail.pii)
    setElStatus(detail.status)
    setElCde(detail.isCde)
    setElFinancial(detail.isFinancial)
    setElOpFreq(detail.opUpdateFrequency ?? '')
    setElOpNotes(detail.opNotes ?? '')
    setElClassification(detail.classification || UNCLASSIFIED)
    setElCustom(detail.customFields && detail.customFields !== '{}' ? detail.customFields : '')
    setElFormSubLabel(detail.subDomain.parent ? `${detail.subDomain.parent.name} / ${detail.subDomain.name}` : detail.subDomain.name)
    setElRefAssetId('') // v0.39.0 — prefill คอลัมน์อ้างอิงจาก mapping เดิม
    setElRefColumns([])
    setElRefDraft(detail.columnMappings.map((m) => ({ assetId: m.assetId, columnName: m.columnName, note: m.note })))
    setDetailOpen(false)
    setElFormOpen(true)
  }

  async function submitElementForm() {
    if (!elName.trim()) return
    if (elFormMode === 'create' && !selectedDomainId) return
    setElFormBusy(true)
    try {
      const isEdit = elFormMode === 'edit' && elFormId
      const res = await fetch(isEdit ? `/api/elements/${elFormId}` : '/api/elements', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail,
          ...(isEdit ? { action: 'UPDATE' } : { subDomainId: selectedDomainId }),
          nameTh: elName.trim(),
          nameEn: elNameEn.trim(),
          definition: elDefinition.trim(),
          examples: elExamples.trim(),
          dataType: elDataType,
          formatPattern: elFormat.trim(),
          valueDomain: elValueDomain.trim(),
          referenceSetId: elRefSet,
          maxLength: elMaxLength.trim() === '' ? null : Number(elMaxLength),
          unit: elUnit.trim(),
          ownerId: elOwner || null,
          stewardId: elSteward || null,
          custodianId: elCustodian || null,
          pii: elPii,
          isCde: elCde,
          isFinancial: elFinancial,
          opUpdateFrequency: elOpFreq,
          opNotes: elOpNotes.trim(),
          classification: elClassification,
          customFields: elCustom.trim() || '{}',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      // v0.39.0 — บันทึกคอลัมน์อ้างอิง (reference) ที่เลือกไว้ในฟอร์ม (replace-all แบบเดียวกับ dialog รายละเอียด)
      const elementId: string | null = isEdit ? elFormId : (data?.element?.id ?? null)
      if (elementId) {
        const mapRes = await fetch(`/api/elements/${elementId}/mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operatorEmail, mappings: elRefDraft }),
        })
        if (!mapRes.ok) {
          const mapData = await mapRes.json().catch(() => null)
          toast({
            title: 'บันทึกตัว element แล้ว แต่คอลัมน์อ้างอิงไม่สำเร็จ',
            description: mapData?.error ?? `HTTP ${mapRes.status} — เปิดรายละเอียดเพื่อแก้ไขภายหลัง`,
            variant: 'destructive',
          })
        }
      }
      toast({ title: data.message ?? 'บันทึกแล้ว' })
      setElFormOpen(false)
      await Promise.all([loadElements(), loadDomains()])
      if (isEdit && detail && detail.id === elFormId) {
        await loadElementDetail(elFormId)
        setDetailOpen(true)
      }
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setElFormBusy(false)
    }
  }

  /* ------------------------- สถานะ element (v0.36.0 — เปิดใช้งาน/เลิกใช้ตรงด้วยสิทธิ์ MANAGE_DATASETS) ------------------------- */
  async function doWorkflowAction(action: 'ACTIVATE' | 'DEPRECATE', note = '') {
    if (!detail) return
    const operator = operatorEmail
    if (!operator) {
      toast({ title: 'กรุณาเลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    setWorkflowBusy(true)
    try {
      const res = await fetch(`/api/elements/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: operator, action, ...(note ? { note } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'ดำเนินการแล้ว' })
      setWorkflowNote('')
      await Promise.all([loadElementDetail(detail.id), loadElements()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setWorkflowBusy(false)
    }
  }

  async function doDeleteElement() {
    if (!deleteElementId) return
    setElementBusy(true)
    try {
      const res = await fetch(`/api/elements/${deleteElementId}`, {
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
      setDeleteElementId(null)
      setDetailOpen(false)
      await Promise.all([loadElements(), loadDomains()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setElementBusy(false)
    }
  }

  /* ------------------------- mapping editor ------------------------- */
  async function loadMappingAssetColumns(id: string) {
    setMapAssetId(id)
    setMapColumns([])
    if (!id) return
    setMapLoading(true)
    try {
      const res = await fetch(`/api/assets/${id}?pageSize=5&role=DATA_STEWARD`)
      const data = await res.json()
      if (res.ok) setMapColumns(data?.columns ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    } finally {
      setMapLoading(false)
    }
  }

  function toggleMapping(assetId: string, columnName: string) {
    setMapDraft((prev) => {
      const exists = prev.some((m) => m.assetId === assetId && m.columnName === columnName)
      if (exists) return prev.filter((m) => !(m.assetId === assetId && m.columnName === columnName))
      return [...prev, { assetId, columnName }]
    })
  }

  async function saveMappings() {
    if (!detail) return
    setMapSaving(true)
    try {
      const res = await fetch(`/api/elements/${detail.id}/mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail, mappings: mapDraft }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'บันทึกการแมปไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'บันทึกการแมปแล้ว' })
      await Promise.all([loadElementDetail(detail.id), loadElements(), loadDomains()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setMapSaving(false)
    }
  }

  /* v0.39.0 — คอลัมน์อ้างอิงในฟอร์ม element: โหลดคอลัมน์ของ Data Asset + toggle เลือก */
  async function loadElRefColumns(id: string) {
    setElRefAssetId(id)
    setElRefColumns([])
    if (!id) return
    setElRefLoading(true)
    try {
      const res = await fetch(`/api/assets/${id}?pageSize=5&role=DATA_STEWARD`)
      const data = await res.json()
      if (res.ok) setElRefColumns(data?.columns ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    } finally {
      setElRefLoading(false)
    }
  }

  function toggleElRef(assetId: string, columnName: string) {
    setElRefDraft((prev) => {
      const exists = prev.some((m) => m.assetId === assetId && m.columnName === columnName)
      if (exists) return prev.filter((m) => !(m.assetId === assetId && m.columnName === columnName))
      return [...prev, { assetId, columnName }]
    })
  }

  /** v0.39.0 — โหลดค่า Meta Data (ค่ามาตรฐาน เช่น THB = ค่าเงินบาทไทย) จากทะเบียนอ้างอิง เมื่อกาง element บนแคตตาล็อก */
  async function loadMetaValues(setId: string) {
    if (!setId || metaValues[setId]) return
    try {
      const res = await fetch(`/api/reference/sets/${setId}`)
      const data = await res.json()
      if (res.ok) {
        setMetaValues((prev) => ({
          ...prev,
          [setId]: (data?.values ?? []).filter((v: { status: string }) => v.status === 'ACTIVE'),
        }))
      }
    } catch {
      /* แสดง "ไม่สามารถโหลด" ไว้ก่อน */
    }
  }

  return (
    <div className="space-y-5">
      {/* หัวหน้า — กระชับ + ปุ่มวิธีใช้งาน (v0.40.0) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Data Catalog</h2>
          <p className="text-sm text-muted-foreground">
            สารบัญข้อมูลองค์กร (Data Inventory · Data Dictionary) — ทะเบียนกลางสำหรับค้นหาและตรวจสอบชนิดข้อมูล รายละเอียด และประเภทข้อมูล
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* v0.33.0 — ผู้ดำเนินการ = บัญชีผู้เข้าสู่ระบบ (API บังคับ — แสดงเพื่อแจ้งเท่านั้น) */}
          <span
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 text-xs text-muted-foreground"
            title="ผู้ดำเนินการคือบัญชีที่เข้าสู่ระบบอยู่ (แก้ได้ที่เมนูบัญชีบน header)"
          >
            <UserRound className="size-3.5" aria-hidden="true" />
            {sessionUser ? `${sessionUser.name} · ${sessionUser.roleTh}` : '— กำลังโหลด —'}
          </span>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setGuideOpen(true)}>
            <HelpCircle className="size-4" aria-hidden="true" /> วิธีใช้งาน
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => {
              void loadDomains()
              void loadAssets()
              void loadElements()
            }}
            aria-label="โหลดข้อมูลใหม่"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* สรุปรวม 4 ใบ (v0.40.0 — เหลือตัวชี้วัดหลักของแคตตาล็อก) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderTree className="size-3.5" aria-hidden="true" /> Data Domain
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{domainTree.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderPlus className="size-3.5" aria-hidden="true" /> Sub Data Domain
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{Math.max(0, domains.length - domainTree.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Boxes className="size-3.5" aria-hidden="true" /> Data Element
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{elements.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PackageSearch className="size-3.5" aria-hidden="true" /> Data Asset ในแคตตาล็อก
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {assetsWithDomain}
              <span className="ml-1 text-sm font-medium text-muted-foreground">/ {assets.length} รายการ</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* เนื้อหาหลัก — Master–Detail (v0.40.0): ซ้ายรายการโดเมน (รองรับหลายโดเมน) · ขวารายละเอียดที่เลือก
          mobile: แสดงรายการ → เลือกแล้วสลับไปหน้ารายละเอียด (ปุ่มกลับ) · desktop: แสดงคู่กัน */}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        {/* ซ้าย — รายการ Data Domain */}
        <Card className={activeDomainId ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                <FolderTree className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                <span className="truncate">Data Domain</span>
                <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                  {catalogDomains.length}
                </Badge>
              </p>
              <Button
                size="sm"
                className="h-8 shrink-0 gap-1 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-700"
                onClick={() => openCreateDomain('', '')}
                title="เพิ่ม Data Domain — ขั้นที่ 1 ของการจัดทำแคตตาล็อก"
              >
                <Plus className="size-3.5" aria-hidden="true" /> เพิ่ม
              </Button>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="pl-8"
                placeholder="ค้นหาโดเมน / Element (EL-####)…"
                aria-label="ค้นหาในแคตตาล็อกข้อมูล"
              />
            </div>

            {domainsLoading || elementsLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดแคตตาล็อก…
              </div>
            ) : catalogDomains.length === 0 ? (
              q ? (
                <div className="mt-2 rounded-lg border border-dashed p-6 text-center">
                  <Search className="mx-auto size-7 text-muted-foreground/40" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium">ไม่พบรายการที่ตรงกับ &quot;{catalogSearch.trim()}&quot;</p>
                  <p className="mt-1 text-xs text-muted-foreground">ลองค้นด้วยชื่อโดเมน ชื่อ element หรือรหัส EL-####</p>
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed p-6 text-center">
                  <FolderTree className="mx-auto size-7 text-muted-foreground/40" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium">แคตตาล็อกยังว่าง — เริ่มที่ขั้นที่ 1</p>
                  <p className="mt-1 text-xs text-muted-foreground">กด &quot;เพิ่ม&quot; ตั้งชื่อระบบบริการ (เช่น ระบบข้อมูลการเงิน) แล้วเลือก Data Asset เข้ามา</p>
                </div>
              )
            ) : (
              <div className="mt-2 max-h-[32rem] space-y-1.5 overflow-y-auto pr-0.5" role="list" aria-label="รายการ Data Domain ทั้งหมด">
                {catalogDomains.map((node) => {
                  const rowAssets = assets.filter((a) => a.domain?.id === node.id).length
                  const rowElements = node.children.reduce((s2, c) => s2 + elements.filter((e) => e.subDomainId === c.id).length, 0)
                  const activeRow = node.id === activeDomainId
                  const rowCol = domainColor(node.color)
                  return (
                    <div key={node.id} role="listitem">
                      <button
                        type="button"
                        onClick={() => setActiveDomainId(node.id)}
                        aria-current={activeRow || undefined}
                        className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                          activeRow ? 'border-emerald-500 bg-emerald-50/60' : 'border-border bg-card hover:bg-muted/40'
                        }`}
                        title={node.description ? `${node.name} — ${node.description}` : node.name}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`size-2.5 shrink-0 rounded-full ${rowCol.dot}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {node.name}
                              {node.nameEn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{node.nameEn}</span>}
                            </span>
                            {node.description && <span className="block truncate text-[11px] text-muted-foreground">{node.description}</span>}
                          </span>
                          <ChevronRight className={`size-4 shrink-0 ${activeRow ? 'text-emerald-700' : 'text-muted-foreground'}`} aria-hidden="true" />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1 pl-[18px]">
                          <Badge variant="outline" className="text-[9px] tabular-nums">{node.children.length} Sub</Badge>
                          <Badge variant="outline" className="text-[9px] tabular-nums">{rowElements} Element</Badge>
                          <Badge variant="outline" className="text-[9px] tabular-nums">{rowAssets} Asset</Badge>
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ขวา — รายละเอียดโดเมนที่เลือก */}
        <Card className={activeDomainId ? 'min-w-0' : 'hidden min-w-0 lg:block'}>
          <CardContent className="p-4">
            {!activeDomain ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-14 text-center">
                <FolderTree className="size-9 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm font-medium">เลือก Data Domain เพื่อดูรายละเอียด</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  กดที่โดเมนจากรายการด้านซ้าย — จะแสดง Sub Data Domain, Data Element (พร้อมคอลัมน์อ้างอิง) และ Meta Data ทั้งหมดที่ผูกอยู่
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* breadcrumb + ปุ่มกลับ (เฉพาะ mobile) */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 shrink-0 lg:hidden"
                    onClick={() => setActiveDomainId('')}
                    aria-label="กลับไปรายการโดเมน"
                  >
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                  </Button>
                  <span className="shrink-0">Data Catalog</span>
                  <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate font-medium text-foreground">{activeDomain.name}</span>
                </div>

                {/* หัวโดเมน + เครื่องมือจัดการ */}
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${activeCol.dot}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                          {activeDomain.name}
                          {activeDomain.nameEn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{activeDomain.nameEn}</span>}
                        </h3>
                        {activeDomain.description && (
                          <p className="mt-0.5 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{activeDomain.description}</p>
                        )}
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] tabular-nums">{activeDomain.children.length} Sub Data Domain</Badge>
                          <Badge variant="outline" className="text-[10px] tabular-nums">{activeElementTotal} Data Element</Badge>
                          <Badge variant="outline" className="text-[10px] tabular-nums">{activeAssets.length} Data Asset</Badge>
                        </p>
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => openManageAssets(activeDomain)}
                        title="เลือก Data Asset เข้ามาในโดเมนนี้"
                      >
                        <PackageSearch className="size-3.5" aria-hidden="true" /> จัดการ Data Asset
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => openCreateDomain(activeDomain.id, activeDomain.name)}
                        title="เพิ่ม Sub Data Domain ภายใต้โดเมนนี้"
                      >
                        <FolderPlus className="size-3.5" aria-hidden="true" /> Sub Data Domain
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDomain(activeDomain)} aria-label={`แก้ไขโดเมน ${activeDomain.name}`}>
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35"
                        disabled={!activeDomainDeletable}
                        onClick={() => setDeleteDomainId(activeDomain.id)}
                        title={activeDomainDeletable ? 'ลบโดเมน' : 'ลบได้เฉพาะโดเมนที่ยังไม่มีข้อมูลผูกใด ๆ'}
                        aria-label={`ลบโดเมน ${activeDomain.name}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  {/* Data Asset ที่ผูกกับโดเมนนี้ */}
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Data Asset:</span>
                    {activeAssets.length === 0 ? (
                      <span className="text-[11px] italic text-muted-foreground">ยังไม่เลือก — กด &quot;จัดการ Data Asset&quot; เพื่อผูกแหล่งข้อมูล</span>
                    ) : (
                      activeAssets.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px]"
                          title={a.name}
                        >
                          <PackageSearch className="size-2.5 shrink-0" aria-hidden="true" />
                          <span className="max-w-[12rem] truncate">{a.name}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Sub Data Domain → Data Element → Meta Data */}
                {activeDomain.children.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-card p-4 text-center">
                    <p className="text-xs font-medium">ยังไม่มี Sub Data Domain</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ขั้นที่ 2 — กด &quot;Sub Data Domain&quot; เพื่อสร้างส่วนย่อย (เช่น อัตราแลกเปลี่ยน ข้อมูลลูกค้า) แล้วค่อยเพิ่ม Data Element
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2" role="list" aria-label="Sub Data Domain และ Data Element">
                    {activeDomain.children.map((sub) => {
                      const subCol = domainColor(sub.color)
                      const subAll = elements.filter((e) => e.subDomainId === sub.id)
                      const subElements = subAll.filter(
                        (e) => !q || `${e.nameTh} ${e.nameEn} ${e.code} ${e.definition}`.toLowerCase().includes(q),
                      )
                      const subDeletable = (sub.elementCount ?? 0) === 0 && sub.assetCount === 0 && (sub.datasetCount ?? 0) === 0 && sub.columnCount === 0
                      return (
                        <div key={sub.id} className="rounded-lg border bg-card" role="listitem">
                          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-2.5">
                            <span className={`size-2 shrink-0 rounded-full ${subCol.dot}`} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{sub.name}</p>
                              {sub.description && <p className="break-words text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{sub.description}</p>}
                            </div>
                            <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                              {subAll.length} Data Element
                            </Badge>
                            <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => openCreateElement(sub.id, activeDomain.name ? `${activeDomain.name} / ${sub.name}` : sub.name)}
                                title="เพิ่ม Data Element ใต้โดเมนย่อยนี้"
                              >
                                <Plus className="size-3" aria-hidden="true" /> Data Element
                              </Button>
                              <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDomain(sub)} aria-label={`แก้ไขโดเมนย่อย ${sub.name}`}>
                                <Pencil className="size-3.5" aria-hidden="true" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35"
                                disabled={!subDeletable}
                                onClick={() => setDeleteDomainId(sub.id)}
                                title={subDeletable ? 'ลบโดเมนย่อย' : 'ลบได้เฉพาะโดเมนย่อยที่ยังไม่มีข้อมูลผูกใด ๆ'}
                                aria-label={`ลบโดเมนย่อย ${sub.name}`}
                              >
                                <Trash2 className="size-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1.5 p-2.5">
                            {subElements.length === 0 ? (
                              q ? (
                                <p className="rounded border border-dashed p-3 text-center text-[11px] text-muted-foreground">ไม่มี Data Element ตรงคำค้นในหมวดนี้</p>
                              ) : (
                                <div className="rounded border border-dashed p-3 text-center">
                                  <p className="text-[11px] font-medium">ยังไม่มี Data Element</p>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    ขั้นที่ 3 — กด &quot;Data Element&quot; ตั้งชื่อ (เช่น ค่าเงิน ชื่อลูกค้า) แล้วเลือกคอลัมน์อ้างอิงจาก Data Asset
                                  </p>
                                </div>
                              )
                            ) : (
                              subElements.map((e) => {
                                const eKey = `e:${e.id}`
                                const eOpen = Boolean(expanded[eKey])
                                const status = ELEMENT_STATUS_LABELS[e.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE
                                const dt = ELEMENT_DATA_TYPE_LABELS[e.dataType as ElementDataType] ?? { th: e.dataType }
                                const values = e.referenceSetId ? metaValues[e.referenceSetId] : undefined
                                const cdeWarning = e.isCde && e.ruleCount === 0
                                return (
                                  <div key={e.id} className="rounded-lg border bg-card" role="listitem">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (e.referenceSetId && !eOpen) void loadMetaValues(e.referenceSetId)
                                        toggleCatalogNode(eKey)
                                      }}
                                      aria-expanded={eOpen}
                                      className="w-full px-2.5 py-2 text-left transition-colors hover:bg-emerald-50/40"
                                      aria-label={`${eOpen ? 'ปิด' : 'กาง'} Meta Data ของ ${e.nameTh}`}
                                    >
                                      <span className="flex flex-wrap items-center gap-1.5">
                                        {eOpen ? (
                                          <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        ) : (
                                          <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        )}
                                        <span className="font-mono text-[10px] text-muted-foreground">{e.code}</span>
                                        <span className="break-words text-sm font-medium [overflow-wrap:anywhere]">{e.nameTh}</span>
                                        {e.nameEn && <span className="text-xs text-muted-foreground">{e.nameEn}</span>}
                                        <Badge variant="outline" className="text-[9px]">{dt.th}</Badge>
                                        {e.isCde && (
                                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] font-medium text-amber-800">
                                            <Star className="mr-0.5 size-2.5" aria-hidden="true" /> CDE
                                          </Badge>
                                        )}
                                        {e.isFinancial && (
                                          <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[9px] font-medium text-teal-800">
                                            <Banknote className="mr-0.5 size-2.5" aria-hidden="true" /> การเงิน
                                          </Badge>
                                        )}
                                        {e.pii && (
                                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700">
                                            <ShieldAlert className="mr-0.5 size-2.5" aria-hidden="true" /> PII
                                          </Badge>
                                        )}
                                        <Badge variant="outline" className={`text-[9px] ${status.chip}`}>{status.th}</Badge>
                                        <span className={`inline-flex items-center gap-1 text-[10px] ${cdeWarning ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>
                                          <Braces className="size-3" aria-hidden="true" /> ผูกกฎ {e.ruleCount} ข้อ
                                        </span>
                                      </span>
                                      <span className="mt-1 flex flex-wrap items-center gap-1 pl-5">
                                        <span className="text-[10px] font-medium text-muted-foreground">อ้างอิง:</span>
                                        {e.columnMappings.length === 0 ? (
                                          <span className="text-[10px] italic text-muted-foreground">ยังไม่ระบุคอลัมน์ — กด &quot;ดู Meta Data ครบ&quot; เพื่อเลือกจาก Data Asset</span>
                                        ) : (
                                          e.columnMappings.map((m) => <ReferenceChip key={`${m.assetId}.${m.columnName}`} assetName={m.assetName} columnName={m.columnName} />)
                                        )}
                                      </span>
                                      {eOpen && (
                                        <span className="mt-1 block pl-5 text-[11px] leading-relaxed text-muted-foreground">
                                          <span className="font-medium text-foreground">Meta Data (ค่ามาตรฐาน):</span>{' '}
                                          {!e.referenceSetId ? (
                                            <span className="italic">ยังไม่ผูกทะเบียน — เปิดรายละเอียดเพื่อกำหนด Meta Data</span>
                                          ) : !values ? (
                                            <span className="inline-flex items-center gap-1">
                                              <Loader2 className="size-3 animate-spin" aria-hidden="true" /> กำลังโหลดค่า…
                                            </span>
                                          ) : values.length === 0 ? (
                                            <span className="italic">ทะเบียนยังไม่มีค่า — เพิ่มค่าที่หน้า &quot;ข้อมูลอ้างอิง&quot;</span>
                                          ) : (
                                            <span className="break-words [overflow-wrap:anywhere]">
                                              {values
                                                .slice(0, 8)
                                                .map((v) => `${v.value} = ${v.labelTh || v.definition || '—'}`)
                                                .join(' · ')}
                                              {values.length > 8 ? ` · +${values.length - 8} ค่า` : ''}
                                            </span>
                                          )}
                                        </span>
                                      )}
                                      {e.definition && <span className="mt-1 block truncate pl-5 text-[11px] text-muted-foreground">{e.definition}</span>}
                                    </button>
                                    <div className="flex items-center justify-end gap-1 border-t px-2.5 py-1.5">
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => openElementDetail(e)} title="ดู Meta Data 4 กลุ่ม + คอลัมน์อ้างอิง + กฎ">
                                        <Box className="size-3" aria-hidden="true" /> ดู Meta Data ครบ
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  ลบโดเมน/โดเมนย่อยได้เฉพาะรายการที่ยังไม่มีข้อมูลผูกใด ๆ — ทุกการเปลี่ยนแปลงต้องมีสิทธิ์จัดการข้อมูลและบันทึก Audit Trail
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------- Dialog วิธีใช้งาน Data Catalog (v0.40.0) ------------------------- */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree className="size-4 text-emerald-700" aria-hidden="true" /> วิธีใช้งาน Data Catalog
            </DialogTitle>
            <DialogDescription>คู่มือสั้น 2 ส่วน — Data Catalog คืออะไร และควรบริหารจัดการอย่างไร</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Info className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" /> Data Catalog คืออะไร?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                สารบัญข้อมูลองค์กร (Data Inventory · Data Dictionary) — รวมรายการข้อมูลของทุกระบบไว้ที่เดียว เพื่อค้นหาและตรวจสอบ{' '}
                <span className="font-medium text-foreground">ชนิดข้อมูล รายละเอียด และประเภทข้อมูล</span> ได้โดยไม่ต้องเปิดระบบต้นทาง
                จัดเก็บเป็นลำดับชั้น 4 ระดับ:
              </p>
              <p className="mt-1.5 rounded border bg-card px-2 py-1 text-center text-xs font-semibold text-foreground">
                Data Domain › Sub Data Domain › Data Element › Meta Data
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <ListTree className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" /> บริหารจัดการอย่างไร — สร้างสารบัญข้อมูลตามลำดับ 4 ขั้น
              </p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>
                  สร้าง <span className="font-semibold text-foreground">Data Domain</span> — ตั้งชื่อระบบบริการ (เช่น ระบบข้อมูลการเงิน) พร้อมเลือก{' '}
                  <span className="font-semibold text-foreground">Data Asset</span> เข้ามาเป็นแหล่งข้อมูลต้นทาง
                </li>
                <li>
                  สร้าง <span className="font-semibold text-foreground">Sub Data Domain</span> — แบ่งส่วนย่อยของโดเมนได้หลายรายการ (เช่น อัตราแลกเปลี่ยน, ข้อมูลลูกค้า)
                </li>
                <li>
                  สร้าง <span className="font-semibold text-foreground">Data Element</span> — ตั้งชื่อข้อมูลรายหน่วย (เช่น ค่าเงิน ชื่อลูกค้า) แล้วเลือกคอลัมน์อ้างอิงจาก Data Asset —
                  ระบบแสดง reference ว่านำมาจากข้อมูลที่ไหน
                </li>
                <li>
                  กำหนด <span className="font-semibold text-foreground">Meta Data</span> ให้ครบถ้วน — ชนิดข้อมูล ค่ามาตรฐานภายใน (เช่น THB = ค่าเงินบาทไทย) และผู้รับผิดชอบ
                  กดที่ element เพื่อดู Meta Data 4 กลุ่ม
                </li>
              </ol>
            </div>
            <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              ทุกการเปลี่ยนแปลงบันทึก Audit Trail · ลบได้เฉพาะรายการที่ยังไม่มีข้อมูลผูก · ตามแนวทาง DAMA-DMBOK2 และ ISO/IEC 11179
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuideOpen(false)}>
              เข้าใจแล้ว
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ------------------------- Dialog รายละเอียด Data Element (Meta Data 4 ระดับ) ------------------------- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detailLoading ? (
            <>
              <DialogHeader>
                <DialogTitle>กำลังโหลดรายละเอียด Data Element</DialogTitle>
                <DialogDescription>โปรดรอสักครู่ — ระบบกำลังดึง Meta Data และการแมปคอลัมน์</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดรายละเอียด…
              </div>
            </>
          ) : !detail ? (
            <>
              <DialogHeader>
                <DialogTitle>ไม่พบข้อมูล Data Element</DialogTitle>
                <DialogDescription>element นี้อาจถูกลบไปแล้วหรือไม่มีอยู่ในระบบ</DialogDescription>
              </DialogHeader>
              <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบข้อมูล element นี้</div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <Box className="size-4 text-emerald-700" aria-hidden="true" />
                  <span className="font-mono text-sm text-muted-foreground">{detail.code}</span>
                  {detail.nameTh}
                  {detail.isCde && (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] font-medium text-amber-800">
                      <Star className="mr-0.5 size-2.5" aria-hidden="true" /> CDE
                    </Badge>
                  )}
                  {detail.isFinancial && (
                    <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[10px] font-medium text-teal-800">
                      <Banknote className="mr-0.5 size-2.5" aria-hidden="true" /> การเงิน
                    </Badge>
                  )}
                  {detail.pii && (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">
                      <ShieldAlert className="mr-0.5 size-2.5" aria-hidden="true" /> PII
                    </Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] ${(ELEMENT_STATUS_LABELS[detail.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE).chip}`}>
                    {(ELEMENT_STATUS_LABELS[detail.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE).th}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Data Element ใต้โดเมนย่อย &quot;{detail.subDomain.parent ? `${detail.subDomain.parent.name} / ` : ''}
                  {detail.subDomain.name}&quot; — Meta Data 4 กลุ่มตามแนวคิด ISO/IEC 11179 (กรอกครั้งเดียวต่อ element)
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as typeof detailTab)}>
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
                    <TabsTrigger value="business">เชิงธุรกิจ</TabsTrigger>
                    <TabsTrigger value="technical">เชิงเทคนิค</TabsTrigger>
                    <TabsTrigger value="operational">เชิงปฏิบัติการ</TabsTrigger>
                    <TabsTrigger value="governance">ธรรมาภิบาล</TabsTrigger>
                    <TabsTrigger value="mapping">
                      การแมปข้อมูล
                      {detailMappings.length > 0 && (
                        <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold tabular-nums text-emerald-800">
                          {detailMappings.length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* ------------------------- แท็บ 1: Meta Data เชิงธุรกิจ ------------------------- */}
                  <TabsContent value="business" className="mt-3">
                    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                      <MetaField label="นิยามทางธุรกิจ (Definition)" value={detail.definition || '—'} wide />
                      <MetaField label="ตัวอย่างค่า" value={detail.examples || '—'} />
                      <MetaField label="รหัสอ้างอิง" value={detail.code} />
                      <MetaField label="ชื่อภาษาอังกฤษ" value={detail.nameEn || '—'} />
                      <MetaField label="โดเมน / โดเมนย่อย" value={`${detail.subDomain.parent?.name ?? '—'} / ${detail.subDomain.name}`} />
                      <MetaField label="สร้างเมื่อ" value={fmtDateTime(detail.createdAt)} />
                      <MetaField label="แก้ไขล่าสุด" value={fmtDateTime(detail.updatedAt)} wide />
                    </div>
                  </TabsContent>

                  {/* ------------------------- แท็บ 2: Meta Data เชิงเทคนิค ------------------------- */}
                  <TabsContent value="technical" className="mt-3 space-y-3">
                    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                      <MetaField
                        label="ประเภทข้อมูล"
                        value={`${ELEMENT_DATA_TYPE_LABELS[detail.dataType as ElementDataType]?.th ?? detail.dataType}${detail.unit ? ` (${detail.unit})` : ''}`}
                      />
                      <MetaField label="รูปแบบ / พาเทิร์น" value={detail.formatPattern || '—'} />
                      <MetaField label="ค่าอนุญาต (Value Domain)" value={detail.valueDomain || '—'} />
                      <MetaField
                        label="ทะเบียนข้อมูลอ้างอิง"
                        value={detail.referenceSet ? `${detail.referenceSet.name} (${detail.referenceSet.code})` : 'ไม่ผูก — ข้อความอิสระ'}
                      />
                      <MetaField label="ความยาวสูงสุด" value={detail.maxLength !== null ? String(detail.maxLength) : '—'} />
                    </div>

                    {/* การแมปคอลัมน์จริง */}
                    <div className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Link2 className="size-3.5 text-emerald-700" aria-hidden="true" /> แหล่งข้อมูลที่แมป ({mapDraft.length} คอลัมน์)
                        </p>
                        {detail.rules.length === 0 && (
                          <p className="text-[11px] text-muted-foreground">element ที่ไม่มีกฎผูกสามารถลบได้ — การแมปจะถูกลบตาม</p>
                        )}
                      </div>
                      {mapDraft.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {mapDraft.map((m) => {
                            const asset = assets.find((a) => a.id === m.assetId)
                            return (
                              <span key={`${m.assetId}.${m.columnName}`} className="rounded-full border bg-muted/50 px-2 py-0.5 font-mono text-[10px]">
                                {asset?.name ?? '(asset)'}<span className="opacity-50"> · </span>{m.columnName}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* editor */}
                      <div className="mt-3 grid gap-2">
                        <Select value={mapAssetId} onValueChange={(v) => void loadMappingAssetColumns(v)}>
                          <SelectTrigger className="h-8 w-full text-xs" aria-label="เลือกข้อมูลเพื่อแมปคอลัมน์">
                            <SelectValue placeholder="— เลือกข้อมูลจากคลังเพื่อแมปคอลัมน์ —" />
                          </SelectTrigger>
                          <SelectContent>
                            {assets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} · {a.columnCount} คอลัมน์
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapAssetId && (
                          mapLoading ? (
                            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> กำลังโหลดคอลัมน์…
                            </div>
                          ) : (
                            <div className="grid max-h-40 gap-1 overflow-y-auto rounded border p-2 sm:grid-cols-2">
                              {mapColumns.map((c) => {
                                const checked = mapDraft.some((m) => m.assetId === mapAssetId && m.columnName === c.name)
                                return (
                                  <label key={c.name} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60">
                                    <Checkbox checked={checked} onCheckedChange={() => toggleMapping(mapAssetId, c.name)} aria-label={`แมปคอลัมน์ ${c.name}`} />
                                    <span className="font-mono">{c.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{DATA_TYPE_LABELS[c.dataType] ?? c.dataType}</span>
                                  </label>
                                )
                              })}
                              {mapColumns.length === 0 && <p className="p-2 text-xs text-muted-foreground">ไม่พบคอลัมน์</p>}
                            </div>
                          )
                        )}
                        <Button size="sm" variant="outline" className="w-full sm:w-fit" disabled={mapSaving || !operatorEmail} onClick={() => void saveMappings()}>
                          {mapSaving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Save className="size-3.5" aria-hidden="true" />}
                          บันทึกการแมป ({mapDraft.length})
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ------------------------- แท็บ 3: Meta Data เชิงปฏิบัติการ — กรอกมือ (ซ้าย) คู่กับค่าจริงจากระบบ (ขวา) ------------------------- */}
                  <TabsContent value="operational" className="mt-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Pencil className="size-3.5 text-emerald-700" aria-hidden="true" /> กรอกมือ (Meta Data)
                        </p>
                        <div className="mt-2 grid gap-2">
                          <MetaField
                            label="ความถี่การปรับปรุงข้อมูล"
                            value={(detail.opUpdateFrequency && OP_UPDATE_FREQUENCY_LABELS[detail.opUpdateFrequency as OpUpdateFrequency]?.th) || 'ไม่ระบุ'}
                          />
                          <MetaField label="หมายเหตุเชิงปฏิบัติการ" value={detail.opNotes || '—'} wide />
                        </div>
                        <p className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> แก้ไขส่วนนี้ได้จากปุ่ม &quot;แก้ไข Meta Data&quot; ด้านล่าง
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Boxes className="size-3.5 text-emerald-700" aria-hidden="true" /> ค่าจริงจากระบบ (อ่านอย่างเดียว)
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <MetaField label="คอลัมน์ที่แมป" value={`${detailOps?.mappingCount ?? 0} คอลัมน์ / ${detailOps?.assetCount ?? 0} ข้อมูล`} />
                          <MetaField label="กฎที่ผูกใช้งาน" value={`${detailOps?.ruleCount ?? 0} ข้อ`} />
                          <MetaField label="ชุดข้อมูลที่ตรวจ" value={`${detailOps?.datasetCount ?? 0} ชุด`} />
                          <MetaField label="รันตรวจล่าสุด" value={detailOps?.lastRunAt ? fmtDateTime(detailOps.lastRunAt) : 'ยังไม่เคยรัน'} />
                          <MetaField
                            label="คะแนน element ล่าสุด"
                            value={detailOps?.lastScore != null ? `${detailOps.lastScore.toFixed(1)} / 100 (ถ่วงแถว)` : 'ยังไม่มีผลรัน'}
                          />
                          <MetaField label="แถวที่ประเมินล่าสุด" value={`${detailOps?.lastRows ?? 0} แถว · กฎไม่ผ่าน ${detailOps?.lastFailedRules ?? 0}`} />
                        </div>
                        {detailOps && detailOps.datasetNames.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {detailOps.datasetNames.map((n) => (
                              <span key={n} className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{n}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* กฎที่ผูก */}
                    <div className="rounded-lg border p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <Braces className="size-3.5 text-emerald-700" aria-hidden="true" /> กฎตรวจสอบที่ผูกกับ element นี้ ({detail.rules.length} ข้อ)
                      </p>
                      {detail.rules.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีกฎผูก — ไปที่คลังกฎ (DQ Rule Library) เพื่อสร้างกฎโดยเลือก element นี้</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {detail.rules.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center gap-1.5 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                              <span className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[r.severity] ?? 'bg-slate-400'}`} aria-hidden="true" />
                              <span className="font-medium">{r.conditionName}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">คอลัมน์ {r.column}</span>
                              <span className="text-[10px] text-muted-foreground">เกณฑ์ผ่าน ≥ {r.threshold}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </TabsContent>

                  {/* ------------------------- แท็บ 4: Meta Data ธรรมาภิบาล ------------------------- */}
                  <TabsContent value="governance" className="mt-3 space-y-3">
                    {/* ผู้รับผิดชอบ 3 บทบาท — เลือกจากผู้ใช้ในระบบ คนละ 1 คนต่อบทบาท */}
                    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">เจ้าของข้อมูล (Data Owner)</p>
                        <p className="mt-0.5 text-xs font-medium">{detailStewardship?.owner ? detailStewardship.owner.name : '— ไม่ระบุ —'}</p>
                        {detailStewardship?.owner && <p className="text-[10px] text-muted-foreground">{detailStewardship.owner.roleTh ?? ''} · {detailStewardship.owner.email}</p>}
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ผู้ดูแลข้อมูล (Data Steward)</p>
                        <p className="mt-0.5 text-xs font-medium">{detailStewardship?.steward ? detailStewardship.steward.name : '— ไม่ระบุ —'}</p>
                        {detailStewardship?.steward && <p className="text-[10px] text-muted-foreground">{detailStewardship.steward.roleTh ?? ''} · {detailStewardship.steward.email}</p>}
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ผู้เก็บรักษาข้อมูล (Data Custodian)</p>
                        <p className="mt-0.5 text-xs font-medium">{detailStewardship?.custodian ? detailStewardship.custodian.name : '— ไม่ระบุ —'}</p>
                        {detailStewardship?.custodian && <p className="text-[10px] text-muted-foreground">{detailStewardship.custodian.roleTh ?? ''} · {detailStewardship.custodian.email}</p>}
                      </div>
                    </div>

                    {/* PII + การจำแนก (ใช้ฟิลด์เดิมมาแสดงใหม่ในกลุ่มธรรมาภิบาล) + ธงพิเศษที่มีผลต่อระบบจริง */}
                    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                      <MetaField label="ข้อมูลส่วนบุคคล (PII)" value={detail.pii ? 'เป็น PII — ปิดบังค่าตามบทบาทเมื่อแสดงผล (PDPA)' : 'ไม่ใช่'} />
                      <MetaField
                        label="การจำแนกข้อมูล"
                        value={
                          detail.classification && detail.classification !== 'UNCLASSIFIED'
                            ? (DATA_CLASSIFICATIONS.find((c) => c.id === detail?.classification)?.th ?? detail.classification)
                            : 'ไม่ระบุ'
                        }
                      />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ธง CDE (Critical Data Element)</p>
                        <p className={`mt-0.5 text-xs ${detail.isCde ? 'font-medium text-amber-800' : 'text-foreground'}`}>
                          {detail.isCde ? 'เปิด — แดชบอร์ดผู้บริหารนับความครอบคลุม/คะแนนต่ำแยกเป็นความเสี่ยง · เตือนเมื่อยังไม่มีกฎผูก' : 'ปิด'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ธงการเงิน (Financial Reporting)</p>
                        <p className={`mt-0.5 text-xs ${detail.isFinancial ? 'font-medium text-teal-800' : 'text-foreground'}`}>
                          {detail.isFinancial ? 'เปิด — แดชบอร์ดผู้บริหารนับความเสี่ยงต่อการรายงานทางการเงินเมื่อคะแนนต่ำกว่าเกณฑ์' : 'ปิด'}
                        </p>
                      </div>
                      {detail.customFields && detail.customFields !== '{}' && <MetaField label="Field เสริม" value={detail.customFields} wide />}
                    </div>

                    {/* สถานะ element — v0.36.0: เปิดใช้งาน/เลิกใช้ตรงด้วยสิทธิ์ MANAGE_DATASETS (ไม่มีคิวอนุมัติ) */}
                    <div className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden="true" /> สถานะและการเปิดใช้งาน
                        </p>
                        <Badge variant="outline" className={`text-[10px] ${(ELEMENT_STATUS_LABELS[detail.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE).chip}`}>
                          {(ELEMENT_STATUS_LABELS[detail.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE).th}
                        </Badge>
                      </div>

                      {detail.status === 'DRAFT' || detail.status === 'DEPRECATED' ? (
                        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 p-2.5">
                          <p className="text-xs text-muted-foreground">
                            เปิดใช้งาน element นี้เพื่อให้ผูกกฎ/แมป/รันในรอบโดเมนได้ — ผู้ดำเนินการ ({operatorEmail || 'ยังไม่เลือก'}) ต้องมีสิทธิ์ &quot;จัดการชุดข้อมูล&quot;
                            {detail.status === 'DEPRECATED' && ' · เปิดใช้งานแล้วจะกลับมาใช้งาน (ACTIVE) อีกครั้ง'}
                          </p>
                          <Button
                            size="sm"
                            className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={workflowBusy || !operatorEmail}
                            onClick={() => void doWorkflowAction('ACTIVATE')}
                          >
                            {workflowBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                            เปิดใช้งาน (ACTIVE)
                          </Button>
                        </div>
                      ) : detail.status === 'ACTIVE' ? (
                        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 p-2.5">
                          <p className="text-xs text-muted-foreground">เลิกใช้ element นี้ — กฎที่ผูกจะไม่ถูกรันในรอบโดเมนถัดไป (ต้องมีสิทธิ์จัดการชุดข้อมูล)</p>
                          <p className="text-xs font-medium" aria-label="ผู้ดำเนินการเลิกใช้จากเซสชันปัจจุบัน">
                            ผู้ดำเนินการ: {sessionUser ? `${sessionUser.name} · ${sessionUser.roleTh}` : '— กำลังโหลด —'}
                          </p>
                          <Input
                            value={workflowNote}
                            onChange={(ev) => setWorkflowNote(ev.target.value)}
                            placeholder="เหตุผลการเลิกใช้ (ไม่บังคับ — บันทึกใน Audit Trail)"
                            className="h-8 text-xs"
                            aria-label="เหตุผลการเลิกใช้"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-fit border-amber-300 text-amber-800 hover:bg-amber-50"
                            disabled={workflowBusy || !operatorEmail}
                            onClick={() => void doWorkflowAction('DEPRECATE', workflowNote)}
                          >
                            <Archive className="size-3.5" aria-hidden="true" /> เลิกใช้ (DEPRECATED)
                          </Button>
                        </div>
                      ) : null}

                      <p className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                        <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        สิทธิ์ตาม RBAC: เปิดใช้งาน/เลิกใช้ = จัดการชุดข้อมูล (MANAGE_DATASETS) — ทุกครั้งบันทึกผู้ดำเนินการใน Audit Trail
                      </p>
                    </div>

                    {/* Audit Trail ของ element นี้ */}
                    <div className="rounded-lg border p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <History className="size-3.5 text-emerald-700" aria-hidden="true" /> Audit Trail ของ element นี้ ({detailAudit.length} รายการล่าสุด)
                      </p>
                      {detailAudit.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีประวัติการทำรายการ</p>
                      ) : (
                        <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                          {detailAudit.map((a) => (
                            <li key={a.id} className="rounded border bg-muted/30 px-2 py-1.5 text-[11px]">
                              <p className="font-medium">{a.detail}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDateTime(a.createdAt)}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </TabsContent>

                  {/* ------------------------- แท็บ 5: Data Mapping (v0.21.0) — เส้นเชื่อมต้นทาง→ปลายทาง ------------------------- */}
                  <TabsContent value="mapping" className="mt-3 space-y-3">
                    {/* แผนผัง lineage แบบย่อ: ต้นทาง (ซ้าย) → element นี้ (กลาง) → ปลายทาง (ขวา) */}
                    {detailLineage && detailLineage.edgeCount > 0 && (
                      <div className="rounded-lg border p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Waypoints className="size-3.5 text-emerald-700" aria-hidden="true" /> แผนผัง Lineage แบบย่อ — {detailLineage.nodeCount} element · {detailLineage.edgeCount} เส้นทาง
                        </p>
                        <div className="mt-2">
                          <LineageDiagram rootId={detailLineage.rootId} nodes={detailLineage.nodes} edges={detailLineage.edges} depth={detailLineage.depth} compact />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">เส้นเชื่อม element นี้กับ element อื่น — ระบุว่าเป็นข้อมูลชนิดเดียวกัน ข้ามระบบ/ข้ามโดเมน</p>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={!operatorEmail}
                        title={operatorEmail ? 'เพิ่มการแมปใหม่' : 'เลือกผู้ดำเนินการก่อน (ต้องมีสิทธิ์จัดการชุดข้อมูล)'}
                        onClick={() => setMapAddOpen(true)}
                      >
                        <Plus className="size-3.5" aria-hidden="true" /> เพิ่มการแมป
                      </Button>
                    </div>

                    {detailMappingsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด mapping…
                      </div>
                    ) : detailMappings.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <Waypoints className="mx-auto size-7 text-muted-foreground/40" aria-hidden="true" />
                        <p className="mt-2 text-sm font-medium">element นี้ยังไม่มีการแมปข้อมูล</p>
                        <p className="mt-1 text-xs text-muted-foreground">กด &quot;เพิ่มการแมป&quot; เพื่อเชื่อมต้นทาง (ไหลเข้า) หรือปลายทาง (ไหลออก)</p>
                      </div>
                    ) : (
                      <>
                        {/* Source Mappings — ข้อมูลที่ไหลเข้า (element อื่นเป็นต้นทาง → element นี้เป็นปลายทาง) */}
                        <div className="rounded-lg border p-3">
                          <p className="flex items-center gap-1.5 text-xs font-semibold">
                            <Waypoints className="size-3.5 text-emerald-700" aria-hidden="true" />
                            Source Mappings — ข้อมูลที่ไหลเข้า ({detailMappings.filter((m) => m.target.id === detail.id).length})
                          </p>
                          {detailMappings.filter((m) => m.target.id === detail.id).length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีต้นทางที่ไหลเข้า element นี้</p>
                          ) : (
                            <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                              {detailMappings
                                .filter((m) => m.target.id === detail.id)
                                .map((m) => (
                                  <MappingSideRow
                                    key={m.id}
                                    mapping={m}
                                    elementId={detail.id}
                                    operatorEmail={operatorEmail}
                                    onChanged={() => (detail ? loadDetailMappings(detail.id) : Promise.resolve())}
                                    onOpenDetail={(id) => {
                                      setMappingDetailId(id)
                                      setMappingDetailOpen(true)
                                    }}
                                  />
                                ))}
                            </ul>
                          )}
                        </div>

                        {/* Target Mappings — ข้อมูลที่ไหลออก (element นี้เป็นต้นทาง → element อื่นเป็นปลายทาง) */}
                        <div className="rounded-lg border p-3">
                          <p className="flex items-center gap-1.5 text-xs font-semibold">
                            <Waypoints className="size-3.5 text-emerald-700" aria-hidden="true" />
                            Target Mappings — ข้อมูลที่ไหลออก ({detailMappings.filter((m) => m.source.id === detail.id).length})
                          </p>
                          {detailMappings.filter((m) => m.source.id === detail.id).length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">element นี้ยังไม่ไหลออกไปยัง element อื่น</p>
                          ) : (
                            <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                              {detailMappings
                                .filter((m) => m.source.id === detail.id)
                                .map((m) => (
                                  <MappingSideRow
                                    key={m.id}
                                    mapping={m}
                                    elementId={detail.id}
                                    operatorEmail={operatorEmail}
                                    onChanged={() => (detail ? loadDetailMappings(detail.id) : Promise.resolve())}
                                    onOpenDetail={(id) => {
                                      setMappingDetailId(id)
                                      setMappingDetailOpen(true)
                                    }}
                                  />
                                ))}
                            </ul>
                          )}
                        </div>
                      </>
                    )}

                    {/* Dialog เพิ่มการแมป (ฟอร์มใช้ร่วมกับหน้า Data Mapping) */}
                    <MappingDetailDialog
                      mappingId={mappingDetailId}
                      open={mappingDetailOpen}
                      onOpenChange={setMappingDetailOpen}
                      operatorEmail={operatorEmail}
                      onChanged={() => (detail ? loadDetailMappings(detail.id) : Promise.resolve())}
                    />
                    <Dialog open={mapAddOpen} onOpenChange={setMapAddOpen}>
                      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>
                            เพิ่มการแมป — <span className="font-mono text-sm text-muted-foreground">{detail.code}</span> {detail.nameTh}
                          </DialogTitle>
                          <DialogDescription>
                            เลือกทิศทางและ element อีกฝั่ง (ต้องเป็นสถานะ ACTIVE) — สร้างแล้วสถานะ DRAFT ต้องส่งขออนุมัติจึงจะใช้งานได้
                          </DialogDescription>
                        </DialogHeader>
                        <MappingForm
                          operators={operators}
                          defaultOperator={operatorEmail}
                          domains={domains}
                          elements={elements}
                          fixedElement={{ id: detail.id, code: detail.code, nameTh: detail.nameTh, path: detailElementPath }}
                          onCreated={(msg) => {
                            toast({ title: msg })
                            setMapAddOpen(false)
                            void loadDetailMappings(detail.id)
                          }}
                          onCancel={() => setMapAddOpen(false)}
                        />
                      </DialogContent>
                    </Dialog>
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35"
                  disabled={detail.rules.length > 0 || !operatorEmail}
                  title={detail.rules.length > 0 ? 'ปลดกฎที่ผูกอยู่ก่อนจึงจะลบได้' : 'ลบ element นี้'}
                  onClick={() => setDeleteElementId(detail.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> ลบ element
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDetailOpen(false)}>
                    ปิด
                  </Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={openEditElementFromDetail}>
                    <Pencil className="size-3.5" aria-hidden="true" /> แก้ไข Meta Data
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------- Dialog ฟอร์ม Data Element (สร้าง/แก้ไข) ------------------------- */}
      <Dialog open={elFormOpen} onOpenChange={setElFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{elFormMode === 'create' ? 'เพิ่ม Data Element' : 'แก้ไข Meta Data ของ Data Element'}</DialogTitle>
            <DialogDescription>
              {elFormMode === 'create'
                ? `ขั้นที่ 3 — สร้างใต้ Sub Data Domain "${elFormSubLabel}" — ตั้งชื่อ (เช่น ค่าเงิน ชื่อลูกค้า) เลือกคอลัมน์อ้างอิงจาก Data Asset และกรอก Meta Data (รหัส EL-#### สร้างอัตโนมัติ · สถานะเริ่มต้น "ร่าง")`
                : 'แก้ไขได้ทุกฟิลด์ Meta Data (สถานะเปลี่ยนผ่าน workflow อนุมัติในแท็บธรรมาภิบาล · ย้ายโดเมนย่อย = ลบแล้วสร้างใหม่เพื่อคงประวัติ)'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="el-name">
                  ชื่อ Data Element <span className="text-rose-600">*</span>
                </Label>
                <Input id="el-name" value={elName} onChange={(e) => setElName(e.target.value)} maxLength={ELEMENT_NAME_MAX} placeholder="เช่น อีเมลลูกค้า" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-name-en">ชื่อภาษาอังกฤษ (ไม่บังคับ)</Label>
                <Input id="el-name-en" value={elNameEn} onChange={(e) => setElNameEn(e.target.value)} maxLength={ELEMENT_NAME_MAX} placeholder="เช่น Customer Email" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="el-definition">นิยามทางธุรกิจ (Definition)</Label>
              <Textarea
                id="el-definition"
                value={elDefinition}
                onChange={(e) => setElDefinition(e.target.value)}
                rows={2}
                maxLength={ELEMENT_TEXT_MAX}
                placeholder="อธิบายความหมายและขอบเขตของข้อมูลนี้ เช่น ที่อยู่อีเมลสำหรับติดต่อลูกค้า ต้องอยู่ในรูปแบบอีเมลที่ถูกต้อง"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="el-examples">ตัวอย่างค่า</Label>
                <Input id="el-examples" value={elExamples} onChange={(e) => setElExamples(e.target.value)} maxLength={ELEMENT_TEXT_MAX} placeholder="เช่น anan.jaidee@example.co.th" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-datatype">ประเภทข้อมูล</Label>
                <Select value={elDataType} onValueChange={setElDataType}>
                  <SelectTrigger id="el-datatype" aria-label="ประเภทข้อมูลของ element">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEMENT_DATA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ELEMENT_DATA_TYPE_LABELS[t].th} ({t})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="el-format">รูปแบบ / พาเทิร์น</Label>
                <Input id="el-format" value={elFormat} onChange={(e) => setElFormat(e.target.value)} maxLength={ELEMENT_TEXT_MAX} placeholder="เช่น name@domain หรือ DD/MM/YYYY" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-valuedomain">ค่าอนุญาต (Value Domain)</Label>
                <Input id="el-valuedomain" value={elValueDomain} onChange={(e) => setElValueDomain(e.target.value)} maxLength={ELEMENT_TEXT_MAX} placeholder="เช่น USD, EUR, THB หรือ ≥ 0" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="el-refset">ผูกทะเบียนข้อมูลอ้างอิง (ไม่บังคับ — v0.31.0)</Label>
              <Select value={elRefSet || NO_DOMAIN} onValueChange={(v) => setElRefSet(v === NO_DOMAIN ? '' : v)}>
                <SelectTrigger id="el-refset">
                  <SelectValue placeholder="— ข้อความอิสระ (ไม่ผูกทะเบียน) —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DOMAIN}>— ข้อความอิสระ (ไม่ผูกทะเบียน) —</SelectItem>
                  {refSets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                ผูกแล้วค่าอนุญาตอ้างอิงจากทะเบียนเดียวกับกฎ IN_LIST/REFERENCE_MATCH — แก้ค่าที่หน้า "ข้อมูลอ้างอิง" (Data Asset) จุดเดียว
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="el-maxlen">ความยาวสูงสุด</Label>
                <Input id="el-maxlen" type="number" min={0} value={elMaxLength} onChange={(e) => setElMaxLength(e.target.value)} placeholder="ไม่ระบุ" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-unit">หน่วย</Label>
                <Input id="el-unit" value={elUnit} onChange={(e) => setElUnit(e.target.value)} maxLength={40} placeholder="เช่น THB, %" />
              </div>
              <div className="grid gap-1.5">
                <Label>สถานะ (workflow อนุมัติ)</Label>
                <div className="flex h-9 items-center">
                  <Badge variant="outline" className={`text-[11px] ${(ELEMENT_STATUS_LABELS[elStatus as ElementStatus] ?? ELEMENT_STATUS_LABELS.DRAFT).chip}`}>
                    {(ELEMENT_STATUS_LABELS[elStatus as ElementStatus] ?? ELEMENT_STATUS_LABELS.DRAFT).th}
                  </Badge>
                  <span className="ml-2 text-[10px] text-muted-foreground">เปลี่ยนผ่านแท็บธรรมาภิบาล</span>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="el-owner">เจ้าของข้อมูล (Data Owner)</Label>
                <Select value={elOwner || NO_DOMAIN} onValueChange={(v) => setElOwner(v === NO_DOMAIN ? '' : v)}>
                  <SelectTrigger id="el-owner" aria-label="เจ้าของข้อมูล">
                    <SelectValue placeholder="— ไม่ระบุ —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DOMAIN}>— ไม่ระบุ —</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-steward">ผู้ดูแลข้อมูล (Data Steward)</Label>
                <Select value={elSteward || NO_DOMAIN} onValueChange={(v) => setElSteward(v === NO_DOMAIN ? '' : v)}>
                  <SelectTrigger id="el-steward" aria-label="ผู้ดูแลข้อมูล">
                    <SelectValue placeholder="— ไม่ระบุ —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DOMAIN}>— ไม่ระบุ —</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-custodian">ผู้เก็บรักษาข้อมูล (Data Custodian)</Label>
                <Select value={elCustodian || NO_DOMAIN} onValueChange={(v) => setElCustodian(v === NO_DOMAIN ? '' : v)}>
                  <SelectTrigger id="el-custodian" aria-label="ผู้เก็บรักษาข้อมูล">
                    <SelectValue placeholder="— ไม่ระบุ —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DOMAIN}>— ไม่ระบุ —</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-classification">การจำแนกข้อมูล</Label>
                <Select value={elClassification} onValueChange={setElClassification}>
                  <SelectTrigger id="el-classification" aria-label="การจำแนกข้อมูล">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCLASSIFIED}>ไม่ระบุ</SelectItem>
                    {DATA_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.th} ({c.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label htmlFor="el-pii" className="text-sm">
                  เป็นข้อมูลส่วนบุคคล (PII)
                </Label>
                <p className="text-[11px] text-muted-foreground">เมื่อเป็น PII ระบบจะปิดบังค่าตามบทบาทเมื่อแสดงผล (PDPA)</p>
              </div>
              <Switch id="el-pii" checked={elPii} onCheckedChange={setElPii} aria-label="เปิด/ปิดสถานะ PII" />
            </div>
            {/* ธงพิเศษ — เฉพาะธงที่มีผลต่อระบบจริง */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div>
                  <Label htmlFor="el-cde" className="flex items-center gap-1 text-sm">
                    <Star className="size-3.5 text-amber-600" aria-hidden="true" /> CDE — ข้อมูลวิกฤต
                  </Label>
                  <p className="text-[11px] text-muted-foreground">แดชบอร์ดผู้บริหารนับความครอบคลุม/คะแนนต่ำเป็นความเสี่ยง · เตือนเมื่อยังไม่มีกฎ</p>
                </div>
                <Switch id="el-cde" checked={elCde} onCheckedChange={setElCde} aria-label="เปิด/ปิดธง CDE" />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                <div>
                  <Label htmlFor="el-financial" className="flex items-center gap-1 text-sm">
                    <Banknote className="size-3.5 text-teal-600" aria-hidden="true" /> ผลต่อการรายงานการเงิน
                  </Label>
                  <p className="text-[11px] text-muted-foreground">แดชบอร์ดผู้บริหารนับความเสี่ยงรายงานเงินเมื่อคะแนนต่ำกว่าเกณฑ์</p>
                </div>
                <Switch id="el-financial" checked={elFinancial} onCheckedChange={setElFinancial} aria-label="เปิด/ปิดธงการเงิน" />
              </div>
            </div>
            {/* เชิงปฏิบัติการ — กรอกมือ (ค่าจริงจากระบบแสดงในหน้ารายละเอียด) */}
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="el-opfreq">ความถี่การปรับปรุงข้อมูล (เชิงปฏิบัติการ)</Label>
                <Select value={elOpFreq || NO_DOMAIN} onValueChange={(v) => setElOpFreq(v === NO_DOMAIN ? '' : v)}>
                  <SelectTrigger id="el-opfreq" aria-label="ความถี่การปรับปรุงข้อมูล">
                    <SelectValue placeholder="— ไม่ระบุ —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DOMAIN}>— ไม่ระบุ —</SelectItem>
                    {OP_UPDATE_FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {OP_UPDATE_FREQUENCY_LABELS[f].th} ({f})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="el-opnotes">หมายเหตุเชิงปฏิบัติการ</Label>
                <Input
                  id="el-opnotes"
                  value={elOpNotes}
                  onChange={(e) => setElOpNotes(e.target.value)}
                  maxLength={ELEMENT_TEXT_MAX}
                  placeholder="เช่น โหลดข้อมูลทุกวัน 06:00 น. โดยทีม Data Engineering"
                />
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                ค่าจริงจากระบบ (จำนวนคอลัมน์ที่แมป / กฎ / ผลรันล่าสุด / คะแนน) แสดงคู่กันอัตโนมัติในแท็บ "เชิงปฏิบัติการ" ของหน้ารายละเอียด
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="el-custom">Field เสริม (JSON object — ไม่บังคับ)</Label>
              <Textarea
                id="el-custom"
                value={elCustom}
                onChange={(e) => setElCustom(e.target.value)}
                rows={2}
                className="font-mono text-xs"
                placeholder='{"source_system": "CRM", "update_frequency": "daily"}'
              />
            </div>

            {/* v0.39.0 — คอลัมน์อ้างอิงจาก Data Asset (reference ว่านำมาจากข้อมูลที่ไหน) */}
            <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                <Link2 className="size-3.5" aria-hidden="true" /> คอลัมน์อ้างอิงจาก Data Asset (Reference) — ระบุว่าข้อมูลนี้นำมาจากที่ใด
              </p>
              <Select value={elRefAssetId} onValueChange={(v) => void loadElRefColumns(v)}>
                <SelectTrigger className="h-8 w-full text-xs" aria-label="เลือก Data Asset เพื่อเลือกคอลัมน์อ้างอิง">
                  <SelectValue placeholder="— เลือก Data Asset จากคลัง —" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.columnCount} คอลัมน์
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {elRefAssetId && (
                elRefLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> กำลังโหลดคอลัมน์…
                  </div>
                ) : (
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded border bg-card p-2 sm:grid-cols-2" role="group" aria-label="เลือกคอลัมน์อ้างอิง">
                    {elRefColumns.map((c) => {
                      const checked = elRefDraft.some((m) => m.assetId === elRefAssetId && m.columnName === c.name)
                      return (
                        <label key={c.name} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60">
                          <Checkbox checked={checked} onCheckedChange={() => toggleElRef(elRefAssetId, c.name)} aria-label={`เลือกคอลัมน์ ${c.name}`} />
                          <span className="font-mono">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground">{DATA_TYPE_LABELS[c.dataType] ?? c.dataType}</span>
                        </label>
                      )
                    })}
                    {elRefColumns.length === 0 && <p className="p-2 text-xs text-muted-foreground">ไม่พบคอลัมน์ของ Data Asset นี้</p>}
                  </div>
                )
              )}
              {elRefDraft.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {elRefDraft.map((m) => {
                    const asset = assets.find((a) => a.id === m.assetId)
                    return <ReferenceChip key={`${m.assetId}.${m.columnName}`} assetName={asset?.name ?? '(asset)'} columnName={m.columnName} />
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                เลือกแล้ว {elRefDraft.length} คอลัมน์ — reference จะแสดงบนแคตตาล็อกว่า element นี้นำมาจาก Data Asset ใดคอลัมน์ใด (แก้ไขภายหลังได้ที่แท็บ "เชิงเทคนิค")
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setElFormOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={elFormBusy || !elName.trim()} onClick={() => void submitElementForm()}>
              {elFormBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- Dialog ฟอร์มโดเมน (สร้าง/แก้ไข) ------------------------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? (formParentId ? 'เพิ่ม Sub Data Domain' : 'เพิ่ม Data Domain') : 'แก้ไขโดเมน'}</DialogTitle>
            <DialogDescription>
              {formMode === 'create' && formParentId
                ? `ขั้นที่ 2 — สร้างส่วนย่อยภายใต้ "${formParentName}" (เช่น อัตราแลกเปลี่ยน ข้อมูลลูกค้า) แล้วเพิ่ม Data Element ภายหลัง — ระบบรองรับโดเมนลึกสุด 2 ระดับ`
                : formMode === 'create'
                  ? 'ขั้นที่ 1 — ตั้งชื่อระบบบริการให้สื่อความหมาย (เช่น ระบบข้อมูลการเงิน) และเลือก Data Asset เข้ามาประกอบการสร้าง'
                  : 'แก้ไขชื่อ/คำอธิบาย/สีป้าย (การผูก Data Asset จัดการที่ปุ่ม "จัดการ Data Asset")'}
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
                placeholder={formParentId ? 'เช่น อัตราแลกเปลี่ยน' : 'เช่น ระบบข้อมูลการเงิน'}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="domain-name-en">ชื่อภาษาอังกฤษ (ไม่บังคับ)</Label>
              <Input
                id="domain-name-en"
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                maxLength={DOMAIN_NAME_MAX}
                placeholder="เช่น Financial Data"
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

            {/* v0.39.0 — เลือก Data Asset เข้ามาในโดเมน (เฉพาะสร้างโดเมนหลัก) */}
            {formMode === 'create' && !formParentId && (
              <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-3">
                <Label className="text-xs">เลือก Data Asset เข้ามาในโดเมนนี้ (ไม่บังคับ — เลือกเพิ่มภายหลังด้วย "จัดการ Data Asset")</Label>
                {assets.length === 0 ? (
                  <p className="rounded border border-dashed bg-card p-2 text-[11px] text-muted-foreground">
                    ยังไม่มีข้อมูลในคลัง — นำเข้าข้อมูลก่อนที่เมนู "นำเข้าข้อมูล" แล้วค่อยเลือกที่ปุ่ม "จัดการ Data Asset"
                  </p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded border bg-card p-2" role="group" aria-label="เลือก Data Asset เข้าโดเมน">
                    {assets.map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/60">
                        <Checkbox
                          checked={formAssetIds.includes(a.id)}
                          onCheckedChange={() => toggleFormAsset(a.id)}
                          aria-label={`เลือก ${a.name}`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-medium [overflow-wrap:anywhere]">{a.name}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {SOURCE_LABELS[a.sourceType] ?? a.sourceType} · {a.columnCount} คอลัมน์
                            {a.domain ? ` · ขณะนี้อยู่โดเมน "${a.domain.name}"` : ' · ยังไม่ระบุโดเมน'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">เลือกแล้ว {formAssetIds.length} รายการ — Data Asset ที่อยู่โดเมนอื่นจะถูกย้ายเข้าโดเมนนี้</p>
              </div>
            )}

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

      {/* ------------------------- Dialog จัดการ Data Asset ในโดเมน (v0.39.0) ------------------------- */}
      <Dialog open={manageAssetsOpen} onOpenChange={setManageAssetsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>จัดการ Data Asset — {manageAssetDomain?.name ?? ''}</DialogTitle>
            <DialogDescription>
              เลือกข้อมูลจากคลัง (Data Asset) ที่จะนำเข้ามาประกอบโดเมนนี้ — รายการที่เคยอยู่โดเมนอื่นจะถูกย้ายเข้าโดเมนนี้ และรายการที่เอาออกจะกลับเป็น &quot;ไม่ระบุโดเมน&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            {assets.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                ยังไม่มีข้อมูลในคลัง — นำเข้าข้อมูลก่อนที่เมนู &quot;นำเข้าข้อมูล&quot;
              </p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2" role="group" aria-label="เลือก Data Asset ในโดเมน">
                {assets.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/60">
                    <Checkbox
                      checked={manageAssetIds.includes(a.id)}
                      onCheckedChange={() => toggleManageAsset(a.id)}
                      aria-label={`เลือก ${a.name}`}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-xs font-medium [overflow-wrap:anywhere]">{a.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {SOURCE_LABELS[a.sourceType] ?? a.sourceType} · {a.columnCount} คอลัมน์ · {a.rowCount} แถว
                        {a.domain && a.domain.id !== manageAssetDomain?.id ? ` · ขณะนี้อยู่โดเมน "${a.domain.name}"` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              เลือกแล้ว {manageAssetIds.length} รายการ — บันทึกแล้วระบบอัปเดตจำนวนบนแคตตาล็อกทันที (บันทึก Audit Trail ทุกครั้ง)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageAssetsOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={manageAssetsBusy || !manageAssetDomain} onClick={() => void saveDomainAssets()}>
              {manageAssetsBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} บันทึก
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

      {/* ------------------------- ยืนยันลบ Data Element ------------------------- */}
      <AlertDialog open={deleteElementId !== null} onOpenChange={(o) => { if (!o) setDeleteElementId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ Data Element</AlertDialogTitle>
            <AlertDialogDescription>
              ลบ &quot;{detail?.nameTh ?? elements.find((e) => e.id === deleteElementId)?.nameTh ?? ''}&quot; พร้อมการแมปคอลัมน์ทั้งหมด?
              (ลบได้เฉพาะ element ที่ไม่มีกฎผูกอยู่ — บันทึก Audit Trail ทุกครั้ง)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={(e) => { e.preventDefault(); void doDeleteElement() }}>
              {elementBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** ช่องแสดงค่า Meta Data ในหน้ารายละเอียด */
function MetaField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs text-foreground">{value}</p>
    </div>
  )
}

/** แสดงวันเวลาแบบอ่านง่าย (th-TH) — null = "—" */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default DataDomainConsole
