'use client'
// Reports view — export audit-ready reports with explicit classification and
// masking disclosure. Unmasked exports do not exist in this platform.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ClipboardCopy, Download, Eye, FileSpreadsheet, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { DatasetDTO } from '@/lib/types'
import { hasPermission } from '@/lib/types'
import { T, fmtDateTime, useLang } from '@/lib/i18n'
import {
  ClassificationBadge, DeniedState, ErrorState, LoadingState, PageShell, SectionHeading,
} from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ViewCtx } from './ctx'

type ExportResult = { downloadUrl: string; auditId: string; classification: string; maskingLevel: string; expiresAt: string }

const REPORT_TYPES = [
  { value: 'dataset_summary', en: 'Dataset summary', th: 'สรุปรายชุดข้อมูล', needsDataset: true },
  { value: 'validation_history', en: 'Validation history', th: 'ประวัติการตรวจสอบ', needsDataset: true },
  { value: 'issue_log', en: 'Issue log', th: 'บันทึกปัญหา', needsDataset: false },
  { value: 'executive_scorecard', en: 'Executive scorecard', th: 'บัตรคะแนนผู้บริหาร', needsDataset: false },
] as const

export default function ReportsView({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()

  const [datasets, setDatasets] = useState<DatasetDTO[]>([])
  const [maskingMode, setMaskingMode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const [type, setType] = useState<string>('dataset_summary')
  const [datasetId, setDatasetId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [copied, setCopied] = useState(false)

  const typeMeta = REPORT_TYPES.find((t) => t.value === type) ?? REPORT_TYPES[0]
  const needsDataset = typeMeta.needsDataset
  const dataset = useMemo(() => datasets.find((d) => d.id === datasetId) ?? null, [datasets, datasetId])
  const classification = dataset?.classification ?? 'INTERNAL'

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [ds, policy] = await Promise.all([api.datasets(), api.policy().catch(() => ({ settings: [] }))])
      setDatasets(ds.datasets)
      const mask = policy.settings.find((s) => s.key === 'masking.defaultMode')
      setMaskingMode(typeof mask?.value === 'string' ? mask.value : null)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const exportNow = async () => {
    setExporting(true)
    try {
      const res = await api.exportReport({ type, datasetId: needsDataset ? datasetId : undefined, format: 'csv' })
      setResult(res)
      setConfirmOpen(false)
      toast.success(lang === 'th' ? 'ส่งออกรายงานสำเร็จ (บันทึกใน audit trail)' : 'Report exported (recorded in the audit trail)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const copyAuditId = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.auditId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(lang === 'th' ? 'คัดลอกไม่สำเร็จ' : 'Copy failed')
    }
  }

  if (!hasPermission(ctx.user.role, 'EXPORT_REPORT')) return <DeniedState resourceEn="report exports" />

  return (
    <PageShell
      objective={{
        en: 'Export audit-ready reports with explicit classification and masking disclosure.',
        th: 'ส่งออกรายงานที่พร้อมตรวจสอบ พร้อมระบุระดับชั้นความลับและการปกปิดข้อมูลอย่างชัดเจน',
      }}
      guidance={{
        en: 'Every export is an audited event. The disclosure card below always reflects the current selection before you confirm.',
        th: 'การส่งออกทุกครั้งเป็นเหตุการณ์ที่ถูกตรวจสอบได้ การ์ดเปิดเผยข้อมูลด้านล่างจะสะท้อนตัวเลือกปัจจุบันก่อนการยืนยันเสมอ',
      }}
    >
      {loading ? (
        <LoadingState label={{ en: 'Loading report options…', th: 'กำลังโหลดตัวเลือกรายงาน…' }} />
      ) : error ? (
        <ErrorState message={error.message} retry={load} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Selection form */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <SectionHeading titleEn="Report selection" titleTh="เลือกรายงาน" />
            <div className="mt-3 grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rep-type"><T en="Report type" th="ประเภทรายงาน" /></Label>
                <Select value={type} onValueChange={(v) => { setType(v); setResult(null) }}>
                  <SelectTrigger id="rep-type" className="h-10 w-full" aria-label="Report type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}><T en={t.en} th={t.th} /></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {needsDataset && (
                <div className="space-y-1.5">
                  <Label htmlFor="rep-dataset"><T en="Dataset (required)" th="ชุดข้อมูล (จำเป็น)" /></Label>
                  <Select value={datasetId} onValueChange={(v) => { setDatasetId(v); setResult(null) }}>
                    <SelectTrigger id="rep-dataset" className="h-10 w-full" aria-label="Report dataset">
                      <SelectValue placeholder={lang === 'th' ? 'เลือกชุดข้อมูล' : 'Select dataset'} />
                    </SelectTrigger>
                    <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground"><T en="Only datasets you are permitted to see are listed." th="แสดงเฉพาะชุดข้อมูลที่คุณมีสิทธิ์เข้าถึง" /></p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label><T en="Format" th="รูปแบบไฟล์" /></Label>
                <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  <FileSpreadsheet className="size-4" aria-hidden /> CSV (formula-injection sanitised)
                </div>
              </div>
              <div className="pt-1">
                <Button
                  className="min-h-[40px] w-full bg-teal-700 text-white hover:bg-teal-800 sm:w-auto"
                  disabled={exporting || (needsDataset && !datasetId)}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Download className="size-4" aria-hidden /> <T en="Export" th="ส่งออก" />
                </Button>
              </div>
            </div>
          </div>

          {/* Disclosure card */}
          <div className="rounded-lg border border-teal-300 bg-teal-50/40 p-4 shadow-sm">
            <SectionHeading
              titleEn="Disclosure before export"
              titleTh="การเปิดเผยข้อมูลก่อนส่งออก"
              hintEn="Updates live with your selection."
              hintTh="อัปเดตตามตัวเลือกของคุณทันที"
            />
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2 rounded border bg-card p-2.5">
                <span className="text-xs font-medium text-muted-foreground"><T en="Classification" th="ระดับชั้นความลับ" /></span>
                <ClassificationBadge level={classification} />
              </div>
              {!dataset && (
                <p className="text-xs text-muted-foreground">
                  <T en="Aggregate export — classified INTERNAL by policy." th="รายงานเชิงรวม — จัดระดับ INTERNAL ตามนโยบาย" />
                </p>
              )}
              <div className="rounded border bg-card p-2.5">
                <p className="text-xs font-medium text-muted-foreground"><T en="Masking level" th="ระดับการปกปิด" /></p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal-900">
                  <Eye className="size-4" aria-hidden />
                  {maskingMode ?? 'FULL'} — <T en="PII masked in exports" th="ข้อมูลส่วนบุคคลถูกปกปิดในไฟล์ส่งออก" />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <T en="Policy masking.defaultMode. EMAIL, PHONE, NAME, ID and ACCOUNT fields are masked at export time." th="ตามนโยบาย masking.defaultMode ฟิลด์ EMAIL, PHONE, NAME, ID และ ACCOUNT จะถูกปกปิดตอนส่งออก" />
                </p>
              </div>
              <div className="rounded border bg-card p-2.5 text-xs text-muted-foreground">
                <T
                  en="Retention: download links expire in 24h; export events are audit-logged."
                  th="การเก็บรักษา: ลิงก์ดาวน์โหลดหมดอายุใน 24 ชั่วโมง เหตุการณ์ส่งออกถูกบันทึกใน audit trail"
                />
              </div>
              <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <T
                  en="Auditors receive the same masking policy; unmasked exports do not exist in this platform."
                  th="ผู้สอบบัญชีได้รับนโยบายการปกปิดเดียวกัน ไม่มีการส่งออกแบบไม่ปกปิดในแพลตฟอร์มนี้"
                />
              </div>
            </div>
          </div>

          {/* Success card */}
          {result && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 shadow-sm lg:col-span-2" role="status">
              <SectionHeading titleEn="Export ready" titleTh="รายงานพร้อมดาวน์โหลด" />
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded border bg-card p-3">
                  <p className="text-xs font-medium text-muted-foreground"><T en="Audit ID" th="รหัสตรวจสอบ" /></p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{result.auditId}</code>
                    <Button variant="ghost" size="sm" className="min-h-[40px] min-w-[40px] px-2" onClick={copyAuditId} aria-label="Copy audit ID">
                      {copied ? <Check className="size-4 text-emerald-700" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
                    </Button>
                  </div>
                </div>
                <div className="rounded border bg-card p-3">
                  <p className="text-xs font-medium text-muted-foreground"><T en="Download" th="ดาวน์โหลด" /></p>
                  <Button asChild variant="outline" className="mt-1 min-h-[40px] border-teal-300 text-teal-800 hover:bg-teal-50">
                    <a href={result.downloadUrl} download aria-label="Download report CSV">
                      <Download className="size-4" aria-hidden /> <T en="Download CSV" th="ดาวน์โหลด CSV" />
                    </a>
                  </Button>
                </div>
                <div className="rounded border bg-card p-3">
                  <p className="text-xs font-medium text-muted-foreground"><T en="Link expires at" th="ลิงก์หมดอายุ" /></p>
                  <p className="mt-1 text-sm">{fmtDateTime(result.expiresAt, lang)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <T en={`Classification: ${result.classification} · Masking: ${result.maskingLevel}`} th={`ระดับชั้นความลับ: ${result.classification} · การปกปิด: ${result.maskingLevel}`} />
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explicit export confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><T en="Confirm export" th="ยืนยันการส่งออก" /></AlertDialogTitle>
            <AlertDialogDescription>
              <T
                en="You are about to generate a CSV export. Please confirm the classification and masking that will apply."
                th="คุณกำลังจะสร้างไฟล์ส่งออก CSV โปรดยืนยันระดับชั้นความลับและการปกปิดที่จะใช้"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1.5 rounded border bg-muted/40 p-3 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground"><T en="Report" th="รายงาน" /></span>
              <span className="font-medium">{typeMeta.en ?? type} {needsDataset ? `· ${dataset?.name ?? ''}` : ''}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground"><T en="Classification" th="ระดับชั้นความลับ" /></span>
              <ClassificationBadge level={classification} />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground"><T en="Masking" th="การปกปิด" /></span>
              <span className="font-medium">{maskingMode ?? 'FULL'} — <T en="PII masked" th="ปกปิดข้อมูลส่วนบุคคล" /></span>
            </li>
            <li className="text-xs text-muted-foreground">
              <T en="This export event will be audit-logged with your identity." th="เหตุการณ์ส่งออกนี้จะถูกบันทึกใน audit trail พร้อมตัวตนของคุณ" />
            </li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[40px]"><T en="Cancel" th="ยกเลิก" /></AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800"
              disabled={exporting}
              onClick={(e) => { e.preventDefault(); void exportNow() }}
            >
              <Download className="size-4" aria-hidden /> <T en={exporting ? 'Exporting…' : 'Export'} th={exporting ? 'กำลังส่งออก…' : 'ส่งออก'} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
