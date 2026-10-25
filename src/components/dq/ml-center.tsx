'use client'

/**
 * ML Center — ศูนย์ ML (v0.28.0)
 * แดชบอร์ดสรุป ML ศูนย์กลาง: ภาพรวม 4 ตัว ML ในหน้าเดียว
 *   ① Anomaly Detection (v0.25.0) · ④ Root Cause Clustering (v0.25.0)
 *   ③ Quality Trend Forecasting (v0.27.0) · ② Risk-based Sampling (v0.26.0)
 * + สุขภาพ ML (คู่กฎ×ชุดข้อมูลพอประเมิน) + แนวโน้มข้ามรอบ 8 batch ล่าสุด
 * + ปรับเกณฑ์ค่าคงที่จากการใช้งานจริง: ฟอร์มรายค่าพร้อมผลกระทบเรียลไทม์จากค่าดิบของ batch ล่าสุด
 *   (บันทึกต้องมีสิทธิ์ REVIEW_SIGNALS ตาม RBAC — ทุกการเปลี่ยนแปลงมี Audit Trail)
 * หลักการล็อก: ML เป็นสัญญาณรอมนุษย์ทบทวน — ปรับเกณฑ์ไม่เปลี่ยนการตัดสินผ่าน/ไม่ผ่านของ validation เดิม
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BrainCircuit,
  History,
  ListChecks,
  Network,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'
import { likelihoodOf } from '@/lib/regulation'
import {
  DEFAULT_ML_SETTINGS,
  TUNABLE_DEFS,
  TUNABLE_GROUPS,
  type MlSettings,
  type MlSettingsKey,
  type TunableDef,
} from '@/lib/ml-settings'

/* ------------------------------- types ----------------------------------- */

interface CenterSummary {
  anomalies: { total: number; critical: number; high: number; medium: number; better: number; normal: number; insufficient: number; drift: number }
  clusters: { total: number; withHypothesis: number; topSharePct: number; topLabel: string | null }
  forecasts: { total: number; worse: number; better: number; stable: number; signals: number; insufficient: number }
  sampling: {
    policy: string
    policyLabel: string
    budgetRows: number
    reviewableRows: number
    includedGroups: number
    totalGroups: number
    riskCoveragePct: number
    createdAt: string
  } | null
}

interface CenterResponse {
  mode: 'BATCH' | 'LATEST_RUNS'
  batchId: string | null
  batchAt: string | null
  settings: MlSettings
  summary: CenterSummary
  health: { pairs: number; evaluated: number; pending: number; evaluatedPct: number; datasets: number }
  trend: Array<{ id: string; at: string; highAnomalies: number; worseForecasts: number; failedRules: number; overallScore: number | null }>
  usage: {
    pairs: number
    zScores: number[]
    windows: number[]
    slopeR2: Array<{ slope: number; r2: number; f1: number | null }>
    shares: number[]
  }
}

