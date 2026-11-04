'use client'
// Validation run detail — full traceability for one execution: header, KPIs,
// per-dimension results, failed rules with masked evidence and a timeline.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Info } from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import type { ValidationResultDTO } from '@/lib/types'
import {
  DataTable, DetailDrawer, DeniedState, ErrorState, KeyValue, LoadingState,
  MaskedChip, PageShell, PartialFailure, ScoreRing, SectionHeading, StatusBadge,
} from '@/components/shared/kit'
import { HBar } from '@/components/shared/charts'
import { T, fmtDateTime, fmtDuration, fmtNumber, fmtPercent, pick, useLang } from '@/lib/i18n'
import type { ViewCtx } from './ctx'
import { Button } from '@/components/ui/button'
import { TriggerBadge } from './validations'

const DIM_SHORT: Record<string, { en: string; th: string }> = {
  COMPLETENESS: { en: 'Completeness', th: 'ความครบถ้วน' },
  ACCURACY: { en: 'Accuracy', th: 'ความถูกต้อง' },
  VALIDITY: { en: 'Validity', th: 'ความถูกต้องตามรูปแบบ' },
  CONSISTENCY: { en: 'Consistency', th: 'ความสอดคล้องกัน' },
  UNIQUENESS: { en: 'Uniqueness', th: 'ความไม่ซ้ำกัน' },
  TIMELINESS: { en: 'Timeliness', th: 'ความทันเวลา' },
  INTEGRITY: { en: 'Integrity', th: 'ความสมบูรณ์อ้างอิง' },
  VOLUME: { en: 'Volume', th: 'ปริมาณข้อมูล' },
  SCHEMA_CONFORMITY: { en: 'Schema conformity', th: 'ความสอดคล้องของสคีมา' },
}

type RunDetail = Awaited<ReturnType<typeof api.validation>>

