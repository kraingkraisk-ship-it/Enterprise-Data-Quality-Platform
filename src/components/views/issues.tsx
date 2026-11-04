'use client'
// Issues view — track data quality issues to resolution with SLA accountability.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock, Flag, Link2, MessageSquarePlus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { DatasetDTO, IssueDTO, IssueStatus, Severity } from '@/lib/types'
import { hasPermission } from '@/lib/types'
import { cn } from '@/lib/utils'
import { T, fmtDateTime, useLang } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import {
  DataTable, DetailDrawer, DeniedState, ErrorState, KeyValue,
  LoadingState, PageShell, StatusBadge,
} from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ViewCtx } from './ctx'

const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'RESOLVED', 'CLOSED', 'REJECTED']
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
type BadgeKind = Parameters<typeof StatusBadge>[0]['kind']
/** Statuses that require a resolution note before leaving the active workflow. */
const NOTE_REQUIRED: IssueStatus[] = ['RESOLVED', 'CLOSED', 'REJECTED']

function slaCell(issue: IssueDTO, lang: 'en' | 'th') {
  if (!issue.slaDueAt) return <span className="text-xs text-muted-foreground">—</span>
  const due = new Date(issue.slaDueAt).getTime()
  const hours = Math.round(Math.abs(due - Date.now()) / 3_600_000)
  if (issue.slaBreached || due < Date.now()) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="size-3.5" aria-hidden />
        {lang === 'th' ? `เกินกำหนด ${hours} ชม.` : `${hours}h overdue`}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3.5" aria-hidden />
      {lang === 'th' ? `อีก ${hours} ชม.` : `due in ${hours}h`}
    </span>
  )
}

