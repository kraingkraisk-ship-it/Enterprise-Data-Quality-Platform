'use client'
// Audit dashboard — critical events, export/rejection activity, actor stats and
// evidence completeness. Records are append-only (immutable) by design.
import React, { useCallback, useEffect, useState } from 'react'
import { Ban, CheckCircle2, FileClock, Lock, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api-client'
import { canAccessView } from '@/lib/types'
import type { AuditDashboardDTO } from '@/lib/types'
import { T, useLang, fmtNumber, fmtDateTime, fmtPercent } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import { PageShell, SectionHeading, KpiCard, DataTable, LoadingState, ErrorState, DeniedState } from '@/components/shared/kit'
import { HBar } from '@/components/shared/charts'
import type { ViewCtx } from '@/components/views/ctx'

const toPct = (v: number) => (v <= 1 ? v * 100 : v)

export default function DashboardAuditView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const [data, setData] = useState<AuditDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string; auditId?: string } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.dashboardAudit()
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
    en: 'Independent oversight: critical events, export activity, file rejections and audit evidence completeness.',
    th: 'การกำกับดูแลอิสระ: เหตุการณ์วิกฤต กิจกรรมส่งออก การปฏิเสธไฟล์ และความครบถ้วนของหลักฐานตรวจสอบ',
  }
  const guidance = {
    en: 'Every action on the platform writes an append-only audit record with actor, resource and correlation ID. Evidence completeness shows how many critical actions carry a correlation ID — the key to end-to-end traceability. Click a critical event to open the full audit log.',
    th: 'ทุกการดำเนินการบนแพลตฟอร์มจะบันทึกร่องรอยแบบเพิ่มได้เท่านั้น พร้อมผู้กระทำ ทรัพยากร และ correlation ID ความครบถ้วนของหลักฐานแสดงสัดส่วนการกระทำวิกฤตที่มี correlation ID ซึ่งเป็นกุญแจสู่การตรวจสอบย้อนกลับแบบครบวงจร คลิกเหตุการณ์เพื่อเปิดบันทึกฉบับเต็ม',
  }

  if (!canAccessView(ctx.user.role, 'dashboard-audit')) {
    return <PageShell objective={objective}><DeniedState resourceEn="the audit dashboard" /></PageShell>
  }
  if (loading) return <PageShell objective={objective} guidance={guidance}><LoadingState rows={6} /></PageShell>
  if (error) return <PageShell objective={objective} guidance={guidance}><ErrorState message={error.message} retry={retry} auditId={error.auditId} /></PageShell>
  if (!data) return null

  const counts = data.eventCounts ?? []
  const maxCount = Math.max(...counts.map((c) => c.count), 1)
  const evidence = toPct(data.evidenceCompleteness ?? 0)
  const canOpenLogs = canAccessView(ctx.user.role, 'audit-logs')

  return (
    <PageShell objective={objective} guidance={guidance}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          labelEn="Critical events (7d)" labelTh="เหตุการณ์วิกฤต (7 วัน)" icon={ShieldAlert}
          value={fmtNumber(data.criticalEvents?.length ?? 0, lang)}
          tone={(data.criticalEvents?.length ?? 0) > 0 ? 'bad' : 'good'}
          sub={<T en="Approvals, denials, exports on restricted data" th="การอนุมัติ การปฏิเสธ การส่งออกข้อมูลระดับจำกัด" />}
        />
        <KpiCard
          labelEn="Export events" labelTh="เหตุการณ์ส่งออก" icon={FileClock}
          value={fmtNumber(data.exportEvents, lang)}
          tone={(data.exportEvents ?? 0) > 0 ? 'warn' : 'good'}
          sub={<T en="Report downloads with masking applied" th="การดาวน์โหลดรายงานพร้อมการปิดบังข้อมูล" />}
        />
        <KpiCard
          labelEn="File rejections" labelTh="การปฏิเสธไฟล์" icon={Ban}
          value={fmtNumber(data.rejectEvents, lang)}
          tone={(data.rejectEvents ?? 0) > 0 ? 'warn' : 'good'}
          sub={<T en="Uploads stopped by AV / policy checks" th="ไฟล์อัปโหลดที่ถูกหยุดโดยการสแกนและนโยบาย" />}
        />
        <KpiCard
          labelEn="Evidence completeness" labelTh="ความครบถ้วนของหลักฐาน" icon={CheckCircle2}
          value={fmtPercent(evidence, lang)}
          tone={evidence >= 95 ? 'good' : evidence >= 80 ? 'warn' : 'bad'}
          sub={<T en="Critical actions with correlation ID" th="การกระทำวิกฤตที่มี correlation ID" />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Event counts */}
        <HBar
          points={counts.map((c) => ({ label: c.action, value: c.count }))}
          labelEn="Audit events by action" labelTh="เหตุการณ์ตรวจสอบตามการกระทำ"
          tone={(v) => (v >= maxCount * 0.75 ? 'warn' : 'good')}
        />

        {/* Actor stats */}
        <section aria-labelledby="audit-actors" className="space-y-2">
          <SectionHeading titleEn="Most active actors" titleTh="ผู้ใช้ที่มีกิจกรรมมากสุด" hintEn="Actions recorded in the audit trail" hintTh="การกระทำที่บันทึกในร่องรอยการตรวจสอบ" />
          <DataTable
            caption="Actors with the most recorded actions"
            rows={data.actorStats ?? []}
            rowKey={(r) => r.actor}
            density={density}
            emptyEn="No actor activity recorded yet."
            emptyTh="ยังไม่มีกิจกรรมของผู้ใช้ที่บันทึกไว้"
            columns={[
              { key: 'actor', headerEn: 'Actor', headerTh: 'ผู้กระทำ', render: (r) => <span className="font-medium">{r.actor}</span> },
              { key: 'actions', headerEn: 'Actions', headerTh: 'จำนวนครั้ง', render: (r) => <span className="tabular-nums">{fmtNumber(r.actions, lang)}</span> },
              { key: 'lastSeen', headerEn: 'Last seen', headerTh: 'ล่าสุด', render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.lastSeen, lang)}</span> },
            ]}
          />
        </section>
      </div>

      {/* Critical events */}
      <section aria-labelledby="audit-critical" className="space-y-2">
        <SectionHeading titleEn="Critical events (last 7 days)" titleTh="เหตุการณ์วิกฤต (7 วันล่าสุด)" hintEn={canOpenLogs ? 'Click an event to open the full audit log' : 'Read-only summary — the full log is restricted'} hintTh={canOpenLogs ? 'คลิกเหตุการณ์เพื่อเปิดบันทึกฉบับเต็ม' : 'สรุปแบบอ่านอย่างเดียว — บันทึกฉบับเต็มถูกจำกัดสิทธิ์'} />
        <DataTable
          caption="Critical audit events with actor, action, resource and correlation ID"
          rows={data.criticalEvents ?? []}
          rowKey={(r) => r.id}
          density={density}
          onRowClick={canOpenLogs ? () => ctx.navigate('audit-logs') : undefined}
          emptyEn="No critical events in the last 7 days."
          emptyTh="ไม่มีเหตุการณ์วิกฤตในช่วง 7 วันล่าสุด"
          columns={[
            { key: 'actor', headerEn: 'Actor', headerTh: 'ผู้กระทำ', render: (r) => <span className="font-medium">{r.actor}</span> },
            { key: 'action', headerEn: 'Action', headerTh: 'การกระทำ', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
            {
              key: 'resource', headerEn: 'Resource', headerTh: 'ทรัพยากร',
              render: (r) => (
                <span className="max-w-[260px] truncate text-xs" title={`${r.resourceType} ${r.resourceId}`}>
                  {r.resourceType} · <span className="font-mono">{r.resourceId}</span>
                </span>
              ),
            },
            { key: 'time', headerEn: 'Time', headerTh: 'เวลา', render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.createdAt, lang)}</span> },
            {
              key: 'corr', headerEn: 'Correlation ID', headerTh: 'รหัสเชื่อมโยง',
              render: (r) => (
                <span className={cn('block max-w-[200px] truncate font-mono text-xs', r.correlationId ? '' : 'text-muted-foreground')} title={r.correlationId ?? undefined}>
                  {r.correlationId ?? '—'}
                </span>
              ),
            },
          ]}
        />
      </section>

      {/* Immutability note */}
      <p className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <T
          en="Audit records are append-only and immutable — no role, including administrators, can edit or delete them. Correlation IDs tie related events together for end-to-end traceability, supporting PDPA accountability and external audits."
          th="บันทึกการตรวจสอบเป็นแบบเพิ่มได้เท่านั้นและแก้ไขไม่ได้ — ไม่มีบทบาทใดรวมถึงผู้ดูแลระบบสามารถแก้ไขหรือลบได้ correlation ID เชื่อมโยงเหตุการณ์ที่เกี่ยวข้องเพื่อการตรวจสอบย้อนกลับครบวงจร รองรับความรับผิดชอบตาม PDPA และการตรวจสอบจากภายนอก"
        />
      </p>
    </PageShell>
  )
}
