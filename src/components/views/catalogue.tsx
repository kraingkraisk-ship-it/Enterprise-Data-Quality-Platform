'use client'
// Catalogue view — permission-filtered dataset discovery with saved views.
// Deny-by-default: datasets the user cannot see are completely hidden server-side.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, Search, Star, TrendingDown, TrendingUp, X, Save, Bookmark } from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import type { Classification, DatasetDTO } from '@/lib/types'
import { PageShell, LoadingState, EmptyState, ErrorState, StatusBadge, ClassificationBadge, DataTable } from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { T, pick, useLang, fmtDateTime, fmtNumber } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import type { ViewCtx } from './ctx'
import { cn } from '@/lib/utils'

interface Filters { q: string; domain: string; classification: string; status: string }
const EMPTY_FILTERS: Filters = { q: '', domain: '', classification: '', status: '' }
const CLASSIFICATIONS: Classification[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
const STATUSES = ['ACTIVE', 'DEPRECATED', 'ARCHIVED']

function scoreTone(score: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (score == null) return 'none'
  if (score >= 85) return 'good'
  if (score >= 70) return 'warn'
  return 'bad'
}

function ScoreCell({ score }: { score: number | null | undefined }) {
  const { lang } = useLang()
  const tone = scoreTone(score)
  const colorCls = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', none: 'text-muted-foreground' }[tone]
  const Icon = tone === 'good' ? TrendingUp : tone === 'bad' ? TrendingDown : null
  if (score == null) return <span className="text-muted-foreground">—</span>
  const bandEn = tone === 'good' ? 'Good' : tone === 'warn' ? 'Needs attention' : 'At risk'
  const bandTh = tone === 'good' ? 'ดี' : tone === 'warn' ? 'ควรเฝ้าระวัง' : 'มีความเสี่ยง'
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-medium tabular-nums', colorCls)}
      aria-label={pick(lang, `Quality score ${Math.round(score)} of 100 — ${bandEn}`, `คะแนนคุณภาพ ${Math.round(score)} จาก 100 — ${bandTh}`)}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {fmtNumber(Math.round(score), lang)}
    </span>
  )
}

