'use client'
// Data Sources view — read-only connector registry with health monitoring.
// Add flow is a 4-step wizard; credentials never touch the platform (secret manager refs only).
import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react'
import {
  Database, DatabaseZap, FileText, FileSpreadsheet, Globe, Plus, ServerCog, ShieldCheck,
  Clock3, Gauge, Activity, CheckCircle2, Layers, Lock, EyeOff,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import { hasPermission, type DataSourceDTO, type SourceType } from '@/lib/types'
import { PageShell, LoadingState, EmptyState, ErrorState, StatusBadge } from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { T, pick, useLang, fmtDateTime, fmtNumber, fmtPercent } from '@/lib/i18n'
import type { ViewCtx } from './ctx'
import { cn } from '@/lib/utils'

const SOURCE_TYPES: SourceType[] = ['POSTGRESQL', 'MSSQL', 'CSV', 'XLSX', 'REST_API']

const TYPE_META: Record<SourceType, { Icon: ElementType; tone: string }> = {
  POSTGRESQL: { Icon: Database, tone: 'bg-teal-50 text-teal-800 border-teal-300' },
  MSSQL: { Icon: DatabaseZap, tone: 'bg-violet-50 text-violet-800 border-violet-300' },
  CSV: { Icon: FileText, tone: 'bg-slate-50 text-slate-700 border-slate-300' },
  XLSX: { Icon: FileSpreadsheet, tone: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  REST_API: { Icon: Globe, tone: 'bg-sky-50 text-sky-800 border-sky-300' },
}

const NEEDS_HOST: SourceType[] = ['POSTGRESQL', 'MSSQL']
const NEEDS_REF: SourceType[] = ['POSTGRESQL', 'MSSQL', 'REST_API']

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type as SourceType] ?? { Icon: ServerCog, tone: 'bg-slate-50 text-slate-700 border-slate-300' }
  const { Icon } = meta
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium', meta.tone)}>
      <Icon className="size-3" aria-hidden />{type.replaceAll('_', ' ')}
    </span>
  )
}

interface WizardForm { type: SourceType | ''; name: string; host: string; connectionRef: string; readOnlyChecked: boolean }

const EMPTY_FORM: WizardForm = { type: '', name: '', host: '', connectionRef: '', readOnlyChecked: false }

function validateStep(step: number, f: WizardForm, lang: 'en' | 'th'): string | null {
  if (step === 1 && !f.type) return pick(lang, 'Select a source type to continue.', 'โปรดเลือกชนิดแหล่งข้อมูลก่อน')
  if (step === 2) {
    if (!f.name.trim()) return pick(lang, 'Name is required.', 'ต้องระบุชื่อ')
    if (f.type && NEEDS_HOST.includes(f.type) && !f.host.trim())
      return pick(lang, `Host is required for ${f.type}.`, `ต้องระบุโฮสต์สำหรับ ${f.type}`)
    if (f.type && NEEDS_REF.includes(f.type) && !f.connectionRef.trim())
      return pick(lang, `Secret manager reference is required for ${f.type}.`, `ต้องระบุข้อมูลอ้างอิง secret manager สำหรับ ${f.type}`)
  }
  if (step === 3 && !f.readOnlyChecked)
    return pick(lang, 'Confirm the connector is READ-ONLY before creating.', 'โปรดยืนยันว่าตัวเชื่อมต่อนี้เป็นแบบอ่านอย่างเดียวก่อนสร้าง')
  return null
}

