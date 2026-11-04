'use client'
// Audit logs view — immutable evidence trail. Gate: AUDITOR / SYSTEM_ADMIN only.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Download, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { AuditLogDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { T, fmtDateTime, useLang } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import {
  DataTable, DetailDrawer, DeniedState, ErrorState, KeyValue,
  LoadingState, PageShell,
} from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ViewCtx } from './ctx'

const ACTIONS = [
  'LOGIN', 'RULE_CREATE', 'RULE_SUBMIT', 'RULE_APPROVE', 'RULE_ACTIVATE', 'VALIDATION_RUN',
  'ANOMALY_REVIEW', 'ISSUE_UPDATE', 'EXPORT', 'FILE_UPLOAD', 'FILE_REJECT', 'GRANT_CHANGE',
  'USER_ROLE_CHANGE', 'POLICY_UPDATE', 'MODEL_PROMOTE',
]
/** Actions whose evidence most often matters to auditors. */
const CRITICAL_ACTIONS = new Set(['EXPORT', 'GRANT_CHANGE', 'USER_ROLE_CHANGE', 'POLICY_UPDATE', 'MODEL_PROMOTE', 'RULE_APPROVE', 'RULE_ACTIVATE', 'FILE_REJECT'])

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return `"${s.replaceAll('"', '""')}"`
}

function buildCsv(logs: AuditLogDTO[]): string {
  const header = ['id', 'createdAt', 'actor', 'actorRole', 'action', 'resourceType', 'resourceId', 'datasetId', 'ip', 'correlationId', 'detail']
  const lines = [header.join(',')]
  for (const l of logs) {
    lines.push([
      l.id, l.createdAt, l.actor, l.actorRole, l.action, l.resourceType, l.resourceId,
      l.datasetId ?? '', l.ip ?? '', l.correlationId ?? '', JSON.stringify(l.detail ?? {}),
    ].map(csvEscape).join(','))
  }
  // BOM so Excel opens Thai text correctly
  return '\uFEFF' + lines.join('\n')
}