export default function CatalogueView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const savedRaw = useUi((s) => s.savedFilters['catalogue'])
  const saveFilter = useUi((s) => s.saveFilter)
  const savedViews: Record<string, string> = useMemo(() => savedRaw ?? {}, [savedRaw])

  const [input, setInput] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [datasets, setDatasets] = useState<DatasetDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce the search box into applied filters.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters((f) => (f.q === input ? f : { ...f, q: input }))
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [input])

  const load = useCallback(async (f: Filters) => {
    try {
      const res = await api.datasets({ q: f.q, domain: f.domain, classification: f.classification, status: f.status })
      setDatasets(res.datasets)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load catalogue')
    }
  }, [])

  // Server-side fetch on filter change — safe: the fetch response is guarded by
  // try/catch and the query params are the effect's own reactive inputs.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(filters) }, [load, filters])

  const domains = useMemo(() => Array.from(new Set((datasets ?? []).map((d) => d.domain))).sort(), [datasets])
  const activeFilterCount = [filters.q, filters.domain, filters.classification, filters.status].filter(Boolean).length

  const clearFilters = () => { setInput(''); setFilters(EMPTY_FILTERS) }

  const persistSaved = (next: Record<string, string>) => saveFilter('catalogue', next)

  const applySaved = (name: string) => {
    try {
      const raw = savedViews[name]
      if (!raw) return
      const f = JSON.parse(raw) as Filters
      const next = { ...EMPTY_FILTERS, ...f }
      setInput(next.q)
      setFilters(next)
    } catch {
      toast.error(pick(lang, 'Saved view could not be applied', 'ไม่สามารถใช้มุมมองที่บันทึกไว้ได้'))
    }
  }

  const doSave = () => {
    const name = saveName.trim()
    if (!name) return
    persistSaved({ ...savedViews, [name]: JSON.stringify(filters) })
    toast.success(pick(lang, `Saved view “${name}”`, `บันทึกมุมมอง “${name}” แล้ว`))
    setSaveName('')
    setSaveOpen(false)
  }

  const columns = [
    {
      key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', className: 'min-w-[240px]',
      render: (d: DatasetDTO) => (
        <div className="max-w-[320px]">
          <p className="flex items-center gap-1 truncate text-sm font-medium" title={d.name}>
            {d.name}
            {d.isCde && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="CDE" />}
          </p>
          {d.nameTh && <p className="truncate text-xs text-muted-foreground">{d.nameTh}</p>}
          <p className="truncate text-xs text-muted-foreground" title={d.description}>{d.description}</p>
        </div>
      ),
    },
    { key: 'domain', headerEn: 'Domain', headerTh: 'โดเมน', render: (d: DatasetDTO) => <span className="text-sm">{d.domain}</span> },
    { key: 'bu', headerEn: 'Business unit', headerTh: 'หน่วยธุรกิจ', render: (d: DatasetDTO) => <span className="text-sm">{d.businessUnit}</span> },
    { key: 'cls', headerEn: 'Classification', headerTh: 'ระดับชั้นความลับ', render: (d: DatasetDTO) => <ClassificationBadge level={d.classification} /> },
    {
      key: 'crit', headerEn: 'Criticality', headerTh: 'ความวิกฤต',
      render: (d: DatasetDTO) => <StatusBadge kind={(d.criticality as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM'} />,
    },
    {
      key: 'pii', headerEn: 'PII fields', headerTh: 'ฟิลด์ PII',
      render: (d: DatasetDTO) => d.piiFields > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-800">
          <EyeOff className="size-3.5" aria-hidden />{fmtNumber(d.piiFields, lang)}
        </span>
      ) : <span className="text-xs text-muted-foreground">0</span>,
    },
    { key: 'score', headerEn: 'Quality score', headerTh: 'คะแนนคุณภาพ', render: (d: DatasetDTO) => <ScoreCell score={d.qualityScore} /> },
    { key: 'rows', headerEn: 'Rows', headerTh: 'จำนวนแถว', render: (d: DatasetDTO) => <span className="tabular-nums text-sm">{fmtNumber(d.rowCount, lang)}</span> },
    { key: 'upd', headerEn: 'Updated', headerTh: 'อัปเดต', render: (d: DatasetDTO) => <span className="text-xs text-muted-foreground">{fmtDateTime(d.lastRefreshAt, lang)}</span> },
  ]

  const savedNames = Object.keys(savedViews)

  return (
    <PageShell
      objective={{
        en: 'Discover datasets you are permitted to see and assess their quality at a glance.',
        th: 'ค้นหาชุดข้อมูลที่คุณมีสิทธิ์เห็น และประเมินคุณภาพได้ในภาพรวม',
      }}
      guidance={{
        en: 'Access is deny-by-default: datasets you are not permitted to see are completely hidden. Click a row to open the dataset detail.',
        th: 'การเข้าถึงถูกปฏิเสธเป็นค่าเริ่มต้น: ชุดข้อมูลที่คุณไม่มีสิทธิ์จะถูกซ่อนทั้งหมด คลิกแถวเพื่อเปิดรายละเอียดชุดข้อมูล',
      }}
    >
      {/* Filters bar */}
      <div className="rounded-lg border bg-card p-3" data-testid="catalogue-filters">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="cat-q" className="sr-only"><T en="Search datasets" th="ค้นหาชุดข้อมูล" /></Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="cat-q" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={pick(lang, 'Search name, description…', 'ค้นหาชื่อ คำอธิบาย…')}
                className="min-h-[40px] pl-8" autoComplete="off"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-domain" className="sr-only"><T en="Domain" th="โดเมน" /></Label>
            <Select value={filters.domain} onValueChange={(v) => setFilters((f) => ({ ...f, domain: v === 'all' ? '' : v }))}>
              <SelectTrigger id="cat-domain" className="min-h-[40px] w-[150px]" aria-label={pick(lang, 'Domain filter', 'ตัวกรองโดเมน')}>
                <SelectValue placeholder={pick(lang, 'Domain', 'โดเมน')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><T en="All domains" th="ทุกโดเมน" /></SelectItem>
                {domains.map((dm) => <SelectItem key={dm} value={dm}>{dm}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-cls" className="sr-only"><T en="Classification" th="ระดับชั้นความลับ" /></Label>
            <Select value={filters.classification} onValueChange={(v) => setFilters((f) => ({ ...f, classification: v === 'all' ? '' : v }))}>
              <SelectTrigger id="cat-cls" className="min-h-[40px] w-[150px]" aria-label={pick(lang, 'Classification filter', 'ตัวกรองระดับชั้นความลับ')}>
                <SelectValue placeholder={pick(lang, 'Classification', 'ระดับชั้นความลับ')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><T en="All classifications" th="ทุกระดับชั้น" /></SelectItem>
                {CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-status" className="sr-only"><T en="Status" th="สถานะ" /></Label>
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === 'all' ? '' : v }))}>
              <SelectTrigger id="cat-status" className="min-h-[40px] w-[140px]" aria-label={pick(lang, 'Status filter', 'ตัวกรองสถานะ')}>
                <SelectValue placeholder={pick(lang, 'Status', 'สถานะ')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><T en="All statuses" th="ทุกสถานะ" /></SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" onClick={clearFilters} className="min-h-[40px]">
              <X className="size-4" aria-hidden /> <T en="Clear filters" th="ล้างตัวกรอง" />
            </Button>
          )}
          {/* Saved views */}
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-h-[40px]">
                  <Bookmark className="size-4" aria-hidden /> <T en="Saved views" th="มุมมองที่บันทึกไว้" />
                  {savedNames.length > 0 && <span className="rounded-full bg-teal-100 px-1.5 text-xs font-semibold text-teal-800">{savedNames.length}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <p className="mb-2 text-xs font-semibold"><T en="Apply a saved view" th="ใช้มุมมองที่บันทึกไว้" /></p>
                {savedNames.length === 0 && <p className="text-xs text-muted-foreground"><T en="No saved views yet." th="ยังไม่มีมุมมองที่บันทึกไว้" /></p>}
                <ul className="space-y-1">
                  {savedNames.map((name) => (
                    <li key={name} className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="min-h-[40px] flex-1 justify-start" onClick={() => applySaved(name)}>{name}</Button>
                      <Button
                        variant="ghost" size="icon" aria-label={pick(lang, `Delete saved view ${name}`, `ลบมุมมอง ${name}`)}
                        className="size-10 text-muted-foreground hover:text-red-700"
                        onClick={() => { const next = { ...savedViews }; delete next[name]; persistSaved(next) }}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
            <Popover open={saveOpen} onOpenChange={setSaveOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-h-[40px]" disabled={activeFilterCount === 0}>
                  <Save className="size-4" aria-hidden /> <T en="Save" th="บันทึก" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <Label htmlFor="save-view-name" className="text-xs"><T en="Name this view" th="ตั้งชื่อมุมมองนี้" /></Label>
                <div className="mt-1.5 flex gap-1.5">
                  <Input id="save-view-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} className="min-h-[40px]" autoComplete="off"
                    onKeyDown={(e) => { if (e.key === 'Enter') doSave() }} />
                  <Button onClick={doSave} disabled={!saveName.trim()} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
                    <T en="Save" th="บันทึก" />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} retry={() => void load(filters)} />}
      {!error && datasets === null && <LoadingState rows={8} label={{ en: 'Loading catalogue…', th: 'กำลังโหลดบัญชีชุดข้อมูล…' }} />}
      {!error && datasets !== null && datasets.length === 0 && (
        <EmptyState
          titleEn="No datasets match your filters" titleTh="ไม่พบชุดข้อมูลที่ตรงกับตัวกรอง"
          bodyEn="Datasets you are not permitted to see are completely hidden. Try widening or clearing the current filters."
          bodyTh="ชุดข้อมูลที่คุณไม่มีสิทธิ์เห็นจะถูกซ่อนทั้งหมด ลองขยายหรือล้างตัวกรองปัจจุบัน"
          action={
            <Button variant="outline" onClick={clearFilters} className="min-h-[40px]">
              <X className="size-4" aria-hidden /> <T en="Clear filters" th="ล้างตัวกรอง" />
            </Button>
          }
        />
      )}
      {!error && datasets !== null && datasets.length > 0 && (
        <div data-testid="catalogue-table">
          <DataTable
            columns={columns}
            rows={datasets}
            rowKey={(d) => d.id}
            density={density}
            caption={pick(lang, 'Dataset catalogue — click a row to open dataset detail', 'บัญชีชุดข้อมูล — คลิกแถวเพื่อเปิดรายละเอียด')}
            onRowClick={(d) => ctx.navigate('dataset-detail', { id: d.id })}
            emptyEn="Try adjusting filters."
            emptyTh="ลองปรับตัวกรอง"
          />
        </div>
      )}
    </PageShell>
  )
}