interface SettingsResponse {
  settings: MlSettings
  defaults: MlSettings
  isDefault: boolean
  updatedAt: string | null
  updatedBy: string | null
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/* ------------------- ผลกระทบจากข้อมูลจริง (เรียลไทม์ต่อรายค่า) ------------------- */

/**
 * นับผลกระทบของค่าที่กำลังตั้ง (draft) เทียบค่าปัจจุบัน (cur) จาก "ค่าดิบ" ของ batch ล่าสุด
 * zScore/slope/r2/forecast1/sharePct เป็นค่าดิบไม่ขึ้นกับเกณฑ์ — นับใหม่ด้วยเกณฑ์ใดก็ได้ทันที
 */
function impactFor(def: TunableDef, draft: MlSettings, cur: MlSettings, usage: CenterResponse['usage'] | null): string {
  if (!usage || usage.pairs === 0) return 'ยังไม่มีข้อมูลจริง — จะแสดงผลกระทบเมื่อมีการรันตรวจในระบบ'
  const zs = usage.zScores
  const wins = usage.windows
  const sr = usage.slopeR2
  const sh = usage.shares
  const bandOf = (f1: number) => likelihoodOf(f1).level

  switch (def.key) {
    case 'mlWindow': {
      const avg = wins.length > 0 ? (wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(1) : '0'
      return `ประวัติเฉลี่ยของคู่กฎตอนนี้ ${avg} รอบ (จาก ${wins.length} คู่) — หน้าต่างใหม่ใช้ตั้งแต่การประเมินครั้งถัดไป`
    }
    case 'mlMinHistory': {
      const now = wins.filter((w) => w < cur.mlMinHistory).length
      const next = wins.filter((w) => w < draft.mlMinHistory).length
      return `ยังไม่พอประเมิน: ${next}/${wins.length} คู่ (ปัจจุบัน ${now}) — ลดค่า = เริ่มประเมินเร็วขึ้น แต่ baseline อาจยังไม่นิ่ง`
    }
    case 'zCritical': {
      const now = zs.filter((z) => z >= cur.zCritical).length
      const next = zs.filter((z) => z >= draft.zCritical).length
      return `ระดับ "สูงมาก" = ${next} รายการ (ปัจจุบัน ${now}) — กลุ่มนี้จะถูกส่งเข้ากล่องสัญญาณ`
    }
    case 'zHigh': {
      const now = zs.filter((z) => z >= cur.zHigh && z < cur.zCritical).length
      const next = zs.filter((z) => z >= draft.zHigh && z < draft.zCritical).length
      return `ระดับ "สูง" = ${next} รายการ (ปัจจุบัน ${now}) — กลุ่มนี้จะถูกส่งเข้ากล่องสัญญาณเช่นกัน`
    }
    case 'zMedium': {
      const now = zs.filter((z) => z >= cur.zMedium && z < cur.zHigh).length
      const next = zs.filter((z) => z >= draft.zMedium && z < draft.zHigh).length
      return `ระดับ "ปานกลาง" = ${next} รายการ (ปัจจุบัน ${now}) · ต่ำกว่า z เกณฑ์นี้ = ถือว่าปกติ (ไม่แจ้งเตือน)`
    }
    case 'driftR2Min': {
      const now = sr.filter((x) => x.slope > 0 && x.r2 >= cur.driftR2Min).length
      const next = sr.filter((x) => x.slope > 0 && x.r2 >= draft.driftR2Min).length
      return `แนวโน้มแย่ลงที่มีนัยสำคัญ = ${next}/${sr.length} เส้น (ปัจจุบัน ${now}) — มีผลทั้ง drift ของ ① และความเชื่อมั่นของ ③`
    }
    case 'clusterShareMin': {
      const now = sh.filter((x) => x >= cur.clusterShareMin).length
      const next = sh.filter((x) => x >= draft.clusterShareMin).length
      return `กลุ่มที่จะเสนอ "สมมติฐานสาเหตุร่วม" = ${next}/${sh.length} กลุ่ม (ปัจจุบัน ${now})`
    }
    case 'fR2High': {
      const now = sr.filter((x) => x.r2 >= cur.fR2High).length
      const next = sr.filter((x) => x.r2 >= draft.fR2High).length
      return `พยากรณ์ "แม่นยำสูง" = ${next}/${sr.length} เส้น (ปัจจุบัน ${now})`
    }
    case 'fMinSlope': {
      const now = sr.filter((x) => Math.abs(x.slope) >= cur.fMinSlope).length
      const next = sr.filter((x) => Math.abs(x.slope) >= draft.fMinSlope).length
      return `เส้นที่มีทิศทาง = ${next}/${sr.length} (ปัจจุบัน ${now}) — ต่ำกว่าเกณฑ์ถือว่า "ทรงตัว"`
    }
    case 'fMinSignalBand': {
      const passCur = (b: number) => b >= cur.fMinSignalBand
      const passNext = (b: number) => b >= draft.fMinSignalBand
      const now = sr.filter(
        (x) => x.f1 !== null && x.slope >= cur.fMinSlope && x.r2 >= cur.driftR2Min && passCur(bandOf(x.f1 as number)),
      ).length
      const next = sr.filter(
        (x) => x.f1 !== null && x.slope >= draft.fMinSlope && x.r2 >= draft.driftR2Min && passNext(bandOf(x.f1 as number)),
      ).length
      return `สัญญาณล่วงหน้า (ML_FORECAST) = ${next} เส้น (ปัจจุบัน ${now}) — รวมเงื่อนไข แย่ลง + R² ผ่าน + ค่าคาดอยู่แถวโอกาสตามเกณฑ์`
    }
    default:
      return ''
  }
}

/* --------------------------- การ์ดภาพรวมรายตัว ML --------------------------- */

function CenterCard({
  icon: Icon,
  title,
  desc,
  big,
  bigLabel,
  badges,
  footnote,
}: {
  icon: typeof BrainCircuit
  title: string
  desc: string
  big: string
  bigLabel: string
  badges: Array<{ label: string; className: string }>
  footnote: string
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription className="mt-1 text-xs leading-relaxed">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-2">
        <div>
          <p className="font-mono text-3xl font-bold tracking-tight text-slate-900">{big}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{bigLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label={`สรุป ${title}`}>
          {badges.map((b) => (
            <Badge key={b.label} variant="outline" className={`text-[10px] ${b.className}`}>
              {b.label}
            </Badge>
          ))}
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">{footnote}</p>
      </CardContent>
    </Card>
  )
}

/* ================================ หน้าหลัก ================================ */

export default function MlCenter({ active }: { active: boolean }) {
  const { toast } = useToast()
  const [center, setCenter] = useState<CenterResponse | null>(null)
  const [settingsRes, setSettingsRes] = useState<SettingsResponse | null>(null)
  const [draft, setDraft] = useState<MlSettings | null>(null)
  // v0.32.0 — ผู้ดำเนินการปรับเกณฑ์ = ผู้ใช้ปัจจุบันจาก header (identity ศูนย์กลาง)
  const { user, hasPermission } = useCurrentUser()
  const canReview = hasPermission('REVIEW_SIGNALS')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [centerRes, settingsRes] = await Promise.all([
        fetch('/api/dq/ml/center').then((r) => r.json().catch(() => ({}))),
        fetch('/api/dq/ml/settings').then((r) => r.json().catch(() => ({}))),
      ])
      if (centerRes && !centerRes.error) setCenter(centerRes as CenterResponse)
      if (settingsRes && !settingsRes.error) {
        setSettingsRes(settingsRes as SettingsResponse)
        setDraft((settingsRes as SettingsResponse).settings)
      }
    } catch {
      /* error แสดงผ่าน state null + empty state */
    } finally {
      setLoading(false)
    }
  }, [])

