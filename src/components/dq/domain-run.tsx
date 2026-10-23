'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, CheckSquare, FolderTree, Layers, Loader2, Play, RefreshCw, ShieldAlert, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

/**
 * DomainRunPanel (v0.18.0) — "เลือก Data Domain ที่ต้องการตรวจ > เลือก DQ Rule ตรวจตาม Data Element"
 * รันกฎที่ผูกกับ Data Element ทั้งโดเมนในคลิกเดียว (เลือกกฎย่อยได้) พร้อมคะแนน rollup
 * ระดับ Element → Sub Data Domain → Data Domain แสดงในผลรันทันที
 */

interface MainDomainItem {
  id: string
  name: string
  nameEn: string
  color: string
  elementCount?: number
}

interface DomainElement {
  id: string
  code: string
  nameTh: string
  parentDomainId: string | null
  subDomainName: string
  pii: boolean
  ruleCount: number
}

interface DomainRule {
  id: string
  datasetIds: string[]
  datasetNames: string[]
  column: string
  conditionName: string
  severity: string
  threshold: number
  enabled: boolean
  sentence: string
  dataElement: { id: string; code: string; nameTh: string; path: string } | null
}

interface RunDomainResponse {
  error?: string
  groupRunId: string
  domain: { id: string; name: string }
  batches: Array<{ batchId: string; datasetId: string; datasetName: string }>
  runsCount: number
  skipped: number
  newSignals: number
  results: Array<{
    runId: string
    datasetName: string
    column: string
    conditionName: string
    severity: string
    dimensionTh: string
    sentence: string
    verdict: string
    status: 'PASSED' | 'FAILED'
    totalRows: number
    failedRows: number
    passRate: number
    elementId: string
    elementName: string
    subDomainName: string
  }>
  byElement: Array<{
    elementId: string
    code: string
    nameTh: string
    subDomainName: string
    score: number | null
    rulesCount: number
    failedRules: number
    totalRows: number
  }>
  bySubDomain: Array<{
    subDomainId: string
    subDomainName: string
    elements: number
    elementsScored: number
    score: number | null
  }>
  domainScore: number | null
  domainGrade: { band: string; label: string; badgeClass: string; textClass: string } | null
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-800 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200',
}

function scoreTextClass(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 90) return 'text-emerald-700'
  if (score >= 75) return 'text-amber-700'
  return 'text-rose-700'
}