export default function ValidationDetailView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const runId = ctx.params.id

  const [data, setData] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [openResultId, setOpenResultId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!runId) { setNotFound(true); setLoading(false); return }
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const res = await api.validation(runId)
      setData(res)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true)
      else setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => { void load() }, [load])

  const run = data?.run ?? null
  const results = useMemo(() => data?.results ?? [], [data])
  const failedResults = useMemo(() => results.filter((r) => r.status === 'FAILED' || r.status === 'ERROR'), [results])
  const openResult = useMemo(() => results.find((r) => r.id === openResultId) ?? null, [results, openResultId])

  const copyCorrelation = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success(pick(lang, 'Correlation id copied', 'คัดลอกรหัสสหพันธ์แล้ว'))
    } catch {
      toast.error(pick(lang, 'Copy failed', 'คัดลอกไม่สำเร็จ'))
    }
  }

  if (notFound) {
    return (
      <PageShell objective={{ en: 'Validation run detail', th: 'รายละเอียดการรันการตรวจสอบ' }}>
        <DeniedState resourceEn="validation run" />
      </PageShell>
    )
  }

  if (loading) {
    return <PageShell objective={{ en: 'Validation run detail', th: 'รายละเอียดการรันการตรวจสอบ' }}><LoadingState rows={8} /></PageShell>
  }

  if (error || !run) {
    return (
      <PageShell objective={{ en: 'Validation run detail', th: 'รายละเอียดการรันการตรวจสอบ' }}>
        <ErrorState message={error?.message} auditId={error?.auditId} retry={() => void load()} />
      </PageShell>
    )
  }

  // Dimension results for HBar
  const dims = Object.entries(run.dimensionResults ?? {})
  const dimPoints = dims.map(([k, v]) => ({ label: pick(lang, DIM_SHORT[k]?.en ?? k, DIM_SHORT[k]?.th ?? k), value: v.rate * 100 }))
  const maxDur = Math.max(...results.map((r) => r.durationMs), 1)
  const topDurations = results.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 8)

  const failedColumns = [
    { key: 'code', headerEn: 'Rule code', headerTh: 'รหัสกฎ', render: (r: ValidationResultDTO) => <span className="font-mono text-xs font-semibold text-teal-800">{r.ruleCode ?? r.ruleId}</span> },
    { key: 'name', headerEn: 'Rule', headerTh: 'กฎ', render: (r: ValidationResultDTO) => <span className="text-sm font-medium">{r.ruleName ?? '—'}</span> },
    { key: 'version', headerEn: 'Version', headerTh: 'เวอร์ชัน', render: (r: ValidationResultDTO) => <span className="font-mono text-xs">v{r.ruleVersion}</span> },
    { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (r: ValidationResultDTO) => <StatusBadge kind={r.status} /> },
    { key: 'passRate', headerEn: 'Pass rate', headerTh: 'อัตราผ่าน', render: (r: ValidationResultDTO) => <span className={`tabular-nums font-medium ${r.passRate >= 0.85 ? 'text-emerald-700' : r.passRate >= 0.7 ? 'text-amber-700' : 'text-red-700'}`}>{fmtPercent(r.passRate * 100, lang)}</span> },
    { key: 'failedRows', headerEn: 'Failed rows', headerTh: 'แถวที่ไม่ผ่าน', render: (r: ValidationResultDTO) => <span className="tabular-nums">{fmtNumber(r.failedRows, lang)}</span> },
    { key: 'evaluated', headerEn: 'Evaluated', headerTh: 'ประเมินแล้ว', render: (r: ValidationResultDTO) => <span className="tabular-nums text-muted-foreground">{fmtNumber(r.evaluatedRows, lang)}</span> },
  ]

  return (
    <PageShell
      objective={{
        en: 'Inspect this validation run end-to-end — dataset context, per-dimension results, failed rules with masked evidence and the execution timeline.',
        th: 'ตรวจดูการรันนี้ตั้งแต่ต้นจนจบ — บริบทชุดข้อมูล ผลรายมิติ กฎที่ไม่ผ่านพร้อมหลักฐานปกปิด และไทม์ไลน์การทำงาน',
      }}
      primaryAction={
        <Button variant="outline" className="min-h-[40px]" onClick={() => ctx.navigate('validations')}>
          <ArrowLeft className="size-4" aria-hidden /> <T en="All runs" th="การรันทั้งหมด" />
        </Button>
      }
      guidance={{
        en: 'Evidence values are masked per PII policy. Source data is never modified automatically.',
        th: 'ค่าหลักฐานถูกปกปิดตามนโยบาย PII และข้อมูลต้นทางจะไม่ถูกแก้ไขโดยอัตโนมัติ',
      }}
    >
      {/* Retry note */}
      {run.attempt > 1 && (
        <PartialFailure note={{
          en: `This run was retried (attempt ${run.attempt}${run.retriedFrom ? `, retry of ${run.retriedFrom}` : ''}). Idempotent: results are written once per correlation id.`,
          th: `การรันนี้ถูกลองใหม่ (ครั้งที่ ${run.attempt}${run.retriedFrom ? ` จาก ${run.retriedFrom}` : ''}) ระบบรับประกันผลลัพธ์ถูกบันทึกครั้งเดียวต่อรหัสสหพันธ์`,
        }} />
      )}

      {/* Header card */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => ctx.navigate('dataset-detail', { id: run.datasetId })}
              className="text-lg font-semibold text-teal-800 underline-offset-4 hover:underline"
            >
              {run.datasetName ?? run.datasetId}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded border bg-muted px-1.5 py-0.5 font-medium">{pick(lang, 'Dataset version', 'เวอร์ชันชุดข้อมูล')} {run.datasetVersion}</span>
              <span className="rounded border bg-muted px-1.5 py-0.5 font-mono">{run.ruleSetVersion}</span>
              <TriggerBadge trigger={run.trigger} />
              <StatusBadge kind={run.status} />
            </div>
          </div>
          <div className="text-end">
            <p className="text-xs text-muted-foreground"><T en="Correlation id" th="รหัสสหพันธ์" /></p>
            <div className="mt-0.5 flex items-center gap-1">
              <code className="max-w-[240px] truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={run.correlationId}>{run.correlationId}</code>
              <Button variant="ghost" size="icon" className="size-10" aria-label={pick(lang, 'Copy correlation id', 'คัดลอกรหัสสหพันธ์')} onClick={() => void copyCorrelation(run.correlationId)}>
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-x-6 gap-y-1.5 border-t pt-3 md:grid-cols-2">
          <KeyValue kEn="Executed by" kTh="ผู้รัน">{run.executedBy}</KeyValue>
          <KeyValue kEn="Started at" kTh="เริ่มเมื่อ">{fmtDateTime(run.startedAt, lang)}</KeyValue>
          <KeyValue kEn="Completed at" kTh="เสร็จเมื่อ">{fmtDateTime(run.completedAt, lang)}</KeyValue>
          <KeyValue kEn="Duration" kTh="ระยะเวลา">{fmtDuration(run.durationMs, lang)}</KeyValue>
          <KeyValue kEn="Attempt" kTh="ความพยายาม">
            {run.attempt > 1 ? (
              <span className="inline-flex items-center gap-1.5">
                <T en={`attempt ${run.attempt}`} th={`ครั้งที่ ${run.attempt}`} />
                {run.retriedFrom && <span className="text-xs text-muted-foreground">(<T en={`retry of ${run.retriedFrom}`} th={`ลองใหม่จาก ${run.retriedFrom}`} />)</span>}
              </span>
            ) : '1'}
          </KeyValue>
        </div>
        <p className="mt-3 flex items-start gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-teal-700" aria-hidden />
          <T en="Every action on this run is audit-logged." th="ทุกการดำเนินการกับการรันนี้ถูกบันทึกในระบบตรวจสอบ" />
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <ScoreRing score={run.qualityScore} size={64} />
          <div>
            <p className="text-xs font-medium text-muted-foreground"><T en="Quality score" th="คะแนนคุณภาพ" /></p>
            <p className={`text-lg font-semibold tabular-nums ${run.qualityScore >= 85 ? 'text-emerald-700' : run.qualityScore >= 70 ? 'text-amber-700' : 'text-red-700'}`}>{fmtNumber(run.qualityScore, lang, { maximumFractionDigits: 1 })}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground"><T en="Coverage" th="ความครอบคลุม" /></p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPercent(run.coverage * 100, lang, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground"><T en="Rows covered by active rules" th="แถวที่ถูกครอบคลุมด้วยกฎที่ใช้งาน" /></p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground"><T en="Rows evaluated" th="แถวที่ประเมิน" /></p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{fmtNumber(run.rowsEvaluated, lang)}</p>
          <p className="mt-1 text-xs text-muted-foreground"><T en="Dataset version" th="เวอร์ชันชุดข้อมูล" /> {run.datasetVersion}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground"><T en="Rules" th="กฎ" /></p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge kind="PASSED" label={`${fmtNumber(run.rulesPassed, lang)} passed`} />
            <StatusBadge kind="FAILED" label={`${fmtNumber(run.rulesFailed, lang)} failed`} />
            <span className="text-xs text-muted-foreground"><T en={`of ${fmtNumber(run.rulesTotal, lang)} total`} th={`จากทั้งหมด ${fmtNumber(run.rulesTotal, lang)}`} /></span>
          </div>
        </div>
      </div>

      {/* Dimension results */}
      <section aria-label={pick(lang, 'Dimension results', 'ผลรายมิติ')} className="rounded-lg border bg-card p-4 shadow-sm">
        <SectionHeading titleEn="Results by quality dimension" titleTh="ผลแยกตามมิติคุณภาพ" hintEn="Pass rate per dimension in this run." hintTh="อัตราการผ่านต่อมิติในการรันนี้" />
        {dims.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground"><T en="No per-dimension breakdown was recorded for this run." th="ไม่มีการบันทึกผลแยกตามมิติสำหรับการรันนี้" /></p>
        ) : (
          <>
            <HBar points={dimPoints} labelEn="Pass rate by dimension (%)" labelTh="อัตราการผ่านแยกตามมิติ (%)" className="mt-3 border-0 p-0 shadow-none" />
            <p className="mt-2 text-xs text-muted-foreground">
              {dims.map(([k, v]) => `${pick(lang, DIM_SHORT[k]?.en ?? k, DIM_SHORT[k]?.th ?? k)}: ${fmtNumber(v.passed, lang)}/${fmtNumber(v.total, lang)}`).join(' · ')}
            </p>
          </>
        )}
      </section>

      {/* Failed rules */}
      <section aria-label={pick(lang, 'Failed rules', 'กฎที่ไม่ผ่าน')}>
        <SectionHeading
          titleEn="Failed rules" titleTh="กฎที่ไม่ผ่าน"
          hintEn="Select a rule to inspect masked evidence." hintTh="เลือกกฎเพื่อดูหลักฐานที่ปกปิดแล้ว"
        />
        <div className="mt-2">
          <DataTable
            columns={failedColumns}
            rows={failedResults}
            rowKey={(r) => r.id}
            onRowClick={(r) => setOpenResultId(r.id)}
            density="compact"
            caption={lang === 'th' ? 'กฎที่ไม่ผ่านในการรันนี้' : 'Rules that failed in this run'}
            emptyEn="No rule failed in this run — excellent."
            emptyTh="ไม่มีกฎใดไม่ผ่านในการรันนี้ — ยอดเยี่ยม"
          />
        </div>
      </section>

      {/* Execution timeline */}
      <section aria-label={pick(lang, 'Execution timeline', 'ไทม์ไลน์การทำงาน')} className="rounded-lg border bg-card p-4 shadow-sm">
        <SectionHeading titleEn="Execution timeline" titleTh="ไทม์ไลน์การทำงาน" hintEn="Top 8 slowest rule evaluations, purely informational." hintTh="การประเมินกฎที่ช้าที่สุด 8 รายการ เพื่อข้อมูลเท่านั้น" />
        <ol className="relative ms-3 mt-3 space-y-4 border-s border-border ps-6">
          <li className="relative">
            <span aria-hidden className="absolute -start-[7px] top-1 size-3.5 rounded-full border-2 border-teal-700 bg-teal-50" />
            <p className="text-sm font-semibold"><T en="Queued / started" th="เข้าคิว / เริ่มต้น" /></p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(run.startedAt, lang)}</p>
          </li>
          {topDurations.map((r) => (
            <li key={`dur-${r.id}`} className="relative">
              <span aria-hidden className="absolute -start-[5px] top-1.5 size-2.5 rounded-full border-2 border-border bg-background" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">{r.ruleName ?? r.ruleCode ?? r.ruleId} <span className="font-mono text-xs text-muted-foreground">v{r.ruleVersion}</span></p>
                <p className="text-xs tabular-nums text-muted-foreground">{fmtDuration(r.durationMs, lang)}</p>
              </div>
              <div className="mt-1 h-2 w-full rounded bg-muted" role="img" aria-label={pick(lang, `${r.ruleName ?? r.ruleCode ?? r.ruleId} took ${fmtDuration(r.durationMs, lang)}`, `${r.ruleName ?? r.ruleCode ?? r.ruleId} ใช้เวลา ${fmtDuration(r.durationMs, lang)}`)}>
                <span className="block h-2 rounded bg-teal-600/80" style={{ width: `${Math.max(3, (r.durationMs / maxDur) * 100)}%` }} />
              </div>
            </li>
          ))}
          <li className="relative">
            <span aria-hidden className={`absolute -start-[7px] top-1 size-3.5 rounded-full border-2 ${run.completedAt ? 'border-emerald-700 bg-emerald-50' : 'border-amber-600 bg-amber-50'}`} />
            <p className="text-sm font-semibold"><T en="Completed" th="เสร็จสิ้น" /></p>
            <p className="text-xs text-muted-foreground">
              {run.completedAt ? fmtDateTime(run.completedAt, lang) : <T en="Not completed yet — the run is still in progress or was cancelled." th="ยังไม่เสร็จสิ้น — กำลังดำเนินการหรือถูกยกเลิก" />}
            </p>
          </li>
        </ol>
      </section>

      {/* Failed-rule evidence drawer */}
      <DetailDrawer
        open={openResultId !== null}
        onOpenChange={(o) => { if (!o) setOpenResultId(null) }}
        title={openResult ? `${openResult.ruleCode ?? ''} · ${openResult.ruleName ?? ''}`.trim() : ''}
        description={pick(lang, 'Masked failure evidence for this rule in this run', 'หลักฐานความล้มเหลวที่ปกปิดแล้วของกฎนี้ในการรันนี้')}
      >
        {openResult && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge kind={openResult.status} />
              <span className="font-mono text-xs">v{openResult.ruleVersion}</span>
              <span><T en="Pass rate" th="อัตราผ่าน" />: <strong className="tabular-nums">{fmtPercent(openResult.passRate * 100, lang)}</strong></span>
              <span><T en="Failed rows" th="แถวที่ไม่ผ่าน" />: <strong className="tabular-nums">{fmtNumber(openResult.failedRows, lang)}</strong></span>
              <span><T en="Evaluated" th="ประเมินแล้ว" />: <strong className="tabular-nums">{fmtNumber(openResult.evaluatedRows, lang)}</strong></span>
              <span><T en="Duration" th="ระยะเวลา" />: <strong className="tabular-nums">{fmtDuration(openResult.durationMs, lang)}</strong></span>
            </div>
            {openResult.messageEn && (
              <p className="rounded border bg-muted/40 p-2.5 text-xs">
                {pick(lang, openResult.messageEn, openResult.messageTh ?? openResult.messageEn)}
              </p>
            )}
            {openResult.evidence && openResult.evidence.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-muted/80">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Row" th="แถว" /></th>
                    <th scope="col" className="px-2 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Column" th="คอลัมน์" /></th>
                    <th scope="col" className="px-2 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Value (masked)" th="ค่า (ปกปิด)" /></th>
                    <th scope="col" className="px-2 py-2 text-start text-xs font-semibold uppercase text-muted-foreground"><T en="Reason" th="เหตุผล" /></th>
                  </tr>
                </thead>
                <tbody>
                  {openResult.evidence.map((ev) => (
                    <tr key={`${ev.row}-${ev.column}`} className="border-t">
                      <td className="px-2 py-2 tabular-nums">{ev.row}</td>
                      <td className="px-2 py-2 font-mono text-xs">{ev.column}</td>
                      <td className="px-2 py-2"><MaskedChip>{ev.valueMasked}</MaskedChip></td>
                      <td className="px-2 py-2 text-xs">{pick(lang, ev.reasonEn, ev.reasonTh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground"><T en="No row-level evidence was recorded for this result." th="ไม่มีหลักฐานระดับแถวสำหรับผลนี้" /></p>
            )}
            <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <T
                en="Evidence masked per PII policy. Source data is never modified automatically."
                th="หลักฐานถูกปกปิดตามนโยบาย PII และข้อมูลต้นทางจะไม่ถูกแก้ไขโดยอัตโนมัติ"
              />
            </p>
          </>
        )}
      </DetailDrawer>
    </PageShell>
  )
}
