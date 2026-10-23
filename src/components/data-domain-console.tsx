'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Banknote,
  Box,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  FolderPlus,
  FolderTree,
  History,
  Info,
  Link2,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Table2,
  Trash2,
  XCircle,
} from 'lucide-react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  rollupAssetCount,
  type DomainItem,
  type DomainNode,
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

/* ------------------------------------------------------------------ */
/* Data Domain Console (v0.18.0) — เมนูอิสระภายใต้กลุ่ม Data Asset      */
/* โครงสร้าง 4 ระดับ: Data Domain > Sub Data Domain > Data Element >    */
/* Meta Data (ISO/IEC 11179)                                           */
/* (1) จัดการโครงสร้างโดเมน 2 ระดับ + Data Element ใต้โดเมนย่อยเสมอ      */
/* (2) Meta Data ราย element + แมปคอลัมน์จริงจากคลังข้อมูล               */
/* (3) จัดหมวดรายคอลัมน์ (v0.15.0) + ชุดข้อมูล DQ ในโดเมน (v0.16.0)      */
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

/** ชุดข้อมูล DQ (Dataset) — แหล่งข้อมูล */
const DQ_SOURCE_LABELS: Record<string, string> = {
  CSV: 'ไฟล์ CSV',
  EXCEL: 'ไฟล์ Excel',
  POSTGRESQL: 'PostgreSQL',
  MSSQL: 'MS SQL Server',
  REST_API: 'REST API',
}

