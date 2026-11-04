'use client'
// Operational dashboard — the daily cockpit for stewards and engineers:
// what needs action now, what is late, what drifted, what is failing.
import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, Gauge, ListChecks, Loader2, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api-client'
import { canAccessView } from '@/lib/types'
import type { OperationalDashboardDTO } from '@/lib/types'
import { T, useLang, fmtNumber, fmtDateTime, fmtPercent } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import { PageShell, SectionHeading, KpiCard, StatusBadge, DataTable, LoadingState, ErrorState, DeniedState } from '@/components/shared/kit'
import type { ViewCtx } from '@/components/views/ctx'

type BadgeKindOf = Parameters<typeof StatusBadge>[0]['kind']
const asKind = (s: string): BadgeKindOf => s as BadgeKindOf
const toPct = (v: number) => (v <= 1 ? v * 100 : v)

export default function DashboardOperationalView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const [data, setData] = useState<OperationalDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string; auditId?: string } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.dashboardOperational()
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
    en: 'Daily operations cockpit: datasets that need action, late data, schema drift and failing rules.',
    th: 'ห้องปฏิบัติการประจำวัน: ชุดข้อมูลที่ต้องดำเนินการ ข้อมูลล่าช้า schema drift และกฎที่ล้มเหลว',
  }
  const guidance = {
    en: 'Work top-down: "Needs action now" lists datasets with the lowest scores; late data and schema drift usually need the data owner; failing rules link to the rule book. Queue depth with a DLQ badge means jobs have exhausted retries.',
    th: 'ทำงานจากบนลงล่าง: "ต้องดำเนินการทันที" แสดงชุดข้อมูลที่คะแนนต่ำสุด ข้อมูลล่าช้าและ schema drift มักต้องให้เจ้าของข้อมูลดำเนินการ กฎที่ล้มเหลวเชื่อมไปยังคู่มือกฎ ถ้าคิวงานมีป้าย DLQ แปลว่ามีงานที่ลองใหม่ครบจำนวนครั้งแล้ว',
  }

  if (!canAccessView(ctx.user.role, 'dashboard-operational')) {
    return <PageShell objective={objective}><DeniedState resourceEn="the operational dashboard" /></PageShell>
  }
  if (loading) return <PageShell objective={objective} guidance={guidance}><LoadingState rows={6} /></PageShell>
  if (error) return <PageShell objective={objective} guidance={guidance}><ErrorState message={error.message} retry={retry} auditId={error.auditId} /></PageShell>
  if (!data) return null

  const k = data.kpis
  const canOpenAdmin = canAccessView(ctx.user.role, 'administration')

  return (
    <PageShell objective={objective} guidance={guidance}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard labelEn="Active rules" labelTh="กฎที่ใช้งานอยู่" icon={ListChecks} value={fmtNumber(k.activeRules, lang)} sub={<T en="Enabled across all datasets" th="เปิดใช้งานในทุกชุดข้อมูล" />} />
        <KpiCard labelEn="Runs (24h)" labelTh="การรัน (24 ชม.)" icon={PlayCircle} value={fmtNumber(k.runs24h, lang)} sub={<T en="Scheduled and manual triggers" th="ตามกำหนดเวลาและสั่งเอง" />} />
        <KpiCard
          labelEn="Pass rate (24h)" labelTh="อัตราผ่าน (24 ชม.)" icon={Gauge}
          value={fmtPercent(toPct(k.passRate24h), lang)}
          tone={toPct(k.passRate24h) >= 95 ? 'good' : toPct(k.passRate24h) >= 85 ? 'warn' : 'bad'}
          sub={<T en="Rule results passed in the last 24 hours" th="ผลกฎที่ผ่านใน 24 ชั่วโมงล่าสุด" />}
        />
        <KpiCard
          labelEn="Queue depth" labelTh="ความลึกคิวงาน" icon={Loader2}
          value={fmtNumber(k.queueDepth, lang)}
          tone={k.queueDepth > 10 ? 'warn' : 'neutral'}
          sub={
            k.dlqCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-red-700">
                <AlertTriangle className="size-3.5" aria-hidden />
                <T en={`DLQ: ${fmtNumber(k.dlqCount, lang)} dead job(s)`} th={`DLQ: ${fmtNumber(k.dlqCount, lang)} งานล้มเหลวถาวร`} />
              </span>
            ) : (
              <T en={`Avg duration ${fmtNumber(k.avgDurationMs, lang, { maximumFractionDigits: 0 })} ms`} th={`ระยะเวลาเฉลี่ย ${fmtNumber(k.avgDurationMs, lang, { maximumFractionDigits: 0 })} มส.`} />
            )
          }
        />
      </div>

      {/* Needs action now */}
      <section aria-labelledby="ops-action" className="space-y-2">
        <SectionHeading titleEn="Needs action now" titleTh="ต้องดำเนินการทันที" hintEn="Lowest-scoring datasets first — click to open the dataset" hintTh="เรียงจากคะแนนต่ำสุด — คลิกเพื่อเปิดชุดข้อมูล" />
        <DataTable
          caption="Datasets with the lowest quality scores that need action"
          rows={data.datasetsNeedingAction ?? []}
          rowKey={(r) => r.id}
          density={density}
          onRowClick={(r) => ctx.navigate('dataset-detail', { id: r.id })}
          emptyEn="Every dataset is at or above its score target."
          emptyTh="ชุดข้อมูลทุกชุดอยู่ที่หรือเหนือเป้าคะแนน"
          columns={[
            { key: 'name', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r) => <span className="font-medium">{r.name}</span> },
            {
              key: 'score', headerEn: 'Score', headerTh: 'คะแนน',
              render: (r) => <span className={cn('font-semibold tabular-nums', r.score >= 85 ? 'text-emerald-700' : r.score >= 70 ? 'text-amber-700' : 'text-red-700')}>{fmtNumber(r.score, lang, { maximumFractionDigits: 1 })}</span>,
            },
            {
              key: 'failed', headerEn: 'Failed rules', headerTh: 'กฎที่ล้มเหลว',
              render: (r) => (
                <span className={cn('tabular-nums', r.failedRules > 0 ? 'font-medium text-red-700' : 'text-muted-foreground')}>
                  {fmtNumber(r.failedRules, lang)}
                </span>
              ),
            },
            { key: 'lastRun', headerEn: 'Last run', headerTh: 'รันล่าสุด', render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.lastRunAt, lang)}</span> },
          ]}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Late data */}
        <section aria-labelledby="ops-late" className="space-y-2">
          <SectionHeading titleEn="Late data" titleTh="ข้อมูลล่าช้า" hintEn="Refreshed later than the dataset SLA allows" hintTh="รับข้อมูลช้ากว่า SLA ที่กำหนด" />
          <DataTable
            caption="Datasets refreshed later than their SLA"
            rows={data.lateDatasets ?? []}
            rowKey={(r) => r.id}
            density={density}
            onRowClick={(r) => ctx.navigate('dataset-detail', { id: r.id })}
            emptyEn="All datasets arrived within their SLA window."
            emptyTh="ข้อมูลทุกชุดมาภายในกรอบเวลา SLA"
            columns={[
              { key: 'name', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'sla', headerEn: 'SLA', headerTh: 'SLA', render: (r) => <span className="whitespace-nowrap tabular-nums text-xs">{fmtNumber(r.slaHours, lang)}h</span> },
              {
                key: 'late', headerEn: 'Delay', headerTh: 'ความล่าช้า',
                render: (r) => (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-red-700">
                    <Clock className="size-3.5" aria-hidden />
                    {fmtNumber(r.hoursLate, lang, { maximumFractionDigits: 1 })}h
                    <span className="sr-only"><T en="hours late" th="ชั่วโมงที่ล่าช้า" /></span>
                  </span>
                ),
              },
            ]}
          />
        </section>

        {/* Failed rules */}
        <section aria-labelledby="ops-failed" className="space-y-2">
          <SectionHeading titleEn="Failing rules" titleTh="กฎที่ล้มเหลว" hintEn="Latest run results with the lowest pass rates — click to open the rule book" hintTh="ผลรันล่าสุดที่อัตราผ่านต่ำสุด — คลิกเพื่อเปิดคู่มือกฎ" />
          <DataTable
            caption="Rules with the lowest pass rates in their latest run"
            rows={data.failedRules ?? []}
            rowKey={(r) => r.ruleCode}
            density={density}
            onRowClick={() => ctx.navigate('rules')}
            emptyEn="No rule failed its latest run — well done."
            emptyTh="ไม่มีกฎล้มเหลวในการรันล่าสุด"
            columns={[
              { key: 'code', headerEn: 'Code', headerTh: 'รหัส', render: (r) => <span className="font-mono text-xs">{r.ruleCode}</span> },
              { key: 'name', headerEn: 'Rule', headerTh: 'ชื่อกฎ', render: (r) => <span className="font-medium">{r.ruleName}</span> },
              { key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r) => r.dataset },
              { key: 'pass', headerEn: 'Pass rate', headerTh: 'อัตราผ่าน', render: (r) => <span className="tabular-nums text-red-700">{fmtPercent(toPct(r.passRate), lang)}</span> },
              { key: 'rows', headerEn: 'Failed rows', headerTh: 'แถวที่ล้มเหลว', render: (r) => <span className="tabular-nums">{fmtNumber(r.failedRows, lang)}</span> },
            ]}
          />
        </section>
      </div>

      {/* Schema drift */}
      <section aria-labelledby="ops-drift" className="space-y-2">
        <SectionHeading titleEn="Schema drift" titleTh="การเลื่อนโครงสร้าง (Schema drift)" hintEn="Column structure changes detected by profiling — click to open anomalies" hintTh="ตรวจพบการเปลี่ยนแปลงโครงสร้างคอลัมน์ — คลิกเพื่อเปิดรายการความผิดปกติ" />
        <DataTable
          caption="Detected schema drift events"
          rows={data.schemaDrifts ?? []}
          rowKey={(r) => r.anomalyId || r.id}
          density={density}
          onRowClick={() => ctx.navigate('anomalies')}
          emptyEn="No schema drift detected in recent profiles."
          emptyTh="ไม่พบ schema drift ในการวิเคราะห์ล่าสุด"
          columns={[
            { key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (r) => <span className="font-medium">{r.dataset}</span> },
            { key: 'column', headerEn: 'Column', headerTh: 'คอลัมน์', render: (r) => <span className="font-mono text-xs">{r.column}</span> },
            { key: 'detail', headerEn: 'Change', headerTh: 'การเปลี่ยนแปลง', render: (r) => <T en={r.detailEn} th={r.detailTh} /> },
            { key: 'at', headerEn: 'Detected', headerTh: 'ตรวจพบ', render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.detectedAt, lang)}</span> },
          ]}
        />
      </section>

      {/* Jobs needing attention */}
      <section aria-labelledby="ops-jobs" className="space-y-2">
        <SectionHeading titleEn="Jobs needing attention" titleTh="งานที่ต้องตรวจสอบ" hintEn="Failed or dead pipeline jobs — open Administration to manage the queue" hintTh="งานท่อประมวลผลที่ล้มเหลวหรือตาย — เปิดหน้าจัดการระบบเพื่อจัดการคิว" />
        <DataTable
          caption="Pipeline jobs that need attention"
          rows={data.jobsAttention ?? []}
          rowKey={(r) => r.id}
          density={density}
          onRowClick={canOpenAdmin ? () => ctx.navigate('administration') : undefined}
          emptyEn="No failed or dead jobs — the pipeline is healthy."
          emptyTh="ไม่มีงานล้มเหลวหรือตาย — ท่อประมวลผลทำงานปกติ"
          columns={[
            { key: 'type', headerEn: 'Job type', headerTh: 'ประเภทงาน', render: (r) => <span className="font-medium">{r.type}</span> },
            { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (r) => <StatusBadge kind={asKind(r.status)} /> },
            {
              key: 'attempts', headerEn: 'Attempts', headerTh: 'จำนวนครั้ง',
              render: (r) => (
                <span className="whitespace-nowrap tabular-nums text-xs">
                  {fmtNumber(r.attempts, lang)}/{fmtNumber(r.maxAttempts, lang)}
                </span>
              ),
            },
            {
              key: 'error', headerEn: 'Last error', headerTh: 'ข้อผิดพลาดล่าสุด',
              render: (r) => (
                <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={r.lastError ?? undefined}>
                  {r.lastError ?? '—'}
                </span>
              ),
            },
            { key: 'created', headerEn: 'Created', headerTh: 'สร้างเมื่อ', render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.createdAt, lang)}</span> },
          ]}
        />
      </section>
    </PageShell>
  )
}
