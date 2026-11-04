'use client'
// No-code Rule Builder — four guided steps: Template → Target → Governance →
// Review & test. Produces a versioned rule definition (JSON) evaluated by the
// server-side rules engine; no code is required from the author.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Fingerprint, GitCompare, Hourglass,
  Info, ListChecks, Link2, Loader2, Regex, Rows3, ShieldCheck, SlidersHorizontal,
  Sparkles, Table2, XCircle,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import {
  DIMENSIONS,
  type ColumnProfile, type DatasetDTO, type Dimension, type RuleDefinition,
  type RuleTemplate, type Severity,
} from '@/lib/types'
import { ErrorState, LoadingState, PageShell, SectionHeading, StatusBadge, MaskedChip } from '@/components/shared/kit'
import { T, fmtPercent, pick, useLang } from '@/lib/i18n'
import type { ViewCtx } from './ctx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Static metadata ─────────────────────────────────────────────────────────

type TemplateMeta = {
  key: RuleTemplate
  Icon: React.ElementType
  en: string; th: string
  descEn: string; descTh: string
  dimension: Dimension
  needsColumn: boolean
}

const TEMPLATES: TemplateMeta[] = [
  { key: 'NOT_NULL', Icon: CheckCircle2, en: 'Not null', th: 'ต้องไม่ว่าง', descEn: 'The column must be present on every row.', descTh: 'คอลัมน์ต้องมีค่าในทุกแถว', dimension: 'COMPLETENESS', needsColumn: true },
  { key: 'REGEX', Icon: Regex, en: 'Format validity', th: 'รูปแบบถูกต้อง', descEn: 'Values must match a regular expression pattern.', descTh: 'ค่าต้องตรงตามรูปแบบ regular expression', dimension: 'VALIDITY', needsColumn: true },
  { key: 'RANGE', Icon: SlidersHorizontal, en: 'Plausibility bounds', th: 'ขอบเขตที่สมเหตุสมผล', descEn: 'Numeric values must fall within min–max bounds.', descTh: 'ค่าตัวเลขต้องอยู่ในช่วงต่ำสุด–สูงสุด', dimension: 'ACCURACY', needsColumn: true },
  { key: 'IN_SET', Icon: ListChecks, en: 'Domain membership', th: 'อยู่ในชุดที่กำหนด', descEn: 'Values must be one of an allowed set.', descTh: 'ค่าต้องเป็นหนึ่งในชุดที่อนุญาต', dimension: 'VALIDITY', needsColumn: true },
  { key: 'UNIQUE', Icon: Fingerprint, en: 'Uniqueness', th: 'ไม่ซ้ำกัน', descEn: 'No duplicate values across all rows.', descTh: 'ห้ามมีค่าซ้ำกันทุกแถว', dimension: 'UNIQUENESS', needsColumn: true },
  { key: 'FRESHNESS', Icon: Hourglass, en: 'Timeliness', th: 'ความทันเวลา', descEn: 'The newest record must be no older than N hours.', descTh: 'ระเบียนล่าสุดต้องไม่เก่ากว่า N ชั่วโมง', dimension: 'TIMELINESS', needsColumn: true },
  { key: 'ROW_COUNT', Icon: Rows3, en: 'Volume envelope', th: 'กรอบปริมาณข้อมูล', descEn: 'Row count must stay inside an expected envelope.', descTh: 'จำนวนแถวต้องอยู่ในกรอบที่คาดหวัง', dimension: 'VOLUME', needsColumn: false },
  { key: 'CROSS_FIELD', Icon: GitCompare, en: 'Cross-field consistency', th: 'ความสอดคล้องระหว่างคอลัมน์', descEn: 'Compare two columns or a column against a constant.', descTh: 'เปรียบเทียบสองคอลัมน์ หรือคอลัมน์กับค่าคงที่', dimension: 'CONSISTENCY', needsColumn: false },
  { key: 'REFERENTIAL', Icon: Link2, en: 'Referential integrity', th: 'ความสมบูรณ์อ้างอิง', descEn: 'Values must exist in a referenced dataset column.', descTh: 'ค่าต้องมีอยู่ในคอลัมน์ของชุดข้อมูลอ้างอิง', dimension: 'INTEGRITY', needsColumn: true },
  { key: 'SCHEMA_MATCH', Icon: Table2, en: 'Schema conformity', th: 'สอดคล้องสคีมา', descEn: 'Compares against the registered schema.', descTh: 'เปรียบเทียบกับสคีมาที่ลงทะเบียนไว้', dimension: 'SCHEMA_CONFORMITY', needsColumn: false },
]

const DIM_DESC: Record<Dimension, { en: string; th: string }> = {
  COMPLETENESS: { en: 'Are required values present?', th: 'ค่าที่จำเป็นมีครบหรือไม่' },
  ACCURACY: { en: 'Do values reflect reality?', th: 'ค่าสะท้อนความจริงหรือไม่' },
  VALIDITY: { en: 'Do values follow the defined format/domain?', th: 'ค่าเป็นไปตามรูปแบบ/โดเมนที่กำหนดหรือไม่' },
  CONSISTENCY: { en: 'Do related fields agree with each other?', th: 'ฟิลด์ที่เกี่ยวข้องสอดคล้องกันหรือไม่' },
  UNIQUENESS: { en: 'Are there unexpected duplicates?', th: 'มีข้อมูลซ้ำที่ไม่คาดคิดหรือไม่' },
  TIMELINESS: { en: 'Is data fresh enough?', th: 'ข้อมูลทันสมัยเพียงพอหรือไม่' },
  INTEGRITY: { en: 'Do references across datasets hold?', th: 'การอ้างอิงระหว่างชุดข้อมูลสมบูรณ์หรือไม่' },
  VOLUME: { en: 'Is the row volume within expectations?', th: 'ปริมาณแถวอยู่ในระดับที่คาดหวังหรือไม่' },
  SCHEMA_CONFORMITY: { en: 'Does the structure match the registered schema?', th: 'โครงสร้างตรงกับสคีมาที่ลงทะเบียนหรือไม่' },
}

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const CROSS_OPS = ['<', '<=', '>', '>=', '=', '!='] as const