function scoreBarClass(score: number | null): string {
  if (score === null) return 'bg-slate-200'
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 75) return 'bg-amber-500'
  return 'bg-rose-500'
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function DomainRunPanel({ runOperator }: { runOperator: string }) {
  const { toast } = useToast()

  const [domains, setDomains] = useState<MainDomainItem[]>([])
  const [domainId, setDomainId] = useState('')
  const [elements, setElements] = useState<DomainElement[]>([])
  const [rules, setRules] = useState<DomainRule[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunDomainResponse | null>(null)
  const [ranAt, setRanAt] = useState<string | null>(null)

  /* ---------- โหลดโดเมนหลัก ---------- */
  useEffect(() => {
    let alive = true
    fetch('/api/domains')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setDomains((d?.domains ?? []).filter((x: MainDomainItem & { parentId: string | null }) => !x.parentId))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  /* ---------- เมื่อเลือกโดเมน: โหลด element + กฎที่ผูก + ผลรอบล่าสุด ---------- */
  const loadDomainTree = useCallback(async (id: string) => {
    if (!id) {
      setElements([])
      setRules([])
      setResult(null)
      return
    }
    setLoadingTree(true)
    setResult(null)
    try {
      const [elRes, ruleRes, lastRes] = await Promise.all([
        fetch('/api/elements').then((r) => r.json()),
        fetch('/api/dq/rules').then((r) => r.json()),
        fetch(`/api/dq/run-domain?domainId=${encodeURIComponent(id)}`).then((r) => r.json()),
      ])
      const allElements: DomainElement[] = elRes?.elements ?? []
      const domainElements = allElements.filter((e) => e.parentDomainId === id)
      setElements(domainElements)
      const elementIds = new Set(domainElements.map((e) => e.id))
      const domainRules: DomainRule[] = (ruleRes?.rules ?? []).filter(
        (r: DomainRule & { enabled: boolean }) => r.enabled && r.dataElement && elementIds.has(r.dataElement.id),
      )
      setRules(domainRules)
      setSelectedRules(new Set(domainRules.map((r) => r.id)))
      if (lastRes?.exists) {
        setResult(lastRes as RunDomainResponse)
        setRanAt(lastRes.ranAt ?? null)
      } else {
        setRanAt(null)
      }
    } catch {
      toast({ title: 'โหลดโครงสร้างโดเมนไม่สำเร็จ', variant: 'destructive' })
    } finally {
      setLoadingTree(false)
    }
  }, [toast])

  useEffect(() => {
    void loadDomainTree(domainId)
  }, [domainId, loadDomainTree])

  /* ---------- จัดกลุ่มกฎราย element (ตาม sub-domain) ---------- */
  const grouped = useMemo(() => {
    const subIds: Array<{ id: string; name: string }> = []
    const seen = new Set<string>()
    for (const e of elements) {
      if (!seen.has(e.subDomainName)) {
        seen.add(e.subDomainName)
        subIds.push({ id: e.subDomainId, name: e.subDomainName })
      }
    }
    return subIds
      .map((s) => ({
        ...s,
        elements: elements
          .filter((e) => e.subDomainId === s.id)
          .map((e) => ({ element: e, rules: rules.filter((r) => r.dataElement?.id === e.id) })),
      }))
      .filter((s) => s.elements.length > 0)
  }, [elements, rules])

  const selectableRuleIds = useMemo(() => rules.map((r) => r.id), [rules])
  const allSelected = selectableRuleIds.length > 0 && selectableRuleIds.every((id) => selectedRules.has(id))

  function toggleRule(id: string) {
    setSelectedRules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedRules(allSelected ? new Set() : new Set(selectableRuleIds))
  }

  /* ---------- รัน ---------- */
  async function runDomain() {
    if (!domainId || selectedRules.size === 0) return
    setRunning(true)
    try {
      const res = await fetch('/api/dq/run-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: runOperator, domainId, ruleIds: [...selectedRules] }),
      })
      const data = (await res.json()) as RunDomainResponse
      if (!res.ok || data.error) {
        toast({ title: 'รันตรวจระดับโดเมนไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      setResult(data)
      setRanAt(new Date().toISOString())
      toast({
        title: 'รันตรวจระดับโดเมนสำเร็จ',
        description: `โดเมน ${data.domain.name} — ${data.runsCount} ผลรัน ครอบ ${data.byElement.length} element · สัญญาณใหม่ ${data.newSignals} รายการ`,
      })
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------- แผงเลือกโดเมน + เลือกกฎ ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="size-4 text-emerald-700" aria-hidden="true" />
            รันตรวจตาม Data Domain — เลือกโดเมนแล้วเลือกกฎราย Data Element
          </CardTitle>
          <CardDescription>
            ระบบจะรวมทุกกฎที่ผูกกับ Data Element (ACTIVE) ใต้โดเมนย่อยทั้งหมด แล้วรันตามชุดข้อมูลที่กฎผูกไว้ —
            คะแนน rollup ระดับ Element → Sub Domain → Domain แสดงทันทีหลังรัน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dr-domain">Data Domain (โดเมนหลัก)</Label>
              <Select
                value={domainId}
                onValueChange={(v) => {
                  setDomainId(v)
                }}
              >
                <SelectTrigger id="dr-domain" aria-label="เลือกโดเมนหลักที่ต้องการตรวจ">
                  <SelectValue placeholder="— เลือกโดเมนหลัก —" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {(d.elementCount ?? 0) > 0 ? ` · ${d.elementCount} element` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={!domainId || selectedRules.size === 0 || running}
                onClick={() => void runDomain()}
              >
                <Play className="size-4" aria-hidden="true" />
                {running ? 'กำลังรัน…' : `รันตรวจ ${selectedRules.size} กฎที่เลือก`}
              </Button>
              <Button variant="outline" size="icon" aria-label="รีโหลดโครงสร้าง" onClick={() => void loadDomainTree(domainId)}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {domainId && (
            loadingTree ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังโหลด element และกฎ…
              </div>
            ) : grouped.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                โดเมนนี้ยังไม่มีกฎที่ผูกกับ Data Element — ผูกกฎกับ element ได้ในคลังกฎ (DQ Rule Library)
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:underline"
                    aria-pressed={allSelected}
                  >
                    {allSelected ? <CheckSquare className="size-3.5" aria-hidden="true" /> : <Square className="size-3.5" aria-hidden="true" />}
                    {allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'} ({selectableRuleIds.length} กฎ)
                  </button>
                  <span className="text-xs text-muted-foreground">เลือกไว้ {selectedRules.size} กฎ</span>
                </div>
                <div className="max-h-[22rem] space-y-3 overflow-y-auto rounded-lg border p-3">
                  {grouped.map((sub) => (
                    <div key={sub.id}>
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Layers className="size-3.5 text-slate-400" aria-hidden="true" />└ {sub.name}
                      </p>
                      <div className="space-y-2">
                        {sub.elements.map(({ element, rules: elRules }) => (
                          <div key={element.id} className="rounded-lg border bg-card p-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Box className="size-3.5 text-emerald-700" aria-hidden="true" />
                              <span className="font-mono text-[10px] text-muted-foreground">{element.code}</span>
                              <span className="text-xs font-medium">{element.nameTh}</span>
                              {element.pii && (
                                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700">
                                  <ShieldAlert className="mr-0.5 size-2.5" aria-hidden="true" /> PII
                                </Badge>
                              )}
                              <span className="ml-auto text-[10px] text-muted-foreground">{elRules.length} กฎ</span>
                            </div>
                            {elRules.length === 0 ? (
                              <p className="mt-1.5 pl-5 text-[11px] text-muted-foreground">ยังไม่มีกฎผูกกับ element นี้</p>
                            ) : (
                              <div className="mt-1.5 space-y-1 pl-5">
                                {elRules.map((r) => (
                                  <label
                                    key={r.id}
                                    className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60"
                                  >
                                    <Checkbox
                                      className="mt-0.5"
                                      checked={selectedRules.has(r.id)}
                                      onCheckedChange={() => toggleRule(r.id)}
                                      aria-label={`เลือกกฎ ${r.conditionName} คอลัมน์ ${r.column}`}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className={`text-[9.5px] ${SEVERITY_BADGE[r.severity] ?? ''}`}>
                                          {r.severity}
                                        </Badge>
                                        <span className="font-medium">{r.conditionName}</span>
                                        <span className="font-mono text-muted-foreground">คอลัมน์ {r.column}</span>
                                        <span className="text-muted-foreground">· {r.datasetNames.join(', ')}</span>
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* ---------- ผลรัน + rollup ---------- */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              ผลรันระดับโดเมน — {result.domain.name}
              {ranAt && <span className="ml-2 text-xs font-normal text-muted-foreground">({fmtTime(ranAt)})</span>}
            </CardTitle>
            <CardDescription>
              {result.runsCount} ผลรัน · {result.batches.length} ชุดข้อมูล ({result.batches.map((b) => b.datasetName).join(', ')})
              {result.skipped ? ` · ข้าม ${result.skipped}` : ''} · สัญญาณใหม่ {result.newSignals} รายการ (รอมนุษย์ทบทวน)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* คะแนนรวมของโดเมน */}
            <div className="flex flex-col gap-3 rounded-lg border bg-emerald-50/50 p-4 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <p className="text-xs text-muted-foreground">คะแนน rollup ของโดเมน (ถ่วงน้ำหนักจำนวนแถว)</p>
                <p className={`text-3xl font-bold ${scoreTextClass(result.domainScore)}`}>
                  {result.domainScore !== null ? result.domainScore.toFixed(1) : '—'}
                  <span className="text-base">/100</span>
                </p>
              </div>
              {result.domainGrade && (
                <Badge variant="outline" className={`w-fit border text-xs font-semibold ${result.domainGrade.badgeClass}`}>
                  เกรด {result.domainGrade.label}
                </Badge>
              )}
              <p className="text-xs leading-relaxed text-slate-700 sm:border-l sm:border-emerald-200 sm:pl-3">
                คะแนนรวมจากการ rollup คะแนนราย Data Element (อัตราผ่านถ่วงจำนวนแถวของทุกกฎ) —
                element ที่ยังไม่มีกฎจะแสดงว่า &quot;ยังไม่ได้ประเมิน&quot; และไม่ถูกนับในคะแนน
              </p>
            </div>

            {/* คะแนนรายโดเมนย่อย */}
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700">คะแนนราย Sub Data Domain (เรียงแย่สุดก่อน)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.bySubDomain.map((s) => (
                  <div key={s.subDomainId} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">{s.subDomainName}</p>
                      <p className={`text-sm font-bold ${scoreTextClass(s.score)}`}>{s.score !== null ? s.score.toFixed(1) : '—'}</p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${scoreBarClass(s.score)}`} style={{ width: `${s.score ?? 0}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      element {s.elementsScored}/{s.elements} ที่ประเมินแล้ว
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* คะแนนราย Data Element */}
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700">คะแนนราย Data Element (โครงสร้าง 4 ระดับ)</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">รหัส</th>
                      <th scope="col" className="px-3 py-2 font-medium">Data Element</th>
                      <th scope="col" className="px-3 py-2 font-medium">โดเมนย่อย</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">กฎ</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">ล้มเหลว</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">แถว</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">คะแนน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.byElement.map((e) => (
                      <tr key={e.elementId} className="border-t">
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{e.code}</td>
                        <td className="px-3 py-2 font-medium">{e.nameTh}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.subDomainName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.rulesCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.failedRules > 0 ? <span className="font-medium text-rose-700">{e.failedRules}</span> : 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.totalRows}</td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${scoreTextClass(e.score)}`}>
                          {e.score !== null ? e.score.toFixed(1) : 'ยังไม่ได้ประเมิน'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* รายละเอียดผลรันรายกฎ */}
            <details className="rounded-lg border bg-slate-50/60 p-3" open>
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                รายละเอียดผลรันรายกฎ ({result.results.length} รายการ)
              </summary>
              <ul className="mt-2 space-y-1.5">
                {result.results.map((r) => (
                  <li key={r.runId} className="flex flex-wrap items-center gap-1.5 rounded border bg-white px-2.5 py-1.5 text-[11.5px]">
                    <Badge variant="outline" className={`text-[9.5px] ${r.status === 'PASSED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                      {r.status === 'PASSED' ? 'ผ่าน' : 'ไม่ผ่าน'}
                    </Badge>
                    <Badge variant="outline" className={`text-[9.5px] ${SEVERITY_BADGE[r.severity] ?? ''}`}>
                      {r.severity}
                    </Badge>
                    <span className="font-medium">{r.elementName}</span>
                    <span className="text-muted-foreground">· {r.subDomainName}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{r.column} · {r.conditionName} · {r.datasetName}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      ผ่าน {Math.round(r.passRate * 100)}% ({r.totalRows - r.failedRows}/{r.totalRows} แถว)
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
