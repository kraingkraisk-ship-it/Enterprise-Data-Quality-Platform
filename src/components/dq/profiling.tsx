'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, Info, Play, RefreshCw, ScanSearch, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { DATA_TYPE_LABELS } from '@/lib/profiling'

/* ------------------------------------------------------------------ */
/* Data Profiling — สำรวจลักษณะข้อมูลจริงรายคอลัมน์                     */
/* READ-ONLY · ทำงานบน snapshot sandbox · PII mask ตามบทบาท (PDPA)      */
/* ------------------------------------------------------------------ */

interface ApiUser {
  id: string
  email: string
  name: string
  role: string
  status: 'ACTIVE' | 'SUSPENDED'
}

interface ApiDataset {
  id: string
  name: string
}

interface ProfileRunSummary {
  id: string
  datasetId: string
  datasetName?: string
  totalRows: number
  totalColumns: number
  avgCompleteness: number | null
  avgUniqueness: number | null
  piiColumnCount: number
  durationMs: number
  createdBy: string
  createdAt: string
}

interface ProfileColumn {
  id: string
  columnName: string
  dataType: string
  totalRows: number
  nullCount: number
  nullPct: number
  distinctCount: number
  distinctPct: number
  minValue: string | null
  maxValue: string | null
  meanValue: string | null
  minLength: number | null
  maxLength: number | null
  topValues: Array<{ value: string; count: number }>
  piiSuspected: boolean
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function completenessColor(pct: number | null): string {
  if (pct === null) return 'text-slate-500'
  if (pct >= 95) return 'text-emerald-700'
  if (pct >= 80) return 'text-amber-700'
  return 'text-rose-700'
}

export default function DqProfiling({ active }: { active: boolean }) {
  const { toast } = useToast()

  const [users, setUsers] = useState<ApiUser[]>([])
  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [datasetId, setDatasetId] = useState('')
  const [operatorEmail, setOperatorEmail] = useState('malee.steward@company.co.th')

  const [runs, setRuns] = useState<ProfileRunSummary[] | null>(null)
  const [current, setCurrent] = useState<{ run: ProfileRunSummary; columns: ProfileColumn[]; piiMasked: boolean } | null>(null)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // ผู้ชม — PII ตามบทบาท (PDPA)
  const [viewerEmail, setViewerEmail] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [u, d] = await Promise.all([
          fetch('/api/rbac/users').then((r) => r.json()),
          fetch('/api/rbac/datasets').then((r) => r.json()),
        ])
        const activeUsers = (u.users ?? []).filter((x: ApiUser) => x.status === 'ACTIVE')
        setUsers(activeUsers)
        setDatasets(d.datasets ?? [])
      } catch {
        /* คงค่าว่าง */
      }
    })()
  }, [])

  const loadRuns = useCallback(async (dsId: string) => {
    if (!dsId) {
      setRuns([])
      setCurrent(null)
      return
    }
    setRuns(null)
    try {
      const res = await fetch(`/api/dq/profile?datasetId=${encodeURIComponent(dsId)}`)
      const data = await res.json()
      setRuns(data.runs ?? [])
      if (data.runs?.[0]?.id) {
        await openRun(data.runs[0].id)
      } else {
        setCurrent(null)
      }
    } catch {
      setRuns([])
    }
  }, [])

  useEffect(() => {
    if (active && datasetId) void loadRuns(datasetId)
  }, [active, datasetId, loadRuns])

  async function openRun(id: string) {
    setLoadingColumns(true)
    try {
      const qs = viewerEmail ? `?operatorEmail=${encodeURIComponent(viewerEmail)}` : ''
      const res = await fetch(`/api/dq/profile/${id}${qs}`)
      const data = await res.json()
      if (data.error) {
        toast({ title: 'โหลดผลโปรไฟล์ไม่สำเร็จ', description: data.error, variant: 'destructive' })
        return
      }
      setCurrent({ run: data.run, columns: data.columns ?? [], piiMasked: data.piiMasked ?? true })
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setLoadingColumns(false)
    }
  }

  // เปลี่ยนผู้ชม → โหลดผลล่าสุดใหม่ด้วยบทบาทใหม่
  useEffect(() => {
    if (current?.run.id) void openRun(current.run.id)
  }, [viewerEmail])

  async function runProfile() {
    if (!datasetId) {
      toast({ title: 'กรุณาเลือกชุดข้อมูลก่อน', variant: 'destructive' })
      return
    }
    setBusy('run-profile')
    try {
      const res = await fetch('/api/dq/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, operatorEmail }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast({ title: 'รันโปรไฟล์ไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: `โปรไฟล์สำเร็จ — ${data.run.totalColumns} คอลัมน์ / ${data.run.totalRows} แถว (${data.run.durationMs} ms)` })
      await loadRuns(datasetId)
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const kpis = [
    { label: 'ความสมบูรณ์เฉลี่ย', value: current ? `${current.run.avgCompleteness ?? '—'}%` : '…', cls: completenessColor(current?.run.avgCompleteness ?? null) },
    { label: 'ความไม่ซ้ำเฉลี่ย', value: current ? `${current.run.avgUniqueness ?? '—'}%` : '…', cls: 'text-teal-700' },
    { label: 'คอลัมน์สงสัย PII', value: current ? String(current.run.piiColumnCount) : '…', cls: current && current.run.piiColumnCount > 0 ? 'text-amber-700' : 'text-slate-600' },
    { label: 'รอบที่โปรไฟล์แล้ว', value: runs ? String(runs.length) : '…', cls: 'text-slate-700' },
  ]

  return (
    <div className="space-y-4">
      {/* คำเตือนหลักการ */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900" role="note">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <p>
          <strong>หลักการ:</strong> โปรไฟล์อ่านข้อมูลจาก snapshot sandbox อย่างเดียว (READ-ONLY) — ไม่มีการเขียนหรือแก้ไขข้อมูลต้นทางทุกกรณี และค่าที่พบบ่อย (top values) จะถูกปิดบัง PII ตามบทบาทผู้ชม ตามหลัก PDPA
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.cls}`}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* แผงควบคุม */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="size-4 text-emerald-700" aria-hidden="true" />
            รันโปรไฟล์ข้อมูล
          </CardTitle>
          <CardDescription>เลือกชุดข้อมูลและผู้ดำเนินการ (ต้องมีสิทธิ์ RUN_VALIDATION) — ผลล่าสุดจะแสดงด้านล่างทันที</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="pf-dataset">ชุดข้อมูล</Label>
              <select
                id="pf-dataset"
                aria-label="เลือกชุดข้อมูลที่จะโปรไฟล์"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">— เลือกชุดข้อมูล —</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-operator">ผู้ดำเนินการ</Label>
              <select
                id="pf-operator"
                aria-label="เลือกผู้ดำเนินการ (ต้องมีสิทธิ์รันโปรไฟล์)"
                value={operatorEmail}
                onChange={(e) => setOperatorEmail(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={runProfile}
                disabled={!datasetId || busy !== null}
              >
                <Play className="size-4" aria-hidden="true" />
                {busy === 'run-profile' ? 'กำลังโปรไฟล์…' : 'รันโปรไฟล์'}
              </Button>
              <Button size="icon" variant="outline" aria-label="รีเฟรชผลโปรไฟล์" onClick={() => datasetId && void loadRuns(datasetId)} disabled={busy !== null}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pf-viewer" className="flex items-center gap-1 text-xs">
                <Eye className="size-3" aria-hidden="true" />
                ผู้ชม (PII ตามบทบาท)
              </Label>
              <select
                id="pf-viewer"
                aria-label="เลือกผู้ชมเพื่อดูค่าที่พบบ่อยตามสิทธิ์บทบาท"
                value={viewerEmail}
                onChange={(e) => setViewerEmail(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="">ปิดบังเข้มสุด (แนะนำ)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ผลโปรไฟล์รายคอลัมน์ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">ผลโปรไฟล์รายคอลัมน์</CardTitle>
              <CardDescription>
                {current
                  ? `${current.run.datasetName} · ${current.run.totalRows} แถว / ${current.run.totalColumns} คอลัมน์ · รันเมื่อ ${fmtTime(current.run.createdAt)} โดย ${current.run.createdBy}${current.piiMasked ? ' · ปิดบัง PII ตามบทบาทผู้ชม' : ''}`
                  : 'เลือกชุดข้อมูลแล้วกด "รันโปรไฟล์" — หรือเลือกจากประวัติด้านล่าง'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingColumns && (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          )}
          {!loadingColumns && !current && (
            <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              ยังไม่มีผลโปรไฟล์ — เลือกชุดข้อมูลที่มีตัวอย่างข้อมูลแล้วกด &quot;รันโปรไฟล์&quot;
            </p>
          )}
          {!loadingColumns && current && current.columns.length === 0 && (
            <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">รอบนี้ไม่มีคอลัมน์ให้แสดง</p>
          )}
          {!loadingColumns && current && current.columns.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="sticky top-0 bg-emerald-50/90 text-emerald-900 backdrop-blur">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">คอลัมน์</th>
                    <th scope="col" className="px-3 py-2 font-medium">ชนิดข้อมูล</th>
                    <th scope="col" className="px-3 py-2 font-medium">ค่าว่าง</th>
                    <th scope="col" className="px-3 py-2 font-medium">ไม่ซ้ำ</th>
                    <th scope="col" className="px-3 py-2 font-medium">ช่วงค่า / ค่าเฉลี่ย</th>
                    <th scope="col" className="px-3 py-2 font-medium">ค่าที่พบบ่อย</th>
                  </tr>
                </thead>
                <tbody>
                  {current.columns.map((c) => {
                    const typeMeta = DATA_TYPE_LABELS[c.dataType] ?? DATA_TYPE_LABELS.TEXT
                    return (
                      <tr key={c.id} className="border-t align-top transition-colors hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className="block max-w-44 truncate font-mono text-[11px] font-medium text-slate-800" title={c.columnName}>
                            {c.columnName}
                          </span>
                          {c.piiSuspected && (
                            <Badge variant="outline" className="mt-1 border-amber-300 bg-amber-50 text-[10px] text-amber-900">
                              <Info className="mr-0.5 size-2.5" aria-hidden="true" />
                              PII
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`border text-[10.5px] ${typeMeta.cls}`}>{typeMeta.th}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${completenessColor(100 - c.nullPct)}`}>{c.nullPct}%</span>
                          <span className="block text-[10px] text-muted-foreground">{c.nullCount}/{c.totalRows} แถว</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-700">{c.distinctPct}%</span>
                          <span className="block text-[10px] text-muted-foreground">{c.distinctCount} ค่า</span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-600">
                          {(c.dataType === 'INTEGER' || c.dataType === 'NUMBER') && c.meanValue !== null ? (
                            <>
                              <span className="block">ต่ำสุด {c.minValue} · สูงสุด {c.maxValue}</span>
                              <span className="block text-muted-foreground">เฉลี่ย {c.meanValue}</span>
                            </>
                          ) : c.minValue !== null ? (
                            <>
                              <span className="block max-w-40 truncate" title={c.minValue}>ต่ำสุด {c.minValue}</span>
                              <span className="block max-w-40 truncate text-muted-foreground" title={c.maxValue ?? ''}>สูงสุด {c.maxValue}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {c.topValues.length > 0 ? (
                            <div className="flex max-w-56 flex-wrap gap-1">
                              {c.topValues.slice(0, 3).map((t) => (
                                <Badge key={`${t.value}-${t.count}`} variant="outline" className="max-w-40 truncate border-slate-200 bg-slate-50 text-[10px] font-normal text-slate-700" title={`${t.value} (${t.count} ครั้ง)`}>
                                  {t.value} <span className="text-slate-400">×{t.count}</span>
                                </Badge>
                              ))}
                              {c.topValues.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">+{c.topValues.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10.5px] text-muted-foreground">ไม่มีค่า</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ประวัติรอบโปรไฟล์ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ประวัติรอบโปรไฟล์</CardTitle>
          <CardDescription>คลิกเพื่อเปิดผลของรอบนั้น (เก็บย้อนหลัง 12 รอบล่าสุดต่อชุดข้อมูล)</CardDescription>
        </CardHeader>
        <CardContent>
          {runs === null && datasetId && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}
          {runs !== null && runs.length === 0 && (
            <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
              {datasetId ? 'ยังไม่มีประวัติโปรไฟล์ของชุดข้อมูลนี้' : 'เลือกชุดข้อมูลก่อนเพื่อดูประวัติ'}
            </p>
          )}
          {runs !== null && runs.length > 0 && (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openRun(r.id)}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-emerald-50/60 ${current?.run.id === r.id ? 'border-emerald-300 bg-emerald-50/60' : ''}`}
                  >
                    <span className="font-medium text-slate-800">{fmtTime(r.createdAt)}</span>
                    <span className="text-muted-foreground">
                      {r.totalRows} แถว · {r.totalColumns} คอลัมน์ · สมบูรณ์ <span className={`font-medium ${completenessColor(r.avgCompleteness)}`}>{r.avgCompleteness ?? '—'}%</span> · PII {r.piiColumnCount} · {r.createdBy}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