export default function AuditLogsView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const allowed = ctx.user.role === 'AUDITOR' || ctx.user.role === 'SYSTEM_ADMIN'

  const [rows, setRows] = useState<AuditLogDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const [fAction, setFAction] = useState('all')
  const [actor, setActor] = useState('')
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<AuditLogDTO | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await api.auditLogs({
        action: fAction === 'all' ? undefined : fAction,
        actor: actor.trim() || undefined,
        q: q.trim() || undefined,
        limit: 200,
      })
      setRows(res.logs)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [allowed, fAction, actor, q])

  useEffect(() => { void load() }, [load])

  const copyText = async (text: string, labelEn: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${labelEn} copied`)
    } catch {
      toast.error(lang === 'th' ? 'คัดลอกไม่สำเร็จ' : 'Copy failed')
    }
  }

  /** Honest local export of the CURRENT filtered view — not an audited report export. */
  const downloadView = async () => {
    try {
      const fresh = await api.auditLogs({
        action: fAction === 'all' ? undefined : fAction,
        actor: actor.trim() || undefined,
        q: q.trim() || undefined,
        limit: 200,
      })
      const blob = new Blob([buildCsv(fresh.logs)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-view-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    }
  }

  const columns = useMemo(() => [
    { key: 'time', headerEn: 'Time', headerTh: 'เวลา', render: (l: AuditLogDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt, lang)}</span> },
    {
      key: 'actor', headerEn: 'Actor', headerTh: 'ผู้กระทำ',
      render: (l: AuditLogDTO) => (
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{l.actor}</span>
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{l.actorRole}</span>
        </span>
      ),
    },
    {
      key: 'action', headerEn: 'Action', headerTh: 'การกระทำ',
      render: (l: AuditLogDTO) => (
        <span className="inline-flex items-center gap-1">
          {CRITICAL_ACTIONS.has(l.action) && <ShieldCheck className="size-3.5 text-teal-700" aria-label="Critical action" />}
          <code className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{l.action}</code>
        </span>
      ),
    },
    { key: 'resource', headerEn: 'Resource', headerTh: 'ทรัพยากร', render: (l: AuditLogDTO) => <span className="font-mono text-xs">{l.resourceType}:{l.resourceId}</span> },
    {
      key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล',
      render: (l: AuditLogDTO) => l.datasetId ? (
        <button
          type="button"
          className="min-h-[40px] text-xs font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900"
          onClick={(e) => { e.stopPropagation(); ctx.navigate('dataset-detail', { id: l.datasetId as string }) }}
        >
          {l.datasetId}
        </button>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    { key: 'ip', headerEn: 'IP', headerTh: 'IP', render: (l: AuditLogDTO) => <span className="font-mono text-xs text-muted-foreground">{l.ip ?? '—'}</span> },
    {
      key: 'corr', headerEn: 'Correlation', headerTh: 'Correlation',
      render: (l: AuditLogDTO) => l.correlationId ? (
        <span className="inline-flex items-center gap-1">
          <code className="max-w-[140px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs" title={l.correlationId}>{l.correlationId}</code>
          <button
            type="button"
            aria-label="Copy correlation id"
            className="inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); void copyText(l.correlationId as string, 'Correlation id') }}
          >
            <ClipboardCopy className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
  ], [lang, ctx])

  if (!allowed) return <DeniedState resourceEn="audit logs" />

  return (
    <PageShell
      objective={{
        en: 'Every critical action, immutably recorded — your audit evidence trail.',
        th: 'ทุกการกระทำสำคัญถูกบันทึกแบบไม่แก้ไขได้ — หลักฐานการตรวจสอบของคุณ',
      }}
      primaryAction={
        <Button variant="outline" onClick={downloadView} className="min-h-[40px]">
          <Download className="size-4" aria-hidden /> <T en="Download view (CSV)" th="ดาวน์โหลดมุมมองนี้ (CSV)" />
        </Button>
      }
      guidance={{
        en: 'This downloads the current filtered view to your device as a plain CSV — it is not an audited report export.',
        th: 'ปุ่มนี้ดาวน์โหลดมุมมองที่กรองอยู่ลงเครื่องของคุณเป็น CSV ธรรมดา — ไม่ใช่การส่งออกรายงานที่ผ่านการตรวจสอบ',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" role="group" aria-label="Filters">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Filters" th="ตัวกรอง" /></span>
        <Select value={fAction} onValueChange={setFAction}>
          <SelectTrigger className="h-10 w-[190px]" aria-label="Action filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All actions" th="ทุกการกระทำ" /></SelectItem>
            {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="space-y-0.5">
          <Label htmlFor="al-actor" className="sr-only"><T en="Actor" th="ผู้กระทำ" /></Label>
          <Input
            id="al-actor" value={actor} onChange={(e) => setActor(e.target.value)}
            placeholder={lang === 'th' ? 'ผู้กระทำ…' : 'Actor…'} aria-label="Actor filter"
            className="h-10 w-[170px]"
          />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor="al-q" className="sr-only"><T en="Search" th="ค้นหา" /></Label>
          <Input
            id="al-q" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'th' ? 'ค้นหาทรัพยากร/รายละเอียด…' : 'Search resource / detail…'} aria-label="Search audit logs"
            className="h-10 w-[220px]"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label={{ en: 'Loading audit trail…', th: 'กำลังโหลดบันทึกการตรวจสอบ…' }} />
      ) : error ? (
        <ErrorState message={error.message} retry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(l) => l.id}
          onRowClick={(l) => { setSelected(l); setDrawerOpen(true) }}
          density={density}
          caption="Immutable audit trail"
          emptyEn="No audit records match the current filters."
          emptyTh="ไม่พบบันทึกที่ตรงกับตัวกรอง"
        />
      )}

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected ? `${selected.action} — ${selected.actor}` : ''}
        description={lang === 'th' ? 'รายละเอียดเหตุการณ์ใน audit trail' : 'Audit event detail'}
      >
        {selected && (
          <>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              {CRITICAL_ACTIONS.has(selected.action) && (
                <span className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-800">
                  <ShieldCheck className="size-3.5" aria-hidden /> <T en="Critical action" th="การกระทำสำคัญ" />
                </span>
              )}
              <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{selected.actorRole}</span>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <KeyValue kEn="Actor" kTh="ผู้กระทำ"><span className="text-xs font-medium">{selected.actor}</span></KeyValue>
              <KeyValue kEn="Recorded at" kTh="บันทึกเมื่อ"><span className="text-xs">{fmtDateTime(selected.createdAt, lang)}</span></KeyValue>
              <KeyValue kEn="Resource" kTh="ทรัพยากร"><span className="font-mono text-xs">{selected.resourceType}:{selected.resourceId}</span></KeyValue>
              {selected.datasetId && <KeyValue kEn="Dataset" kTh="ชุดข้อมูล"><span className="font-mono text-xs">{selected.datasetId}</span></KeyValue>}
              <KeyValue kEn="IP" kTh="IP"><span className="font-mono text-xs">{selected.ip ?? '—'}</span></KeyValue>
              <KeyValue kEn="Correlation" kTh="Correlation">
                <span className="inline-flex items-center gap-1.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{selected.correlationId ?? '—'}</code>
                  {selected.correlationId && (
                    <button
                      type="button" aria-label="Copy correlation id"
                      className="inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => void copyText(selected.correlationId as string, 'Correlation id')}
                    >
                      <ClipboardCopy className="size-3.5" aria-hidden />
                    </button>
                  )}
                </span>
              </KeyValue>
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Detail (JSON)" th="รายละเอียด (JSON)" /></p>
              <pre className={cn('max-h-64 overflow-auto rounded bg-muted/60 p-2 font-mono text-xs edqp-scroll')}>
                {JSON.stringify(selected.detail ?? {}, null, 2)}
              </pre>
            </div>

            <p className="flex items-start gap-2 rounded border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <T
                en="Records are append-only; no update or delete API exists."
                th="บันทึกเหล่านี้เป็นแบบเพิ่มเท่านั้น (append-only) ไม่มี API สำหรับแก้ไขหรือลบ"
              />
            </p>
          </>
        )}
      </DetailDrawer>
    </PageShell>
  )
}
