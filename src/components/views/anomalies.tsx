'use client'
// Anomalies view — investigate ML-detected findings. Every finding cites its
// model version and requires human review; source data is never modified.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Clock, Copy, GitCompare, ScanSearch, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { AnomalyDTO, AnomalyType, DatasetDTO } from '@/lib/types'
import { hasPermission } from '@/lib/types'
import { cn } from '@/lib/utils'
import { T, fmtDateTime, useLang } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import {
  DataTable, DetailDrawer, DeniedState, ErrorState, KeyValue,
  LoadingState, MaskedChip, MlDisclaimer, PageShell, StatusBadge,
} from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ViewCtx } from './ctx'

export const ANOMALY_TYPE_META: Record<AnomalyType, { Icon: React.ElementType; en: string; th: string }> = {
  NUMERIC_OUTLIER: { Icon: Sparkles, en: 'Numeric outlier', th: 'ค่าผิดปกติเชิงตัวเลข' },
  DUPLICATE: { Icon: Copy, en: 'Duplicate', th: 'ข้อมูลซ้ำ' },
  SCHEMA_DRIFT: { Icon: GitCompare, en: 'Schema drift', th: 'โครงสร้าง schema เปลี่ยน' },
  DATA_DRIFT: { Icon: TrendingUp, en: 'Data drift', th: 'การกระจายข้อมูลเปลี่ยน' },
  VOLUME_SHIFT: { Icon: Activity, en: 'Volume shift', th: 'ปริมาณข้อมูลผันผวน' },
}

export function scoreTone(score: number): string {
  if (score >= 0.9) return 'text-red-700'
  if (score >= 0.75) return 'text-amber-700'
  return 'text-muted-foreground'
}

/** Review badge — PENDING deliberately uses a Clock icon (awaiting human review). */
export function ReviewBadge({ status }: { status: string }) {
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
        <Clock className="size-3" aria-hidden />
        <T en="Pending review" th="รอการตรวจสอบ" />
      </span>
    )
  }
  if (status === 'CONFIRMED_ISSUE') return <StatusBadge kind="CONFIRMED_ISSUE" label={undefined} />
  if (status === 'FALSE_POSITIVE') return <StatusBadge kind="FALSE_POSITIVE" label={undefined} />
  return <StatusBadge kind="UNKNOWN" label={status} />
}

