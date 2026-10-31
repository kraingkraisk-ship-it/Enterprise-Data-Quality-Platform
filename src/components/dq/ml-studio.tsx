'use client'

/**
 * ML Studio (v0.37.0) — ผู้ช่วย ML ด้วย scikit-learn บนหลัก Train/Test
 * หลักการบนหน้าจอ: ML เป็นผู้ช่วย (Assistant) — ความถูกต้องขึ้นกับ 1) ข้อมูล (Data Asset)
 * 2) DQ Rule (ผู้ติดป้าย) 3) คนสอน (human-in-the-loop)
 * เอนจินเรียนรู้: LogisticRegression (scikit-learn) บนบริการ ml-engine แยกต่างหาก
 * 4 แท็บ: เทรนโมเดล (TRAIN_ML_MODEL) · ผลลัพธ์ ML (REVIEW_SIGNALS) · คลัง label (LABEL_ML_DATA) · สุ่มตรวจ (LABEL_ML_DATA)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BrainCircuit, CheckCircle2, Download, FileUp, FlaskConical, RefreshCw, Sparkles, Tag, TrendingUp, XCircle } from 'lucide-react'
import { useCurrentUser } from '@/components/user-context'
import { hasPermission } from '@/lib/rbac'
import { DIMENSION_KEYS } from '@/lib/dq'

/* ------------------------------- ชนิดข้อมูล -------------------------------- */

interface VersionRow {
  id: string
  version: number
  domainId: string
  domainName: string
  status: string
  trainPct: number
  accuracy: number | null
  precision: number | null
  recall: number | null
  f1: number | null
  trainRows: number
  testRows: number
  assetCount: number
  ruleCount: number
  labelCount: number
  trainedBy: string
  note: string
  createdAt: string
}

interface DomainRow {
  id: string
  name: string
}

interface TrainResultView {
  version: number
  trainRows: number
  testRows: number
  trainPct: number
  assetCount: number
  ruleCount: number
  humanTeachCount: number
  metrics: { accuracy: number | null; precision: number | null; recall: number | null; f1: number | null; rocAuc: number | null }
  engine: { name: string; estimator: string; version: string; featureCount: number }
  notes: string[]
  message: string
}

interface SettingsView {
  trainPct: number
  minTrainRows: number
  minTestRows: number
  confidenceHigh: number
  confidenceMedium: number
  auditSampleSize: number
}

interface LabelRowView {
  id: string
  version: number
  assetName: string
  rowNo: number
  rowData: Record<string, string>
  mlVerdict: string
  mlReason: string
  mlScore: number
  humanFlag: string | null
  humanNote: string
  usedInVersion: number
}

interface AuditRowView {
  id: string
  batchNo: number
  assetName: string
  rowNo: number
  rowData: Record<string, string>
  mlAdvice: string
  mlVerdict: string
  mlScore: number
  humanVerdict: string | null
  humanReason: string
  dimension: string
}

interface RunSummaryView {
  batchId: string
  datasetName: string
  totalRules: number
  passedRules: number
  failedRules: number
  overallScore: number | null
  modelVersion: number | null
  summaryText: string
  dimensionBreakdown: Array<{ dimension: string; dimensionTh: string; failed: number; total: number; passRate: number }>
  commonCauses: Array<{ signature: string; failedRows: number; affectedRules: number; hypothesis: string }>
  advice: string[]
}

interface TrendsView {
  modelVersion: number | null
  repeatRisk: Array<{ assetId: string; assetName: string; confirmedIncorrect: number; note: string }>
  crossDomain: Array<{ dimensionTh: string; domains: string[]; note: string }>
  auditTrend: { batchCount: number; incorrectRate: number | null; slope: number | null; note: string }
}

interface RecommendationView {
  assetName: string
  dataType: string
  modelVersion: number | null
  profile: { nullRate: number; uniqueRate: number; majorityShape: string; p5: number | null; p95: number | null } | null
  recommendations: Array<{ condition: string; th: string; dimensionTh: string; confidence: string; reason: string }>
}

/* ------------------------------ ตัวช่วยเล็ก ๆ ------------------------------- */

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

const VERDICT_BADGE: Record<string, string> = {
  INCORRECT: 'bg-rose-100 text-rose-900 border-rose-200',
  SUSPECT: 'bg-amber-100 text-amber-900 border-amber-200',
  CORRECT: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}
const VERDICT_TH: Record<string, string> = { INCORRECT: 'ไม่ถูกต้อง', SUSPECT: 'ยังไม่แน่ใจ', CORRECT: 'ถูกต้อง' }
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  TRAINED: 'bg-teal-50 text-teal-900 border-teal-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200',
}
const STATUS_TH: Record<string, string> = { ACTIVE: 'กำลังใช้งาน', TRAINED: 'เทรนแล้ว', ARCHIVED: 'เก็บในคลัง' }

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data?.error ?? `คำขอล้มเหลว (${res.status})`)
  return data
}

/* --------------------------------- หน้าจอ ---------------------------------- */

