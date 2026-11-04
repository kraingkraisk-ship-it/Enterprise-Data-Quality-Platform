'use client'
// ML models view — govern the ML lifecycle:
// Registered → Validated → Shadow → Human review → Promoted. Detection is never deletion.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Brain, CheckCircle2, Cpu, Lock, Minus, Radar, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { DatasetDTO, MLModelDTO, ModelStage } from '@/lib/types'
import { hasPermission } from '@/lib/types'
import { cn } from '@/lib/utils'
import { T, fmtDateTime, fmtNumber, useLang } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import {
  DataTable, DetailDrawer, DeniedState, ErrorState, KeyValue,
  LoadingState, MlDisclaimer, PageShell, SectionHeading, StatusBadge,
} from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ViewCtx } from './ctx'
import { FeatureBars } from './anomalies'

const ALGORITHMS = ['IsolationForest', 'LocalOutlierFactor', 'DuplicateLinkage', 'DriftMonitor'] as const
const ALGO_ICON: Record<string, React.ElementType> = {
  IsolationForest: Brain, LocalOutlierFactor: Brain, DuplicateLinkage: Cpu, DriftMonitor: Cpu,
}
const fmtMetric = (v: number | undefined) => (typeof v === 'number' && !isNaN(v) ? v.toFixed(2) : '—')

/** Signed, coloured delta with an arrow icon (never colour alone). */
function Delta({ value }: { value: number | null }) {
  if (value === null || isNaN(value)) return <span className="text-muted-foreground">—</span>
  const eps = 0.005
  if (Math.abs(value) < eps) {
    return <span className="inline-flex items-center gap-0.5 text-slate-600"><Minus className="size-3" aria-hidden />0.00</span>
  }
  const up = value > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', up ? 'text-emerald-700' : 'text-red-700')}>
      {up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
      {up ? '+' : ''}{value.toFixed(2)}
    </span>
  )
}

function paramsHighlights(params: Record<string, unknown>): string {
  return Object.entries(params ?? {}).slice(0, 3).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ') || '—'
}