export default function IssuesView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const canManage = hasPermission(ctx.user.role, 'MANAGE_ISSUE')

  const [datasets, setDatasets] = useState<DatasetDTO[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [rows, setRows] = useState<IssueDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const [fDataset, setFDataset] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fSeverity, setFSeverity] = useState('all')
  const [q, setQ] = useState('')

  // Raise issue dialog
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raising, setRaising] = useState(false)
  const [nDataset, setNDataset] = useState('')
  const [nTitle, setNTitle] = useState('')
  const [nDesc, setNDesc] = useState('')
  const [nSeverity, setNSeverity] = useState('MEDIUM')
  const [nAssignee, setNAssignee] = useState('')

  // Detail drawer state
  const [selected, setSelected] = useState<IssueDTO | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [pendingStatus, setPendingStatus] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [pendingAssignee, setPendingAssignee] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [ds, issues] = await Promise.all([
        api.datasets(),
        api.issues({
          datasetId: fDataset === 'all' ? undefined : fDataset,
          status: fStatus === 'all' ? undefined : fStatus,
          severity: fSeverity === 'all' ? undefined : fSeverity,
          q: q.trim() || undefined,
        }),
      ])
      setDatasets(ds.datasets)
      setRows(issues.issues)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [fDataset, fStatus, fSeverity, q])

  useEffect(() => { void load() }, [load])

  // assignee options for the raise dialog
  useEffect(() => {
    if (!raiseOpen) return
    api.listUsers().then((r) => setUsers(r.users.map((u) => ({ id: u.id, name: u.name })))).catch(() => setUsers([]))
  }, [raiseOpen])

  const openDetail = (i: IssueDTO) => {
    setSelected(i)
    setComment('')
    setPendingStatus('')
    setResolutionNote('')
    setPendingAssignee(i.assignee ?? '')
    setDrawerOpen(true)
  }

  const raise = async () => {
    if (!nDataset || !nTitle.trim() || !nDesc.trim()) {
      toast.error(lang === 'th' ? 'กรอกชุดข้อมูล หัวข้อ และคำอธิบายให้ครบ' : 'Dataset, title and description are required')
      return
    }
    setRaising(true)
    try {
      const res = await api.createIssue({
        datasetId: nDataset, title: nTitle.trim(), description: nDesc.trim(),
        severity: nSeverity, assignee: nAssignee || undefined,
      })
      toast.success(lang === 'th' ? `สร้างปัญหา ${res.issue.key} แล้ว` : `Issue ${res.issue.key} created`)
      setRaiseOpen(false)
      setNDataset(''); setNTitle(''); setNDesc(''); setNSeverity('MEDIUM'); setNAssignee('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create issue')
    } finally {
      setRaising(false)
    }
  }

  const patch = async (id: string, body: { status?: string; assignee?: string; resolutionNote?: string; comment?: string }, okEn: string, okTh: string) => {
    setActing(true)
    try {
      await api.updateIssue(id, body)
      toast.success(lang === 'th' ? okTh : okEn)
      const fresh = await api.issues({})
      setRows(fresh.issues)
      const updated = fresh.issues.find((i) => i.id === id) ?? null
      setSelected(updated)
      setComment(''); setPendingStatus(''); setResolutionNote('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setActing(false)
    }
  }

  const columns = useMemo(() => [
    { key: 'key', headerEn: 'Key', headerTh: 'รหัส', render: (i: IssueDTO) => <span className="font-mono text-xs font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2">{i.key}</span> },
    { key: 'title', headerEn: 'Title', headerTh: 'หัวข้อ', render: (i: IssueDTO) => <span className="max-w-[280px] truncate text-xs font-medium" title={i.title}>{i.title}</span> },
    { key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (i: IssueDTO) => <span className="text-xs">{i.datasetName ?? i.datasetId}</span> },
    { key: 'severity', headerEn: 'Severity', headerTh: 'ความรุนแรง', render: (i: IssueDTO) => <StatusBadge kind={i.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'} /> },
    { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (i: IssueDTO) => <StatusBadge kind={i.status as BadgeKind} /> },
    { key: 'sla', headerEn: 'SLA', headerTh: 'SLA', render: (i: IssueDTO) => slaCell(i, lang) },
    { key: 'assignee', headerEn: 'Assignee', headerTh: 'ผู้รับผิดชอบ', render: (i: IssueDTO) => <span className="text-xs">{i.assignee ?? '—'}</span> },
    { key: 'opened', headerEn: 'Opened', headerTh: 'เปิดเมื่อ', render: (i: IssueDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(i.openedAt, lang)}</span> },
  ], [lang])

  if (!hasPermission(ctx.user.role, 'VIEW_ISSUE')) return <DeniedState resourceEn="issues" />

  return (
    <PageShell
      objective={{
        en: 'Track data quality issues to resolution with SLA accountability.',
        th: 'ติดตามปัญหาคุณภาพข้อมูลจนถึงการปิดงาน พร้อมความรับผิดชอบต่อ SLA',
      }}
      primaryAction={canManage ? (
        <Button onClick={() => setRaiseOpen(true)} className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800">
          <Flag className="size-4" aria-hidden /> <T en="Raise issue" th="แจ้งปัญหา" />
        </Button>
      ) : undefined}
      guidance={{
        en: 'SLA clocks follow policy sla.hoursBySeverity. Every status change and comment is recorded in the audit trail.',
        th: 'นาฬิกา SLA ตามนโยบาย sla.hoursBySeverity การเปลี่ยนสถานะและความคิดเห็นทุกรายการถูกบันทึกใน audit trail',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" role="group" aria-label="Filters">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Filters" th="ตัวกรอง" /></span>
        <Select value={fDataset} onValueChange={setFDataset}>
          <SelectTrigger className="h-10 w-[180px]" aria-label="Dataset filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All datasets" th="ทุกชุดข้อมูล" /></SelectItem>
            {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="h-10 w-[160px]" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All statuses" th="ทุกสถานะ" /></SelectItem>
            {ISSUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fSeverity} onValueChange={setFSeverity}>
          <SelectTrigger className="h-10 w-[150px]" aria-label="Severity filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All severities" th="ทุกความรุนแรง" /></SelectItem>
            {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search issues"
            placeholder={lang === 'th' ? 'ค้นหาหัวข้อ/รหัส…' : 'Search title / key…'}
            className="h-10 w-[200px] pl-8"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label={{ en: 'Loading issues…', th: 'กำลังโหลดปัญหา…' }} />
      ) : error ? (
        <ErrorState message={error.message} retry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(i) => i.id}
          onRowClick={openDetail}
          density={density}
          caption="Data quality issues with SLA tracking"
          emptyEn="No issues match the current filters."
          emptyTh="ไม่พบปัญหาที่ตรงกับตัวกรอง"
        />
      )}

      {/* Raise issue dialog */}
      <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle><T en="Raise a data quality issue" th="แจ้งปัญหาคุณภาพข้อมูล" /></DialogTitle>
            <DialogDescription>
              <T en="An SLA clock starts immediately based on the selected severity." th="นาฬิกา SLA เริ่มนับทันทีตามระดับความรุนแรงที่เลือก" />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="iss-dataset"><T en="Dataset" th="ชุดข้อมูล" /></Label>
              <Select value={nDataset} onValueChange={setNDataset}>
                <SelectTrigger id="iss-dataset" className="h-10 w-full" aria-label="Issue dataset">
                  <SelectValue placeholder={lang === 'th' ? 'เลือกชุดข้อมูล' : 'Select dataset'} />
                </SelectTrigger>
                <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iss-title"><T en="Title" th="หัวข้อ" /></Label>
              <Input id="iss-title" value={nTitle} onChange={(e) => setNTitle(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iss-desc"><T en="Description" th="คำอธิบาย" /></Label>
              <Textarea id="iss-desc" value={nDesc} onChange={(e) => setNDesc(e.target.value)} className="min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="iss-sev"><T en="Severity" th="ความรุนแรง" /></Label>
                <Select value={nSeverity} onValueChange={setNSeverity}>
                  <SelectTrigger id="iss-sev" className="h-10 w-full" aria-label="Issue severity"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iss-assignee"><T en="Assignee (optional)" th="ผู้รับผิดชอบ (ไม่บังคับ)" /></Label>
                <Select value={nAssignee} onValueChange={setNAssignee}>
                  <SelectTrigger id="iss-assignee" className="h-10 w-full" aria-label="Issue assignee">
                    <SelectValue placeholder={lang === 'th' ? 'ยังไม่มอบหมาย' : 'Unassigned'} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[40px]" onClick={() => setRaiseOpen(false)}><T en="Cancel" th="ยกเลิก" /></Button>
            <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={raising} onClick={raise}>
              <Flag className="size-4" aria-hidden /> <T en={raising ? 'Creating…' : 'Create issue'} th={raising ? 'กำลังสร้าง…' : 'สร้างปัญหา'} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected ? `${selected.key} — ${selected.title}` : ''}
        description={lang === 'th' ? 'รายละเอียดปัญหา บทสนทนา และสถานะ' : 'Issue detail, discussion and workflow'}
      >
        {selected && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind={selected.severity as Severity} />
              <StatusBadge kind={selected.status as BadgeKind} />
              {slaCell(selected, lang)}
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <KeyValue kEn="Description" kTh="คำอธิบาย"><p className="text-xs leading-relaxed">{selected.description}</p></KeyValue>
              <KeyValue kEn="Source" kTh="แหล่งที่มา">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <Link2 className="size-3.5 text-teal-700" aria-hidden />
                  {selected.sourceType}
                  {selected.sourceRef && <span className="font-mono text-muted-foreground">· {selected.sourceRef}</span>}
                </span>
              </KeyValue>
              <KeyValue kEn="Reported by" kTh="ผู้แจ้ง"><span className="text-xs">{selected.reportedBy}</span></KeyValue>
              <KeyValue kEn="Opened / resolved" kTh="เปิด / ปิด">
                <span className="text-xs">
                  {fmtDateTime(selected.openedAt, lang)}
                  {selected.resolvedAt ? ` → ${fmtDateTime(selected.resolvedAt, lang)}` : ''}
                </span>
              </KeyValue>
              {selected.resolutionNote && (
                <KeyValue kEn="Resolution note" kTh="บันทึกการแก้ไข"><p className="text-xs">{selected.resolutionNote}</p></KeyValue>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <T en={`Comments (${selected.comments?.length ?? 0})`} th={`ความคิดเห็น (${selected.comments?.length ?? 0})`} />
              </p>
              <ul className="space-y-2">
                {(selected.comments ?? []).map((c) => (
                  <li key={c.id} className="rounded border bg-muted/30 p-2">
                    <p className="text-xs font-semibold">{c.author} <span className="font-normal text-muted-foreground">· {fmtDateTime(c.createdAt, lang)}</span></p>
                    <p className="mt-0.5 text-xs">{c.body}</p>
                  </li>
                ))}
                {(selected.comments ?? []).length === 0 && <li className="text-xs text-muted-foreground"><T en="No comments yet." th="ยังไม่มีความคิดเห็น" /></li>}
              </ul>
              {canManage && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    aria-label="New comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={lang === 'th' ? 'เพิ่มความคิดเห็น…' : 'Add a comment…'}
                    className="min-h-[64px]"
                  />
                  <Button
                    variant="outline" className="min-h-[40px]" disabled={acting || !comment.trim()}
                    onClick={() => patch(selected.id, { comment: comment.trim() }, 'Comment added', 'เพิ่มความคิดเห็นแล้ว')}
                  >
                    <MessageSquarePlus className="size-4" aria-hidden /> <T en="Add comment" th="เพิ่มความคิดเห็น" />
                  </Button>
                </div>
              )}
            </div>

            {canManage && (
              <div className="space-y-3 rounded-lg border border-teal-300 bg-teal-50/50 p-3">
                <p className="text-xs font-semibold text-teal-900"><T en="Workflow" th="การดำเนินงาน" /></p>
                <div className="space-y-1.5">
                  <Label htmlFor="iss-status"><T en="Change status" th="เปลี่ยนสถานะ" /></Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={pendingStatus} onValueChange={setPendingStatus}>
                      <SelectTrigger id="iss-status" className="h-10 w-[190px]" aria-label="New status">
                        <SelectValue placeholder={lang === 'th' ? 'เลือกสถานะใหม่' : 'Select new status'} />
                      </SelectTrigger>
                      <SelectContent>
                        {ISSUE_STATUSES.filter((s) => s !== selected.status).map((s) => (
                          <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pendingStatus && NOTE_REQUIRED.includes(pendingStatus as IssueStatus) && (
                      <Textarea
                        aria-label="Resolution note"
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder={lang === 'th' ? 'บันทึกการแก้ไข (จำเป็น)' : 'Resolution note (required)'}
                        className="min-h-[64px] w-full"
                      />
                    )}
                    <Button
                      className={cn('min-h-[40px] bg-teal-700 text-white hover:bg-teal-800')}
                      disabled={acting || !pendingStatus || (NOTE_REQUIRED.includes(pendingStatus as IssueStatus) && !resolutionNote.trim())}
                      onClick={() => patch(
                        selected.id,
                        { status: pendingStatus, ...(NOTE_REQUIRED.includes(pendingStatus as IssueStatus) ? { resolutionNote: resolutionNote.trim() } : {}) },
                        `Status updated to ${pendingStatus.replaceAll('_', ' ')}`,
                        `เปลี่ยนสถานะเป็น ${pendingStatus.replaceAll('_', ' ')} แล้ว`,
                      )}
                    >
                      <T en="Apply status" th="บันทึกสถานะ" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="iss-assign"><T en="Change assignee" th="เปลี่ยนผู้รับผิดชอบ" /></Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={pendingAssignee} onValueChange={setPendingAssignee}>
                      <SelectTrigger id="iss-assign" className="h-10 w-[190px]" aria-label="Assignee">
                        <SelectValue placeholder={lang === 'th' ? 'ยังไม่มอบหมาย' : 'Unassigned'} />
                      </SelectTrigger>
                      <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button
                      variant="outline" className="min-h-[40px]" disabled={acting || !pendingAssignee || pendingAssignee === selected.assignee}
                      onClick={() => patch(selected.id, { assignee: pendingAssignee }, 'Assignee updated', 'อัปเดตผู้รับผิดชอบแล้ว')}
                    >
                      <T en="Save assignee" th="บันทึกผู้รับผิดชอบ" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </DetailDrawer>
    </PageShell>
  )
}