  // โหลดเมื่อเปิดหน้า (หน้าคง mounted — โหลดใหม่ทุกครั้งที่กลับมาเพื่อให้ตัวเลขเป็นปัจจุบัน)
  useEffect(() => {
    if (active) void load()
  }, [active, load])

  const cur = settingsRes?.settings ?? DEFAULT_ML_SETTINGS
  const dirty = draft !== null && TUNABLE_DEFS.some((d) => draft[d.key] !== cur[d.key])

  function setNum(key: MlSettingsKey, raw: string) {
    if (raw === '') return
    const v = Number(raw)
    if (Number.isNaN(v)) return
    setDraft((d) => (d ? { ...d, [key]: v } : d))
  }

  async function save(reset: boolean) {
    if (!user) {
      toast({ title: 'กรุณาเลือกผู้ดำเนินการ (ต้องมีสิทธิ์ทบทวนสัญญาณ AI)', variant: 'destructive' })
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/dq/ml/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: user?.email ?? '', reset, values: reset ? undefined : draft }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        settings?: MlSettings
        error?: string
        recomputed?: { anomalies: number; clusters: number; forecasts: number } | null
        recomputeError?: string | null
      }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      toast({
        title: reset ? 'คืนค่าเริ่มต้นของเกณฑ์ ML แล้ว' : 'บันทึกเกณฑ์ ML ใหม่แล้ว',
        description: body.recomputed
          ? `ประเมิน batch ล่าสุดใหม่ทันที: ความผิดปกติ ${body.recomputed.anomalies} · กลุ่มสาเหตุ ${body.recomputed.clusters} · พยากรณ์ ${body.recomputed.forecasts}`
          : body.recomputeError ?? 'จะใช้เกณฑ์ใหม่ตั้งแต่การประเมินครั้งถัดไป',
      })
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'บันทึกเกณฑ์ไม่สำเร็จ'
      setFormError(msg)
      toast({ title: 'บันทึกเกณฑ์ไม่สำเร็จ', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const modeBadge = center ? (
    center.mode === 'BATCH' ? (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
        บันทึกจาก batch ล่าสุด · {fmtTime(center.batchAt)}
      </Badge>
    ) : (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-900">
        โหมดสด — ยังไม่มี batch (ประเมินจากผลรันล่าสุด ไม่บันทึก)
      </Badge>
    )
  ) : null

  const a = center?.summary.anomalies
  const c = center?.summary.clusters
  const f = center?.summary.forecasts
  const sp = center?.summary.sampling
  const maxTrend = center ? Math.max(1, ...center.trend.map((t) => Math.max(t.highAnomalies, t.worseForecasts))) : 1

  return (
    <div className="space-y-6">
      {/* ------------------------------ หัวหน้า ------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <BrainCircuit className="h-4 w-4 text-teal-700" aria-hidden />
                ศูนย์ ML — ภาพรวมระบบ Machine Learning ศูนย์กลาง
              </CardTitle>
              <CardDescription className="mt-1">
                สรุปทั้ง 4 ตัว ML ในหน้าเดียว (① ความผิดปกติข้ามรอบ · ④ สาเหตุร่วม · ③ พยากรณ์แนวโน้ม · ② แผนสุ่มตรวจ)
                พร้อมปรับเกณฑ์ค่าคงที่จากการใช้งานจริง — รายละเอียดเต็มของแต่ละตัวอยู่ที่ แดชบอร์ด &gt; ML · สัญญาณอัจฉริยะ
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" onClick={() => void load()} aria-label="โหลดภาพรวม ML ใหม่">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              โหลดใหม่
            </Button>
          </div>
          {modeBadge && <div className="flex flex-wrap items-center gap-2 pt-1">{modeBadge}</div>}
        </CardHeader>
      </Card>

      {/* --------------------------- ภาพรวม 4 ตัว ML --------------------------- */}
      {loading && !center ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด…</CardContent>
            </Card>
          ))}
        </div>
      ) : (
        center && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="list" aria-label="ภาพรวม 4 ตัว ML">
            {/* ① Anomaly */}
            <div role="listitem" className="contents">
              <CenterCard
                icon={BrainCircuit}
                title="① ความผิดปกติข้ามรอบ"
                desc="เทียบอัตราล้มเหลวรอบปัจจุบันกับ baseline ที่เรียนรู้จากประวัติจริง"
                big={String(a ? a.critical + a.high : 0)}
                bigLabel="รายการระดับสูง/สูงมาก (ส่งเข้ากล่องสัญญาณแล้ว)"
                badges={[
                  { label: `สูงมาก ${a?.critical ?? 0}`, className: 'border-rose-200 bg-rose-50 text-rose-800' },
                  { label: `สูง ${a?.high ?? 0}`, className: 'border-orange-200 bg-orange-50 text-orange-800' },
                  { label: `ปานกลาง ${a?.medium ?? 0}`, className: 'border-amber-200 bg-amber-50 text-amber-900' },
                  ...(a && a.better > 0 ? [{ label: `ดีขึ้นผิดปกติ ${a.better}`, className: 'border-teal-200 bg-teal-50 text-teal-800' }] : []),
                  { label: `แนวโน้มแย่ลง ${a?.drift ?? 0}`, className: 'border-slate-200 bg-slate-50 text-slate-700' },
                ]}
                footnote={`รวม ${a?.total ?? 0} คู่กฎ×ชุดข้อมูล · ยังไม่ประเมิน ${a?.insufficient ?? 0} · ดูรายละเอียด: แดชบอร์ด > ML · สัญญาณอัจฉริยะ`}
              />
            </div>
            {/* ④ Cluster */}
            <div role="listitem" className="contents">
              <CenterCard
                icon={Network}
                title="④ สาเหตุร่วมของรอบ"
                desc="จัดกลุ่มความล้มเหลวด้วยลายเซ็น แหล่งข้อมูล · ชุดข้อมูล · มิติ (exact-match ตรวจย้อนได้)"
                big={String(c?.total ?? 0)}
                bigLabel="กลุ่มลายเซ็นในรอบล่าสุด"
                badges={[
                  { label: `มีสมมติฐาน ${c?.withHypothesis ?? 0}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                  ...(c && c.topSharePct > 0
                    ? [{ label: `ใหญ่สุด ${c.topSharePct.toFixed(0)}%`, className: 'border-rose-200 bg-rose-50 text-rose-800' }]
                    : []),
                ]}
                footnote={c?.topLabel ? `กลุ่มใหญ่สุด: ${c.topLabel} · ดูรายละเอียด: แดชบอร์ด > ML · สัญญาณอัจฉริยะ` : 'ยังไม่มีความล้มเหลวในรอบล่าสุด (ผลดี)'}
              />
            </div>
            {/* ③ Forecast */}
            <div role="listitem" className="contents">
              <CenterCard
                icon={TrendingUp}
                title="③ พยากรณ์แนวโน้ม"
                desc="เส้น linear trend ของอัตราล้มเหลว → คาด 1/3/5 รอบข้างหน้า (สัญญาณล่วงหน้า)"
                big={String(f ? f.worse + f.signals : 0)}
                bigLabel="เส้นที่แนวโน้มแย่ลง (ส่งสัญญาณล่วงหน้าแล้วในวงเล็บ)"
                badges={[
                  { label: `แย่ลง ${f?.worse ?? 0}`, className: 'border-rose-200 bg-rose-50 text-rose-800' },
                  { label: `ดีขึ้น ${f?.better ?? 0}`, className: 'border-teal-200 bg-teal-50 text-teal-800' },
                  { label: `ทรงตัว ${f?.stable ?? 0}`, className: 'border-slate-200 bg-slate-50 text-slate-700' },
                  { label: `สัญญาณ ${f?.signals ?? 0}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                ]}
                footnote={`รวม ${f?.total ?? 0} คู่กฎ×ชุดข้อมูล · ประวัติยังไม่พอ ${f?.insufficient ?? 0} · ดูรายละเอียด: แดชบอร์ด > ML · สัญญาณอัจฉริยะ`}
              />
            </div>
            {/* ② Sampling */}
            <div role="listitem" className="contents">
              <CenterCard
                icon={ListChecks}
                title="② แผนสุ่มตรวจตามความเสี่ยง"
                desc="จัดสรรงบการทบทวนให้กลุ่มความเสี่ยงสูงสุดก่อน (validation ยังตรวจครบทุกแถว)"
                big={sp ? String(sp.budgetRows) : '—'}
                bigLabel={sp ? `แถวทบทวน ตามนโยบาย ${sp.policyLabel}` : 'ยังไม่ได้สร้างแผนสำหรับ batch ล่าสุด'}
                badges={
                  sp
                    ? [
                        { label: `กลุ่ม ${sp.includedGroups}/${sp.totalGroups}`, className: 'border-slate-200 bg-slate-50 text-slate-700' },
                        { label: `ครอบคลุมความเสี่ยง ${sp.riskCoveragePct}%`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                      ]
                    : [{ label: 'สร้างแผนที่ แดชบอร์ด > ML · สัญญาณอัจฉริยะ', className: 'border-amber-200 bg-amber-50 text-amber-900' }]
                }
                footnote={sp ? `ฐานจริง ${sp.reviewableRows} แถว · สร้างเมื่อ ${fmtTime(sp.createdAt)}` : 'แผนถูกสร้างเมื่อผู้มีสิทธิ์กดสร้างเท่านั้น (ไม่สร้างอัตโนมัติ)'}
              />
            </div>
          </div>
        )
      )}