const CONDITION_PHRASE: Record<RuleTemplate, { en: string; th: string }> = {
  NOT_NULL: { en: 'not be null or empty', th: 'ต้องไม่เป็นค่าว่าง' },
  REGEX: { en: 'match the pattern', th: 'ต้องตรงตามรูปแบบ' },
  RANGE: { en: 'be between', th: 'ต้องอยู่ระหว่าง' },
  IN_SET: { en: 'be one of', th: 'ต้องเป็นค่าใดค่าหนึ่งจาก' },
  UNIQUE: { en: 'be unique across all rows', th: 'ต้องไม่ซ้ำกันทุกแถว' },
  FRESHNESS: { en: 'be no older than', th: 'ต้องมีอายุไม่เกิน' },
  ROW_COUNT: { en: 'stay within', th: 'ต้องอยู่ในช่วง' },
  CROSS_FIELD: { en: 'satisfy', th: 'ต้องเป็นไปตาม' },
  REFERENTIAL: { en: 'exist in', th: 'ต้องมีอยู่ใน' },
  SCHEMA_MATCH: { en: 'match the registered schema', th: 'ต้องตรงกับสคีมาที่ลงทะเบียนไว้' },
}

const SEV_TH: Record<Severity, string> = { CRITICAL: 'วิกฤต', HIGH: 'สูง', MEDIUM: 'ปานกลาง', LOW: 'ต่ำ' }