export default function MlModelsView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const canManage = hasPermission(ctx.user.role, 'MANAGE_ML')

  const [models, setModels] = useState<MLModelDTO[] | null>(null)
  const [datasets, setDatasets] = useState<DatasetDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const [selected, setSelected] = useState<MLModelDTO | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [championId, setChampionId] = useState('')
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [acting, setActing] = useState(false)

  // Register-model dialog state
  const [regOpen, setRegOpen] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [rName, setRName] = useState('')
  const [rAlgorithm, setRAlgorithm] = useState('IsolationForest')
  const [rVersion, setRVersion] = useState('')
  const [rScope, setRScope] = useState('none')
  const [rRows, setRRows] = useState('')
  const [rPrecision, setRPrecision] = useState('')
  const [rRecall, setRRecall] = useState('')
  const [rF1, setRF1] = useState('')
  const [rRoc, setRRoc] = useState('')
  const [rFeatures, setRFeatures] = useState('')
  const [rFeatureError, setRFeatureError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [m, ds] = await Promise.all([api.models(), api.datasets()])
      setModels(m.models)
      setDatasets(ds.datasets)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openDetail = (m: MLModelDTO) => {
    setSelected(m)
    setChampionId('')
    setPromoteOpen(false)
    setDrawerOpen(true)
  }

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s))

  const register = async () => {
    if (!rName.trim() || !rVersion.trim()) {
      toast.error(lang === 'th' ? 'กรอกชื่อโมเดลและเวอร์ชัน' : 'Model name and version are required')
      return
    }
    let featureImportance: { feature: string; weight: number }[] = []
    if (rFeatures.trim()) {
      try {
        const parsed: unknown = JSON.parse(rFeatures)
        if (!Array.isArray(parsed)) throw new Error('not an array')
        featureImportance = parsed as { feature: string; weight: number }[]
        setRFeatureError('')
      } catch {
        setRFeatureError(lang === 'th' ? 'JSON ไม่ถูกต้อง เช่น [{"feature":"amount","weight":0.4}]' : 'Invalid JSON, e.g. [{"feature":"amount","weight":0.4}]')
        return
      }
    }
    setRegistering(true)
    try {
      await api.registerModel({
        name: rName.trim(), algorithm: rAlgorithm, version: rVersion.trim(),
        scopeDatasetId: rScope === 'none' ? undefined : rScope,
        trainingRows: num(rRows) ?? 0,
        metrics: { precision: num(rPrecision), recall: num(rRecall), f1: num(rF1), rocAuc: num(rRoc) },
        featureImportance,
      })
      toast.success(lang === 'th' ? 'ลงทะเบียนโมเดลแล้ว (สถานะ REGISTERED)' : 'Model registered (stage REGISTERED)')
      setRegOpen(false)
      setRName(''); setRVersion(''); setRRows(''); setRPrecision(''); setRRecall(''); setRF1(''); setRRoc(''); setRFeatures('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  /** Stage transition with toast + audit note. shadowOfId is sent when a champion was chosen. */
  const setStage = async (m: MLModelDTO, stage: ModelStage, shadowOfId?: string, okEn?: string, okTh?: string) => {
    setActing(true)
    try {
      const body: { stage: string; shadowOfId?: string } = { stage }
      if (shadowOfId) body.shadowOfId = shadowOfId
      await api.setModelStage(m.id, body as { stage: string })
      toast.success(
        (okTh ? lang === 'th' ? okTh : okEn : '') ||
        (lang === 'th' ? `เปลี่ยนสถานะโมเดลเป็น ${stage} แล้ว (บันทึกใน audit trail)` : `Model stage set to ${stage} (recorded in the audit trail)`),
      )
      const fresh = await api.models()
      setModels(fresh.models)
      setSelected(fresh.models.find((x) => x.id === m.id) ?? null)
      setPromoteOpen(false)
      setChampionId('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transition failed')
    } finally {
      setActing(false)
    }
  }

  const champion = useMemo(() => {
    if (!selected || !models) return null
    return models.find((m) => m.id === selected.shadowOfId)
      ?? models.find((m) => m.stage === 'PROMOTED' && m.algorithm === selected.algorithm && m.id !== selected.id)
      ?? null
  }, [selected, models])

  const championsForAlgorithm = useMemo(() => {
    if (!selected || !models) return []
    return models.filter((m) => m.stage === 'PROMOTED' && m.algorithm === selected.algorithm)
  }, [selected, models])

  const scopeName = (id: string | null | undefined) => {
    if (!id) return <T en="All datasets (global)" th="ทุกชุดข้อมูล (ทั่วไป)" />
    const d = datasets.find((x) => x.id === id)
    return d ? d.name : id
  }

  const columns = useMemo(() => [
    { key: 'name', headerEn: 'Model', headerTh: 'โมเดล', render: (m: MLModelDTO) => <span className="text-xs font-semibold">{m.name}</span> },
    {
      key: 'algorithm', headerEn: 'Algorithm', headerTh: 'อัลกอริทึม',
      render: (m: MLModelDTO) => {
        const Icon = ALGO_ICON[m.algorithm] ?? Brain
        return <span className="inline-flex items-center gap-1.5 text-xs"><Icon className="size-3.5 text-teal-700" aria-hidden />{m.algorithm}</span>
      },
    },
    { key: 'version', headerEn: 'Version', headerTh: 'เวอร์ชัน', render: (m: MLModelDTO) => <span className="font-mono text-xs">v{m.version}</span> },
    { key: 'stage', headerEn: 'Stage', headerTh: 'ระยะ', render: (m: MLModelDTO) => <StatusBadge kind={m.stage as ModelStage} /> },
    {
      key: 'metrics', headerEn: 'Metrics', headerTh: 'ตัวชี้วัด',
      render: (m: MLModelDTO) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          P {fmtMetric(m.metrics?.precision)} · R {fmtMetric(m.metrics?.recall)} · F1 {fmtMetric(m.metrics?.f1)}
        </span>
      ),
    },
    { key: 'trained', headerEn: 'Trained', headerTh: 'ฝึกเมื่อ', render: (m: MLModelDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(m.trainedAt, lang)}</span> },
    {
      key: 'active', headerEn: 'Active', headerTh: 'ใช้งาน',
      render: (m: MLModelDTO) => m.isActive ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden /><T en="Active" th="ใช้งาน" /></span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3.5" aria-hidden /><T en="Standby" th="สำรอง" /></span>
      ),
    },
    { key: 'scope', headerEn: 'Scope dataset', headerTh: 'ขอบเขตชุดข้อมูล', render: (m: MLModelDTO) => <span className="text-xs">{m.scopeDatasetId ? (datasets.find((d) => d.id === m.scopeDatasetId)?.name ?? m.scopeDatasetId) : <T en="All datasets" th="ทุกชุดข้อมูล" />}</span> },
  ], [lang, datasets])

  if (!hasPermission(ctx.user.role, 'VIEW_ML')) return <DeniedState resourceEn="ML models" />

  return (
    <PageShell
      objective={{
        en: 'Govern the ML lifecycle — Registered → Validated → Shadow → Human review → Promoted. Detection is never deletion.',
        th: 'กำกับดูแลวงจรชีวิต ML — ลงทะเบียน → ตรวจสอบ → Shadow → ทบทวนโดยมนุษย์ → ใช้งานจริง การตรวจจับไม่มีวันลบข้อมูล',
      }}
      primaryAction={canManage ? (
        <Button onClick={() => setRegOpen(true)} className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800">
          <Radar className="size-4" aria-hidden /> <T en="Register model" th="ลงทะเบียนโมเดล" />
        </Button>
      ) : undefined}
      guidance={{
        en: 'Promotion requires a shadow period and an explicit human decision; both champion replacement and retirement are audit-logged.',
        th: 'การเลื่อนสถานะต้องผ่านช่วง shadow และการตัดสินใจโดยมนุษย์อย่างชัดเจน การเปลี่ยน champion และการปลดระวางถูกบันทึกใน audit trail',
      }}
    >
      <MlDisclaimer />

      {loading ? (
        <LoadingState label={{ en: 'Loading models…', th: 'กำลังโหลดโมเดล…' }} />
      ) : error ? (
        <ErrorState message={error.message} retry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={models ?? []}
          rowKey={(m) => m.id}
          onRowClick={openDetail}
          density={density}
          caption="ML models across the governance lifecycle"
          emptyEn="No models registered yet."
          emptyTh="ยังไม่มีการลงทะเบียนโมเดล"
        />
      )}

      {/* Register model dialog */}
      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle><T en="Register a detection model" th="ลงทะเบียนโมเดลตรวจจับ" /></DialogTitle>
            <DialogDescription>
              <T en="New models always start at REGISTERED and never touch alerting until promoted through shadow review." th="โมเดลใหม่เริ่มที่สถานะ REGISTERED และจะไม่มีผลต่อการแจ้งเตือนจนกว่าจะผ่าน shadow review และได้รับการเลื่อนสถานะ" />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ml-name"><T en="Name" th="ชื่อโมเดล" /></Label>
                <Input id="ml-name" value={rName} onChange={(e) => setRName(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ml-version"><T en="Version" th="เวอร์ชัน" /></Label>
                <Input id="ml-version" value={rVersion} onChange={(e) => setRVersion(e.target.value)} placeholder="1.0" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ml-algo"><T en="Algorithm" th="อัลกอริทึม" /></Label>
                <Select value={rAlgorithm} onValueChange={setRAlgorithm}>
                  <SelectTrigger id="ml-algo" className="h-10 w-full" aria-label="Algorithm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ALGORITHMS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ml-scope"><T en="Scope dataset (optional)" th="ชุดข้อมูลเป้าหมาย (ไม่บังคับ)" /></Label>
                <Select value={rScope} onValueChange={setRScope}>
                  <SelectTrigger id="ml-scope" className="h-10 w-full" aria-label="Scope dataset"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><T en="All datasets" th="ทุกชุดข้อมูล" /></SelectItem>
                    {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ml-rows"><T en="Training rows" th="จำนวนแถวฝึกฝน" /></Label>
              <Input id="ml-rows" type="number" min={0} value={rRows} onChange={(e) => setRRows(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ml-prec" className="text-xs">Precision</Label>
                <Input id="ml-prec" type="number" step="0.01" min={0} max={1} value={rPrecision} onChange={(e) => setRPrecision(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ml-rec" className="text-xs">Recall</Label>
                <Input id="ml-rec" type="number" step="0.01" min={0} max={1} value={rRecall} onChange={(e) => setRRecall(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ml-f1" className="text-xs">F1</Label>
                <Input id="ml-f1" type="number" step="0.01" min={0} max={1} value={rF1} onChange={(e) => setRF1(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ml-roc" className="text-xs">ROC AUC</Label>
                <Input id="ml-roc" type="number" step="0.01" min={0} max={1} value={rRoc} onChange={(e) => setRRoc(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ml-feat"><T en="Feature importance JSON (optional)" th="Feature importance JSON (ไม่บังคับ)" /></Label>
              <Textarea id="ml-feat" value={rFeatures} onChange={(e) => { setRFeatures(e.target.value); setRFeatureError('') }} className="min-h-[64px] font-mono text-xs" />
              {rFeatureError && <p className="text-xs text-red-700" role="alert">{rFeatureError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[40px]" onClick={() => setRegOpen(false)}><T en="Cancel" th="ยกเลิก" /></Button>
            <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={registering} onClick={register}>
              <Radar className="size-4" aria-hidden /> <T en={registering ? 'Registering…' : 'Register'} th={registering ? 'กำลังลงทะเบียน…' : 'ลงทะเบียน'} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected ? `${selected.name} v${selected.version}` : ''}
        description={lang === 'th' ? 'รายละเอียดโมเดลและการกำกับดูแลวงจรชีวิต' : 'Model detail and lifecycle governance'}
      >
        {selected && (
          <>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <KeyValue kEn="Algorithm" kTh="อัลกอริทึม">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {(() => { const Icon = ALGO_ICON[selected.algorithm] ?? Brain; return <Icon className="size-3.5 text-teal-700" aria-hidden /> })()}
                  {selected.algorithm}
                </span>
              </KeyValue>
              <KeyValue kEn="Stage" kTh="ระยะ"><StatusBadge kind={selected.stage as ModelStage} /></KeyValue>
              <KeyValue kEn="Metrics" kTh="ตัวชี้วัด">
                <span className="font-mono text-xs tabular-nums">
                  P {fmtMetric(selected.metrics?.precision)} · R {fmtMetric(selected.metrics?.recall)} · F1 {fmtMetric(selected.metrics?.f1)} · AUC {fmtMetric(selected.metrics?.rocAuc)}
                </span>
              </KeyValue>
              <KeyValue kEn="Trained" kTh="ฝึกเมื่อ"><span className="text-xs">{fmtDateTime(selected.trainedAt, lang)}</span></KeyValue>
              <KeyValue kEn="Training rows" kTh="แถวฝึกฝน"><span className="text-xs tabular-nums">{fmtNumber(selected.trainingRows, lang)}</span></KeyValue>
              <KeyValue kEn="Active" kTh="ใช้งาน">
                {selected.isActive
                  ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden /><T en="Active champion" th="champion ที่ใช้งาน" /></span>
                  : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3.5" aria-hidden /><T en="Not alerting" th="ไม่ได้ใช้แจ้งเตือน" /></span>}
              </KeyValue>
              <KeyValue kEn="Scope dataset" kTh="ชุดข้อมูลเป้าหมาย"><span className="text-xs">{scopeName(selected.scopeDatasetId)}</span></KeyValue>
              <KeyValue kEn="Registered by" kTh="ผู้ลงทะเบียน"><span className="text-xs">{selected.createdBy} · {fmtDateTime(selected.createdAt, lang)}</span></KeyValue>
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Parameters (JSON)" th="พารามิเตอร์ (JSON)" /></p>
              <pre className="max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-xs edqp-scroll">{JSON.stringify(selected.params ?? {}, null, 2)}</pre>
            </div>

            {(selected.featureImportance?.length ?? 0) > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Feature importance" th="ความสำคัญของคุณลักษณะ" /></p>
                <FeatureBars items={selected.featureImportance.map((f) => ({ feature: f.feature, contribution: f.weight }))} />
              </div>
            )}

            {/* Lifecycle governance */}
            <div className="space-y-3 rounded-lg border border-teal-300 bg-teal-50/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                <ShieldCheck className="size-4" aria-hidden />
                <T en="Lifecycle actions" th="การดำเนินการตามวงจรชีวิต" />
              </p>

              {!canManage ? (
                <p className="text-xs text-teal-900/80"><T en="You need the MANAGE_ML permission to change model stages." th="คุณต้องมีสิทธิ์ MANAGE_ML จึงจะเปลี่ยนระยะของโมเดลได้" /></p>
              ) : selected.stage === 'REGISTERED' && (
                <div className="space-y-2">
                  <p className="text-xs text-teal-900/80"><T en="Validate offline metrics against a labelled baseline, then move to VALIDATED." th="ตรวจสอบตัวชี้วัดออฟไลน์กับ baseline จากนั้นเลื่อนไป VALIDATED" /></p>
                  <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={acting} onClick={() => setStage(selected, 'VALIDATED')}>
                    <T en="Validate" th="ตรวจสอบ" />
                  </Button>
                </div>
              )}

              {canManage && selected.stage === 'VALIDATED' && (
                <div className="space-y-2">
                  <Label htmlFor="shadow-champ"><T en="Champion to shadow (if any)" th="Champion ที่จะ shadow (ถ้ามี)" /></Label>
                  <Select value={championId} onValueChange={setChampionId}>
                    <SelectTrigger id="shadow-champ" className="h-10 w-full" aria-label="Champion model">
                      <SelectValue placeholder={championsForAlgorithm.length ? (lang === 'th' ? 'เลือก champion' : 'Select champion') : (lang === 'th' ? 'ไม่มี champion ในอัลกอริทึมนี้' : 'No promoted champion for this algorithm')} />
                    </SelectTrigger>
                    <SelectContent>
                      {championsForAlgorithm.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} v{m.version}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-violet-900 rounded border border-violet-200 bg-violet-50 p-2">
                    <T
                      en="Shadow period: policy ml.shadowDurationDays (14d). Candidate scores are recorded but NOT used for alerting."
                      th="ช่วง shadow: ตามนโยบาย ml.shadowDurationDays (14 วัน) คะแนนของ candidate จะถูกบันทึกแต่จะไม่ถูกใช้แจ้งเตือน"
                    />
                  </p>
                  <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={acting} onClick={() => setStage(selected, 'SHADOW', championId || undefined)}>
                    <T en="Start shadow" th="เริ่ม shadow" />
                  </Button>
                </div>
              )}

              {canManage && selected.stage === 'SHADOW' && (
                <div className="space-y-3">
                  {selected.shadowOfId ? (
                    <SectionHeading
                      titleEn="Human review — candidate vs champion"
                      titleTh="ทบทวนโดยมนุษย์ — candidate เทียบ champion"
                      hintEn="Compare offline metrics before replacing the alerting champion."
                      hintTh="เปรียบเทียบตัวชี้วัดก่อนเปลี่ยน champion ที่ใช้แจ้งเตือน"
                    />
                  ) : (
                    <p className="flex items-start gap-1.5 text-xs text-amber-900 rounded border border-amber-300 bg-amber-50 p-2">
                      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <T
                        en="Promotion is locked: this shadow run has no champion reference (shadowOfId). Re-enter shadow with a champion to enable promotion."
                        th="การเลื่อนสถานะถูกล็อก: ช่วง shadow นี้ไม่มีข้อมูลอ้างอิง champion (shadowOfId) ให้เริ่ม shadow ใหม่พร้อมระบุ champion เพื่อเปิดให้เลื่อนสถานะ"
                      />
                    </p>
                  )}

                  {champion && (
                    <div className="overflow-x-auto rounded-lg border bg-card">
                      <table className="w-full text-xs">
                        <caption className="sr-only">Candidate vs champion comparison</caption>
                        <thead>
                          <tr className="border-b bg-muted/60">
                            <th scope="col" className="px-2 py-1.5 text-left font-semibold text-muted-foreground"><T en="Metric" th="ตัวชี้วัด" /></th>
                            <th scope="col" className="px-2 py-1.5 text-right font-semibold text-muted-foreground"><T en={`Candidate (${selected.name})`} th={`Candidate (${selected.name})`} /></th>
                            <th scope="col" className="px-2 py-1.5 text-right font-semibold text-muted-foreground"><T en={`Champion (${champion.name})`} th={`Champion (${champion.name})`} /></th>
                            <th scope="col" className="px-2 py-1.5 text-right font-semibold text-muted-foreground"><T en="Δ" th="ผลต่าง" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {([
                            ['Precision', selected.metrics?.precision, champion.metrics?.precision],
                            ['Recall', selected.metrics?.recall, champion.metrics?.recall],
                            ['F1', selected.metrics?.f1, champion.metrics?.f1],
                            ['ROC AUC', selected.metrics?.rocAuc, champion.metrics?.rocAuc],
                          ] as [string, number | undefined, number | undefined][]).map(([label, c, ch]) => (
                            <tr key={label} className="border-b last:border-0">
                              <td className="px-2 py-1.5 font-medium">{label}</td>
                              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMetric(c)}</td>
                              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMetric(ch)}</td>
                              <td className="px-2 py-1.5 text-right">
                                {typeof c === 'number' && typeof ch === 'number' ? <Delta value={c - ch} /> : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-b">
                            <td className="px-2 py-1.5 font-medium"><T en="Top features" th="คุณลักษณะหลัก" /></td>
                            <td className="px-2 py-1.5 font-mono">{selected.featureImportance?.slice(0, 3).map((f) => f.feature).join(', ') || '—'}</td>
                            <td className="px-2 py-1.5 font-mono">{champion.featureImportance?.slice(0, 3).map((f) => f.feature).join(', ') || '—'}</td>
                            <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
                          </tr>
                          <tr className="border-b">
                            <td className="px-2 py-1.5 font-medium"><T en="Training rows" th="แถวฝึกฝน" /></td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(selected.trainingRows, lang)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(champion.trainingRows, lang)}</td>
                            <td className="px-2 py-1.5 text-right">
                              <Delta value={selected.trainingRows - champion.trainingRows} />
                            </td>
                          </tr>
                          <tr>
                            <td className="px-2 py-1.5 font-medium"><T en="Params highlights" th="พารามิเตอร์หลัก" /></td>
                            <td className="px-2 py-1.5 font-mono" colSpan={2}>{paramsHighlights(selected.params)}</td>
                            <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {selected.shadowOfId ? (
                      <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={acting} onClick={() => setPromoteOpen(true)}>
                        <ArrowRightLeft className="size-4" aria-hidden /> <T en="Promote" th="เลื่อนสถานะ" />
                      </Button>
                    ) : (
                      <Button className="min-h-[40px]" disabled aria-disabled>
                        <Lock className="size-4" aria-hidden /> <T en="Promote (locked)" th="เลื่อนสถานะ (ล็อก)" />
                      </Button>
                    )}
                    <Button variant="outline" className="min-h-[40px] border-red-300 text-red-800 hover:bg-red-50" disabled={acting} onClick={() => setStage(selected, 'RETIRED', undefined, 'Candidate rejected and retired (audit-logged)', 'ปฏิเสธ candidate และปลดระวางแล้ว (บันทึกใน audit trail)')}>
                      <T en="Reject candidate" th="ปฏิเสธ candidate" />
                    </Button>
                  </div>
                </div>
              )}

              {canManage && selected.stage === 'PROMOTED' && (
                <div className="space-y-2">
                  <p className="text-xs text-teal-900/80"><T en="This model currently drives alerting. Retiring it stops automated anomaly scoring." th="โมเดลนี้กำลังใช้แจ้งเตือนอยู่ การปลดระวางจะหยุดการให้คะแนนความผิดปกติอัตโนมัติ" /></p>
                  <Button variant="outline" className="min-h-[40px] border-red-300 text-red-800 hover:bg-red-50" disabled={acting} onClick={() => setStage(selected, 'RETIRED', undefined, 'Model retired (audit-logged)', 'ปลดระวางโมเดลแล้ว (บันทึกใน audit trail)')}>
                    <T en="Retire" th="ปลดระวาง" />
                  </Button>
                </div>
              )}

              {selected.stage === 'RETIRED' && (
                <p className="text-xs text-muted-foreground"><T en="Retired models are read-only; they can never be re-promoted. Register a new version instead." th="โมเดลที่ปลดระวางเป็นแบบอ่านอย่างเดียวและเลื่อนสถานะซ้ำไม่ได้ ให้ลงทะเบียนเวอร์ชันใหม่แทน" /></p>
              )}
            </div>
          </>
        )}
      </DetailDrawer>

      {/* Promote confirm */}
      <AlertDialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><T en="Promote candidate to champion?" th="เลื่อน candidate เป็น champion?" /></AlertDialogTitle>
            <AlertDialogDescription>
              <T
                en="This replaces the active champion for alerting. The previous champion is retired automatically. This decision is recorded in the immutable audit trail."
                th="การกระทำนี้จะแทนที่ champion ที่ใช้แจ้งเตือน โดย champion เดิมจะถูกปลดระวางโดยอัตโนมัติ การตัดสินใจนี้ถูกบันทึกใน audit trail แบบไม่แก้ไขได้"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[40px]"><T en="Cancel" th="ยกเลิก" /></AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800"
              disabled={acting}
              onClick={(e) => { e.preventDefault(); if (selected) void setStage(selected, 'PROMOTED') }}
            >
              <ArrowRightLeft className="size-4" aria-hidden /> <T en={acting ? 'Promoting…' : 'Promote'} th={acting ? 'กำลังเลื่อนสถานะ…' : 'เลื่อนสถานะ'} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