export default function DataSourcesView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const [sources, setSources] = useState<DataSourceDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM)
  const [stepError, setStepError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canManage = hasPermission(ctx.user.role, 'MANAGE_SOURCE')

  const load = useCallback(async () => {
    try {
      const res = await api.sources()
      setSources(res.sources)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load data sources')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openWizard = () => { setForm(EMPTY_FORM); setStep(1); setStepError(null); setWizardOpen(true) }

  const goNext = () => {
    const v = validateStep(step, form, lang)
    if (v) { setStepError(v); return }
    setStepError(null)
    setStep((s) => Math.min(4, s + 1))
  }

  const submit = async () => {
    const v = validateStep(3, form, lang)
    if (v) { setStepError(v); return }
    setSubmitting(true)
    setStepError(null)
    try {
      await api.createSource({
        name: form.name.trim(),
        type: form.type,
        host: form.host.trim() || undefined,
        connectionRef: form.connectionRef.trim() || undefined,
      })
      toast.success(pick(lang, 'Data source created — connector will sync on first run', 'สร้างแหล่งข้อมูลสำเร็จ — ตัวเชื่อมต่อจะซิงก์ในการรันแรก'))
      setStep(4)
      void load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create data source'
      setStepError(msg)
      toast.error(pick(lang, 'Could not create data source', 'ไม่สามารถสร้างแหล่งข้อมูลได้'), { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  const summary = useMemo(() => ({
    healthy: (sources ?? []).filter((s) => s.health === 'HEALTHY').length,
    total: (sources ?? []).length,
  }), [sources])

  return (
    <PageShell
      objective={{
        en: 'Maintain read-only connections to enterprise systems and monitor their health.',
        th: 'ดูแลการเชื่อมต่อแบบอ่านอย่างเดียวไปยังระบบองค์กร และติดตามสุขภาพการเชื่อมต่อ',
      }}
      primaryAction={canManage ? (
        <Button onClick={openWizard} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white" data-testid="add-source">
          <Plus className="size-4" aria-hidden /> <T en="Add data source" th="เพิ่มแหล่งข้อมูล" />
        </Button>
      ) : undefined}
      guidance={{
        en: 'Every connector is strictly read-only. Credentials are stored in the enterprise secret manager — the platform keeps only a reference. Creation is audit-logged server-side.',
        th: 'ตัวเชื่อมต่อทุกตัวเป็นแบบอ่านอย่างเดียว ข้อมูลรับรองเก็บใน secret manager ขององค์กร โดยแพลตฟอร์มเก็บเพียงข้อมูลอ้างอิง การสร้างจะถูกบันทึกการตรวจสอบฝั่งเซิร์ฟเวอร์',
      }}
    >
      {error && <ErrorState message={error} retry={() => void load()} />}
      {!error && sources === null && <LoadingState rows={4} label={{ en: 'Loading data sources…', th: 'กำลังโหลดแหล่งข้อมูล…' }} />}
      {!error && sources !== null && sources.length === 0 && (
        <EmptyState
          titleEn="No data sources connected" titleTh="ยังไม่มีแหล่งข้อมูลที่เชื่อมต่อ"
          bodyEn="Connect a read-only source such as PostgreSQL, MSSQL, CSV, XLSX or a REST API to begin profiling and validation."
          bodyTh="เชื่อมต่อแหล่งข้อมูลแบบอ่านอย่างเดียว เช่น PostgreSQL, MSSQL, CSV, XLSX หรือ REST API เพื่อเริ่มการทำโปรไฟล์และตรวจสอบคุณภาพ"
          action={canManage ? (
            <Button onClick={openWizard} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
              <Plus className="size-4" aria-hidden /> <T en="Add data source" th="เพิ่มแหล่งข้อมูล" />
            </Button>
          ) : undefined}
        />
      )}
      {!error && sources !== null && sources.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <T
              en={`${fmtNumber(summary.total, lang)} sources · ${fmtNumber(summary.healthy, lang)} healthy`}
              th={`${fmtNumber(summary.total, lang)} แหล่งข้อมูล · ${fmtNumber(summary.healthy, lang)} ปกติ`}
            />
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="source-grid">
            {sources.map((s) => {
              const { Icon } = TYPE_META[s.type] ?? { Icon: ServerCog }
              return (
                <div key={s.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm" data-testid="source-card">
                  <div className="flex items-start justify-between gap-2">
                    <TypeBadge type={s.type} />
                    <StatusBadge kind={(s.health as 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN') ?? 'UNKNOWN'} />
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-teal-700" aria-hidden />{s.name}</p>
                    {s.host && <p className="mt-1 font-mono text-xs text-muted-foreground" title={s.host}>{s.host}</p>}
                    {s.connectionRef && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="size-3 shrink-0" aria-hidden />
                        <span className="font-mono truncate">{s.connectionRef}</span>
                      </p>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock3 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <dt className="sr-only"><T en="Last sync" th="ซิงก์ล่าสุด" /></dt>
                      <dd className="truncate" title={fmtDateTime(s.lastSyncAt, lang)}>
                        <span className="text-muted-foreground"><T en="Last sync: " th="ซิงก์ล่าสุด: " /></span>
                        {fmtDateTime(s.lastSyncAt, lang)}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Gauge className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <dt className="sr-only"><T en="Latency p95" th="ความหน่วง p95" /></dt>
                      <dd><span className="text-muted-foreground"><T en="p95: " th="p95: " /></span>{s.latencyP95Ms != null ? `${fmtNumber(s.latencyP95Ms, lang)} ms` : '—'}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Activity className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <dt className="sr-only"><T en="Success rate" th="อัตราสำเร็จ" /></dt>
                      <dd><span className="text-muted-foreground"><T en="Success: " th="สำเร็จ: " /></span>{fmtPercent(s.successRate == null ? null : s.successRate * (s.successRate <= 1 ? 100 : 1), lang, 1)}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <dt className="sr-only"><T en="Datasets" th="ชุดข้อมูล" /></dt>
                      <dd><span className="text-muted-foreground"><T en="Datasets: " th="ชุดข้อมูล: " /></span>{fmtNumber(s.datasetCount ?? 0, lang)}</dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Dialog open={wizardOpen} onOpenChange={(o) => { if (!submitting) setWizardOpen(o) }}>
        <DialogContent className="sm:max-w-lg" aria-describedby="src-wizard-desc">
          <DialogHeader>
            <DialogTitle><T en="Add data source" th="เพิ่มแหล่งข้อมูล" /></DialogTitle>
            <DialogDescription id="src-wizard-desc">
              <T
                en={`Step ${step} of 4 — register a read-only connector. An audit record is written server-side.`}
                th={`ขั้นตอนที่ ${step} จาก 4 — ลงทะเบียนตัวเชื่อมต่อแบบอ่านอย่างเดียว ระบบจะบันทึกการตรวจสอบฝั่งเซิร์ฟเวอร์`}
              />
            </DialogDescription>
          </DialogHeader>

          <ol className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className={cn('flex-1 rounded-sm border px-1.5 py-1 text-center', n === step ? 'border-teal-600 bg-teal-50 font-semibold text-teal-800' : n < step ? 'border-teal-300 text-teal-700' : '')}>
                {n === 1 ? <T en="Type" th="ชนิด" /> : n === 2 ? <T en="Details" th="รายละเอียด" /> : n === 3 ? <T en="Review" th="ตรวจทาน" /> : <T en="Done" th="เสร็จสิ้น" />}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="src-type"><T en="Source type" th="ชนิดแหล่งข้อมูล" /></Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as SourceType }))}>
                  <SelectTrigger id="src-type" className="min-h-[40px] w-full"><SelectValue placeholder={pick(lang, 'Select type', 'เลือกชนิด')} /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((t) => {
                      const { Icon } = TYPE_META[t]
                      return (
                        <SelectItem key={t} value={t}>
                          <Icon className="size-3.5" aria-hidden />{t.replaceAll('_', ' ')}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <p className="flex items-start gap-2 rounded border border-teal-200 bg-teal-50 p-2 text-xs text-teal-900">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <T
                  en="Read-only credentials stored in secret manager, never in the platform."
                  th="ข้อมูลรับรองแบบอ่านอย่างเดียวจัดเก็บใน secret manager ไม่จัดเก็บในแพลตฟอร์ม"
                />
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="src-name"><T en="Name" th="ชื่อ" /> <span className="text-red-700" aria-hidden>*</span></Label>
                <Input id="src-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="min-h-[40px]" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="src-host">
                  <T en="Host" th="โฮสต์" />
                  {form.type && NEEDS_HOST.includes(form.type) && <span className="text-red-700"> *</span>}
                </Label>
                <Input id="src-host" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} className="min-h-[40px] font-mono" placeholder={form.type === 'REST_API' ? 'https://api.example.com' : 'db-host:5432'} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="src-ref">
                  <T en="Secret manager reference e.g. vault://kv/edqp/…" th="ข้อมูลอ้างอิง secret manager เช่น vault://kv/edqp/…" />
                  {form.type && NEEDS_REF.includes(form.type) && <span className="text-red-700"> *</span>}
                </Label>
                <Input id="src-ref" value={form.connectionRef} onChange={(e) => setForm((f) => ({ ...f, connectionRef: e.target.value }))} className="min-h-[40px] font-mono" placeholder="vault://kv/edqp/prod/pg-crm" autoComplete="off" />
              </div>
              <p className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <T
                  en="Password fields are forbidden here. The platform stores only the secret manager reference; secrets are resolved by the connector at sync time."
                  th="ห้ามกรอกรหัสผ่านในหน้านี้ แพลตฟอร์มเก็บเพียงข้อมูลอ้างอิง secret manager โดยตัวเชื่อมต่อจะดึงความลับขณะซิงก์"
                />
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <dl className="space-y-1.5 rounded border bg-muted/40 p-3 text-sm">
                <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-xs text-muted-foreground"><T en="Type" th="ชนิด" /></dt><dd>{form.type}</dd></div>
                <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-xs text-muted-foreground"><T en="Name" th="ชื่อ" /></dt><dd>{form.name}</dd></div>
                <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-xs text-muted-foreground"><T en="Host" th="โฮสต์" /></dt><dd className="font-mono text-xs">{form.host || '—'}</dd></div>
                <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-xs text-muted-foreground"><T en="Secret ref" th="ข้อมูลอ้างอิงความลับ" /></dt><dd className="font-mono text-xs break-all">{form.connectionRef || '—'}</dd></div>
              </dl>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Activity className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <T en="Connection test is performed by the platform connector at first sync." th="การทดสอบการเชื่อมต่อจะดำเนินการโดยตัวเชื่อมต่อของแพลตฟอร์มขณะซิงก์ครั้งแรก" />
              </p>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded border border-teal-300 bg-teal-50 px-3 text-sm text-teal-900">
                <Checkbox checked={form.readOnlyChecked} onCheckedChange={(v) => setForm((f) => ({ ...f, readOnlyChecked: v === true }))} />
                <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 shrink-0" aria-hidden /><T en="This connector is READ-ONLY" th="ตัวเชื่อมต่อนี้เป็นแบบอ่านอย่างเดียว" /></span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center gap-2 rounded border border-emerald-300 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="size-8 text-emerald-700" aria-hidden />
              <p className="text-sm font-semibold text-emerald-900"><T en="Data source registered" th="ลงทะเบียนแหล่งข้อมูลแล้ว" /></p>
              <p className="text-xs text-emerald-800">
                <T en="The connector will test the connection and perform the first sync automatically. Health appears on this card." th="ตัวเชื่อมต่อจะทดสอบการเชื่อมต่อและซิงก์ครั้งแรกโดยอัตโนมัติ สุขภาพการเชื่อมต่อจะแสดงบนการ์ดนี้" />
              </p>
            </div>
          )}

          {stepError && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">{stepError}</p>}

          <DialogFooter>
            {step > 1 && step < 4 && (
              <Button variant="outline" onClick={() => { setStep((s) => s - 1); setStepError(null) }} className="min-h-[40px]">
                <T en="Back" th="ย้อนกลับ" />
              </Button>
            )}
            {step < 3 && (
              <Button onClick={goNext} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
                <T en="Next" th="ถัดไป" />
              </Button>
            )}
            {step === 3 && (
              <Button onClick={() => void submit()} disabled={submitting} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
                {submitting ? <T en="Creating…" th="กำลังสร้าง…" /> : <T en="Create source" th="สร้างแหล่งข้อมูล" />}
              </Button>
            )}
            {step === 4 && (
              <Button onClick={() => setWizardOpen(false)} className="min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white">
                <T en="Close" th="ปิด" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