const STEPS = [
  { en: 'Template', th: 'เทมเพลต' },
  { en: 'Target', th: 'เป้าหมาย' },
  { en: 'Governance', th: 'การกำกับดูแล' },
  { en: 'Review & test', th: 'ทบทวนและทดสอบ' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)

// ─── Component ───────────────────────────────────────────────────────────────

export default function RuleBuilderView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()

  // Wizard state
  const [step, setStep] = useState(0)
  const [template, setTemplate] = useState<RuleTemplate | null>(null)
  const [datasets, setDatasets] = useState<DatasetDTO[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState(ctx.params.datasetId ?? '')
  const [columns, setColumns] = useState<ColumnProfile[]>([])
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [column, setColumn] = useState('')
  const [dimension, setDimension] = useState<Dimension | null>(null)

  // Parameters
  const [pattern, setPattern] = useState('')
  const [min, setMin] = useState(''); const [max, setMax] = useState('')
  const [inSet, setInSet] = useState('')
  const [maxHours, setMaxHours] = useState('24')
  const [minRows, setMinRows] = useState(''); const [maxRows, setMaxRows] = useState('')
  const [leftCol, setLeftCol] = useState(''); const [crossOp, setCrossOp] = useState<string>('<')
  const [rightMode, setRightMode] = useState<'column' | 'constant'>('column')
  const [rightCol, setRightCol] = useState(''); const [rightConst, setRightConst] = useState('')
  const [refDatasetId, setRefDatasetId] = useState(''); const [refColumn, setRefColumn] = useState('')
  const [refColumns, setRefColumns] = useState<ColumnProfile[]>([])
  const [condCol, setCondCol] = useState(''); const [condOp, setCondOp] = useState<'=' | '!='>('='); const [condVal, setCondVal] = useState('')

  // Governance
  const [severity, setSeverity] = useState<Severity>('MEDIUM')
  const [effectiveDate, setEffectiveDate] = useState(todayISO())
  const [owner, setOwner] = useState(ctx.user.name)
  const [requiresApproval, setRequiresApproval] = useState(true)
  const [tags, setTags] = useState('')
  const [nameEn, setNameEn] = useState(''); const [nameTh, setNameTh] = useState('')
  const nameTouched = useRef(false)

  // Review & test
  const [previewLang, setPreviewLang] = useState<'en' | 'th'>(lang)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof api.testRule>> | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'draft' | 'submit' | null>(null)
  const [saving, setSaving] = useState(false)

  const meta = useMemo(() => TEMPLATES.find((t) => t.key === template) ?? null, [template])
  const dataset = useMemo(() => datasets?.find((d) => d.id === datasetId) ?? null, [datasets, datasetId])

  // Initial load
  useEffect(() => {
    api.datasets()
      .then((r) => setDatasets(r.datasets))
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Failed to load datasets'))
  }, [])

  // Load columns when dataset changes
  useEffect(() => {
    setColumn(''); setLeftCol(''); setRightCol(''); setCondCol(''); setTestResult(null)
    if (!datasetId) { setColumns([]); return }
    let alive = true
    setColumnsLoading(true)
    api.dataset(datasetId)
      .then((r) => { if (alive) setColumns(r.columns.map((c) => ({ name: c.name, type: c.dataType, count: 0, nullCount: 0, nullRate: 0 }))) })
      .catch(() => { if (alive) setColumns([]) })
      .finally(() => { if (alive) setColumnsLoading(false) })
    return () => { alive = false }
  }, [datasetId])

  // Load referenced dataset columns
  useEffect(() => {
    setRefColumn('')
    if (!refDatasetId) { setRefColumns([]); return }
    let alive = true
    api.dataset(refDatasetId)
      .then((r) => { if (alive) setRefColumns(r.columns.map((c) => ({ name: c.name, type: c.dataType, count: 0, nullCount: 0, nullRate: 0 }))) })
      .catch(() => { if (alive) setRefColumns([]) })
    return () => { alive = false }
  }, [refDatasetId])

  // Auto-suggest rule names until the author edits them
  useEffect(() => {
    if (nameTouched.current) return
    const parts = [dataset?.name, column || (template === 'ROW_COUNT' ? 'Row count' : template === 'SCHEMA_MATCH' ? 'Schema' : null), meta ? pick('en', meta.en, '') : null].filter(Boolean)
    setNameEn(parts.join(' · '))
    const partsTh = [dataset?.nameTh ?? dataset?.name, column, meta?.th].filter(Boolean)
    setNameTh(partsTh.join(' · '))
  }, [dataset, column, meta, template])

  // Applicability: hide boolean columns for NOT_NULL (empty-check is meaningless
  // on booleans) — a note explains the exclusion. Other templates show all.
  const selectableColumns = useMemo(() => {
    if (template === 'NOT_NULL') return columns.filter((c) => !/bool/i.test(c.type))
    return columns
  }, [columns, template])

  const isBoolExcluded = template === 'NOT_NULL' && columns.length !== selectableColumns.length

  // ── Derived definition + summary ────────────────────────────────────────────

  const condition = useMemo(() => (condCol && condVal ? `${condCol} ${condOp} ${condVal}` : undefined), [condCol, condOp, condVal])

  const parameters = useMemo<Record<string, unknown> | undefined>(() => {
    switch (template) {
      case 'REGEX': return { pattern }
      case 'RANGE': return { min: Number(min), max: Number(max) }
      case 'IN_SET': return { values: inSet.split(',').map((s) => s.trim()).filter(Boolean) }
      case 'FRESHNESS': return { maxHours: Number(maxHours) }
      case 'ROW_COUNT': return { minRows: Number(minRows), maxRows: Number(maxRows) }
      case 'CROSS_FIELD': return rightMode === 'column' ? { left: leftCol, op: crossOp, right: rightCol } : { left: leftCol, op: crossOp, rightValue: Number(rightConst) }
      case 'REFERENTIAL': return { dataset: refDatasetId, column: refColumn }
      default: return undefined
    }
  }, [template, pattern, min, max, inSet, maxHours, minRows, maxRows, leftCol, crossOp, rightMode, rightCol, rightConst, refDatasetId, refColumn])

  const operator = useMemo<string | undefined>(() => {
    switch (template) {
      case 'NOT_NULL': return 'IS_NOT_NULL'
      case 'REGEX': return 'MATCHES'
      case 'RANGE': return 'BETWEEN'
      case 'IN_SET': return 'IN'
      case 'UNIQUE': return 'UNIQUE'
      case 'FRESHNESS': return 'WITHIN_HOURS'
      case 'ROW_COUNT': return 'ROW_COUNT'
      case 'CROSS_FIELD': return 'CROSS_FIELD'
      case 'REFERENTIAL': return 'REFERENCE_EXISTS'
      case 'SCHEMA_MATCH': return 'SCHEMA_MATCH'
      default: return undefined
    }
  }, [template])

  const definition = useMemo<RuleDefinition | null>(() => {
    if (!template) return null
    return {
      column: template === 'ROW_COUNT' || template === 'CROSS_FIELD' || template === 'SCHEMA_MATCH' ? undefined : (column || undefined),
      operator,
      parameters,
      condition,
      severity,
    }
  }, [template, column, operator, parameters, condition, severity])

  const paramSummary = useMemo(() => {
    switch (template) {
      case 'REGEX': return `${pattern}`
      case 'RANGE': return `${min} – ${max}`
      case 'IN_SET': return `{${inSet.split(',').map((s) => s.trim()).filter(Boolean).join(', ')}}`
      case 'FRESHNESS': return `${maxHours}h`
      case 'ROW_COUNT': return `${minRows} – ${maxRows} rows`
      case 'CROSS_FIELD': return `${leftCol} ${crossOp} ${rightMode === 'column' ? rightCol : rightConst}`
      case 'REFERENTIAL': return `${datasets?.find((d) => d.id === refDatasetId)?.name ?? refDatasetId}.${refColumn}`
      default: return ''
    }
  }, [template, pattern, min, max, inSet, maxHours, minRows, maxRows, leftCol, crossOp, rightMode, rightCol, rightConst, refDatasetId, refColumn, datasets])

  const summaryOf = useCallback((l: 'en' | 'th'): string => {
    if (!template || !dataset) return ''
    const phrase = CONDITION_PHRASE[template]
    const subject = template === 'ROW_COUNT'
      ? (l === 'th' ? 'จำนวนแถว' : 'the row count')
      : template === 'SCHEMA_MATCH' ? (l === 'th' ? 'โครงสร้างข้อมูล' : 'the structure') : column
    const filterPart = condition
      ? (l === 'th' ? `เมื่อ ${condition}` : `when ${condition}`)
      : (l === 'th' ? 'สำหรับทุกแถว' : 'for all rows')
    const params = paramSummary ? ` ${paramSummary}` : ''
    if (l === 'th') return `สำหรับ ${dataset.nameTh ?? dataset.name} ${subject} ${phrase.th}${params} ${filterPart} มิฉะนั้นให้ทำเครื่องหมายว่า${SEV_TH[severity]}`
    return `For ${dataset.name}, ${subject} must ${phrase.en}${params} ${filterPart}, otherwise mark as ${severity.toLowerCase()}.`
  }, [template, dataset, column, condition, paramSummary, severity])

  const summary = useMemo(() => summaryOf(previewLang), [summaryOf, previewLang])

  // ── Per-step validation ─────────────────────────────────────────────────────

  const regexValid = useMemo(() => { if (!pattern) return false; try { new RegExp(pattern); return true } catch { return false } }, [pattern])
  const numOk = (s: string) => s !== '' && !isNaN(Number(s))
  const inSetValues = useMemo(() => inSet.split(',').map((s) => s.trim()).filter(Boolean), [inSet])

  const paramsValid = useMemo(() => {
    switch (template) {
      case 'REGEX': return regexValid
      case 'RANGE': return numOk(min) && numOk(max) && Number(min) <= Number(max)
      case 'IN_SET': return inSetValues.length > 0
      case 'FRESHNESS': return numOk(maxHours) && Number(maxHours) > 0
      case 'ROW_COUNT': return numOk(minRows) && numOk(maxRows) && Number(minRows) <= Number(maxRows)
      case 'CROSS_FIELD': return !!leftCol && (rightMode === 'column' ? !!rightCol : numOk(rightConst))
      case 'REFERENTIAL': return !!refDatasetId && !!refColumn
      default: return true
    }
  }, [template, regexValid, min, max, inSetValues.length, maxHours, minRows, maxRows, leftCol, rightMode, rightCol, rightConst, refDatasetId, refColumn])

  const conditionValid = condCol === '' && condVal === '' ? true : !!condCol && !!condVal

  const stepValid = useMemo(() => {
    switch (step) {
      case 0: return !!template
      case 1: return !!datasetId && (!meta?.needsColumn || !!column) && paramsValid && conditionValid
      case 2: return !!nameEn.trim() && !!effectiveDate && !!owner.trim()
      default: return true
    }
  }, [step, template, datasetId, meta, column, paramsValid, conditionValid, nameEn, effectiveDate, owner])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const runTest = async () => {
    if (!datasetId || !definition) return
    setTesting(true); setTestError(null)
    try {
      const res = await api.testRule({ datasetId, definition, templateKey: template ?? undefined })
      setTestResult(res)
    } catch (e) {
      setTestResult(null)
      setTestError(e instanceof ApiError ? e.message : pick(lang, 'Test run failed', 'การทดสอบไม่สำเร็จ'))
    } finally {
      setTesting(false)
    }
  }

  const save = async (mode: 'draft' | 'submit') => {
    if (!datasetId || !definition || !template) return
    setSaving(true)
    try {
      const { rule, versionId } = await api.createRule({
        datasetId,
        name: nameEn.trim(),
        nameTh: nameTh.trim() || undefined,
        dimension: meta?.dimension ?? dimension ?? 'COMPLETENESS',
        severity,
        requiresApproval,
        owner: owner.trim(),
        templateKey: template,
        tags: tags.trim() || undefined,
        definition,
        status: 'DRAFT',
      })
      if (mode === 'submit') {
        await api.submitRuleVersion(rule.id, versionId)
        toast.success(pick(lang, `Rule ${rule.code} v1 created and submitted for approval. Recorded in audit trail.`, `สร้างกฎ ${rule.code} v1 และส่งขออนุมัติแล้ว บันทึกในระบบตรวจสอบแล้ว`))
      } else {
        toast.success(pick(lang, `Rule ${rule.code} saved as draft. Recorded in audit trail.`, `บันทึกกฎ ${rule.code} เป็นฉบับร่างแล้ว บันทึกในระบบตรวจสอบแล้ว`))
      }
      ctx.navigate('rules')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : pick(lang, 'Could not save the rule', 'ไม่สามารถบันทึกกฎได้'))
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  // Keyboard-accessible template radio group (roving tabindex + arrow keys)
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onRadioKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % TEMPLATES.length
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + TEMPLATES.length) % TEMPLATES.length
    if (next !== null) {
      e.preventDefault()
      setTemplate(TEMPLATES[next].key)
      radioRefs.current[next]?.focus()
    }
  }

  if (loadError) {
    return <PageShell objective={{ en: 'Rule Builder', th: 'ตัวสร้างกฎ' }}><ErrorState message={loadError} retry={() => { setLoadError(null); api.datasets().then((r) => setDatasets(r.datasets)).catch(() => setLoadError('Failed to load datasets')) }} /></PageShell>
  }

  if (datasets === null) {
    return <PageShell objective={{ en: 'Rule Builder', th: 'ตัวสร้างกฎ' }}><LoadingState rows={5} /></PageShell>
  }

  const err = (cond: boolean, en: string, th: string) =>
    cond ? <p className="flex items-center gap-1 text-xs text-red-700"><XCircle className="size-3.5 shrink-0" aria-hidden /> <T en={en} th={th} /></p> : null

  return (
    <PageShell
      objective={{
        en: 'Create a data quality rule in four steps — for [Dataset], [Column] must [Condition] using [Parameters] when [filter], otherwise mark as [Severity].',
        th: 'สร้างกฎคุณภาพข้อมูลใน 4 ขั้นตอน — สำหรับ [ชุดข้อมูล] [คอลัมน์] ต้อง [เงื่อนไข] โดยใช้ [พารามิเตอร์] เมื่อ [ตัวกรอง] มิฉะนั้นทำเครื่องหมายว่า [ความรุนแรง]',
      }}
      guidance={{
        en: 'No code required. The definition is stored as JSON, versioned, and can be tested on real data before approval. Source data is never modified.',
        th: 'ไม่ต้องเขียนโค้ด นิยามจะถูกเก็บเป็น JSON แบบมีเวอร์ชัน และทดสอบกับข้อมูลจริงได้ก่อนการอนุมัติ ข้อมูลต้นทางจะไม่ถูกแก้ไข',
      }}
    >
      {/* Stepper */}
      <nav aria-label={pick(lang, 'Builder progress', 'ความคืบหน้า')}>
        <ol className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
          {STEPS.map((s, i) => (
            <li key={s.en} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => { if (i <= step) setStep(i) }}
                disabled={i > step}
                aria-current={i === step ? 'step' : undefined}
                className={`flex min-h-[40px] flex-1 items-center gap-2 rounded-md px-2 text-start text-sm font-medium transition-colors disabled:opacity-50 ${i === step ? 'text-teal-800' : i < step ? 'text-emerald-700 hover:bg-emerald-50' : 'text-muted-foreground'}`}
              >
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${i === step ? 'border-teal-700 bg-teal-700 text-white' : i < step ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground'}`}>
                  {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <T en={s.en} th={s.th} />
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className={`hidden h-px flex-1 sm:block ${i < step ? 'bg-emerald-500' : 'bg-border'}`} />}
            </li>
          ))}
        </ol>
      </nav>

      {/* STEP 1 — Template */}
      {step === 0 && (
        <section className="space-y-3" aria-label={pick(lang, 'Step 1: choose a template', 'ขั้นตอนที่ 1: เลือกเทมเพลต')}>
          <SectionHeading titleEn="1 · Choose a rule template" titleTh="1 · เลือกเทมเพลตของกฎ" hintEn="Each template maps to a governed dimension and a JSON definition." hintTh="แต่ละเทมเพลตเชื่อมกับมิติและนิยาม JSON ที่กำกับดูแล" />
          <div role="radiogroup" aria-label={pick(lang, 'Rule templates', 'เทมเพลตกฎ')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {TEMPLATES.map((t, idx) => {
              const selected = template === t.key
              return (
                <button
                  key={t.key}
                  ref={(el) => { radioRefs.current[idx] = el }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || template === null ? 0 : -1}
                  onKeyDown={(e) => onRadioKeyDown(e, idx)}
                  onClick={() => { setTemplate(t.key); setDimension(t.dimension); setTestResult(null) }}
                  className={`flex min-h-[40px] flex-col items-start gap-1.5 rounded-lg border p-3 text-start transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${selected ? 'border-teal-700 bg-teal-50 ring-2 ring-teal-700/30' : 'bg-card hover:border-teal-600/50 hover:bg-teal-50/40'}`}
                >
                  <span className={`flex size-8 items-center justify-center rounded-md ${selected ? 'bg-teal-700 text-white' : 'bg-muted text-teal-800'}`}>
                    <t.Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold">
                    <T en={t.en} th={t.th} />
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground"><T en={t.descEn} th={t.descTh} /></span>
                  <span className="mt-auto pt-1 text-[10px] font-medium uppercase tracking-wide text-teal-800">{t.dimension.replaceAll('_', ' ')}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* STEP 2 — Target */}
      {step === 1 && meta && (
        <section className="space-y-4" aria-label={pick(lang, 'Step 2: choose the target', 'ขั้นตอนที่ 2: เลือกเป้าหมาย')}>
          <SectionHeading titleEn="2 · Dataset, column and dimension" titleTh="2 · ชุดข้อมูล คอลัมน์ และมิติ" hintEn="Only columns applicable to the selected template are listed." hintTh="แสดงเฉพาะคอลัมน์ที่เหมาะกับเทมเพลตที่เลือก" />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rb-dataset"><T en="Dataset" th="ชุดข้อมูล" /></Label>
              <Select value={datasetId || undefined} onValueChange={setDatasetId}>
                <SelectTrigger id="rb-dataset" className="min-h-[40px] w-full" aria-invalid={!datasetId}>
                  <SelectValue placeholder={pick(lang, 'Select a dataset…', 'เลือกชุดข้อมูล…')} />
                </SelectTrigger>
                <SelectContent>
                  {(datasets ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {err(!datasetId, 'A dataset is required.', 'ต้องเลือกชุดข้อมูล')}
            </div>

            {meta.needsColumn && (
              <div className="space-y-1.5">
                <Label htmlFor="rb-column"><T en="Column" th="คอลัมน์" /></Label>
                <Select value={column || undefined} onValueChange={setColumn} disabled={!datasetId || columnsLoading}>
                  <SelectTrigger id="rb-column" className="min-h-[40px] w-full" aria-invalid={!!datasetId && !column}>
                    <SelectValue placeholder={columnsLoading ? pick(lang, 'Loading columns…', 'กำลังโหลดคอลัมน์…') : pick(lang, 'Select a column…', 'เลือกคอลัมน์…')} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableColumns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name} <span className="text-xs text-muted-foreground">({c.type})</span></SelectItem>)}
                  </SelectContent>
                </Select>
                {isBoolExcluded && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><Info className="size-3.5" aria-hidden /> <T en="Boolean columns are excluded for the Not-null template." th="คอลัมน์แบบ boolean ถูกตัดออกสำหรับเทมเพลต Not-null" /></p>
                )}
                {err(!!datasetId && !columnsLoading && !column, 'A column is required for this template.', 'เทมเพลตนี้ต้องเลือกคอลัมน์')}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rb-dimension"><T en="Quality dimension" th="มิติคุณภาพข้อมูล" /></Label>
            <Select value={dimension ?? undefined} onValueChange={(v) => setDimension(v as Dimension)}>
              <SelectTrigger id="rb-dimension" className="min-h-[40px] w-full md:w-96">
                <SelectValue placeholder={pick(lang, 'Select a dimension…', 'เลือกมิติ…')} />
              </SelectTrigger>
              <SelectContent>
                {DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d.replaceAll('_', ' ')} — {pick(lang, DIM_DESC[d].en, DIM_DESC[d].th)}</SelectItem>)}
              </SelectContent>
            </Select>
            {dimension && <p className="text-xs text-muted-foreground">{pick(lang, DIM_DESC[dimension].en, DIM_DESC[dimension].th)}</p>}
          </div>

          {/* Template parameters */}
          <div className="rounded-lg border bg-card p-4">
            <SectionHeading titleEn="Parameters" titleTh="พารามิเตอร์" hintEn={`Template: ${meta.en}`} hintTh={`เทมเพลต: ${meta.th}`} />
            <div className="mt-3 space-y-3">
              {template === 'REGEX' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rb-pattern"><T en="Regular expression pattern" th="รูปแบบ regular expression" /></Label>
                  <Input id="rb-pattern" className="min-h-[40px] font-mono" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="^[A-Z]{2}\d{4}$" aria-invalid={pattern !== '' && !regexValid} />
                  {pattern !== '' && !regexValid && err(true, 'Invalid regular expression.', 'regular expression ไม่ถูกต้อง')}
                  {pattern !== '' && regexValid && <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden /> <T en="Valid expression." th="รูปแบบถูกต้อง" /></p>}
                </div>
              )}

              {template === 'RANGE' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-min"><T en="Minimum" th="ค่าต่ำสุด" /></Label>
                    <Input id="rb-min" className="min-h-[40px]" type="number" value={min} onChange={(e) => setMin(e.target.value)} aria-invalid={min !== '' && !numOk(min)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-max"><T en="Maximum" th="ค่าสูงสุด" /></Label>
                    <Input id="rb-max" className="min-h-[40px]" type="number" value={max} onChange={(e) => setMax(e.target.value)} aria-invalid={max !== '' && !numOk(max)} />
                  </div>
                  {err((numOk(min) && numOk(max) && Number(min) > Number(max)), 'Minimum must be ≤ maximum.', 'ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด')}
                </div>
              )}

              {template === 'IN_SET' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rb-inset"><T en="Allowed values (comma separated)" th="ค่าที่อนุญาต (คั่นด้วยจุลภาค)" /></Label>
                  <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
                    {inSetValues.map((v) => <span key={v} className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200">{v}</span>)}
                    <input
                      className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                      value={inSet}
                      onChange={(e) => setInSet(e.target.value)}
                      placeholder="RETAIL, WHOLESALE, ONLINE"
                      aria-label={pick(lang, 'Allowed values, comma separated', 'ค่าที่อนุญาต คั่นด้วยจุลภาค')}
                      aria-invalid={inSetValues.length === 0}
                    />
                  </div>
                  {err(inSetValues.length === 0, 'At least one value is required.', 'ต้องระบุค่าอย่างน้อยหนึ่งค่า')}
                </div>
              )}

              {template === 'FRESHNESS' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rb-hours"><T en="Maximum age (hours)" th="อายุสูงสุด (ชั่วโมง)" /></Label>
                  <Input id="rb-hours" className="min-h-[40px]" type="number" min={1} value={maxHours} onChange={(e) => setMaxHours(e.target.value)} aria-invalid={!numOk(maxHours) || Number(maxHours) <= 0} />
                  {err(!numOk(maxHours) || Number(maxHours) <= 0, 'Hours must be a positive number.', 'ชั่วโมงต้องเป็นจำนวนบวก')}
                </div>
              )}

              {template === 'ROW_COUNT' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-minrows"><T en="Minimum rows" th="จำนวนแถวต่ำสุด" /></Label>
                    <Input id="rb-minrows" className="min-h-[40px]" type="number" value={minRows} onChange={(e) => setMinRows(e.target.value)} aria-invalid={minRows !== '' && !numOk(minRows)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-maxrows"><T en="Maximum rows" th="จำนวนแถวสูงสุด" /></Label>
                    <Input id="rb-maxrows" className="min-h-[40px]" type="number" value={maxRows} onChange={(e) => setMaxRows(e.target.value)} aria-invalid={maxRows !== '' && !numOk(maxRows)} />
                  </div>
                  {err(numOk(minRows) && numOk(maxRows) && Number(minRows) > Number(maxRows), 'Minimum must be ≤ maximum.', 'ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด')}
                </div>
              )}

              {template === 'CROSS_FIELD' && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rb-left"><T en="Left column" th="คอลัมน์ซ้าย" /></Label>
                      <Select value={leftCol || undefined} onValueChange={setLeftCol}>
                        <SelectTrigger id="rb-left" className="min-h-[40px] w-full" aria-invalid={!leftCol}><SelectValue placeholder={pick(lang, 'Column…', 'คอลัมน์…')} /></SelectTrigger>
                        <SelectContent>{columns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rb-op"><T en="Operator" th="ตัวดำเนินการ" /></Label>
                      <Select value={crossOp} onValueChange={setCrossOp}>
                        <SelectTrigger id="rb-op" className="min-h-[40px] w-full font-mono"><SelectValue /></SelectTrigger>
                        <SelectContent>{CROSS_OPS.map((o) => <SelectItem key={o} value={o} className="font-mono">{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rb-rightmode"><T en="Right side" th="ฝั่งขวา" /></Label>
                      <Select value={rightMode} onValueChange={(v) => setRightMode(v as 'column' | 'constant')}>
                        <SelectTrigger id="rb-rightmode" className="min-h-[40px] w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="column"><T en="Another column" th="อีกคอลัมน์" /></SelectItem>
                          <SelectItem value="constant"><T en="Constant value" th="ค่าคงที่" /></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {rightMode === 'column' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="rb-right"><T en="Right column" th="คอลัมน์ขวา" /></Label>
                      <Select value={rightCol || undefined} onValueChange={setRightCol}>
                        <SelectTrigger id="rb-right" className="min-h-[40px] w-full" aria-invalid={!rightCol}><SelectValue placeholder={pick(lang, 'Column…', 'คอลัมน์…')} /></SelectTrigger>
                        <SelectContent>{columns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="rb-rightconst"><T en="Constant value" th="ค่าคงที่" /></Label>
                      <Input id="rb-rightconst" className="min-h-[40px]" type="number" value={rightConst} onChange={(e) => setRightConst(e.target.value)} aria-invalid={rightConst !== '' && !numOk(rightConst)} />
                    </div>
                  )}
                  {err(!leftCol, 'Left column is required.', 'ต้องเลือกคอลัมน์ซ้าย')}
                  {err(!!leftCol && rightMode === 'column' && !rightCol, 'Right column is required.', 'ต้องเลือกคอลัมน์ขวา')}
                  {err(!!leftCol && rightMode === 'constant' && !numOk(rightConst), 'A numeric constant is required.', 'ต้องระบุค่าคงที่ตัวเลข')}
                </div>
              )}

              {template === 'REFERENTIAL' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-refds"><T en="Referenced dataset" th="ชุดข้อมูลอ้างอิง" /></Label>
                    <Select value={refDatasetId || undefined} onValueChange={setRefDatasetId}>
                      <SelectTrigger id="rb-refds" className="min-h-[40px] w-full" aria-invalid={!refDatasetId}><SelectValue placeholder={pick(lang, 'Dataset…', 'ชุดข้อมูล…')} /></SelectTrigger>
                      <SelectContent>{(datasets ?? []).filter((d) => d.id !== datasetId).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rb-refcol"><T en="Referenced column" th="คอลัมน์อ้างอิง" /></Label>
                    <Select value={refColumn || undefined} onValueChange={setRefColumn} disabled={!refDatasetId}>
                      <SelectTrigger id="rb-refcol" className="min-h-[40px] w-full" aria-invalid={!!refDatasetId && !refColumn}><SelectValue placeholder={pick(lang, 'Column…', 'คอลัมน์…')} /></SelectTrigger>
                      <SelectContent>{refColumns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {template === 'SCHEMA_MATCH' && (
                <p className="flex items-start gap-1.5 rounded border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <T en="This template compares the dataset structure against the registered schema — no parameters are needed." th="เทมเพลตนี้เปรียบเทียบโครงสร้างชุดข้อมูลกับสคีมาที่ลงทะเบียนไว้ — ไม่ต้องระบุพารามิเตอร์" />
                </p>
              )}

              {(template === 'NOT_NULL' || template === 'UNIQUE') && (
                <p className="flex items-start gap-1.5 rounded border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {template === 'NOT_NULL'
                    ? <T en="No parameters — every row must have a value in the selected column." th="ไม่ต้องตั้งค่า — ทุกแถวต้องมีค่าในคอลัมน์ที่เลือก" />
                    : <T en="No parameters — values in the selected column must be unique across all rows." th="ไม่ต้องตั้งค่า — ค่าในคอลัมน์ที่เลือกต้องไม่ซ้ำกันทุกแถว" />}
                </p>
              )}
            </div>
          </div>

          {/* Optional condition */}
          <div className="rounded-lg border bg-card p-4">
            <SectionHeading titleEn="Optional row filter" titleTh="ตัวกรองแถว (ไม่บังคับ)" hintEn="Optional filter, e.g. segment = RETAIL" hintTh="ตัวกรองไม่บังคับ เช่น segment = RETAIL" />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_100px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="rb-condcol"><T en="Column" th="คอลัมน์" /></Label>
                <Select value={condCol || undefined} onValueChange={(v) => { if (v === '__none__') { setCondCol(''); setCondVal(''); setTestResult(null) } else { setCondCol(v); setTestResult(null) } }}>
                  <SelectTrigger id="rb-condcol" className="min-h-[40px] w-full" aria-invalid={!!condCol && !conditionValid}><SelectValue placeholder={pick(lang, 'Any column…', 'คอลัมน์ใดก็ได้…')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__"><T en="(no filter)" th="(ไม่กรอง)" /></SelectItem>
                    {columns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rb-condop"><T en="Operator" th="ตัวดำเนินการ" /></Label>
                <Select value={condOp} onValueChange={(v) => setCondOp(v as '=' | '!=')}>
                  <SelectTrigger id="rb-condop" className="min-h-[40px] w-full font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="=" className="font-mono">=</SelectItem><SelectItem value="!=" className="font-mono">!=</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rb-condval"><T en="Value" th="ค่า" /></Label>
                <Input id="rb-condval" className="min-h-[40px]" value={condVal} onChange={(e) => setCondVal(e.target.value)} aria-invalid={!!condCol && !conditionValid} placeholder="RETAIL" />
              </div>
            </div>
            {err(!conditionValid, 'Complete the filter or leave it empty.', 'กรอกตัวกรองให้ครบ หรือเว้นว่างไว้')}
          </div>
        </section>
      )}

      {/* STEP 3 — Governance */}
      {step === 2 && (
        <section className="space-y-4" aria-label={pick(lang, 'Step 3: governance', 'ขั้นตอนที่ 3: การกำกับดูแล')}>
          <SectionHeading titleEn="3 · Severity, ownership and approval policy" titleTh="3 · ความรุนแรง ความรับผิดชอบ และนโยบายการอนุมัติ" />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rb-name"><T en="Rule name (English)" th="ชื่อกฎ (อังกฤษ)" /></Label>
              <Input id="rb-name" className="min-h-[40px]" value={nameEn} onChange={(e) => { nameTouched.current = true; setNameEn(e.target.value) }} aria-invalid={!nameEn.trim()} />
              {err(!nameEn.trim(), 'A rule name is required.', 'ต้องระบุชื่อกฎ')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-nameth"><T en="Rule name (Thai)" th="ชื่อกฎ (ไทย)" /></Label>
              <Input id="rb-nameth" className="min-h-[40px]" value={nameTh} onChange={(e) => { nameTouched.current = true; setNameTh(e.target.value) }} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rb-severity"><T en="Severity when the rule fails" th="ความรุนแรงเมื่อกฎไม่ผ่าน" /></Label>
              <div className="flex items-center gap-2">
                <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                  <SelectTrigger id="rb-severity" className="min-h-[40px] w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <StatusBadge kind={severity} label={pick(lang, severity, `${severity} (${SEV_TH[severity]})`)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-date"><T en="Effective from" th="มีผลตั้งแต่" /></Label>
              <Input id="rb-date" className="min-h-[40px]" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} aria-invalid={!effectiveDate} />
              {err(!effectiveDate, 'An effective date is required.', 'ต้องระบุวันที่มีผล')}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rb-owner"><T en="Rule owner (accountable)" th="เจ้าของกฎ (ผู้รับผิดชอบ)" /></Label>
              {ctx.user.role === 'SYSTEM_ADMIN' ? (
                <Input id="rb-owner" className="min-h-[40px]" value={owner} onChange={(e) => setOwner(e.target.value)} />
              ) : (
                <>
                  <Input id="rb-owner" className="min-h-[40px]" value={owner} readOnly aria-readonly />
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-teal-700" aria-hidden /> <T en="Accountable: you" th="ผู้รับผิดชอบ: ตัวคุณเอง" /></p>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-tags"><T en="Tags (comma separated)" th="แท็ก (คั่นด้วยจุลภาค)" /></Label>
              <Input id="rb-tags" className="min-h-[40px]" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="CDE, finance, quarterly-report" />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
            <div>
              <Label htmlFor="rb-approval"><T en="Requires Data Owner approval" th="ต้องได้รับอนุมัติจากเจ้าของข้อมูล" /></Label>
              <p className="mt-1 text-xs text-muted-foreground"><T en="Data Owner must approve this exact version before activation." th="เจ้าของข้อมูลต้องอนุมัติเวอร์ชันนี้โดยเฉพาะก่อนการเปิดใช้งาน" /></p>
            </div>
            <Switch id="rb-approval" checked={requiresApproval} onCheckedChange={setRequiresApproval} className="mt-1 h-6 w-11 data-[state=checked]:bg-teal-700" aria-label={pick(lang, 'Requires approval', 'ต้องได้รับอนุมัติ')} />
          </div>
        </section>
      )}

      {/* STEP 4 — Review & test */}
      {step === 3 && template && dataset && meta && (
        <section className="space-y-4" aria-label={pick(lang, 'Step 4: review and test', 'ขั้นตอนที่ 4: ทบทวนและทดสอบ')}>
          <SectionHeading titleEn="4 · Review, test on real data, then save" titleTh="4 · ทบทวน ทดสอบกับข้อมูลจริง แล้วบันทึก" />

          {/* Live natural-language summary */}
          <div className="rounded-lg border bg-teal-50/50 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold"><T en="Natural language summary" th="สรุปด้วยภาษาธรรมชาติ" /></h3>
              <div role="radiogroup" aria-label={pick(lang, 'Summary language', 'ภาษาของสรุป')} className="flex overflow-hidden rounded-md border">
                {(['en', 'th'] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={previewLang === l} onClick={() => setPreviewLang(l)}
                    className={`min-h-[36px] px-3 text-xs font-semibold ${previewLang === l ? 'bg-teal-700 text-white' : 'bg-card text-muted-foreground hover:bg-teal-50'}`}>
                    {l === 'en' ? 'EN' : 'ไทย'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm leading-relaxed" aria-live="polite">
              {summary}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {previewLang === 'en' ? summaryOf('th') : summaryOf('en')}
            </p>
            <div className="mt-3 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <span><T en="Dimension" th="มิติ" />: {meta.dimension.replaceAll('_', ' ')}</span>
              <span><T en="Approval required" th="ต้องได้รับอนุมัติ" />: {requiresApproval ? <T en="Yes" th="ใช่" /> : <T en="No" th="ไม่" />}</span>
              <span><T en="Effective from" th="มีผลตั้งแต่" />: {effectiveDate}</span>
              <span><T en="Owner" th="เจ้าของ" />: {owner}</span>
            </div>
          </div>

          {/* Test */}
          <div className="flex flex-wrap items-center gap-3">
            <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => void runTest()} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              <T en="Test rule" th="ทดสอบกฎ" />
            </Button>
            <p className="text-xs text-muted-foreground"><T en="Runs the definition against a sample of the real dataset. Evidence is masked per PII policy." th="รันนิยามกับตัวอย่างข้อมูลจริง หลักฐานจะถูกปกปิดตามนโยบาย PII" /></p>
          </div>

          {testError && <ErrorState message={testError} retry={() => void runTest()} />}

          {testResult && (
            <div className="rounded-lg border bg-card p-4" aria-live="polite">
              <SectionHeading titleEn="Test result" titleTh="ผลการทดสอบ" />
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <StatusBadge kind={testResult.status as 'PASSED' | 'FAILED' | 'WARNING' | 'ERROR' | 'SKIPPED'} />
                <span><T en="Pass rate" th="อัตราผ่าน" />: <strong className="tabular-nums">{fmtPercent(testResult.passRate * 100, lang)}</strong></span>
                <span><T en="Rows evaluated" th="แถวที่ประเมิน" />: <strong className="tabular-nums">{testResult.evaluatedRows.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}</strong></span>
                <span><T en="Failed rows" th="แถวที่ไม่ผ่าน" />: <strong className="tabular-nums">{testResult.failedRows.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}</strong></span>
              </div>
              {testResult.evidence.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/80">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Row" th="แถว" /></th>
                        <th scope="col" className="px-3 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Column" th="คอลัมน์" /></th>
                        <th scope="col" className="px-3 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Value (masked)" th="ค่า (ปกปิดแล้ว)" /></th>
                        <th scope="col" className="px-3 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Reason" th="เหตุผล" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.evidence.map((ev) => (
                        <tr key={`${ev.row}-${ev.column}`} className="border-t">
                          <td className="px-3 py-2 tabular-nums">{ev.row}</td>
                          <td className="px-3 py-2 font-mono text-xs">{ev.column}</td>
                          <td className="px-3 py-2"><MaskedChip>{ev.valueMasked}</MaskedChip></td>
                          <td className="px-3 py-2 text-xs">{pick(lang, ev.reasonEn, ev.reasonTh)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground"><T en="Failure samples are masked per PII policy." th="ตัวอย่างความล้มเหลวถูกปกปิดตามนโยบาย PII" /></p>
            </div>
          )}

          {/* Save actions */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" className="min-h-[40px]" onClick={() => setConfirmAction('draft')} disabled={saving}>
              <T en="Save draft" th="บันทึกฉบับร่าง" />
            </Button>
            <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => setConfirmAction('submit')} disabled={saving}>
              <ArrowRight className="size-4" aria-hidden /> <T en="Submit for approval" th="ส่งเพื่อขออนุมัติ" />
            </Button>
          </div>
        </section>
      )}

      {/* Wizard navigation */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <Button variant="outline" className="min-h-[40px]" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4" aria-hidden /> <T en="Back" th="ย้อนกลับ" />
        </Button>
        <p className="text-xs text-muted-foreground"><T en={`Step ${step + 1} of 4`} th={`ขั้นตอนที่ ${step + 1} จาก 4`} /></p>
        {step < 3 ? (
          <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => setStep((s) => Math.min(3, s + 1))} disabled={!stepValid}>
            <T en="Next" th="ถัดไป" /> <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : <span className="w-[76px]" aria-hidden />}
      </div>

      {/* Save confirmation */}
      <Dialog open={confirmAction !== null} onOpenChange={(o) => { if (!o) setConfirmAction(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction === 'submit' ? <T en="Create and submit for approval?" th="สร้างและส่งขออนุมัติ?" /> : <T en="Create rule as draft?" th="สร้างกฎเป็นฉบับร่าง?" />}</DialogTitle>
            <DialogDescription>
              {confirmAction === 'submit'
                ? <T en="The rule will be created as v1 (DRAFT) and immediately submitted to the Data Owner for approval. This is recorded in the audit trail." th="กฎจะถูกสร้างเป็น v1 (ฉบับร่าง) และส่งให้เจ้าของข้อมูลอนุมัติทันที การกระทำนี้ถูกบันทึกในระบบตรวจสอบ" />
                : <T en="The rule will be created as v1 in DRAFT status. You can submit it for approval later. This is recorded in the audit trail." th="กฎจะถูกสร้างเป็น v1 สถานะฉบับร่าง คุณสามารถส่งขออนุมัติภายหลังได้ การกระทำนี้ถูกบันทึกในระบบตรวจสอบ" />}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-[40px]" onClick={() => setConfirmAction(null)} disabled={saving}><T en="Cancel" th="ยกเลิก" /></Button>
            <Button className="min-h-[40px] bg-teal-700 hover:bg-teal-800" onClick={() => confirmAction && void save(confirmAction)} disabled={saving || !stepValid}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
              <T en="Confirm" th="ยืนยัน" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