      {/* ------------------------ สุขภาพ ML + แนวโน้มข้ามรอบ ------------------------ */}
      {center && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-teal-700" aria-hidden />
                สุขภาพ ML (จากข้อมูลจริง)
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                คู่กฎ×ชุดข้อมูลที่ ML เริ่มประเมินได้จริง — ครบเมื่อประวัติ ≥ {cur.mlMinHistory} รอบ (เกณฑ์ปัจจุบัน)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex items-end justify-between gap-2">
                  <p className="font-mono text-3xl font-bold tracking-tight text-slate-900">{center.health.evaluatedPct}%</p>
                  <p className="text-xs text-muted-foreground">
                    {center.health.evaluated}/{center.health.pairs} คู่พอประเมิน
                  </p>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`พอประเมิน ${center.health.evaluatedPct}% ของคู่กฎทั้งหมด`}>
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${center.health.evaluatedPct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border bg-slate-50/60 px-2 py-2">
                  <p className="font-mono text-lg font-bold text-slate-900">{center.health.pairs}</p>
                  <p className="text-[10.5px] text-muted-foreground">คู่กฎ×ชุดข้อมูล</p>
                </div>
                <div className="rounded-md border bg-slate-50/60 px-2 py-2">
                  <p className="font-mono text-lg font-bold text-slate-900">{center.health.pending}</p>
                  <p className="text-[10.5px] text-muted-foreground">ยังไม่พอประเมิน</p>
                </div>
                <div className="rounded-md border bg-slate-50/60 px-2 py-2">
                  <p className="font-mono text-lg font-bold text-slate-900">{center.health.datasets}</p>
                  <p className="text-[10.5px] text-muted-foreground">ชุดข้อมูลที่เกี่ยวข้อง</p>
                </div>
              </div>
              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                ยิ่งประวัติรันมากขึ้น ML ยิ่งนิ่งขึ้น — คู่ที่ "ยังไม่พอประเมิน" ระบบแสดงสถานะโปร่งใสแทนการเดา
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-teal-700" aria-hidden />
                แนวโน้มข้ามรอบ (8 batch ล่าสุด)
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                จากผล ML ที่บันทึกไว้จริงราย batch — ความผิดปกติระดับสูง/สูงมาก (①) และพยากรณ์ทิศแย่ลง (③)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {center.trend.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มี batch ในระบบ — รัน validation แล้วกราฟจะเริ่มสะสม</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <caption className="sr-only">ตารางแนวโน้มข้ามรอบของสัญญาณ ML ราย batch</caption>
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th scope="col" className="py-1.5 pe-2 font-medium">รอบ</th>
                        <th scope="col" className="py-1.5 pe-2 font-medium">① สูง/สูงมาก</th>
                        <th scope="col" className="py-1.5 pe-2 font-medium">③ แย่ลง</th>
                        <th scope="col" className="py-1.5 pe-2 font-medium">กฎที่ล้ม</th>
                        <th scope="col" className="py-1.5 font-medium">คะแนนรวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {center.trend.map((t) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="py-1.5 pe-2 whitespace-nowrap text-slate-600">{fmtTime(t.at)}</td>
                          <td className="py-1.5 pe-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 text-right font-mono font-semibold text-rose-700">{t.highAnomalies}</span>
                              <span className="h-1.5 rounded-full bg-rose-400" style={{ width: `${(t.highAnomalies / maxTrend) * 56}px` }} aria-hidden />
                            </div>
                          </td>
                          <td className="py-1.5 pe-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 text-right font-mono font-semibold text-amber-700">{t.worseForecasts}</span>
                              <span className="h-1.5 rounded-full bg-amber-400" style={{ width: `${(t.worseForecasts / maxTrend) * 56}px` }} aria-hidden />
                            </div>
                          </td>
                          <td className="py-1.5 pe-2 font-mono text-slate-700">{t.failedRules}</td>
                          <td className="py-1.5 font-mono text-slate-700">{t.overallScore !== null ? Number(t.overallScore).toFixed(1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* --------------------- ปรับเกณฑ์ค่าคงที่จากการใช้งานจริง --------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-teal-700" aria-hidden />
                ปรับเกณฑ์ค่าคงที่ ML จากการใช้งานจริง
              </CardTitle>
              <CardDescription className="mt-1">
                แต่ละค่าแสดง "ผลกระทบ" คำนวณสดจากค่าดิบของ batch ล่าสุด — ปรับแล้วเห็นตัวเลขเปลี่ยนก่อนบันทึก
                บันทึกแล้วระบบประเมิน batch ล่าสุดใหม่ทันที (ผ่าน/ไม่ผ่านของ validation เดิมไม่ถูกแตะ)
              </CardDescription>
            </div>
            {settingsRes && (
              <Badge variant="outline" className={`shrink-0 text-[10px] ${settingsRes.isDefault ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                {settingsRes.isDefault ? 'ใช้ค่าเริ่มต้นของระบบ' : `ปรับแล้ว · โดย ${settingsRes.updatedBy ?? '—'} · ${fmtTime(settingsRes.updatedAt)}`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!draft ? (
            <p className="py-4 text-center text-sm text-muted-foreground">กำลังโหลดเกณฑ์ปัจจุบัน…</p>
          ) : (
            <>
              {TUNABLE_GROUPS.map((g) => (
                <div key={g.key}>
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">{g.labelTh}</h3>
                    <p className="text-[11px] text-muted-foreground">{g.descTh}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2" role="group" aria-label={g.labelTh}>
                    {TUNABLE_DEFS.filter((d) => d.group === g.key).map((d) => (
                      <div key={d.key} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label htmlFor={`ml-${d.key}`} className="text-xs font-semibold text-slate-800">
                            {d.labelTh}
                          </Label>
                          {draft[d.key] === cur[d.key] ? (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[9.5px] text-slate-500">
                              ค่าเริ่มต้น
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[9.5px] text-amber-900">
                              แก้ไขยังไม่บันทึก
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{d.descTh}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input
                            id={`ml-${d.key}`}
                            type="number"
                            className="h-8 w-24 font-mono text-xs"
                            min={d.min}
                            max={d.max}
                            step={d.step}
                            value={String(draft[d.key])}
                            onChange={(e) => setNum(d.key, e.target.value)}
                            aria-label={`${d.labelTh} (ช่วง ${d.min}–${d.max})`}
                          />
                          <span className="text-[10.5px] text-muted-foreground">
                            ช่วง {d.min}–{d.max}
                            {d.asPercent ? ` · ×100 = ${(draft[d.key] * 100).toFixed(d.step < 0.01 ? 1 : 0)}%` : ''}
                          </span>
                        </div>
                        <p className="mt-2 rounded-md bg-teal-50/60 px-2 py-1.5 text-[11px] leading-relaxed text-teal-900" aria-live="polite">
                          {impactFor(d, draft, cur, center?.usage ?? null)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {formError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
                  {formError}
                </div>
              )}

              {/* บันทึก — ผู้ดำเนินการต้องมีสิทธิ์ REVIEW_SIGNALS (RBAC บังคับทั้งฝั่งจอและเซิร์ฟเวอร์) */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50/60 p-3">
                {/* v0.32.0 — ผู้ดำเนินการ = ผู้ใช้ปัจจุบันจาก header (สิทธิ์ REVIEW_SIGNALS ตรวจที่ API เสมอ) */}
                <div
                  className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground"
                  aria-label="ผู้ดำเนินการปรับเกณฑ์ (ต้องมีสิทธิ์ทบทวนสัญญาณ AI)"
                >
                  <UserRound className="size-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                  <span className="max-w-64 truncate font-medium text-slate-800">{user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลด…'}</span>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${canReview ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    {canReview ? 'มีสิทธิ์ทบทวนสัญญาณ' : 'ไม่มีสิทธิ์ทบทวนสัญญาณ'}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  className="h-9 gap-1 bg-teal-700 text-xs text-white hover:bg-teal-800"
                  disabled={saving || !draft || !dirty}
                  onClick={() => void save(false)}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} aria-hidden />
                  บันทึกเกณฑ์ + ประเมิน batch ล่าสุดใหม่
                </Button>
                <Button size="sm" variant="outline" className="h-9 text-xs" disabled={saving || settingsRes?.isDefault} onClick={() => void save(true)}>
                  คืนค่าเริ่มต้น
                </Button>
                {dirty && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-900">
                    มีการแก้ไขยังไม่บันทึก
                  </Badge>
                )}
              </div>

              {!canReview && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="note">
                  ผู้ใช้ปัจจุบันไม่มีสิทธิ์ทบทวนสัญญาณ AI (REVIEW_SIGNALS) — ดูได้เท่านั้น เปลี่ยนไปใช้บัญชีที่มีสิทธิ์ที่ตัวเลือก “ผู้ใช้งาน” มุมขวาบน หรือมอบสิทธิ์ในหน้าบทบาทและสิทธิ์
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ทุกการบันทึกลง Audit Trail (ผู้บันทึก + เวลา + ค่าที่เปลี่ยน) ตรวจย้อนได้ในหน้าบทบาทและสิทธิ์ ·
                แผนสุ่มตรวจ (②) ที่บันทึกไว้คงเดิมเพราะเก็บปัจจัยตอนสร้าง — กดสร้างแผนใหม่ที่ แดชบอร์ด &gt; ML · สัญญาณอัจฉริยะ เพื่อใช้เกณฑ์ใหม่ ·
                เกณฑ์ที่แสดงคือค่าเดียวกับที่ engine ใช้คำนวณจริง (แหล่งเดียว: ตาราง DqMlSettings + ค่าคงที่ใน <span className="font-mono">src/lib/ml.ts</span> / <span className="font-mono">forecast.ts</span>)
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