interface DqDatasetItem {
  id: string
  name: string
  sourceType: string
  piiEnabled: boolean
  status: string
  domain: { id: string; name: string; color: string; parentId: string | null; parentName: string | null } | null
  ruleCount: number
  sampleCount: number
  lastBatch: { at: string; overallScore: number | null } | null
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
  maxLength: number | null
  unit: string
  ownerId: string | null
  pii: boolean
  classification: string
  isCde: boolean
  isFinancial: boolean
  pendingApproval: boolean
  status: string
  position: number
  ruleCount: number
  mappingCount: number
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
  pendingApproval: boolean
  approvedBy: string | null
  approvedAt: string | null
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
  selected,
  onSelect,
  onEdit,
  onAddSub,
  onDelete,
}: {
  item: DomainItem
  sub?: boolean
  childCount: number
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onAddSub?: () => void
  onDelete: () => void
}) {
  const col = domainColor(item.color)
  const elementCount = item.elementCount ?? 0
  const deletable = childCount === 0 && item.assetCount === 0 && (item.datasetCount ?? 0) === 0 && item.columnCount === 0 && elementCount === 0
  const blockedReason =
    childCount > 0
      ? 'ลบโดเมนย่อยทั้งหมดก่อนจึงจะลบโดเมนนี้ได้'
      : item.assetCount > 0
        ? 'ย้ายข้อมูลออกจากโดเมนก่อนจึงจะลบได้'
        : (item.datasetCount ?? 0) > 0
          ? 'ย้ายชุดข้อมูล DQ ออกจากโดเมนก่อนจึงจะลบได้'
          : elementCount > 0
            ? 'ลบ Data Element ใต้โดเมนย่อยนี้ออกก่อนจึงจะลบได้'
            : 'นำการจัดหมวดคอลัมน์ออกจากโดเมนนี้ก่อนจึงจะลบได้'
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors ${
        sub ? 'ml-6 border-dashed' : ''
      } ${selected ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-200' : ''}`}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={`size-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-sm font-medium">
            {item.name}
            {item.nameEn && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{item.nameEn}</span>}
          </span>
          {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
          {item.assetCount} ข้อมูล · {(item.datasetCount ?? 0) as number} ชุด
          <span className="hidden sm:inline"> · {item.columnCount} คอลัมน์</span>
          {elementCount > 0 && <span className="hidden md:inline"> · {elementCount} element</span>}
        </Badge>
      </button>
      {!sub && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onAddSub}
          title="เพิ่มโดเมนย่อย"
          aria-label={`เพิ่มโดเมนย่อยใน ${item.name}`}
        >
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

/* ------------------------- แถว Data Element ------------------------- */

function ElementRowCard({ e, onClick }: { e: ElementRow; onClick: () => void }) {
  const status = ELEMENT_STATUS_LABELS[e.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE
  const dt = ELEMENT_DATA_TYPE_LABELS[e.dataType as ElementDataType] ?? { th: e.dataType }
  const cdeWarning = e.isCde && e.ruleCount === 0
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50/40"
      aria-label={`เปิดรายละเอียด ${e.nameTh}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{e.code}</span>
        <span className="text-sm font-medium">{e.nameTh}</span>
        {e.nameEn && <span className="text-xs text-muted-foreground">{e.nameEn}</span>}
        {e.isCde && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] font-medium text-amber-800" title="Critical Data Element — ข้อมูลวิกฤตต่อองค์กร">
            <Star className="mr-0.5 size-2.5" aria-hidden="true" /> CDE
          </Badge>
        )}
        {e.isFinancial && (
          <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[9px] font-medium text-teal-800" title="ผลกระทบต่อการรายงานทางการเงิน">
            <Banknote className="mr-0.5 size-2.5" aria-hidden="true" /> การเงิน
          </Badge>
        )}
        {e.pii && (
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700">
            <ShieldAlert className="mr-0.5 size-2.5" aria-hidden="true" /> PII
          </Badge>
        )}
        {e.pendingApproval && (
          <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[9px] text-sky-800">
            <Clock3 className="mr-0.5 size-2.5" aria-hidden="true" /> รออนุมัติ
          </Badge>
        )}
        <Badge variant="outline" className={`text-[9px] ${status.chip}`}>
          {status.th}
        </Badge>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>ประเภท: {dt.th}</span>
        {e.unit && <span>หน่วย: {e.unit}</span>}
        <span className="inline-flex items-center gap-1">
          <Link2 className="size-3" aria-hidden="true" /> แมป {e.mappingCount} คอลัมน์
        </span>
        <span className={`inline-flex items-center gap-1 ${cdeWarning ? 'font-medium text-amber-700' : ''}`}>
          <Braces className="size-3" aria-hidden="true" /> ผูกกฎ {e.ruleCount} ข้อ
          {cdeWarning && ' · CDE ยังไม่มีกฎ — ควรผูกกฎตรวจ'}
        </span>
      </div>
      {e.definition && <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{e.definition}</p>}
    </button>
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

  /* ---------- เลือกโดเมนจากต้นไม้ + แท็บ ---------- */
  const [selectedDomainId, setSelectedDomainId] = useState<string>('')
  const [tab, setTab] = useState<'elements' | 'columns' | 'datasets'>('elements')

  /* ---------- Data Element (v0.18.0) ---------- */
  const [elements, setElements] = useState<ElementRow[]>([])
  const [elementsLoading, setElementsLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ElementDetail | null>(null)
  const [detailStewardship, setDetailStewardship] = useState<{ owner: StewardPerson | null; steward: StewardPerson | null; custodian: StewardPerson | null } | null>(null)
  const [detailOps, setDetailOps] = useState<OperationalActual | null>(null)
  const [detailAudit, setDetailAudit] = useState<AuditEntry[]>([])
  const [detailTab, setDetailTab] = useState<'business' | 'technical' | 'operational' | 'governance'>('business')
  const [detailLoading, setElementDetailLoading] = useState(false)
  const [deleteElementId, setDeleteElementId] = useState<string | null>(null)
  const [elementBusy, setElementBusy] = useState(false)
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [approverEmail, setApproverEmail] = useState('')
  const [workflowNote, setWorkflowNote] = useState('')

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
  const [formBusy, setFormBusy] = useState(false)
  const [deleteDomainId, setDeleteDomainId] = useState<string | null>(null)
  const [domainBusy, setDomainBusy] = useState(false)

  /* ---------- จัดหมวดรายคอลัมน์ ---------- */
  const [assetId, setAssetId] = useState<string>('')
  const [columns, setColumns] = useState<AssetColumn[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [assign, setAssign] = useState<Record<string, string>>({}) // columnName → domainId ('' = ไม่ระบุ)
  const [savedAssign, setSavedAssign] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [assetDomainId, setAssetDomainId] = useState<string>('')
  const [settingAssetDomain, setSettingAssetDomain] = useState(false)

  /* ---------- ชุดข้อมูล DQ (Dataset) ในโดเมน — v0.16.0 ---------- */
  const [dqDatasets, setDqDatasets] = useState<DqDatasetItem[]>([])
  const [dqLoading, setDqLoading] = useState(true)
  const [settingDsId, setSettingDsId] = useState<string | null>(null)
  const [createDsOpen, setCreateDsOpen] = useState(false)
  const [dsName, setDsName] = useState('')
  const [dsSourceType, setDsSourceType] = useState('CSV')
  const [dsDomainId, setDsDomainId] = useState('')
  const [dsCsv, setDsCsv] = useState('')
  const [dsBusy, setDsBusy] = useState(false)

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

  const loadDqDatasets = useCallback(async () => {
    try {
      const res = await fetch('/api/dq/datasets')
      const data = await res.json()
      setDqDatasets(data?.datasets ?? [])
    } catch {
      /* คงรายการเดิมไว้ */
    } finally {
      setDqLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDomains()
    void loadAssets()
    void loadElements()
    void loadDqDatasets()
  }, [loadDomains, loadAssets, loadElements, loadDqDatasets])

  // เปิดหน้าครั้งใดก็รีเฟรช — ให้ข้อมูลที่เพิ่งนำเข้า/แก้ไขแสดงทันที
  useEffect(() => {
    if (active) {
      void loadDomains()
      void loadAssets()
      void loadElements()
      void loadDqDatasets()
    }
  }, [active, loadDomains, loadAssets, loadElements, loadDqDatasets])

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
  /** ผู้ที่มีสิทธิ์อนุมัติ (APPROVE_EXCEPTIONS) — ใช้เลือกผู้อนุมัติใน workflow (สิทธิ์เดิม ไม่เพิ่มบทบาทใหม่) */
  const approvers = useMemo(() => users.filter((u) => ROLES[u.role as keyof typeof ROLES]?.permissions.includes('APPROVE_EXCEPTIONS')), [users])

  // เลือกผู้อนุมัติเริ่มต้น — ถ้าผู้ดำเนินการหน้าหลักมีสิทธิ์อนุมัติให้ใช้คนนั้น ไม่งั้นใช้รายแรกที่มีสิทธิ์
  useEffect(() => {
    if (!detailOpen || approvers.length === 0) return
    if (approverEmail && approvers.some((u) => u.email === approverEmail)) return
    const def = approvers.find((u) => u.email === operatorEmail)?.email ?? approvers[0].email
    setApproverEmail(def)
  }, [detailOpen, approverEmail, approvers, operatorEmail])

  /* ------------------------- โหลดคอลัมน์ + การจัดหมวดเดิมของ asset (แท็บจัดหมวด) ------------------------- */
  const loadAssetDetail = useCallback(
    async (id: string) => {
      setAssignLoading(true)
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
        setAssignLoading(false)
      }
    },
    [toast],
  )

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
  const dqWithDomain = useMemo(() => dqDatasets.filter((d) => d.domain).length, [dqDatasets])
  const elementsWithMapping = useMemo(() => elements.filter((e) => e.mappingCount > 0).length, [elements])

  const selectedDomain = domains.find((d) => d.id === selectedDomainId) ?? null
  const selectedIsSub = Boolean(selectedDomain?.parentId)
  const selectedSubIds = useMemo(() => {
    if (!selectedDomainId) return []
    if (selectedIsSub) return [selectedDomainId]
    return domains.filter((d) => d.parentId === selectedDomainId).map((d) => d.id)
  }, [selectedDomainId, selectedIsSub, domains])
  const elementsInView = useMemo(
    () => (selectedSubIds.length === 0 ? [] : elements.filter((e) => selectedSubIds.includes(e.subDomainId))),
    [elements, selectedSubIds],
  )
  const selectedDomainLabel = selectedDomain
    ? selectedIsSub
      ? `${domains.find((p) => p.id === selectedDomain?.parentId)?.name ?? ''} / ${selectedDomain.name}`
      : selectedDomain.name
    : ''

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
      if (deleteDomainId === selectedDomainId) setSelectedDomainId('')
      setDeleteDomainId(null)
      await Promise.all([loadDomains(), loadElements(), assetId ? loadAssetDetail(assetId) : Promise.resolve()])
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

  function openCreateElement() {
    if (!selectedIsSub || !selectedDomainId) {
      toast({ title: 'เลือก "โดเมนย่อย" ก่อน', description: 'Data Element ต้องแขวนใต้โดเมนย่อยเท่านั้น', variant: 'destructive' })
      return
    }
    setElFormMode('create')
    setElFormId(null)
    setElName('')
    setElNameEn('')
    setElDefinition('')
    setElExamples('')
    setElDataType('TEXT')
    setElFormat('')
    setElValueDomain('')
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
    setDetailOpen(false)
    setElFormOpen(true)
  }

  async function submitElementForm() {
    if (!elName.trim()) return
    if (elFormMode === 'create' && !selectedIsSub) return
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

  /* ------------------------- workflow อนุมัติ (v0.20.0) — สิทธิ์เดิม: ส่ง = MANAGE_DATASETS · อนุมัติ/เลิกใช้ = APPROVE_EXCEPTIONS ------------------------- */
  async function doWorkflowAction(action: 'SUBMIT_APPROVAL' | 'APPROVE' | 'REJECT_APPROVAL' | 'DEPRECATE', note = '') {
    if (!detail) return
    const operator = action === 'SUBMIT_APPROVAL' ? operatorEmail : approverEmail
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

  /* ------------------------- บันทึกการจัดหมวดรายคอลัมน์ (แท็บจัดหมวด) ------------------------- */
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
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' , variant: 'destructive' })
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

  /* ------------------------- ชุดข้อมูล DQ (Dataset) — v0.16.0 ------------------------- */
  function openCreateDataset() {
    setDsName('')
    setDsSourceType('CSV')
    setDsDomainId('')
    setDsCsv('')
    setCreateDsOpen(true)
  }

  async function createDataset() {
    if (!dsName.trim() || !operatorEmail) return
    setDsBusy(true)
    try {
      const res = await fetch('/api/dq/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail,
          name: dsName.trim(),
          sourceType: dsSourceType,
          ...(dsDomainId ? { domainId: dsDomainId } : {}),
          ...(dsCsv.trim() ? { csv: dsCsv } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'สร้างไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'สร้างแล้ว' })
      setCreateDsOpen(false)
      await Promise.all([loadDqDatasets(), loadDomains()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setDsBusy(false)
    }
  }

  async function setDatasetDomain(ds: DqDatasetItem, domainId: string) {
    if (!operatorEmail) return
    setSettingDsId(ds.id)
    try {
      const res = await fetch(`/api/dq/datasets/${ds.id}`, {
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
      await Promise.all([loadDqDatasets(), loadDomains()])
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setSettingDsId(null)
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
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Data Domain · Sub Domain · Data Element · Meta Data</h2>
          <p className="text-sm text-muted-foreground">
            โครงสร้าง 4 ระดับตามแนวคิด ISO/IEC 11179 — เลือกโดเมนจากต้นไม้ แล้วจัดการ Data Element (แขวนใต้โดเมนย่อยเสมอ) พร้อม Meta Data
            และการแมปคอลัมน์จริงจากคลังข้อมูล · ทุกการเปลี่ยนแปลงบันทึก Audit Trail
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
              void loadElements()
            }}
            aria-label="โหลดข้อมูลใหม่"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* สรุปรวม */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
              <Boxes className="size-3.5" aria-hidden="true" /> Data Element
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{elements.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="size-3.5" aria-hidden="true" /> แมปคอลัมน์แล้ว
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {elementsWithMapping}
              <span className="ml-1 text-sm font-medium text-muted-foreground">/ {elements.length} element</span>
            </p>
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
              <Database className="size-3.5" aria-hidden="true" /> ชุดข้อมูล DQ จัดโดเมนแล้ว
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {dqWithDomain}
              <span className="ml-1 text-sm font-medium text-muted-foreground">/ {dqDatasets.length} ชุด</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* เนื้อหาหลัก 2 คอลัมน์: ต้นไม้โดเมน (เลือกได้) + แท็บงาน */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------- แผงซ้าย: โครงสร้างโดเมน ------------------------- */}
        <Card className="min-w-0 lg:col-span-2">
          <CardContent className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <FolderTree className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> โครงสร้างโดเมนข้อมูล
                </p>
                <p className="text-xs text-muted-foreground">คลิกเลือกโดเมนเพื่อจัดการ Data Element ด้านขวา</p>
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
              <div className="max-h-[30rem] space-y-1.5 overflow-x-hidden overflow-y-auto rounded-lg border p-2" role="list" aria-label="ต้นไม้โดเมนข้อมูล">
                {domainTree.map((n) => (
                  <div key={n.id} className="space-y-1.5" role="listitem">
                    <DomainTreeRow
                      item={n}
                      childCount={n.children.length}
                      selected={selectedDomainId === n.id}
                      onSelect={() => setSelectedDomainId(selectedDomainId === n.id ? '' : n.id)}
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
                        selected={selectedDomainId === c.id}
                        onSelect={() => setSelectedDomainId(selectedDomainId === c.id ? '' : c.id)}
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
              ลบได้เฉพาะโดเมนที่ว่าง (ไม่มีโดเมนย่อย · ข้อมูลผูก · ชุดข้อมูล · คอลัมน์จัดหมวด · Data Element) — ทุกการเปลี่ยนแปลงต้องมีสิทธิ์จัดการข้อมูล
            </p>
          </CardContent>
        </Card>

        {/* ------------------------- แผงขวา: แท็บงาน ------------------------- */}
        <Card className="min-w-0 lg:col-span-3">
          <CardContent className="p-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="mb-3 flex w-full flex-wrap sm:w-auto">
                <TabsTrigger value="elements" className="gap-1.5">
                  <Boxes className="size-3.5" aria-hidden="true" /> Data Element
                </TabsTrigger>
                <TabsTrigger value="columns" className="gap-1.5">
                  <Table2 className="size-3.5" aria-hidden="true" /> จัดหมวดคอลัมน์
                </TabsTrigger>
                <TabsTrigger value="datasets" className="gap-1.5">
                  <Database className="size-3.5" aria-hidden="true" /> ชุดข้อมูล DQ
                </TabsTrigger>
              </TabsList>

              {/* ------------------------- แท็บ 1: Data Element (4 ระดับ) ------------------------- */}
              <TabsContent value="elements" className="mt-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Boxes className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> Data Element — องค์ประกอบข้อมูลใต้โดเมนย่อย
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedDomain
                        ? selectedIsSub
                          ? `กำลังดู: ${selectedDomainLabel} — ${elementsInView.length} element`
                          : `กำลังดูทุกโดเมนย่อยของ "${selectedDomain.name}" — ${elementsInView.length} element`
                        : 'เลือกโดเมนจากต้นไม้ด้านซ้ายเพื่อแสดง element'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={!selectedIsSub}
                    onClick={openCreateElement}
                    title={selectedIsSub ? 'เพิ่ม Data Element' : 'เลือก "โดเมนย่อย" ก่อน (element ต้องแขวนใต้โดเมนย่อย)'}
                  >
                    <Plus className="size-3.5" aria-hidden="true" /> เพิ่ม Data Element
                  </Button>
                </div>

                {selectedDomain && !selectedIsSub && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    &quot;{selectedDomain.name}&quot; เป็นโดเมนหลัก — แสดง element รวมของทุกโดเมนย่อย (อ่านอย่างเดียว)
                    เลือกโดเมนย่อยเพื่อเพิ่ม/แก้ไข element ได้
                  </p>
                )}

                {!selectedDomainId ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
                    <Boxes className="size-10 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium">เลือกโดเมนจากต้นไม้ด้านซ้ายก่อน</p>
                    <p className="max-w-md text-xs text-muted-foreground">
                      โครงสร้าง 4 ระดับ: Data Domain → Sub Data Domain → <span className="font-medium text-foreground">Data Element</span> → Meta Data —
                      element ต้องแขวนใต้โดเมนย่อยเสมอ (กติกาบังคับทั้ง UI และ API)
                    </p>
                  </div>
                ) : elementsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด element…
                  </div>
                ) : elementsInView.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Boxes className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium">ยังไม่มี Data Element ในโดเมนที่เลือก</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedIsSub
                        ? 'กด "เพิ่ม Data Element" เพื่อสร้าง element แรก พร้อมกรอก Meta Data ตามมาตรฐาน ISO/IEC 11179'
                        : 'เลือกโดเมนย่อยด้านซ้ายแล้วสร้าง element'}
                    </p>
                  </div>
                ) : selectedIsSub ? (
                  <div className="max-h-[26rem] space-y-1.5 overflow-x-hidden overflow-y-auto rounded-lg border p-2">
                    {elementsInView.map((e) => (
                      <ElementRowCard key={e.id} e={e} onClick={() => openElementDetail(e)} />
                    ))}
                  </div>
                ) : (
                  <div className="max-h-[26rem] space-y-3 overflow-x-hidden overflow-y-auto rounded-lg border p-2">
                    {domains
                      .filter((d) => d.parentId === selectedDomainId)
                      .map((sub) => {
                        const subElements = elementsInView.filter((e) => e.subDomainId === sub.id)
                        if (subElements.length === 0) return null
                        return (
                          <div key={sub.id}>
                            <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                              <span className={`inline-block size-2 rounded-full ${domainColor(sub.color).dot}`} aria-hidden="true" />└ {sub.name}
                            </p>
                            <div className="space-y-1.5">
                              {subElements.map((e) => (
                                <ElementRowCard key={e.id} e={e} onClick={() => openElementDetail(e)} />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </TabsContent>

              {/* ------------------------- แท็บ 2: จัดหมวดรายคอลัมน์ (v0.15.0) ------------------------- */}
              <TabsContent value="columns" className="mt-0 space-y-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Table2 className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> จัดหมวดรายคอลัมน์ — เลือกข้อมูลจากคลังข้อมูล
                  </p>
                  <p className="text-xs text-muted-foreground">เลือก Data Asset แล้วระบุโดเมน / โดเมนย่อยให้แต่ละคอลัมน์ กดบันทึกครั้งเดียวทั้งชุด</p>
                </div>

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
                    ) : assignLoading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดคอลัมน์…
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[22rem] overflow-y-auto rounded-lg border">
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
                                      <SelectTrigger className="h-8 w-full text-xs" aria-label={`ระบุโดเมนให้คอลัมน์ ${c.name}`}>
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
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                    <PackageSearch className="size-10 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium">เลือกข้อมูลจากคลังข้อมูลก่อน</p>
                    <p className="max-w-md text-xs text-muted-foreground">
                      ระบบจะโหลดรายชื่อคอลัมน์ทั้งหมดของข้อมูลที่เลือก แล้วให้คุณระบุโดเมน / โดเมนย่อยให้แต่ละคอลัมน์ได้ทีละรายการ
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ------------------------- แท็บ 3: ชุดข้อมูล DQ (v0.16.0) ------------------------- */}
              <TabsContent value="datasets" className="mt-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Database className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> ชุดข้อมูล DQ ในโดเมน — สร้างชุดข้อมูลและจัดโดเมนรายชุด
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ชุดข้อมูล (Dataset) ของโมดูลคุณภาพข้อมูลที่ใช้รันกฎตรวจ — ผูกเข้าโดเมนเพื่อให้แดชบอร์ดผู้บริหารรวมคะแนนรายโดเมนได้
                    </p>
                  </div>
                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={openCreateDataset}>
                    <Plus className="size-3.5" aria-hidden="true" /> สร้างชุดข้อมูล
                  </Button>
                </div>

                {dqLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลดชุดข้อมูล…
                  </div>
                ) : dqDatasets.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Database className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium">ยังไม่มีชุดข้อมูล DQ</p>
                    <p className="mt-1 text-xs text-muted-foreground">กด &quot;สร้างชุดข้อมูล&quot; เพื่อเพิ่มชุดข้อมูลแรก แล้วผูกเข้าโดเมนเพื่อเริ่มตรวจคุณภาพ</p>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[22rem] overflow-x-hidden overflow-y-auto rounded-lg border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white">
                          <TableRow>
                            <TableHead className="text-xs">ชื่อชุดข้อมูล</TableHead>
                            <TableHead className="hidden w-32 text-xs sm:table-cell">แหล่งข้อมูล</TableHead>
                            <TableHead className="hidden w-24 text-right text-xs sm:table-cell">ตัวอย่าง</TableHead>
                            <TableHead className="hidden w-20 text-right text-xs md:table-cell">กฎตรวจ</TableHead>
                            <TableHead className="w-[15rem] text-xs sm:w-[17rem]">โดเมน / โดเมนย่อย</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dqDatasets.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="max-w-[12rem]">
                                <p className="truncate text-xs font-medium" title={d.name}>
                                  {d.name}
                                </p>
                                {d.piiEnabled && (
                                  <Badge variant="outline" className="mt-0.5 text-[9px] text-muted-foreground">
                                    PII ปิดบังตามบทบาท
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-[10px]">
                                  {DQ_SOURCE_LABELS[d.sourceType] ?? d.sourceType}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">
                                {d.sampleCount > 0 ? `${d.sampleCount} แถว` : '—'}
                              </TableCell>
                              <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">
                                {d.ruleCount > 0 ? d.ruleCount : '—'}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={d.domain?.id || NO_DOMAIN}
                                  onValueChange={(v) => void setDatasetDomain(d, v === NO_DOMAIN ? '' : v)}
                                  disabled={settingDsId === d.id || !operatorEmail}
                                >
                                  <SelectTrigger className="h-8 w-full text-xs" aria-label={`จัดโดเมนให้ชุดข้อมูล ${d.name}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>{renderDomainOptions()}</SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      จัดโดเมนได้ {dqWithDomain} / {dqDatasets.length} ชุด — เลือกโดเมนในตารางเพื่อบันทึกทันที (บันทึก Audit Trail ทุกครั้ง) · ชุดข้อมูลที่ยังไม่ระบุโดเมนจะรวมในกลุ่ม &quot;ไม่ระบุโดเมน&quot; ของแดชบอร์ดผู้บริหาร
                    </p>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

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
                  {detail.pendingApproval && (
                    <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] text-sky-800">
                      <Clock3 className="mr-0.5 size-2.5" aria-hidden="true" /> รออนุมัติ
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
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                    <TabsTrigger value="business">เชิงธุรกิจ</TabsTrigger>
                    <TabsTrigger value="technical">เชิงเทคนิค</TabsTrigger>
                    <TabsTrigger value="operational">เชิงปฏิบัติการ</TabsTrigger>
                    <TabsTrigger value="governance">ธรรมาภิบาล</TabsTrigger>
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

                    {/* Workflow อนุมัติ — สิทธิ์เดิม: ส่ง = MANAGE_DATASETS · อนุมัติ/ส่งกลับ/เลิกใช้ = APPROVE_EXCEPTIONS */}
                    <div className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden="true" /> สถานะและการอนุมัติ (Workflow)
                        </p>
                        <div className="flex items-center gap-1.5">
                          {detail.pendingApproval && (
                            <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] text-sky-800">
                              <Clock3 className="mr-0.5 size-2.5" aria-hidden="true" /> รออนุมัติ
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-[10px] ${(ELEMENT_STATUS_LABELS[detail.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE).chip}`}>
                            {(ELEMENT_STATUS_LABELS[detail.status as ElementStatus] ?? ELEMENT_STATUS_LABELS.ACTIVE).th}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <MetaField
                          label="ผู้อนุมัติล่าสุด"
                          value={
                            detail.approvedBy
                              ? `${detail.approvedBy}${detail.approvedAt ? ` · ${fmtDateTime(detail.approvedAt)}` : ''}`
                              : 'ไม่มีประวัติอนุมัติ (สร้างก่อนระบบ workflow หรือยังไม่เคยส่งขออนุมัติ)'
                          }
                          wide
                        />
                      </div>

                      {detail.pendingApproval ? (
                        <div className="mt-3 grid gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5">
                          <p className="text-xs text-sky-900">
                            element นี้รอการตัดสิน — เลือกผู้อนุมัติ (ต้องมีสิทธิ์ &quot;อนุมัติข้อยกเว้น&quot;: เจ้าของข้อมูล / เจ้าหน้าที่กำกับดูแล / ผู้บริหาร)
                          </p>
                          <Select value={approverEmail} onValueChange={setApproverEmail}>
                            <SelectTrigger className="h-8 w-full text-xs" aria-label="เลือกผู้อนุมัติ">
                              <SelectValue placeholder="— เลือกผู้อนุมัติ —" />
                            </SelectTrigger>
                            <SelectContent>
                              {approvers.map((u) => (
                                <SelectItem key={u.email} value={u.email}>
                                  {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={workflowNote}
                            onChange={(ev) => setWorkflowNote(ev.target.value)}
                            placeholder="เหตุผลประกอบการส่งกลับ (ไม่บังคับ — บันทึกใน Audit Trail)"
                            className="h-8 text-xs"
                            aria-label="เหตุผลการส่งกลับ"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              disabled={workflowBusy || !approverEmail}
                              onClick={() => void doWorkflowAction('APPROVE')}
                            >
                              {workflowBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                              อนุมัติ (ACTIVE)
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-300 text-rose-700 hover:bg-rose-50"
                              disabled={workflowBusy || !approverEmail}
                              onClick={() => void doWorkflowAction('REJECT_APPROVAL', workflowNote)}
                            >
                              <XCircle className="size-3.5" aria-hidden="true" /> ส่งกลับให้แก้ไข
                            </Button>
                          </div>
                        </div>
                      ) : detail.status === 'DRAFT' || detail.status === 'DEPRECATED' ? (
                        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 p-2.5">
                          <p className="text-xs text-muted-foreground">
                            ส่งขออนุมัติเพื่อเปิดใช้งาน — ผู้ดำเนินการหน้านี้ ({operatorEmail || 'ยังไม่เลือก'}) ต้องมีสิทธิ์ &quot;จัดการชุดข้อมูล&quot;
                            {detail.status === 'DEPRECATED' && ' · อนุมัติแล้วจะกลับมาใช้งาน (ACTIVE) อีกครั้ง'}
                          </p>
                          <Button
                            size="sm"
                            className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={workflowBusy || !operatorEmail}
                            onClick={() => void doWorkflowAction('SUBMIT_APPROVAL')}
                          >
                            {workflowBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
                            ส่งขออนุมัติ
                          </Button>
                        </div>
                      ) : detail.status === 'ACTIVE' ? (
                        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 p-2.5">
                          <p className="text-xs text-muted-foreground">เลิกใช้ element นี้ — กฎที่ผูกจะไม่ถูกรันในรอบโดเมนถัดไป (ต้องมีสิทธิ์อนุมัติ)</p>
                          <Select value={approverEmail} onValueChange={setApproverEmail}>
                            <SelectTrigger className="h-8 w-full text-xs" aria-label="เลือกผู้ดำเนินการเลิกใช้">
                              <SelectValue placeholder="— เลือกผู้ดำเนินการ (ต้องมีสิทธิ์อนุมัติ) —" />
                            </SelectTrigger>
                            <SelectContent>
                              {approvers.map((u) => (
                                <SelectItem key={u.email} value={u.email}>
                                  {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                            disabled={workflowBusy || !approverEmail}
                            onClick={() => void doWorkflowAction('DEPRECATE', workflowNote)}
                          >
                            <Archive className="size-3.5" aria-hidden="true" /> เลิกใช้ (DEPRECATED)
                          </Button>
                        </div>
                      ) : null}

                      <p className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                        <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        สิทธิ์ตาม RBAC เดิม: ส่งขออนุมัติ = จัดการชุดข้อมูล · อนุมัติ/ส่งกลับ/เลิกใช้ = อนุมัติข้อยกเว้น — ทุกครั้งบันทึกผู้ดำเนินการใน Audit Trail
                        ขณะรออนุมัติแก้ไข Meta Data ไม่ได้
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
                ? `สร้างใต้โดเมนย่อย "${selectedDomainLabel}" — กรอก Meta Data 4 กลุ่มครั้งเดียวต่อ element (รหัส EL-#### สร้างอัตโนมัติ · สถานะเริ่มต้น "ร่าง" ต้องผ่านการอนุมัติจึงใช้งานได้)`
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

      {/* ------------------------- Dialog สร้างชุดข้อมูล DQ (v0.16.0) ------------------------- */}
      <Dialog open={createDsOpen} onOpenChange={setCreateDsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>สร้างชุดข้อมูลใหม่</DialogTitle>
            <DialogDescription>
              สร้าง Dataset ของโมดูลคุณภาพข้อมูล และผูกเข้า Data Domain ได้ทันที — วางข้อมูล CSV/TSV เพื่อใช้เป็นข้อมูลตัวอย่างสำหรับรันกฎตรวจ (READ-ONLY ไม่แตะข้อมูลต้นทางจริง)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ds-name">
                ชื่อชุดข้อมูล <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="ds-name"
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                maxLength={120}
                placeholder="เช่น ทะเบียนลูกค้าสาขาภาคเหนือ"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ds-source">แหล่งข้อมูล</Label>
                <Select value={dsSourceType} onValueChange={setDsSourceType}>
                  <SelectTrigger id="ds-source" aria-label="แหล่งข้อมูล">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DQ_SOURCE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ds-domain">โดเมนข้อมูล (ไม่บังคับ)</Label>
                <Select value={dsDomainId || NO_DOMAIN} onValueChange={(v) => setDsDomainId(v === NO_DOMAIN ? '' : v)}>
                  <SelectTrigger id="ds-domain" aria-label="โดเมนข้อมูลของชุดข้อมูลใหม่">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>{renderDomainOptions()}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ds-csv">ข้อมูลตัวอย่าง CSV / TSV (ไม่บังคับ)</Label>
              <Textarea
                id="ds-csv"
                value={dsCsv}
                onChange={(e) => setDsCsv(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                placeholder={'บรรทัดแรกเป็นหัวคอลัมน์ เช่น\naccount_no,customer_name,balance,open_date\n100001,บริษัท ตัวอย่าง จำกัด,250000,2024-01-15\n100002,นายสมชาย ใจดี,0,'}
              />
              <p className="text-[11px] text-muted-foreground">
                รองรับ CSV (คั่นด้วย ,) หรือ TSV (คั่นด้วย tab จาก Excel) · สูงสุด 60 คอลัมน์ / 200 แถว · ข้อมูล PII จะถูกปิดบังตามบทบาทเมื่อแสดงผล (PDPA)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDsOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={dsBusy || !dsName.trim() || !operatorEmail} onClick={() => void createDataset()}>
              {dsBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} สร้างชุดข้อมูล
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