/** Mini bar list for contributing features (bars are decorative; numbers carry meaning). */
export function FeatureBars({ items }: { items: { feature: string; contribution: number }[] }) {
  const max = Math.max(...items.map((i) => Math.abs(i.contribution)), 0.0001)
  return (
    <ul className="space-y-1.5">
      {items.map((f) => (
        <li key={f.feature} className="grid grid-cols-[minmax(90px,1fr)_2fr_auto] items-center gap-2 text-xs">
          <span className="truncate font-mono text-foreground/80" title={f.feature}>{f.feature}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full bg-teal-600"
              style={{ width: `${Math.min(100, (Math.abs(f.contribution) / max) * 100)}%` }}
            />
          </span>
          <span className="tabular-nums text-muted-foreground">{Math.round(f.contribution * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}

export default function AnomaliesView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const density = useUi((s) => s.density)
  const canReview = hasPermission(ctx.user.role, 'REVIEW_ANOMALY') || hasPermission(ctx.user.role, 'MANAGE_ML')
  const canScan = canReview

  const [datasets, setDatasets] = useState<DatasetDTO[]>([])
  const [rows, setRows] = useState<AnomalyDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const [fDataset, setFDataset] = useState('all')
  const [fType, setFType] = useState('all')
  const [fReview, setFReview] = useState('all')
  const [fStatus, setFStatus] = useState('all')

  const [scanOpen, setScanOpen] = useState(false)
  const [scanDataset, setScanDataset] = useState('')
  const [scanning, setScanning] = useState(false)

  const [selected, setSelected] = useState<AnomalyDTO | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [ds, an] = await Promise.all([
        api.datasets(),
        api.anomalies({
          datasetId: fDataset === 'all' ? undefined : fDataset,
          type: fType === 'all' ? undefined : fType,
          reviewStatus: fReview === 'all' ? undefined : fReview,
          status: fStatus === 'all' ? undefined : fStatus,
        }),
      ])
      setDatasets(ds.datasets)
      setRows(an.anomalies)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [fDataset, fType, fReview, fStatus])

  useEffect(() => { void load() }, [load])

  const openDetail = (a: AnomalyDTO) => {
    setSelected(a)
    setReviewNote('')
    setDrawerOpen(true)
  }

  const scan = async () => {
    if (!scanDataset) { toast.error(lang === 'th' ? 'เลือกชุดข้อมูลก่อน' : 'Select a dataset first'); return }
    setScanning(true)
    try {
      const res = await api.scanAnomalies(scanDataset)
      toast.success(lang === 'th' ? `จัดคิวสแกน ML แล้ว (job ${res.jobId})` : `ML scan queued (job ${res.jobId})`)
      setScanOpen(false)
      setScanDataset('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const review = async (a: AnomalyDTO, reviewStatus: 'CONFIRMED_ISSUE' | 'FALSE_POSITIVE') => {
    if (reviewStatus === 'FALSE_POSITIVE' && !reviewNote.trim()) {
      toast.error(lang === 'th' ? 'ต้องระบุเหตุผลสำหรับ false positive' : 'A note is required to mark a false positive')
      return
    }
    setActing(true)
    try {
      await api.reviewAnomaly(a.id, { reviewStatus, note: reviewNote.trim() || undefined })
      toast.success(
        reviewStatus === 'CONFIRMED_ISSUE'
          ? lang === 'th' ? 'ยืนยันเป็นปัญหาแล้ว — สร้าง Issue เชื่อมโยงอัตโนมัติ' : 'Confirmed as issue — a linked Issue was auto-created'
          : lang === 'th' ? 'ทำเครื่องหมาย false positive แล้ว' : 'Marked as false positive',
      )
      setReviewNote('')
      void load()
      // refresh the row inside the drawer without closing it
      setSelected((prev) => (prev ? { ...prev, reviewStatus, reviewNote: reviewNote.trim() || prev.reviewNote, reviewedBy: ctx.user.name } : prev))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed')
    } finally {
      setActing(false)
    }
  }

  const columns = useMemo(() => [
    { key: 'detected', headerEn: 'Detected', headerTh: 'ตรวจพบ', render: (a: AnomalyDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(a.detectedAt, lang)}</span> },
    { key: 'dataset', headerEn: 'Dataset', headerTh: 'ชุดข้อมูล', render: (a: AnomalyDTO) => <span className="text-xs font-medium">{a.datasetName ?? a.datasetId}</span> },
    {
      key: 'type', headerEn: 'Type', headerTh: 'ประเภท',
      render: (a: AnomalyDTO) => {
        const meta = ANOMALY_TYPE_META[a.type]
        const Icon = meta?.Icon ?? Sparkles
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Icon className="size-3.5 text-teal-700" aria-hidden />
            {meta ? <T en={meta.en} th={meta.th} /> : a.type}
          </span>
        )
      },
    },
    { key: 'column', headerEn: 'Column', headerTh: 'คอลัมน์', render: (a: AnomalyDTO) => <span className="font-mono text-xs">{a.columnName ?? '—'}</span> },
    { key: 'score', headerEn: 'Score', headerTh: 'คะแนน', render: (a: AnomalyDTO) => <span className={cn('font-mono text-sm font-semibold tabular-nums', scoreTone(a.score))}>{a.score.toFixed(2)}</span> },
    { key: 'stat', headerEn: 'Statistic', headerTh: 'สถิติ', render: (a: AnomalyDTO) => <span className="font-mono text-xs text-muted-foreground">{a.rawStat ?? '—'}</span> },
    {
      key: 'model', headerEn: 'Model', headerTh: 'โมเดล',
      render: (a: AnomalyDTO) => (
        <span className="font-mono text-xs">{a.modelName ? `${a.modelName}#${a.modelVersion ?? '?'}` : '—'}</span>
      ),
    },
    { key: 'review', headerEn: 'Review status', headerTh: 'สถานะการตรวจ', render: (a: AnomalyDTO) => <ReviewBadge status={a.reviewStatus} /> },
    {
      key: 'row', headerEn: 'Row key / value', headerTh: 'แถว / ค่า',
      render: (a: AnomalyDTO) => (
        <span className="flex items-center gap-1.5">
          {a.rowKey && <span className="font-mono text-xs text-muted-foreground">{a.rowKey}</span>}
          {a.valueMasked && <MaskedChip>{a.valueMasked}</MaskedChip>}
          {!a.rowKey && !a.valueMasked && <span className="text-xs text-muted-foreground">—</span>}
        </span>
      ),
    },
  ], [lang])

  if (!hasPermission(ctx.user.role, 'VIEW_ANOMALY')) return <DeniedState resourceEn="anomaly findings" />

  return (
    <PageShell
      objective={{
        en: 'Investigate ML-detected anomalies — every finding cites its model version and requires human review.',
        th: 'ตรวจสอบความผิดปกติที่ ML ตรวจพบ — ทุกผลการตรวจระบุเวอร์ชันของโมเดลและต้องมีมนุษย์ตรวจสอบยืนยัน',
      }}
      primaryAction={canScan ? (
        <Button onClick={() => setScanOpen(true)} className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800">
          <ScanSearch className="size-4" aria-hidden /> <T en="Scan dataset" th="สแกนชุดข้อมูล" />
        </Button>
      ) : undefined}
      guidance={{
        en: 'Detection is a signal, not deletion. Confirm an issue or mark a false positive — both decisions are audit-logged.',
        th: 'การตรวจจับเป็นเพียงสัญญาณ ไม่ใช่การลบข้อมูล ยืนยันเป็นปัญหาหรือทำเครื่องหมาย false positive — ทั้งสองการตัดสินใจถูกบันทึกใน audit trail',
      }}
    >
      <MlDisclaimer />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" role="group" aria-label="Filters">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Filters" th="ตัวกรอง" /></span>
        <Select value={fDataset} onValueChange={setFDataset}>
          <SelectTrigger className="h-10 w-[190px]" aria-label="Dataset filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All datasets" th="ทุกชุดข้อมูล" /></SelectItem>
            {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fType} onValueChange={setFType}>
          <SelectTrigger className="h-10 w-[170px]" aria-label="Type filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All types" th="ทุกประเภท" /></SelectItem>
            {(Object.keys(ANOMALY_TYPE_META) as AnomalyType[]).map((t) => (
              <SelectItem key={t} value={t}><T en={ANOMALY_TYPE_META[t].en} th={ANOMALY_TYPE_META[t].th} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fReview} onValueChange={setFReview}>
          <SelectTrigger className="h-10 w-[180px]" aria-label="Review status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All review statuses" th="ทุกสถานะการตรวจ" /></SelectItem>
            <SelectItem value="PENDING"><T en="Pending review" th="รอการตรวจสอบ" /></SelectItem>
            <SelectItem value="CONFIRMED_ISSUE"><T en="Confirmed issue" th="ยืนยันเป็นปัญหา" /></SelectItem>
            <SelectItem value="FALSE_POSITIVE"><T en="False positive" th="ผลบวกลวง" /></SelectItem>
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="h-10 w-[150px]" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All statuses" th="ทุกสถานะ" /></SelectItem>
            <SelectItem value="OPEN"><T en="Open" th="เปิดอยู่" /></SelectItem>
            <SelectItem value="TRIAGED"><T en="Triaged" th="จัดลำดับแล้ว" /></SelectItem>
            <SelectItem value="RESOLVED"><T en="Resolved" th="แก้ไขแล้ว" /></SelectItem>
            <SelectItem value="DISMISSED"><T en="Dismissed" th="ปิดโดยไม่ดำเนินการ" /></SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <LoadingState label={{ en: 'Loading anomalies…', th: 'กำลังโหลดความผิดปกติ…' }} />
      ) : error ? (
        <ErrorState message={error.message} retry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(a) => a.id}
          onRowClick={openDetail}
          density={density}
          caption="ML-detected anomalies awaiting human review"
          emptyEn="No anomalies match the current filters. Run a scan to look for new findings."
          emptyTh="ไม่พบความผิดปกติตามตัวกรอง ลองสแกนเพื่อค้นหาผลใหม่"
        />
      )}

      {/* Scan dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><T en="Scan dataset for anomalies" th="สแกนหาความผิดปกติในชุดข้อมูล" /></DialogTitle>
            <DialogDescription>
              <T
                en="Queues an ML scan job (Isolation Forest, record linkage, drift monitors). Results are advisory and require human review."
                th="จัดคิวงานสแกน ML (Isolation Forest, record linkage, drift monitor) ผลลัพธ์เป็นเพียงข้อเสนอแนะและต้องมีมนุษย์ตรวจสอบ"
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="scan-dataset"><T en="Dataset" th="ชุดข้อมูล" /></Label>
            <Select value={scanDataset} onValueChange={setScanDataset}>
              <SelectTrigger id="scan-dataset" className="h-10 w-full" aria-label="Dataset to scan"><SelectValue placeholder={lang === 'th' ? 'เลือกชุดข้อมูล' : 'Select a dataset'} /></SelectTrigger>
              <SelectContent>
                {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[40px]" onClick={() => setScanOpen(false)}><T en="Cancel" th="ยกเลิก" /></Button>
            <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={scanning || !scanDataset} onClick={scan}>
              <ScanSearch className="size-4" aria-hidden /> <T en={scanning ? 'Queuing…' : 'Queue scan'} th={scanning ? 'กำลังจัดคิว…' : 'จัดคิวสแกน'} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected ? `${ANOMALY_TYPE_META[selected.type]?.en ?? selected.type} — ${selected.datasetName ?? selected.datasetId}` : ''}
        description={lang === 'th' ? 'รายละเอียดความผิดปกติและการตรวจสอบโดยมนุษย์' : 'Anomaly detail and human review'}
      >
        {selected && (
          <>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <KeyValue kEn="Model" kTh="โมเดล">
                <span className="font-mono text-xs">{selected.modelName ? `${selected.modelName}#${selected.modelVersion ?? '?'}` : '—'}</span>
              </KeyValue>
              <KeyValue kEn="Score / statistic" kTh="คะแนน / สถิติ">
                <span className={cn('font-mono text-sm font-semibold tabular-nums', scoreTone(selected.score))}>{selected.score.toFixed(3)}</span>
                {selected.rawStat && <span className="ml-2 font-mono text-xs text-muted-foreground">{selected.rawStat}</span>}
              </KeyValue>
              <KeyValue kEn="Dataset version" kTh="เวอร์ชันชุดข้อมูล"><span className="font-mono text-xs">{selected.datasetVersion}</span></KeyValue>
              <KeyValue kEn="Detected at" kTh="ตรวจพบเมื่อ"><span className="text-xs">{fmtDateTime(selected.detectedAt, lang)}</span></KeyValue>
              <KeyValue kEn="Row / value" kTh="แถว / ค่า">
                <span className="flex flex-wrap items-center gap-1.5">
                  {selected.rowKey && <span className="font-mono text-xs">{selected.rowKey}</span>}
                  {selected.valueMasked && <MaskedChip>{selected.valueMasked}</MaskedChip>}
                  {selected.expectedMasked && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <T en="expected" th="คาดหวัง" /> <MaskedChip>{selected.expectedMasked}</MaskedChip>
                    </span>
                  )}
                  {!selected.rowKey && !selected.valueMasked && '—'}
                </span>
              </KeyValue>
              <KeyValue kEn="Review status" kTh="สถานะการตรวจ"><ReviewBadge status={selected.reviewStatus} /></KeyValue>
              {selected.reviewedBy && (
                <KeyValue kEn="Reviewed by" kTh="ผู้ตรวจสอบ">
                  <span className="text-xs">{selected.reviewedBy}{selected.reviewNote ? ` — “${selected.reviewNote}”` : ''}</span>
                </KeyValue>
              )}
            </div>

            {selected.explanationEn && (
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><T en="Explanation" th="คำอธิบาย" /></p>
                <p className="text-sm"><T en={selected.explanationEn} th={selected.explanationTh ?? selected.explanationEn} /></p>
              </div>
            )}

            {selected.contributingFeatures && selected.contributingFeatures.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <T en="Contributing features" th="คุณลักษณะที่มีอิทธิพล" />
                </p>
                <FeatureBars items={selected.contributingFeatures} />
              </div>
            )}

            {canReview && selected.reviewStatus === 'PENDING' ? (
              <div className="space-y-2 rounded-lg border border-teal-300 bg-teal-50/50 p-3">
                <p className="text-xs font-semibold text-teal-900"><T en="Human review" th="การตรวจสอบโดยมนุษย์" /></p>
                <p className="text-xs text-teal-900/80">
                  <T
                    en="Confirming auto-creates a tracking Issue (DQ-…) linked to this anomaly. Marking a false positive requires a note."
                    th="การยืนยันจะสร้าง Issue (DQ-…) ที่เชื่อมโยงกับความผิดปกตินี้โดยอัตโนมัติ การทำเครื่องหมาย false positive ต้องระบุเหตุผล"
                  />
                </p>
                <Textarea
                  aria-label="Review note"
                  placeholder={lang === 'th' ? 'บันทึกการตรวจสอบ (จำเป็นสำหรับ false positive)' : 'Review note (required for false positive)'}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="min-h-[72px]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={acting} onClick={() => review(selected, 'CONFIRMED_ISSUE')}>
                    <T en="Confirm as issue" th="ยืนยันเป็นปัญหา" />
                  </Button>
                  <Button variant="outline" className="min-h-[40px] border-red-300 text-red-800 hover:bg-red-50" disabled={acting} onClick={() => review(selected, 'FALSE_POSITIVE')}>
                    <T en="Mark false positive" th="ทำเครื่องหมาย false positive" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                <T
                  en={`Review status: ${selected.reviewStatus.replaceAll('_', ' ').toLowerCase()}. Only pending findings can be reviewed, and you need the REVIEW_ANOMALY permission.`}
                  th={`สถานะการตรวจ: ${selected.reviewStatus.replaceAll('_', ' ').toLowerCase()} เฉพาะผลที่ยังรอตรวจเท่านั้นที่ตรวจได้ และต้องมีสิทธิ์ REVIEW_ANOMALY`}
                />
              </p>
            )}
          </>
        )}
      </DetailDrawer>
    </PageShell>
  )
}