export default function MlStudio({ active }: { active: boolean }) {
  const { user } = useCurrentUser()
  const canTrain = user ? hasPermission(user.role, 'TRAIN_ML_MODEL') : false
  const canLabel = user ? hasPermission(user.role, 'LABEL_ML_DATA') : false
  const canView = user ? hasPermission(user.role, 'REVIEW_SIGNALS') : false

  const defaultTab = canTrain ? 'train' : canLabel ? 'labels' : 'results'
  const [tab, setTab] = useState(defaultTab)
  /** ปรับแท็บเริ่มต้นตามสิทธิ์จริงเมื่อโหลดผู้ใช้เสร็จ (ครั้งเดียว — ผู้ใช้เลือกเองได้หลังจากนั้น) */
  const [tabAdjusted, setTabAdjusted] = useState(false)
  useEffect(() => {
    if (!user || tabAdjusted) return
    setTabAdjusted(true)
    setTab(defaultTab)
  }, [user, canTrain, canLabel, defaultTab, tabAdjusted])

  // ---- ข้อมูลร่วม ----
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [settings, setSettings] = useState<SettingsView | null>(null)

  // ---- แท็บเทรน ----
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [trainDomain, setTrainDomain] = useState('')
  const [trainPct, setTrainPct] = useState(70)
  const [trainNote, setTrainNote] = useState('')
  const [training, setTraining] = useState(false)
  const [trainResult, setTrainResult] = useState<TrainResultView | null>(null)
  const [trainError, setTrainError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // ---- แท็บผลลัพธ์ ----
  const [summary, setSummary] = useState<RunSummaryView | null>(null)
  const [trends, setTrends] = useState<TrendsView | null>(null)
  const [assets, setAssets] = useState<Array<{ id: string; name: string }>>([])
  const [recAsset, setRecAsset] = useState('')
  const [recColumn, setRecColumn] = useState('')
  const [assetColumns, setAssetColumns] = useState<Array<{ name: string; dataType: string }>>([])
  const [recs, setRecs] = useState<RecommendationView | null>(null)
  const [recLoading, setRecLoading] = useState(false)

  // ---- แท็บคลัง label ----
  const [labels, setLabels] = useState<LabelRowView[]>([])
  const [labelStats, setLabelStats] = useState<{ unflagged: number; confirmed: number; overridden: number } | null>(null)
  const [labelFilter, setLabelFilter] = useState('unflagged')
  const [labelNote, setLabelNote] = useState<Record<string, string>>({})
  const [labelBusy, setLabelBusy] = useState<string | null>(null)

  // ---- แท็บสุ่มตรวจ ----
  const [auditRows, setAuditRows] = useState<AuditRowView[]>([])
  const [auditBatch, setAuditBatch] = useState(0)
  const [auditStats, setAuditStats] = useState<{ total: number; audited: number; remaining: number; incorrect: number } | null>(null)
  const [auditDomain, setAuditDomain] = useState('')
  const [auditSize, setAuditSize] = useState(20)
  const [auditBusy, setAuditBusy] = useState(false)
  const [auditVerdict, setAuditVerdict] = useState<Record<string, string>>({})
  const [auditReason, setAuditReason] = useState<Record<string, string>>({})
  const [auditDimension, setAuditDimension] = useState<Record<string, string>>({})
  const [auditMsg, setAuditMsg] = useState<string | null>(null)

  /* ------------------------------ โหลดข้อมูล ------------------------------- */

  const loadCore = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([fetch('/api/domains').then((r) => r.json()), jsonFetch<{ settings: SettingsView }>('/api/ml/settings')])
      setDomains(Array.isArray(d?.domains) ? d.domains.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : [])
      setSettings(s.settings)
      setTrainPct((prev) => (prev === 70 && s.settings ? s.settings.trainPct : prev))
      setAuditSize((prev) => (prev === 20 && s.settings ? s.settings.auditSampleSize : prev))
    } catch {
      /* โหลดไม่สำเร็จ — แสดงค่าว่าง */
    }
  }, [])

  const loadVersions = useCallback(async () => {
    try {
      const data = await jsonFetch<{ versions: VersionRow[] }>('/api/ml/versions')
      setVersions(data.versions)
    } catch {
      setVersions([])
    }
  }, [])

  const loadLabels = useCallback(async () => {
    try {
      const data = await jsonFetch<{ rows: LabelRowView[]; stats: { unflagged: number; confirmed: number; overridden: number } }>(
        `/api/ml/labels?flag=${labelFilter}&take=100`,
      )
      setLabels(data.rows)
      setLabelStats(data.stats)
    } catch {
      setLabels([])
    }
  }, [labelFilter])

  const loadAudit = useCallback(async () => {
    try {
      const data = await jsonFetch<{ batchNo: number; rows: AuditRowView[]; stats: { total: number; audited: number; remaining: number; incorrect: number } | null }>(
        '/api/ml/audit-samples',
      )
      setAuditBatch(data.batchNo)
      setAuditRows(data.rows ?? [])
      setAuditStats(data.stats)
    } catch {
      setAuditRows([])
    }
  }, [])

  const loadResults = useCallback(async () => {
    try {
      const [s, t, a] = await Promise.all([
        jsonFetch<{ summary: RunSummaryView | null }>('/api/ml/run-summary'),
        jsonFetch<TrendsView>('/api/ml/trends'),
        fetch('/api/assets').then((r) => r.json()),
      ])
      setSummary(s.summary)
      setTrends(t)
      setAssets(
        (Array.isArray(a?.assets) ? a.assets : [])
          .filter((x: { status?: string }) => (x.status ?? 'ACTIVE') === 'ACTIVE')
          .map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })),
      )
    } catch {
      /* แสดงค่าว่าง */
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void loadCore()
  }, [active, loadCore])

  useEffect(() => {
    if (!active) return
    if (tab === 'train') void loadVersions()
    else if (tab === 'results') void loadResults()
    else if (tab === 'labels') void loadLabels()
    else if (tab === 'audit') void loadAudit()
  }, [active, tab, loadVersions, loadResults, loadLabels, loadAudit])

  /* ------------------------------ การกระทำ -------------------------------- */

  const doTrain = async () => {
    setTraining(true)
    setTrainError(null)
    setTrainResult(null)
    try {
      const result = await jsonFetch<TrainResultView>('/api/ml/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: user?.email, domainId: trainDomain, trainPct, note: trainNote }),
      })
      setTrainResult(result)
      await loadVersions()
    } catch (e) {
      setTrainError(e instanceof Error ? e.message : 'เทรนไม่สำเร็จ')
    } finally {
      setTraining(false)
    }
  }

  const doVersionAction = async (id: string, action: 'ACTIVATE' | 'ARCHIVE') => {
    try {
      await jsonFetch(`/api/ml/versions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, operatorEmail: user?.email }),
      })
      await loadVersions()
    } catch (e) {
      setTrainError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ')
    }
  }

  const doDeleteVersion = async (id: string) => {
    try {
      await jsonFetch(`/api/ml/versions/${id}`, { method: 'DELETE' })
      await loadVersions()
    } catch (e) {
      setTrainError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    }
  }

  const doExport = async (id: string) => {
    try {
      const res = await fetch(`/api/ml/export?versionId=${id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'ส่งออกไม่สำเร็จ')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'model.dqmmodel'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setTrainError(e instanceof Error ? e.message : 'ส่งออกไม่สำเร็จ')
    }
  }

  const doImport = async (file: File) => {
    setImporting(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const data = await jsonFetch<{ version: number }>('/api/ml/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: text, operatorEmail: user?.email }),
      })
      setImportMsg(`นำเข้าสำเร็จ — เป็นเวอร์ชัน v${data.version} (สถานะ TRAINED รอตั้งใช้งาน)`)
      await loadVersions()
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  const doFlag = async (id: string, humanFlag: 'CONFIRMED' | 'OVERRIDDEN') => {
    setLabelBusy(id)
    try {
      await jsonFetch(`/api/ml/labels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanFlag, note: labelNote[id] ?? '', operatorEmail: user?.email }),
      })
      await loadLabels()
    } catch {
      /* คงสถานะเดิม */
    } finally {
      setLabelBusy(null)
    }
  }

  const doCreateAuditBatch = async () => {
    setAuditBusy(true)
    setAuditMsg(null)
    try {
      const data = await jsonFetch<{ batchNo: number; created: number; modelVersion: number | null }>('/api/ml/audit-samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: user?.email, domainId: auditDomain, size: auditSize }),
      })
      setAuditMsg(`สร้างรอบที่ ${data.batchNo} แล้ว — สุ่มได้ ${data.created} แถว${data.modelVersion ? ` (คำแนะนำจากโมเดล v${data.modelVersion})` : ' (ยังไม่มีโมเดล — ตัดสินเองได้เลย)'}`)
      await loadAudit()
    } catch (e) {
      setAuditMsg(e instanceof Error ? e.message : 'สร้างรอบสุ่มไม่สำเร็จ')
    } finally {
      setAuditBusy(false)
    }
  }

  const doAuditVerdict = async (id: string, humanVerdict: 'CORRECT' | 'INCORRECT') => {
    setAuditBusy(true)
    try {
      await jsonFetch(`/api/ml/audit-samples/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          humanVerdict,
          reason: auditReason[id] ?? '',
          dimension: humanVerdict === 'INCORRECT' ? auditDimension[id] ?? '' : '',
          operatorEmail: user?.email,
        }),
      })
      await loadAudit()
    } catch (e) {
      setAuditMsg(e instanceof Error ? e.message : 'บันทึกคำตัดสินไม่สำเร็จ')
    } finally {
      setAuditBusy(false)
    }
  }

  const loadAssetColumns = async (assetId: string) => {
    setRecAsset(assetId)
    setRecColumn('')
    setRecs(null)
    setAssetColumns([])
    if (!assetId) return
    try {
      const data = await fetch(`/api/assets/${assetId}?pageSize=5`).then((r) => r.json())
      setAssetColumns(Array.isArray(data?.asset?.columns) ? data.asset.columns.map((c: { name: string; dataType: string }) => c) : Array.isArray(data?.columns) ? data.columns : [])
    } catch {
      /* แสดงค่าว่าง */
    }
  }

  const doRecommend = async () => {
    if (!recAsset || !recColumn) return
    setRecLoading(true)
    try {
      const data = await jsonFetch<RecommendationView>(`/api/ml/recommend-rules?assetId=${recAsset}&column=${encodeURIComponent(recColumn)}`)
      setRecs(data)
    } catch {
      setRecs(null)
    } finally {
      setRecLoading(false)
    }
  }

  /* --------------------------------- render -------------------------------- */

  const activeVersion = useMemo(() => versions.find((v) => v.status === 'ACTIVE'), [versions])

  const tabItems = useMemo(() => {
    const items: Array<{ value: string; label: string; show: boolean }> = [
      { value: 'train', label: 'เทรนโมเดล', show: canTrain },
      { value: 'results', label: 'ผลลัพธ์ ML', show: canView || canTrain },
      { value: 'labels', label: 'คลัง label', show: canLabel },
      { value: 'audit', label: 'สุ่มตรวจ', show: canLabel },
    ]
    return items.filter((i) => i.show)
  }, [canTrain, canLabel, canView])

  if (!canTrain && !canLabel && !canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="size-5 text-teal-700" aria-hidden="true" /> ML Studio
            </CardTitle>
            <CardDescription>ผู้ช่วย ML ด้วย scikit-learn (LogisticRegression) บนหลัก Train/Test — เทรนจากข้อมูลจริง + กฎ DQ + คนสอน</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">บทบาทของคุณยังไม่มีสิทธิ์เข้าถึง ML Studio — ผู้ที่เห็นได้: เจ้าของข้อมูล · ผู้ดูแลข้อมูล · ผู้ดูแลระบบ (เทรน/label) และบทบาทที่มีสิทธิ์ทบทวนผล ML (ดูผล)</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      {/* หัวหน้า + หลักการ */}
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          <BrainCircuit className="size-6 text-teal-700" aria-hidden="true" /> ML Studio
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">v0.37.0 · scikit-learn</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          ML เป็น<strong className="text-slate-800">ผู้ช่วย (Assistant)</strong>เท่านั้น — ความถูกต้องและความแม่นยำขึ้นอยู่กับการเทรน 3 อย่าง:{' '}
          <strong className="text-slate-800">1) ข้อมูล (Data Asset)</strong> · <strong className="text-slate-800">2) DQ Rule (ผู้ติดป้าย — บอกว่าไม่ถูกต้องเพราะอะไร)</strong> ·{' '}
          <strong className="text-slate-800">3) คนสอน</strong> (ยืนยัน/แก้คำตัดสิน แล้วเทรนซ้ำให้แม่นขึ้น)
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {tabItems.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ============================ แท็บ 1: เทรนโมเดล ============================ */}
        {canTrain && (
          <TabsContent value="train" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* ฟอร์มเทรน */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                    <FlaskConical className="size-4 text-teal-700" aria-hidden="true" /> เทรนโมเดลใหม่
                  </CardTitle>
                  <CardDescription>
                    ชุดฝึก = ข้อมูลจริงจาก Data Asset ของโดเมน · ผู้ติดป้าย = กฎ DQ ทุกข้อ · แบ่งแถวตาม % เพื่อวัดความแม่นยำบนชุดทดสอบ
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">ขอบเขตโดเมน</span>
                      <Select value={trainDomain || 'ALL'} onValueChange={(v) => setTrainDomain(v === 'ALL' ? '' : v)}>
                        <SelectTrigger aria-label="เลือกโดเมน">
                          <SelectValue placeholder="เลือกโดเมน" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">ทุกโดเมน (รวมทั้งระบบ)</SelectItem>
                          {domains.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">แยกโมเดลรายโดเมน — โดเมนไหนข้อมูลมาก เทรนบ่อย แม่นขึ้น</span>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-slate-700">% ชุดฝึก (Train %)</span>
                      <Input
                        type="number"
                        min={30}
                        max={90}
                        value={trainPct}
                        onChange={(e) => setTrainPct(Number(e.target.value))}
                        aria-label="เปอร์เซ็นต์ชุดฝึก"
                      />
                      <span className="text-xs text-muted-foreground">
                        แบ่งรายแถว — ฝึก {trainPct}% / ทดสอบ {100 - trainPct}% (ชุดทดสอบใช้วัดความแม่นยำจริง)
                      </span>
                    </label>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">บันทึกหมายเหตุ (ไม่บังคับ)</span>
                    <Input value={trainNote} onChange={(e) => setTrainNote(e.target.value)} placeholder="เช่น เทรนครั้งแรกหลังเพิ่มกฎ NOT_NULL" aria-label="หมายเหตุการเทรน" />
                  </label>
                  <Button onClick={doTrain} disabled={training} className="w-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto">
                    {training ? 'กำลังเทรน…' : 'เริ่มเทรนโมเดล'}
                  </Button>
                  {trainError && (
                    <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900 [overflow-wrap:anywhere]">
                      {trainError}
                    </p>
                  )}
                  {trainResult && (
                    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                      <p className="font-semibold text-emerald-900">{trainResult.message}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <div className="rounded bg-white p-2 text-center">
                          <p className="text-xs text-muted-foreground">Accuracy</p>
                          <p className="text-sm font-bold text-slate-900">{pct(trainResult.metrics.accuracy)}</p>
                        </div>
                        <div className="rounded bg-white p-2 text-center">
                          <p className="text-xs text-muted-foreground">Precision</p>
                          <p className="text-sm font-bold text-slate-900">{pct(trainResult.metrics.precision)}</p>
                        </div>
                        <div className="rounded bg-white p-2 text-center">
                          <p className="text-xs text-muted-foreground">Recall</p>
                          <p className="text-sm font-bold text-slate-900">{pct(trainResult.metrics.recall)}</p>
                        </div>
                        <div className="rounded bg-white p-2 text-center">
                          <p className="text-xs text-muted-foreground">F1</p>
                          <p className="text-sm font-bold text-slate-900">{pct(trainResult.metrics.f1)}</p>
                        </div>
                        <div className="rounded bg-white p-2 text-center">
                          <p className="text-xs text-muted-foreground">ROC-AUC</p>
                          <p className="text-sm font-bold text-slate-900">{pct(trainResult.metrics.rocAuc)}</p>
                        </div>
                      </div>
                      <p className="text-xs font-medium text-emerald-900">
                        เอนจิน: {trainResult.engine.name} ({trainResult.engine.estimator}) เวอร์ชัน {trainResult.engine.version} · คุณลักษณะ {trainResult.engine.featureCount} รายการ
                      </p>
                      <p className="text-xs text-emerald-900">
                        ชุดฝึก {trainResult.trainRows} แถว · ทดสอบ {trainResult.testRows} แถว · กฎผู้ติดป้าย {trainResult.ruleCount} ข้อ · ข้อมูลสอนจากคน {trainResult.humanTeachCount}
                      </p>
                      {trainResult.notes.length > 0 && (
                        <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-700">
                          {trainResult.notes.map((n, i) => (
                            <li key={i} className="[overflow-wrap:anywhere]">
                              {n}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-muted-foreground">ตั้งเวอร์ชันนี้เป็น "กำลังใช้งาน" ได้จากตารางด้านล่าง</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* เกณฑ์ + import */}
              <div className="space-y-4">
                {settings && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base text-slate-900">เกณฑ์ปัจจุบัน (ตั้งได้จากแบบฟอร์มเทรน + สุ่มตรวจ)</CardTitle>
                      <CardDescription>แบ่งชุดฝึกเริ่มต้น {settings.trainPct}% · ขั้นต่ำชุดฝึก {settings.minTrainRows} แถว · ขั้นต่ำชุดทดสอบ {settings.minTestRows} แถว · สุ่มตรวจรอบละ {settings.auditSampleSize} แถว</CardDescription>
                    </CardHeader>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                      <FileUp className="size-4 text-teal-700" aria-hidden="true" /> นำเข้าโมเดล (.dqmmodel)
                    </CardTitle>
                    <CardDescription>
                      ไฟล์สำรองมีเฉพาะพารามิเตอร์ + สถิติรวม — <strong className="text-slate-800">ไม่มีข้อมูลดิบ ไม่มี PII</strong> · ตรวจ checksum ก่อนนำเข้าเสมอ
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Input
                      type="file"
                      accept=".dqmmodel,.json"
                      disabled={importing}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void doImport(f)
                        e.target.value = ''
                      }}
                      aria-label="เลือกไฟล์โมเดล .dqmmodel"
                    />
                    {importing && <p className="text-sm text-muted-foreground">กำลังนำเข้า…</p>}
                    {importMsg && (
                      <p className="rounded-md border border-teal-200 bg-teal-50 p-2 text-sm text-teal-900 [overflow-wrap:anywhere]">{importMsg}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ตารางเวอร์ชัน */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-slate-900">เวอร์ชันโมเดลทั้งหมด</CardTitle>
                <CardDescription>
                  ทุกการเทรน = เวอร์ชันใหม่ · คุณภาพวัดจากชุดทดสอบ (แถวที่โมเดลไม่เคยเห็น) · ACTIVE ได้ 1 เวอร์ชันต่อโดเมน
                </CardDescription>
              </CardHeader>
              <CardContent>
                {versions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีเวอร์ชันโมเดล — เทรนครั้งแรกจากแบบฟอร์มด้านบน</p>
                ) : (
                  <div className="max-h-96 overflow-auto rounded-lg border" style={{ scrollbarWidth: 'thin' }}>
                    <table className="w-full min-w-[860px] text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">เวอร์ชัน</th>
                          <th className="px-3 py-2">โดเมน</th>
                          <th className="px-3 py-2">สถานะ</th>
                          <th className="px-3 py-2">Train%</th>
                          <th className="px-3 py-2">Accuracy</th>
                          <th className="px-3 py-2">Precision</th>
                          <th className="px-3 py-2">Recall</th>
                          <th className="px-3 py-2">ข้อมูล</th>
                          <th className="px-3 py-2">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {versions.map((v) => (
                          <tr key={v.id} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2 font-semibold text-slate-900">v{v.version}</td>
                            <td className="px-3 py-2 text-slate-700 [overflow-wrap:anywhere]">{v.domainName}</td>
                            <td className="px-3 py-2">
                              <Badge className={`${STATUS_BADGE[v.status] ?? ''} border`}>{STATUS_TH[v.status] ?? v.status}</Badge>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{v.trainPct}%</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{pct(v.accuracy)}</td>
                            <td className="px-3 py-2 text-slate-700">{pct(v.precision)}</td>
                            <td className="px-3 py-2 text-slate-700">{pct(v.recall)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              ฝึก {v.trainRows} / ทดสอบ {v.testRows} · asset {v.assetCount} · กฎ {v.ruleCount} · สอน {v.labelCount}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {v.status !== 'ACTIVE' && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => doVersionAction(v.id, 'ACTIVATE')}>
                                    ใช้งาน
                                  </Button>
                                )}
                                {v.status === 'ACTIVE' && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => doVersionAction(v.id, 'ARCHIVE')}>
                                    เก็บเข้าคลัง
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => doExport(v.id)} aria-label={`ส่งออกเวอร์ชัน v${v.version}`}>
                                  <Download className="size-3" aria-hidden="true" /> export
                                </Button>
                                {v.status !== 'ACTIVE' && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-rose-700 hover:bg-rose-50" onClick={() => doDeleteVersion(v.id)} aria-label={`ลบเวอร์ชัน v${v.version}`}>
                                    ลบ
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {activeVersion && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    โมเดลที่กำลังใช้งาน: v{activeVersion.version} ({activeVersion.domainName}) — แนะนำกฎ/สรุปหลังตรวจ/คำแนะนำสุ่มตรวจ อ้างอิงจากเวอร์ชันนี้
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============================ แท็บ 2: ผลลัพธ์ ML ============================ */}
        {(canView || canTrain) && (
          <TabsContent value="results" className="mt-4 space-y-4">
            {/* B2 สรุปหลังตรวจ */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base text-slate-900">
                  <span>สรุปหลังตรวจ (รอบล่าสุด)</span>
                  <Button size="sm" variant="outline" onClick={() => void loadResults()} aria-label="รีเฟรชผลลัพธ์">
                    <RefreshCw className="size-3.5" aria-hidden="true" /> รีเฟรช
                  </Button>
                </CardTitle>
                <CardDescription>สรุปความผิดปกติ + ขั้นตอนถัดไปที่แนะนำ — เสนอแนะเท่านั้น ไม่ตัดสินแทนคะแนนกฎ</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!summary ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีรอบรัน — รัน validation ก่อน แล้วกลับมาดูสรุปที่นี่</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-800 [overflow-wrap:anywhere]">
                      <strong>{summary.datasetName}</strong> — {summary.summaryText} · คะแนนรวม {summary.overallScore !== null ? summary.overallScore.toFixed(1) : '—'}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">ความผิดปกติรายมิติ</p>
                        <ul className="space-y-1 text-sm">
                          {summary.dimensionBreakdown.slice(0, 5).map((d) => (
                            <li key={d.dimension} className="flex items-center justify-between gap-2">
                              <span className="text-slate-700">{d.dimensionTh}</span>
                              <span className={d.failed > 0 ? 'font-medium text-rose-700' : 'text-emerald-700'}>
                                {d.failed}/{d.total} ไม่ผ่าน ({pct(d.passRate)} ผ่าน)
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">สาเหตุร่วม (อธิบายว่าทำไมข้อมูลไม่ถูกต้อง)</p>
                        {summary.commonCauses.length === 0 ? (
                          <p className="text-sm text-emerald-700">รอบนี้ไม่มีความล้มเหลว — ไม่พบสาเหตุร่วม</p>
                        ) : (
                          <ul className="space-y-1.5 text-sm">
                            {summary.commonCauses.map((c) => (
                              <li key={c.signature} className="[overflow-wrap:anywhere]">
                                <span className="font-medium text-slate-800">{c.signature}</span> — {c.hypothesis}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">ขั้นตอนถัดไปที่แนะนำ</p>
                      <ul className="list-inside list-disc space-y-1 text-sm text-amber-900">
                        {summary.advice.map((a, i) => (
                          <li key={i} className="[overflow-wrap:anywhere]">
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* แนวโน้ม */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                    <TrendingUp className="size-4 text-teal-700" aria-hidden="true" /> แนวโน้ม: ความเสี่ยงผิดซ้ำ
                  </CardTitle>
                  <CardDescription>ข้อมูลที่เคย "ไม่ถูกต้อง" และผู้สอนยืนยันแล้ว — มีโอกาสกลับมาผิดซ้ำ ควรกำกับต่อเนื่อง</CardDescription>
                </CardHeader>
                <CardContent>
                  {!trends || trends.repeatRisk.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล — ผลจะมาจากคลัง label ที่มนุษย์ยืนยัน + การสุ่มตรวจ</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {trends.repeatRisk.map((r) => (
                        <li key={r.assetId} className="rounded-lg border p-2 [overflow-wrap:anywhere]">
                          <p className="font-medium text-slate-900">
                            {r.assetName} — ยืนยันแล้ว {r.confirmedIncorrect} แถว
                          </p>
                          <p className="text-xs text-muted-foreground">{r.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">แนวโน้ม: ความอ่อนร่วมข้ามโดเมน + จากการสอน</CardTitle>
                  <CardDescription>โดเมนที่มีมิติอ่อนเหมือนกัน น่าจะมีสาเหตุร่วมระดับกระบวนการ</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {trends && trends.crossDomain.length > 0 ? (
                    trends.crossDomain.map((c, i) => (
                      <p key={i} className="rounded-lg border p-2 text-slate-800 [overflow-wrap:anywhere]">
                        <strong>{c.dimensionTh}</strong>: {c.domains.join(' · ')} — {c.note}
                      </p>
                    ))
                  ) : (
                    <p className="text-muted-foreground">ยังไม่พบความอ่อนร่วมข้ามโดเมน</p>
                  )}
                  {trends && (
                    <p className="rounded-lg border border-teal-200 bg-teal-50 p-2 text-teal-900 [overflow-wrap:anywhere]">
                      สุ่มตรวจ {trends.auditTrend.batchCount} รอบ — {trends.auditTrend.note}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* B1 แนะนำกฎ */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-slate-900">แนะนำกฎสำหรับคอลัมน์ (ใช้คู่ Rule Builder ได้)</CardTitle>
                <CardDescription>เลือก Data Asset + คอลัมน์ → ระบบแนะนำเงื่อนไขที่ควรใช้ตามชนิดข้อมูล + 9 มิติ + สิ่งที่โมเดลเรียนรู้</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">Data Asset</span>
                    <Select value={recAsset} onValueChange={(v) => void loadAssetColumns(v)}>
                      <SelectTrigger aria-label="เลือก Data Asset">
                        <SelectValue placeholder="เลือก Asset" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {assets.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">คอลัมน์</span>
                    <Select value={recColumn} onValueChange={setRecColumn} disabled={!recAsset}>
                      <SelectTrigger aria-label="เลือกคอลัมน์">
                        <SelectValue placeholder={recAsset ? 'เลือกคอลัมน์' : 'เลือก Asset ก่อน'} />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {assetColumns.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name} ({c.dataType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="flex items-end">
                    <Button onClick={doRecommend} disabled={!recAsset || !recColumn || recLoading} className="w-full bg-teal-700 text-white hover:bg-teal-800">
                      {recLoading ? 'กำลังวิเคราะห์…' : 'ขอคำแนะนำ'}
                    </Button>
                  </div>
                </div>
                {recs && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {recs.assetName} · ชนิดข้อมูล {recs.dataType}
                      {recs.modelVersion ? ` · อ้างอิงโมเดล v${recs.modelVersion}` : ' · (ยังไม่มีโมเดล ACTIVE — แนะนำจากหลักชนิดข้อมูลล้วน)'}
                      {recs.profile ? ` · ค่าว่าง ${pct(recs.profile.nullRate)} · ไม่ซ้ำ ${pct(recs.profile.uniqueRate)}` : ''}
                    </p>
                    <ul className="grid gap-2 md:grid-cols-2">
                      {recs.recommendations.map((r, i) => (
                        <li key={i} className="rounded-lg border p-2.5 text-sm [overflow-wrap:anywhere]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">{r.condition !== '—' ? r.condition : 'ประวัติจากการเทรน'}</span>
                            <Badge
                              className={
                                r.confidence === 'HIGH'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : r.confidence === 'MEDIUM'
                                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                              }
                            >
                              {r.confidence === 'HIGH' ? 'แนะนำแรง' : r.confidence === 'MEDIUM' ? 'แนะนำ' : 'พิจารณาเพิ่ม'}
                            </Badge>
                          </div>
                          <p className="text-slate-700">{r.th}</p>
                          <p className="text-xs text-muted-foreground">{r.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============================ แท็บ 3: คลัง label ============================ */}
        {canLabel && (
          <TabsContent value="labels" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-slate-900">
                  <span className="flex items-center gap-2">
                    <Tag className="size-4 text-teal-700" aria-hidden="true" /> คลัง label — ตรวจคำตัดสินของ ML
                  </span>
                  {labelStats && (
                    <span className="flex gap-1.5 text-xs">
                      <Badge className="border-amber-200 bg-amber-50 text-amber-900">รอตรวจ {labelStats.unflagged}</Badge>
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">ยืนยันแล้ว {labelStats.confirmed}</Badge>
                      <Badge className="border-rose-100 bg-rose-50 text-rose-800">แก้คำตัดสิน {labelStats.overridden}</Badge>
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  ยืนยัน (CONFIRMED) = เห็นด้วยกับ ML · แก้คำตัดสิน (OVERRIDDEN) = รู้จริงว่า ML ตัดสินพลาด — ทั้งคู่จะถูกใช้ "สอน" ในการเทรนถัดไปให้แม่นขึ้น
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={labelFilter} onValueChange={setLabelFilter}>
                    <SelectTrigger className="w-56" aria-label="กรองสถานะ label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unflagged">รอตรวจ</SelectItem>
                      <SelectItem value="CONFIRMED">ยืนยันแล้ว</SelectItem>
                      <SelectItem value="OVERRIDDEN">แก้คำตัดสินแล้ว</SelectItem>
                      <SelectItem value="all">ทั้งหมด</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => void loadLabels()} aria-label="รีเฟรชคลัง label">
                    <RefreshCw className="size-3.5" aria-hidden="true" /> รีเฟรช
                  </Button>
                </div>
                {labels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {labelFilter === 'unflagged' ? 'ไม่มี label รอตรวจ — เทรนโมเดลก่อนเพื่อสร้าง label จากชุดทดสอบ' : 'ไม่มีรายการตามเงื่อนไขกรอง'}
                  </p>
                ) : (
                  <div className="max-h-[28rem] space-y-3 overflow-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {labels.map((item) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge className={`${VERDICT_BADGE[item.mlVerdict] ?? ''} border`}>{VERDICT_TH[item.mlVerdict] ?? item.mlVerdict}</Badge>
                            <span className="font-medium text-slate-900 [overflow-wrap:anywhere]">{item.assetName}</span>
                            <span className="text-xs text-muted-foreground">แถว {item.rowNo} · โมเดล v{item.version} · ความเชื่อมั่น {pct(item.mlScore)}</span>
                            {item.humanFlag && (
                              <Badge className={item.humanFlag === 'CONFIRMED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}>
                                {item.humanFlag === 'CONFIRMED' ? 'ยืนยันแล้ว' : 'แก้คำตัดสินแล้ว'}
                                {item.usedInVersion > 0 ? ` · ใช้เทรน v${item.usedInVersion}` : ' · รอใช้เทรน'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {item.mlReason && (
                          <p className="mt-1.5 text-sm text-slate-700 [overflow-wrap:anywhere]">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">ML บอกว่า: </span>
                            {item.mlReason}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                          {Object.entries(item.rowData)
                            .slice(0, 8)
                            .map(([col, val]) => (
                              <span key={col} className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-700 [overflow-wrap:anywhere] ring-1 ring-slate-200">
                                <span className="text-slate-400">{col}:</span> {val === '' ? <em className="text-slate-400">ค่าว่าง</em> : val}
                              </span>
                            ))}
                        </div>
                        {!item.humanFlag && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Input
                              className="h-8 min-w-48 flex-1 text-sm"
                              placeholder="หมายเหตุ (ไม่บังคับ)"
                              value={labelNote[item.id] ?? ''}
                              onChange={(e) => setLabelNote((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              aria-label={`หมายเหตุสำหรับ ${item.assetName} แถว ${item.rowNo}`}
                            />
                            <Button
                              size="sm"
                              className="h-8 bg-emerald-700 text-white hover:bg-emerald-800"
                              disabled={labelBusy === item.id}
                              onClick={() => doFlag(item.id, 'CONFIRMED')}
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden="true" /> ยืนยัน
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-rose-200 text-rose-700 hover:bg-rose-50"
                              disabled={labelBusy === item.id}
                              onClick={() => doFlag(item.id, 'OVERRIDDEN')}
                            >
                              <XCircle className="size-3.5" aria-hidden="true" /> แก้คำตัดสิน
                            </Button>
                          </div>
                        )}
                        {item.humanNote && <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">หมายเหตุ: {item.humanNote}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============================ แท็บ 4: สุ่มตรวจ ============================ */}
        {canLabel && (
          <TabsContent value="audit" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-slate-900">
                  <span>สุ่มตรวจ — มนุษย์ตัดสิน ML แนะนำ</span>
                  {auditStats && (
                    <span className="flex gap-1.5 text-xs">
                      <Badge className="border-slate-200 bg-slate-50 text-slate-700">รอบ {auditBatch} · {auditStats.total} แถว</Badge>
                      <Badge className="border-amber-200 bg-amber-50 text-amber-900">รอตัดสิน {auditStats.remaining}</Badge>
                      <Badge className="border-rose-100 bg-rose-50 text-rose-800">ไม่ถูกต้อง {auditStats.incorrect}</Badge>
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  สุ่มแถวจาก Data Asset ให้คุณตัดสินด้วยตา — ML แนะนำเป็นข้อมูลประกอบ (ถ้ามีโมเดล ACTIVE) · คำตัดสินของคุณ = ความจริงที่สอนโมเดล
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">โดเมนที่สุ่ม</span>
                    <Select value={auditDomain || 'ALL'} onValueChange={(v) => setAuditDomain(v === 'ALL' ? '' : v)}>
                      <SelectTrigger aria-label="เลือกโดเมนที่สุ่ม">
                        <SelectValue placeholder="ทุกโดเมน" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ทุกโดเมน</SelectItem>
                        {domains.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700">จำนวนแถวต่อรอบ</span>
                    <Input type="number" min={5} max={100} value={auditSize} onChange={(e) => setAuditSize(Number(e.target.value))} aria-label="จำนวนแถวต่อรอบสุ่ม" />
                  </label>
                  <div className="flex items-end">
                    <Button onClick={doCreateAuditBatch} disabled={auditBusy} className="w-full bg-teal-700 text-white hover:bg-teal-800">
                      {auditBusy ? 'กำลังสุ่ม…' : 'เริ่มรอบสุ่มใหม่'}
                    </Button>
                  </div>
                </div>
                {auditMsg && (
                  <p className="rounded-md border border-teal-200 bg-teal-50 p-2 text-sm text-teal-900 [overflow-wrap:anywhere]">{auditMsg}</p>
                )}
                {auditRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีรอบสุ่มตรวจ — กด "เริ่มรอบสุ่มใหม่" เพื่อเริ่มสอนโมเดล</p>
                ) : (
                  <div className="max-h-[28rem] space-y-3 overflow-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {auditRows.map((row) => (
                      <div key={row.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-slate-900 [overflow-wrap:anywhere]">{row.assetName}</span>
                          <span className="text-xs text-muted-foreground">แถว {row.rowNo}</span>
                          {row.mlVerdict && <Badge className={`${VERDICT_BADGE[row.mlVerdict] ?? ''} border`}>ML แนะนำ: {VERDICT_TH[row.mlVerdict] ?? row.mlVerdict}</Badge>}
                          {row.humanVerdict && (
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                              คุณตัดสิน: {row.humanVerdict === 'INCORRECT' ? 'ไม่ถูกต้อง' : 'ถูกต้อง'}
                            </Badge>
                          )}
                        </div>
                        {row.mlAdvice && <p className="mt-1 text-xs text-slate-600 [overflow-wrap:anywhere]">คำแนะนำ ML: {row.mlAdvice}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                          {Object.entries(row.rowData)
                            .slice(0, 8)
                            .map(([col, val]) => (
                              <span key={col} className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-700 [overflow-wrap:anywhere] ring-1 ring-slate-200">
                                <span className="text-slate-400">{col}:</span> {val === '' ? <em className="text-slate-400">ค่าว่าง</em> : val}
                              </span>
                            ))}
                        </div>
                        {!row.humanVerdict && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Select value={auditVerdict[row.id] ?? ''} onValueChange={(v) => setAuditVerdict((prev) => ({ ...prev, [row.id]: v }))}>
                                <SelectTrigger className="w-44" aria-label={`ตัดสิน ${row.assetName} แถว ${row.rowNo}`}>
                                  <SelectValue placeholder="ตัดสินแถวนี้" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CORRECT">ถูกต้อง</SelectItem>
                                  <SelectItem value="INCORRECT">ไม่ถูกต้อง</SelectItem>
                                </SelectContent>
                              </Select>
                              {(auditVerdict[row.id] ?? '') === 'INCORRECT' && (
                                <Select value={auditDimension[row.id] ?? ''} onValueChange={(v) => setAuditDimension((prev) => ({ ...prev, [row.id]: v }))}>
                                  <SelectTrigger className="w-52" aria-label="เลือกมิติที่เกี่ยว">
                                    <SelectValue placeholder="มิติที่เกี่ยว (ไม่บังคับ)" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-64">
                                    {DIMENSION_KEYS.map((d) => (
                                      <SelectItem key={d} value={d}>
                                        {d}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                className="h-8 min-w-48 flex-1 text-sm"
                                placeholder="เหตุผลที่คุณตัดสิน (แนะนำให้กรอก — เป็นข้อมูลสอน)"
                                value={auditReason[row.id] ?? ''}
                                onChange={(e) => setAuditReason((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                aria-label={`เหตุผลสำหรับ ${row.assetName} แถว ${row.rowNo}`}
                              />
                              <Button
                                size="sm"
                                className="h-8 bg-emerald-700 text-white hover:bg-emerald-800"
                                disabled={auditBusy || !(auditVerdict[row.id] ?? '')}
                                onClick={() => doAuditVerdict(row.id, 'CORRECT')}
                              >
                                ถูกต้อง
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-rose-200 text-rose-700 hover:bg-rose-50"
                                disabled={auditBusy || !(auditVerdict[row.id] ?? '')}
                                onClick={() => doAuditVerdict(row.id, 'INCORRECT')}
                              >
                                ไม่ถูกต้อง
                              </Button>
                            </div>
                          </div>
                        )}
                        {row.humanVerdict && row.humanReason && <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">เหตุผล: {row.humanReason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <footer className="border-t pt-3 text-xs text-muted-foreground">
        หลักการเดียวทั้งระบบ: ML เป็นผู้ช่วย — เทรนจากข้อมูลจริง (Data Asset) + กฎ DQ ทุกข้อ (ผู้ติดป้าย) + คนสอน (คลัง label / สุ่มตรวจ) ·
        ข้อมูลเทรนอยู่ในระบบแยกตามโดเมน · export/import เฉพาะพารามิเตอร์ (ไม่มีข้อมูลดิบ/PII)
      </footer>
    </div>
  )
}
