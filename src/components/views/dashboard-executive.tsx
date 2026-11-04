'use client'
// Executive dashboard — answers three leadership questions in one screen:
// (1) Are we improving? (2) Which business units are at risk? (3) What breached SLA?
import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CircleAlert, Minus, ShieldCheck,
  TrendingDown, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api-client'
import { canAccessView } from '@/lib/types'
import type { ExecutiveDashboardDTO } from '@/lib/types'
import { T, useLang, fmtNumber, fmtDateTime, fmtPercent } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { PageShell, SectionHeading, KpiCard, ScoreRing, StatusBadge, DataTable, LoadingState, ErrorState, DeniedState } from '@/components/shared/kit'
import { TrendLine, HBar } from '@/components/shared/charts'
import type { ViewCtx } from '@/components/views/ctx'

const titleCase = (s: string) => s.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase())
/** API may send 0–1 fractions or 0–100 percentages; normalise to 0–100. */
const toPct = (v: number) => (v <= 1 ? v * 100 : v)

export default function DashboardExecutiveView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const [data, setData] = useState<ExecutiveDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string; auditId?: string } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.dashboardExecutive()
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
    en: 'One screen for leadership: overall quality trend, rule coverage, open issues and SLA breaches.',
    th: 'หน้าจอเดียวสำหรับผู้บริหาร: แนวโน้มคุณภาพรวม ความครอบคลุมกฎ ปัญหาค้าง และการละเมิด SLA',
  }
  const guidance = {
    en: 'Answers three questions: (1) Are we improving? — see the 30-day score trend and its delta. (2) Which business units are at risk? — see the unit risk comparison and datasets at risk. (3) What has breached SLA? — see the breach table with hours overdue; click a breach to open the issue list.',
    th: 'ตอบสามคำถาม: (1) เราดีขึ้นหรือไม่ — ดูแนวโน้มคะแนน 30 วัน (2) หน่วยงานใดเสี่ยง — ดูการเปรียบเทียบความเสี่ยงรายหน่วยและชุดข้อมูลที่เสี่ยง (3) อะไรละเมิด SLA — ดูตารางการละเมิดพร้อมชั่วโมงที่เกินกำหนด คลิกเพื่อเปิดรายการปัญหา',
  }

  if (!canAccessView(ctx.user.role, 'dashboard-executive')) {
    return <PageShell objective={objective}><DeniedState resourceEn="the executive dashboard" /></PageShell>
  }
  if (loading) return <PageShell objective={objective} guidance={guidance}><LoadingState rows={6} /></PageShell>
  if (error) return <PageShell objective={objective} guidance={guidance}><ErrorState message={error.message} retry={retry} auditId={error.auditId} /></PageShell>
  if (!data) return null

  const delta = data.delta30d ?? 0
  const improving = delta >= 0

  return (
    <PageShell
      objective={objective}
      guidance={guidance}
      primaryAction={
        <Button onClick={() => ctx.navigate('issues')}>
          <CircleAlert className="size-4" aria-hidden />
          <T en="Open issues" th="เปิดรายการปัญหา" />
        </Button>
      }
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <ScoreRing score={data.overallScore} size={72} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground"><T en="Overall DQ score" th="คะแนนคุณภาพข้อมูลรวม" /></p>
            <p className="mt-1 flex items-center gap-1 text-xs">
              {improving
                ? <TrendingUp className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
                : <TrendingDown className="size-3.5 shrink-0 text-red-700" aria-hidden />}
              <span className={cn('font-medium', improving ? 'text-emerald-700' : 'text-red-700')}>
                {improving ? '+' : '−'}{fmtNumber(Math.abs(delta), lang, { maximumFractionDigits: 1 })}
              </span>
              <span className="sr-only">{improving ? 'improving' : 'declining'}</span>
              <span className="text-muted-foreground"><T en="pts / 30d" th="คะแนน / 30 วัน" /></span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground"><T en="Weighted, coverage-guarded" th="ถ่วงน้ำหนักตามนโยบาย" /></p>
          </div>
        </div>
        <KpiCard
          labelEn="Rule coverage" labelTh="ความครอบคลุมกฎ" icon={ShieldCheck}
          value={fmtPercent(toPct(data.coverage), lang)}
          sub={<T en="CDE rules active vs required" th="กฎ CDE ที่ใช้งานเทียบกับที่กำหนด" />}
          tone={toPct(data.coverage) >= 80 ? 'good' : toPct(data.coverage) >= 60 ? 'warn' : 'bad'}
        />
        <KpiCard
          labelEn="Open issues" labelTh="ปัญหาที่เปิดอยู่" icon={CircleAlert}
          value={fmtNumber(data.openIssues, lang)}
          tone={data.openIssues > 0 ? 'warn' : 'good'}
          sub={<T en="Awaiting resolution" th="รอการแก้ไข" />}
        />
        <KpiCard
          labelEn="SLA breaches" labelTh="การละเมิด SLA" icon={AlertTriangle}
          value={fmtNumber(data.slaBreached, lang)}
          tone={data.slaBreached > 0 ? 'bad' : 'good'}
          sub={data.slaBreached > 0 ? <T en="Immediate attention required" th="ต้องดำเนินการทันที" /> : <T en="No breach — on target" th="ไม่มีการละเมิด — ตามเป้าหมาย" />}
        />
      </div>

      {/* Trend + unit risk */}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.scoreTrend.length >= 2 ? (
          <TrendLine
            points={data.scoreTrend.map((p) => ({ label: p.date?.slice(5) ?? '', value: p.score }))}
            labelEn="Overall DQ score — last 30 days" labelTh="คะแนนคุณภาพรวม — 30 วันล่าสุด"
            unitEn="score" unitTh="คะแนน"
          />
        ) : (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground"><T en="Not enough history for a trend yet." th="ยังมีข้อมูลย้อนหลังไม่พอสำหรับแสดงแนวโน้ม" /></div>
        )}
        <HBar
          points={(data.businessUnitRisk ?? []).map((b) => ({ label: b.unit, value: b.score }))}
          labelEn="Business unit — DQ score (lower = more risk)" labelTh="หน่วยงาน — คะแนนคุณภาพ (ต่ำ = เสี่ยงมาก)"
        />
      </div>

      {/* Dimension scores */}
      <section aria-labelledby="exec-dimensions" className="space-y-2">
        <h2 id="exec-dimensions" className="text-base font-semibold"><T en="Quality dimensions" th="มิติคุณภาพข้อมูล" /></h2>
        <HBar
          points={(data.dimensionScores ?? []).map((d) => ({ label: titleCase(d.dimension), value: toPct(d.rate) }))}
          labelEn="Dimension pass rate (%)" labelTh="อัตราผ่านรายมิติ (%)"
        />
      </section>

      {/* Critical datasets at risk */}
      <section aria-labelledby="exec-datasets" className="space-y-2">
        <SectionHeading
          titleEn="Critical datasets at risk" titleTh="ชุดข้อมูลวิกฤตที่มีความเสี่ยง"
          hintEn="Click a dataset to open its quality detail" hintTh="คลิกชุดข้อมูลเพื่อเปิดรายละเอียดคุณภาพ"
        />
        <DataTable
          caption="Critical datasets at risk with quality score and 7-day trend"
          rows={data.criticalDatasetsAtRisk ?? []}
          rowKey={(r) => r.id}
          density={density}
          onRowClick={(r) => ctx.navigate('dataset-detail', { id: r.id })}
          emptyEn="No critical dataset is below target right now."
          emptyTh="ขณะนี้ไม่มีชุดข้อมูลวิกฤตที่ต่ำกว่าเป้าหมาย"
          columns={[
            { key: 'name', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'domain', headerEn: 'Domain', headerTh: 'โดเมน', render: (r) => r.domain },
            {
              key: 'score', headerEn: 'Score', headerTh: 'คะแนน',
              render: (r) => <span className={cn('font-semibold tabular-nums', r.score >= 85 ? 'text-emerald-700' : r.score >= 70 ? 'text-amber-700' : 'text-red-700')}>{fmtNumber(r.score, lang, { maximumFractionDigits: 1 })}</span>,
            },
            {
              key: 'trend', headerEn: '7-day trend', headerTh: 'แนวโน้ม 7 วัน',
              render: (r) => {
                const up = r.trend7d > 0
                const flat = Math.abs(r.trend7d) < 0.05
                return (
                  <span className={cn('inline-flex items-center gap-1 text-xs font-medium', flat ? 'text-muted-foreground' : up ? 'text-emerald-700' : 'text-red-700')}>
                    {flat ? <Minus className="size-3.5" aria-hidden /> : up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                    {up ? '+' : '−'}{fmtNumber(Math.abs(r.trend7d), lang, { maximumFractionDigits: 1 })}
                    <span className="sr-only">{flat ? 'unchanged' : up ? 'improved' : 'declined'}</span>
                  </span>
                )
              },
            },
          ]}
        />
      </section>

      {/* SLA breaches */}
      <section aria-labelledby="exec-sla" className="space-y-2">
        <SectionHeading
          titleEn="SLA breaches" titleTh="การละเมิด SLA"
          hintEn="Issues past their resolution deadline — click to open the issue list" hintTh="ปัญหาที่เลยกำหนดแก้ไข — คลิกเพื่อเปิดรายการปัญหา"
        />
        <DataTable
          caption="Issues that have breached their SLA, with hours overdue"
          rows={data.slaBreaches ?? []}
          rowKey={(r) => r.key}
          density={density}
          onRowClick={() => ctx.navigate('issues')}
          emptyEn="No SLA breaches — every open issue is within its deadline."
          emptyTh="ไม่มีการละเมิด SLA — ปัญหาที่เปิดอยู่ทั้งหมดอยู่ในกำหนด"
          columns={[
            { key: 'key', headerEn: 'Issue', headerTh: 'รหัสปัญหา', render: (r) => <span className="font-mono text-xs">{r.key}</span> },
            { key: 'title', headerEn: 'Title', headerTh: 'หัวข้อ', render: (r) => <span className="font-medium">{r.title}</span> },
            { key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r) => r.dataset },
            { key: 'severity', headerEn: 'Severity', headerTh: 'ความรุนแรง', render: (r) => <StatusBadge kind={r.severity} /> },
            { key: 'due', headerEn: 'Due at', headerTh: 'กำหนดเสร็จ', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.dueAt, lang)}</span> },
            {
              key: 'overdue', headerEn: 'Hours overdue', headerTh: 'ชั่วโมงที่เกินกำหนด',
              render: (r) => (
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-red-700">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {fmtNumber(r.hoursOverdue, lang, { maximumFractionDigits: 1 })}h
                  <span className="sr-only"><T en="hours overdue" th="ชั่วโมงที่เกินกำหนด" /></span>
                </span>
              ),
            },
          ]}
        />
      </section>
    </PageShell>
  )
}
