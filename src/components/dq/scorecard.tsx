'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, Gauge, LineChart, RefreshCw, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DIMENSION_ICONS } from '@/components/dimension-picker'

/* ------------------------------------------------------------------ */
/* DQ Scorecard — บัตรคะแนนคุณภาพข้อมูลรายชุดข้อมูล                     */
/* เมทริกซ์ ชุดข้อมูล × 9 มิติ (DAMA-DMBOK) + เกรด + แนวโน้ม 30 วัน      */
/* ------------------------------------------------------------------ */

interface DimensionCell {
  dimension: string
  th: string
  en: string
  clauseNo: number
  score: number | null
  grade: { band: string; label: string; badgeClass: string; textClass: string } | null
  rulesCount: number
  failedRules: number
}

interface TrendPoint {
  date: string
  score: number
  runs: number
}

interface ScorecardDataset {
  id: string
  name: string
  sourceType: string
  rulesCount: number
  score: number | null
  grade: { band: string; label: string; badgeClass: string; textClass: string } | null
  lastRunAt: string | null
  dimensions: DimensionCell[]
  trend: TrendPoint[]
}

interface ScorecardData {
  kpis: {
    datasetsTotal: number
    datasetsWithRun: number
    avgScore: number | null
    avgGrade: { band: string; label: string; badgeClass: string; textClass: string } | null
    weakest: { dimension: string; th: string; en: string; avg: number | null } | null
    strongest: { dimension: string; th: string; en: string; avg: number | null } | null
  }
  datasets: ScorecardDataset[]
}

/** สีเซลล์คะแนนในเมทริกซ์ (ตามเกณฑ์เกรดเดียวกันทั้งระบบ) */
function cellClass(score: number | null): string {
  if (score === null) return 'bg-slate-50 text-slate-400'
  if (score >= 95) return 'bg-emerald-50 text-emerald-800'
  if (score >= 85) return 'bg-teal-50 text-teal-800'
  if (score >= 70) return 'bg-amber-50 text-amber-900'
  return 'bg-rose-50 text-rose-800'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return iso
  }
}

/** เส้นแนวโน้มเล็ก (SVG inline — ไม่พึ่งไลบรารีเพิ่ม) */
function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <span className="text-[10px] text-muted-foreground">ข้อมูลน้อย — ต้องตรวจอีกหลายรอบ</span>
  }
  const w = 120
  const h = 32
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores, 60)
  const max = Math.max(...scores, 100)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p.score - min) / range) * (h - 4) - 2).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1].score
  const first = points[0].score
  const up = last >= first
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`แนวโน้มคะแนน ${points.length} จุด`}>
        <polyline points={coords} fill="none" stroke={up ? '#059669' : '#e11d48'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {up ? (
        <TrendingUp className="size-3.5 text-emerald-600" aria-label="ทิศทางดีขึ้น" />
      ) : (
        <TrendingDown className="size-3.5 text-rose-600" aria-label="ทิศทางแย่ลง" />
      )}
    </span>
  )
}

interface ScorecardProps {
  /** โหลดข้อมูลใหม่ทุกครั้งที่เปิดหน้า */
  active: boolean
  onGoValidations: () => void
}

