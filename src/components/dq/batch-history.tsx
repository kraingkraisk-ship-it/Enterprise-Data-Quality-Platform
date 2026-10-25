'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleMinus, ClipboardList, Eye, FileWarning, Layers, Play, RefreshCw, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DimensionBadge } from '@/components/dimension-picker'
import { SEVERITY_LABELS } from '@/lib/dq'

/* ------------------------------------------------------------------ */
/* รอบการตรวจ (Validation Batch) — ประวัติการรันทุกครั้ง + เจาะรายรอบ    */
/* ใช้ในหน้า "ผลการตรวจสอบ" (Validation Results)                       */
/* ------------------------------------------------------------------ */

interface ApiDataset {
  id: string
  name: string
}

interface BatchItem {
  id: string
  datasetId: string
  datasetName: string
  triggeredBy: string
  createdBy: string
  totalRules: number
  passedRules: number
  failedRules: number
  skippedRules: number
  overallScore: number | null
  grade: { band: string; label: string; badgeClass: string; textClass: string } | null
  createdAt: string
}

interface BatchResultItem {
  runId: string
  ruleId: string
  column: string
  conditionName: string
  severity: string
  dimension: string
  clauseNo: number
  sentence: string
  verdict: string
  advice: string | null
  status: 'PASSED' | 'FAILED' | 'NO_DATA'
  totalRows: number
  failedRows: number
  passRate: number
  failuresCount: number
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface BatchHistoryProps {
  /** เปลี่ยนค่านี้เมื่อต้องการโหลดรายการใหม่ (เช่น หลังรันตรวจเสร็จ) */
  reloadKey: number
  datasets: ApiDataset[]
  onGoFailedRecords: () => void
}

export default function BatchHistory({ reloadKey, datasets, onGoFailedRecords }: BatchHistoryProps) {
  const [batches, setBatches] = useState<BatchItem[] | null>(null)
  const [filterDataset, setFilterDataset] = useState('')
  const [detail, setDetail] = useState<{ batch: BatchItem; results: BatchResultItem[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = useCallback(async () => {
    try {
      const qs = filterDataset ? `?datasetId=${encodeURIComponent(filterDataset)}` : ''
      const res = await fetch(`/api/dq/validations${qs}`)
      const data = (await res.json()) as { batches?: BatchItem[] }
      setBatches(data.batches ?? [])
    } catch {
      setBatches([])
    }
  }, [filterDataset])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  async function openDetail(b: BatchItem) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/dq/validations/${b.id}`)
      const data = (await res.json()) as { batch?: BatchItem; results?: BatchResultItem[]; error?: string }
      if (data.batch && data.results) {
        setDetail({ batch: data.batch, results: data.results })
      }
    } catch {
      /* ไม่สำเร็จ — ปิดได้เฉย ๆ */
    } finally {
      setLoadingDetail(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4 text-emerald-700" aria-hidden="true" />
              รอบการตรวจล่าสุด (Validation Batches)
            </CardTitle>
            <CardDescription>กดรัน 1 ครั้ง = 1 รอบ — เจาะดูผลรายกฎและคำตัดสินตามมาตราได้ทุกรอบ</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="กรองตามชุดข้อมูล"
              value={filterDataset}
              onChange={(e) => setFilterDataset(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">ทุกชุดข้อมูล</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              รีเฟรช
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {batches === null && <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลดรอบการตรวจ…</p>}
        {batches !== null && batches.length === 0 && (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            ยังไม่มีรอบการตรวจ — รันการตรวจสอบด้านบน แล้วรอบจะปรากฏที่นี่
          </p>
        )}
        {batches !== null && batches.length > 0 && (
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-emerald-50/90 text-emerald-900 backdrop-blur">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">วันที่ · เวลา</th>
                  <th scope="col" className="px-3 py-2 font-medium">ชุดข้อมูล</th>
                  <th scope="col" className="px-3 py-2 font-medium">ผู้รัน</th>
                  <th scope="col" className="px-3 py-2 font-medium">ผลกฎ (ผ่าน/ล้มเหลว/ข้าม)</th>
                  <th scope="col" className="px-3 py-2 font-medium">คะแนนรวม</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-t transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{fmtTime(b.createdAt)}</td>
                    <td className="max-w-48 truncate px-3 py-2 font-medium" title={b.datasetName}>{b.datasetName}</td>
                    <td className="max-w-40 truncate px-3 py-2 text-[11px] text-muted-foreground" title={b.createdBy}>{b.createdBy}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="ผ่าน" />
                        {b.passedRules}
                        <XCircle className="ml-1 size-3.5 text-rose-600" aria-label="ล้มเหลว" />
                        {b.failedRules}
                        <span className="ml-1 text-muted-foreground">/ ข้าม {b.skippedRules}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {b.overallScore !== null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{b.overallScore.toFixed(1)}</span>
                          {b.grade && (
                            <Badge variant="outline" className={`border text-[10px] font-semibold ${b.grade.badgeClass}`}>
                              {b.grade.label}
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => void openDetail(b)} disabled={loadingDetail}>
                        <Eye className="size-3" aria-hidden="true" />
                        เปิดดู
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Dialog เจาะรายรอบ */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                  <ClipboardList className="size-4 text-emerald-700" aria-hidden="true" />
                  รอบการตรวจ — {detail.batch.datasetName}
                  {detail.batch.overallScore !== null && (
                    <Badge variant="outline" className={`border text-xs font-semibold ${detail.batch.grade?.badgeClass ?? ''}`}>
                      คะแนน {detail.batch.overallScore.toFixed(1)} {detail.batch.grade ? `· เกรด ${detail.batch.grade.label}` : ''}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {fmtTime(detail.batch.createdAt)} · ผู้รัน {detail.batch.createdBy} · กฎ {detail.batch.totalRules} ข้อ (ผ่าน {detail.batch.passedRules} · ล้มเหลว {detail.batch.failedRules} · ข้าม {detail.batch.skippedRules})
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[55vh] pr-3">
                <div className="space-y-2">
                  {detail.results.map((r) => (
                    <div key={r.runId} className="rounded-lg border p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {r.status === 'PASSED' ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-label="ผ่าน" />
                        ) : r.status === 'NO_DATA' ? (
                          <CircleMinus className="size-4 text-amber-600" aria-label="ไม่มีข้อมูลให้ตรวจ" />
                        ) : (
                          <XCircle className="size-4 text-rose-600" aria-label="ล้มเหลว" />
                        )}
                        <Badge variant="outline" className={`border text-[11px] ${SEVERITY_BADGE[r.severity] ?? ''}`}>
                          {SEVERITY_LABELS[r.severity as keyof typeof SEVERITY_LABELS]?.th ?? r.severity}
                        </Badge>
                        <DimensionBadge dimension={r.dimension} />
                        <Badge variant="outline" className="text-[11px]">{r.conditionName}</Badge>
                        <span
                          className={`text-xs font-semibold ${
                            r.status === 'PASSED'
                              ? 'text-emerald-700'
                              : r.status === 'NO_DATA'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {r.status === 'PASSED'
                            ? 'ผ่าน'
                            : r.status === 'NO_DATA'
                              ? 'ไม่มีข้อมูลให้ตรวจ (0 แถว)'
                              : `ล้มเหลว ${r.failedRows}/${r.totalRows} แถว (${Math.round(r.passRate * 100)}%)`}
                        </span>
                        {r.failuresCount > 0 && (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-800">
                            <FileWarning className="mr-1 size-3" aria-hidden="true" />
                            เก็บแถวล้มเหลว {r.failuresCount}
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-[12px] text-slate-700">{r.sentence}</p>
                      <p
                        className={`mt-1 text-[12.5px] leading-relaxed ${
                          r.status === 'PASSED' ? 'text-emerald-800' : r.status === 'NO_DATA' ? 'text-amber-800' : 'text-rose-800'
                        }`}
                        role="note"
                      >
                        {r.verdict}
                      </p>
                    </div>
                  ))}
                  {detail.results.some((r) => r.failuresCount > 0) && (
                    <Button variant="outline" className="mt-1 w-full gap-2" onClick={onGoFailedRecords}>
                      <Play className="size-4" aria-hidden="true" />
                      ดูรายการข้อมูลที่ไม่ผ่านทั้งหมดในหน้า Failed Records
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
