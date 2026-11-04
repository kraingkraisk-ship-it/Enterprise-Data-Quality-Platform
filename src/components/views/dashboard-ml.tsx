'use client'
// ML Monitoring dashboard — model lifecycle, detection trend, shadow comparisons.
// Every ML surface carries the mandatory ML disclaimer.
import React, { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Bot, Brain, CircleAlert, Minus, Radar, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api-client'
import { canAccessView } from '@/lib/types'
import type { MlDashboardDTO } from '@/lib/types'
import { T, useLang, fmtNumber, fmtDateTime } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import { PageShell, SectionHeading, KpiCard, StatusBadge, DataTable, LoadingState, ErrorState, DeniedState, MlDisclaimer } from '@/components/shared/kit'
import { TrendLine } from '@/components/shared/charts'
import type { ViewCtx } from '@/components/views/ctx'

type BadgeKindOf = Parameters<typeof StatusBadge>[0]['kind']
const asKind = (s: string): BadgeKindOf => s as BadgeKindOf
const prettyType = (s: string) => s.toLowerCase().replaceAll('_', ' ')

/** Signed metric delta with arrow icon + text (never colour alone). */
function DeltaCell({ value, digits = 3 }: { value: number | null | undefined; digits?: number }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const better = value > 0.0005
  const worse = value < -0.0005
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium tabular-nums', better ? 'text-emerald-700' : worse ? 'text-red-700' : 'text-muted-foreground')}>
      {better ? <ArrowUpRight className="size-3.5" aria-hidden /> : worse ? <ArrowDownRight className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
      {value > 0 ? '+' : ''}{value.toFixed(digits)}
      <span className="sr-only">{better ? 'better than champion' : worse ? 'worse than champion' : 'equal to champion'}</span>
    </span>
  )
}

export default function DashboardMlView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const [data, setData] = useState<MlDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string; auditId?: string } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.dashboardMl()
      .then((d) => { if (!cancelled) { setData(d); setError(null); setLoading(false) } })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError({ message: e instanceof Error ? e.message : undefined, auditId: e instanceof ApiError ? e.auditId : undefined })
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [tick])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setTick((t) => t + 1)
  }, [])

  const objective = {
    en: 'Monitor ML detection: model lifecycle stages, open anomalies and shadow-vs-champion comparisons.',
    th: 'ติดตามการตรวจจับด้วย ML: รอบชีวิตโมเดล ความผิดปกติที่เปิดอยู่ และการเปรียบเทียบ shadow กับ champion',
  }
  const guidance = {
    en: 'Shadow candidates run beside the champion without touching decisions — compare metric deltas before promotion. All detections are signals that require human review; the platform never modifies source data automatically.',
    th: 'โมเดล shadow ทำงานเคียงข้าง champion โดยไม่กระทบการตัดสินใจ — เปรียบเทียบค่าเมตริกก่อน promote ทุกการตรวจจับเป็นเพียงสัญญาณที่ต้องมีมนุษย์ทบทวน ระบบจะไม่แก้ไขข้อมูลต้นทางโดยอัตโนมัติ',
  }

  if (!canAccessView(ctx.user.role, 'dashboard-ml')) {
    return <PageShell objective={objective}><DeniedState resourceEn="the ML monitoring dashboard" /></PageShell>
  }
  if (loading) return <PageShell objective={objective} guidance={guidance}><LoadingState rows={6} /></PageShell>
  if (error) return <PageShell objective={objective} guidance={guidance}><ErrorState message={error.message} retry={retry} auditId={error.auditId} /></PageShell>
  if (!data) return null

  const models = data.models ?? []
  const openTotal = (data.anomalyStats ?? []).reduce((a, b) => a + (b.open ?? 0), 0)
  const pendingTotal = (data.anomalyStats ?? []).reduce((a, b) => a + (b.pendingReview ?? 0), 0)
  const stageCounts = ['PROMOTED', 'SHADOW', 'VALIDATED', 'REGISTERED']
    .map((st) => ({ st, n: models.filter((m) => m.stage === st).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.st} ${x.n}`)
    .join(' · ')

  return (
    <PageShell objective={objective} guidance={guidance}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          labelEn="Models by stage" labelTh="โมเดลแยกตามรอบชีวิต" icon={Bot}
          value={fmtNumber(models.length, lang)}
          sub={stageCounts || <T en="No models registered" th="ยังไม่มีโมเดลลงทะเบียน" />}
        />
        <KpiCard
          labelEn="Open anomalies" labelTh="ความผิดปกติที่เปิดอยู่" icon={Radar}
          value={fmtNumber(openTotal, lang)}
          tone={openTotal > 0 ? 'warn' : 'good'}
          sub={<T en="Awaiting triage across all detectors" th="รอคัดกรองจากทุกตัวตรวจจับ" />}
        />
        <KpiCard
          labelEn="Pending review" labelTh="รอการทบทวน" icon={CircleAlert}
          value={fmtNumber(pendingTotal, lang)}
          tone={pendingTotal > 0 ? 'bad' : 'good'}
          sub={<T en="Human review required before action" th="ต้องมีมนุษย์ทบทวนก่อนดำเนินการ" />}
        />
      </div>

      {/* ML disclaimer — mandatory at the top of the ML section */}
      <MlDisclaimer />

      {/* Detection trend */}
      {(data.detectionTrend?.length ?? 0) >= 2 ? (
        <TrendLine
          points={(data.detectionTrend ?? []).map((p) => ({ label: p.date?.slice(5) ?? '', value: p.count }))}
          labelEn="Detections per day" labelTh="การตรวจจับต่อวัน"
          unitEn="detections" unitTh="รายการ"
        />
      ) : (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground"><T en="Not enough detection history for a trend yet." th="ยังมีประวัติการตรวจจับไม่พอสำหรับแสดงแนวโน้ม" /></div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Shadow comparisons */}
        <section aria-labelledby="ml-shadow" className="space-y-2">
          <SectionHeading titleEn="Shadow vs champion" titleTh="เปรียบเทียบ Shadow กับ Champion" hintEn="Metric deltas are candidate − champion on the same held-out data" hintTh="ค่าเมตริกคือ candidate − champion บนข้อมูลทดสอบชุดเดียวกัน" />
          <DataTable
            caption="Shadow model comparisons against the champion"
            rows={data.shadowComparisons ?? []}
            rowKey={(r) => `${r.candidate}-${r.champion}`}
            density={density}
            emptyEn="No shadow models are currently being compared."
            emptyTh="ขณะนี้ไม่มีโมเดล shadow ที่กำลังเปรียบเทียบ"
            columns={[
              {
                key: 'candidate', headerEn: 'Candidate', headerTh: 'ผู้ท้าชิง',
                render: (r) => (
                  <span className="flex items-center gap-1.5">
                    <Brain className="size-4 shrink-0 text-violet-700" aria-hidden />
                    <span className="max-w-[180px] truncate font-medium" title={r.candidate}>{r.candidate}</span>
                  </span>
                ),
              },
              { key: 'champion', headerEn: 'Champion', headerTh: 'แชมป์', render: (r) => <span className="max-w-[160px] truncate text-xs text-muted-foreground" title={r.champion}>{r.champion}</span> },
              { key: 'precision', headerEn: 'Δ Precision', headerTh: 'Δ ความแม่นยำ', render: (r) => <DeltaCell value={r.precisionDelta} /> },
              { key: 'recall', headerEn: 'Δ Recall', headerTh: 'Δ ความครบถ้วน', render: (r) => <DeltaCell value={r.recallDelta} /> },
              { key: 'f1', headerEn: 'Δ F1', headerTh: 'Δ F1', render: (r) => <DeltaCell value={r.f1Delta} /> },
            ]}
          />
        </section>

        {/* Open anomalies by detector */}
        <section aria-labelledby="ml-anomalies" className="space-y-2">
          <SectionHeading titleEn="Anomalies by detector" titleTh="ความผิดปกติตามตัวตรวจจับ" hintEn="Click to open the anomaly review queue" hintTh="คลิกเพื่อเปิดคิวทบทวนความผิดปกติ" />
          <DataTable
            caption="Open and pending-review anomaly counts by detector type"
            rows={data.anomalyStats ?? []}
            rowKey={(r) => r.type}
            density={density}
            onRowClick={() => ctx.navigate('anomalies')}
            emptyEn="No anomalies recorded for any detector."
            emptyTh="ไม่มีบันทึกความผิดปกติจากตัวตรวจจับใด ๆ"
            columns={[
              { key: 'type', headerEn: 'Detector type', headerTh: 'ประเภทตัวตรวจจับ', render: (r) => <span className="font-medium capitalize">{prettyType(r.type)}</span> },
              { key: 'open', headerEn: 'Open', headerTh: 'เปิดอยู่', render: (r) => <span className="tabular-nums">{fmtNumber(r.open, lang)}</span> },
              {
                key: 'pending', headerEn: 'Pending review', headerTh: 'รอทบทวน',
                render: (r) => <span className={cn('tabular-nums', r.pendingReview > 0 ? 'font-medium text-amber-700' : 'text-muted-foreground')}>{fmtNumber(r.pendingReview, lang)}</span>,
              },
            ]}
          />
        </section>
      </div>

      {/* Models */}
      <section aria-labelledby="ml-models" className="space-y-2">
        <SectionHeading titleEn="Registered models" titleTh="โมเดลที่ลงทะเบียน" hintEn="Lifecycle stages: REGISTERED → VALIDATED → SHADOW → PROMOTED — click to manage models" hintTh="รอบชีวิต: REGISTERED → VALIDATED → SHADOW → PROMOTED — คลิกเพื่อจัดการโมเดล" />
        <DataTable
          caption="ML models with lifecycle stage and activity status"
          rows={models}
          rowKey={(m) => m.id}
          density={density}
          onRowClick={() => ctx.navigate('ml-models')}
          emptyEn="No models registered yet."
          emptyTh="ยังไม่มีโมเดลที่ลงทะเบียน"
          columns={[
            { key: 'name', headerEn: 'Model', headerTh: 'โมเดล', render: (m) => <span className="font-medium">{m.name}</span> },
            { key: 'version', headerEn: 'Version', headerTh: 'เวอร์ชัน', render: (m) => <span className="font-mono text-xs">{m.version}</span> },
            { key: 'algorithm', headerEn: 'Algorithm', headerTh: 'อัลกอริทึม', render: (m) => <span className="text-xs text-muted-foreground">{m.algorithm}</span> },
            { key: 'stage', headerEn: 'Stage', headerTh: 'ระยะ', render: (m) => <StatusBadge kind={asKind(m.stage)} /> },
            {
              key: 'active', headerEn: 'Active', headerTh: 'ใช้งาน',
              render: (m) => m.isActive ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><ShieldCheck className="size-3.5" aria-hidden /><T en="Active" th="ใช้งาน" /></span>
              ) : (
                <span className="text-xs text-muted-foreground"><T en="Inactive" th="ไม่ใช้งาน" /></span>
              ),
            },
            { key: 'trained', headerEn: 'Trained at', headerTh: 'ฝึกเมื่อ', render: (m) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(m.trainedAt, lang)}</span> },
          ]}
        />
      </section>
    </PageShell>
  )
}