export default function DqScorecard({ active, onGoValidations }: ScorecardProps) {
  const [data, setData] = useState<ScorecardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dq/scorecard')
      const json = (await res.json()) as ScorecardData & { error?: string }
      if (!json.error) setData(json)
    } catch {
      /* คงข้อมูลเดิม */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  const kpis = data?.kpis
  const dimensionHeaders = data?.datasets[0]?.dimensions ?? []

  return (
    <div className="space-y-4">
      {/* ----------------------------- KPI ----------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gauge className="size-3.5 text-emerald-700" aria-hidden="true" />
            คะแนนเฉลี่ยองค์กร
          </p>
          <div className="mt-1 flex items-center gap-2">
            {loading && !data ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className={`text-2xl font-bold ${kpis?.avgGrade?.textClass ?? 'text-slate-700'}`}>
                {kpis?.avgScore !== null && kpis?.avgScore !== undefined ? kpis.avgScore.toFixed(1) : '—'}
                <span className="text-sm">/100</span>
              </p>
            )}
            {kpis?.avgGrade && (
              <Badge variant="outline" className={`border text-[11px] font-semibold ${kpis.avgGrade.badgeClass}`}>
                {kpis.avgGrade.label}
              </Badge>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">ชุดข้อมูลที่ตรวจแล้ว</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {loading && !data ? '…' : `${kpis?.datasetsWithRun ?? 0}/${kpis?.datasetsTotal ?? 0}`}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="size-3.5 text-rose-600" aria-hidden="true" />
            มิติอ่อนที่สุด
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-rose-800" title={kpis?.weakest?.th}>
            {kpis?.weakest ? `${kpis.weakest.th} (${kpis.weakest.avg?.toFixed(1)})` : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5 text-emerald-600" aria-hidden="true" />
            มิติแข็งแกร่งสุด
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-emerald-800" title={kpis?.strongest?.th}>
            {kpis?.strongest ? `${kpis.strongest.th} (${kpis.strongest.avg?.toFixed(1)})` : '—'}
          </p>
        </Card>
      </div>

      {/* --------------------------- เมทริกซ์ --------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4 text-emerald-700" aria-hidden="true" />
                บัตรคะแนนรายชุดข้อมูล × 9 มิติ (DAMA-DMBOK)
              </CardTitle>
              <CardDescription>คะแนนจากผลการตรวจล่าสุดของทุกกฎ — กดแถวเพื่อดูรายละเอียดมิติและแนวโน้ม</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              รีเฟรช
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!data && loading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          )}
          {data && data.datasets.length === 0 && (
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              ยังไม่มีชุดข้อมูลในระบบ
            </p>
          )}
          {data && data.datasets.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-emerald-50/90 text-emerald-900">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">ชุดข้อมูล</th>
                    {dimensionHeaders.map((d) => {
                      const Icon = DIMENSION_ICONS[d.dimension as keyof typeof DIMENSION_ICONS]
                      return (
                        <th
                          key={d.dimension}
                          scope="col"
                          className="px-1.5 py-2 text-center font-medium"
                          title={`มาตรา ${d.clauseNo}: ${d.th} (${d.en})`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {Icon && <Icon className="size-3" aria-hidden="true" />}
                            <span className="hidden xl:inline">{d.th}</span>
                            <span className="xl:hidden">{d.clauseNo}</span>
                          </span>
                        </th>
                      )
                    })}
                    <th scope="col" className="px-3 py-2 text-center font-medium">รวม</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium">ตรวจล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {data.datasets.map((ds) => (
                    <Fragment key={ds.id}>
                      <tr
                        className="cursor-pointer border-t transition-colors hover:bg-slate-50"
                        onClick={() => setExpanded(expanded === ds.id ? null : ds.id)}
                        aria-expanded={expanded === ds.id}
                      >
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                            {expanded === ds.id ? (
                              <ChevronDown className="size-3.5 text-slate-400" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="size-3.5 text-slate-400" aria-hidden="true" />
                            )}
                            <span className="max-w-52 truncate" title={ds.name}>{ds.name}</span>
                          </span>
                        </td>
                        {ds.dimensions.map((d) => (
                          <td key={d.dimension} className="px-1.5 py-1.5 text-center">
                            <span
                              className={`inline-block min-w-10 rounded px-1.5 py-1 text-[11px] font-semibold ${cellClass(d.score)}`}
                              title={
                                d.score !== null
                                  ? `มาตรา ${d.clauseNo} ${d.th}: ${d.score.toFixed(1)} — ${d.grade?.label ?? ''} (กฎ ${d.rulesCount} ข้อ${d.failedRules > 0 ? ` ล้มเหลว ${d.failedRules}` : ''})`
                                  : `มาตรา ${d.clauseNo} ${d.th}: ยังไม่ได้ประเมิน (ไม่มีกฎ)`
                              }
                            >
                              {d.score !== null ? d.score.toFixed(0) : '—'}
                            </span>
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`font-bold ${ds.grade?.textClass ?? 'text-slate-500'}`}>
                              {ds.score !== null ? ds.score.toFixed(1) : '—'}
                            </span>
                            {ds.grade && (
                              <Badge variant="outline" className={`border text-[10px] font-semibold ${ds.grade.badgeClass}`}>
                                {ds.grade.label}
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-[11px] text-muted-foreground">{fmtDate(ds.lastRunAt)}</td>
                      </tr>
                      {expanded === ds.id && (
                        <tr className="border-t bg-slate-50/60">
                          <td colSpan={dimensionHeaders.length + 3} className="px-4 py-3">
                            <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
                              {/* การ์ดรายมิติ */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                {ds.dimensions.map((d) => {
                                  const Icon = DIMENSION_ICONS[d.dimension as keyof typeof DIMENSION_ICONS]
                                  return (
                                    <div
                                      key={d.dimension}
                                      className={`rounded-lg border bg-white p-2.5 ${d.score === null ? 'border-dashed opacity-70' : ''}`}
                                    >
                                      <div className="mb-1 flex items-center gap-1.5">
                                        {Icon && <Icon className="size-3.5 shrink-0 text-slate-600" aria-hidden="true" />}
                                        <span className="truncate text-[11px] font-semibold text-slate-800">มาตรา {d.clauseNo}: {d.th}</span>
                                      </div>
                                      {d.score !== null ? (
                                        <>
                                          <div className="flex items-baseline gap-1">
                                            <span className={`text-base font-bold ${d.grade?.textClass ?? 'text-slate-700'}`}>{d.score.toFixed(0)}</span>
                                            <span className="text-[10px] text-muted-foreground">/100 · กฎ {d.rulesCount} ข้อ</span>
                                          </div>
                                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                                            <div className={`h-full rounded-full ${d.grade?.barClass ?? 'bg-slate-400'}`} style={{ width: `${d.score}%` }} />
                                          </div>
                                          {d.failedRules > 0 && (
                                            <p className="mt-1 text-[10px] text-rose-700">ล้มเหลว {d.failedRules} กฎ — ดูรายละเอียดในผลการตรวจ</p>
                                          )}
                                        </>
                                      ) : (
                                        <p className="text-[10.5px] text-muted-foreground">ยังไม่ได้ประเมิน — ไม่มีกฎในมิตินี้</p>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              {/* แนวโน้ม */}
                              <div className="rounded-lg border bg-white p-3">
                                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                  <LineChart className="size-3.5 text-emerald-700" aria-hidden="true" />
                                  แนวโน้มคะแนน 30 วันล่าสุด
                                </p>
                                <Sparkline points={ds.trend} />
                                <ul className="mt-2 space-y-0.5 text-[10.5px] text-muted-foreground">
                                  {ds.trend.slice(-5).reverse().map((t) => (
                                    <li key={t.date}>
                                      {t.date} — เฉลี่ย {t.score.toFixed(1)} ({t.runs} ผลรัน)
                                    </li>
                                  ))}
                                  {ds.trend.length === 0 && <li>ยังไม่มีประวัติใน 30 วันล่าสุด</li>}
                                </ul>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 w-full gap-1.5 text-[11px]"
                                  onClick={onGoValidations}
                                >
                                  <ClipboardList className="size-3.5" aria-hidden="true" />
                                  ไปที่ผลการตรวจสอบ
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground" role="note">
            <ClipboardList className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            คะแนนคำนวณจากอัตราผ่านของกฎล่าสุดรายมิติ — เกณฑ์เกรด: ดีเยี่ยม ≥95 · ดี ≥85 · ต้องปรับปรุง ≥70 · วิกฤต &lt;70 (เดียวกันทั้งระบบตามมาตรฐาน DAMA-DMBOK)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
