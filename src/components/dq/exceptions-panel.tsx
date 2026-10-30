'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ClipboardCheck, Send, ShieldOff, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/components/user-context'

/* ------------------------------------------------------------------ */
/* Exceptions Panel — ทะเบียนข้อยกเว้นกฎ (v0.36.0 — RBAC ตามบทบาทล้วน)   */
/* ขอใช้ = มีผลทันทีจนถึงวันหมดอายุ (สิทธิ์ MANAGE_RULES)                */
/* ยกเลิกก่อนหมดอายุ = สิทธิ์ MANAGE_ISSUES — ทุก action บันทึก Audit    */
/* ------------------------------------------------------------------ */

interface ApiDataset {
  id: string
  name: string
}

interface ApiRule {
  id: string
  column: string
  conditionName: string
  enabled: boolean
  datasetIds: string[]
}

interface ApiException {
  id: string
  datasetName: string
  ruleId: string | null
  ruleLabel: string | null
  reason: string
  requestedBy: string
  status: string // APPROVED (ใช้งานอยู่) | REVOKED (ยกเลิกแล้ว)
  expiresAt: string
  revokedBy: string | null
  revokedAt: string | null
  createdAt: string
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso ?? '—'
  }
}

export default function ExceptionsPanel() {
  const { toast } = useToast()

  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [rules, setRules] = useState<ApiRule[]>([])
  const [exceptions, setExceptions] = useState<ApiException[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // form
  const [exDataset, setExDataset] = useState('')
  const [exRule, setExRule] = useState('')
  const [exReason, setExReason] = useState('')
  const [exExpires, setExExpires] = useState('')
  // ผู้ขอ/ผู้ยกเลิก = ผู้ใช้ปัจจุบันจาก header (identity ศูนย์กลาง — สิทธิ์ตรวจที่ API เสมอ)
  const { user, hasPermission } = useCurrentUser()

  const activeExceptions = useMemo(() => exceptions.filter((x) => x.status === 'APPROVED'), [exceptions])
  const revokedExceptions = useMemo(() => exceptions.filter((x) => x.status !== 'APPROVED'), [exceptions])
  const rulesOfDataset = useMemo(() => rules?.filter((r) => r.enabled && r.datasetIds.includes(exDataset)) ?? [], [rules, exDataset])

  const reload = useCallback(async () => {
    try {
      const [d, r, x] = await Promise.all([
        fetch('/api/rbac/datasets').then((res) => res.json()),
        fetch('/api/dq/rules').then((res) => res.json()),
        fetch('/api/dq/exceptions').then((res) => res.json()),
      ])
      setDatasets(d.datasets ?? [])
      setRules(r.rules ?? [])
      setExceptions(x.exceptions ?? [])
    } catch {
      /* network error — คงค่าเดิมไว้ */
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function postJson(url: string, body: Record<string, unknown>, busyKey: string, okMessage: string): Promise<boolean> {
    setBusy(busyKey)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return false
      }
      toast({ title: okMessage })
      return true
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function patchJson(url: string, body: Record<string, unknown>, busyKey: string, okMessage: string): Promise<boolean> {
    setBusy(busyKey)
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return false
      }
      toast({ title: okMessage })
      return true
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateException() {
    const ok = await postJson(
      '/api/dq/exceptions',
      {
        datasetId: exDataset,
        ruleId: exRule || undefined,
        reason: exReason,
        expiresAt: exExpires ? new Date(exExpires).toISOString() : '',
        requestedByEmail: user?.email ?? '',
      },
      'create-exception',
      'ขอใช้ข้อยกเว้นแล้ว — มีผลทันทีจนถึงวันหมดอายุ',
    )
    if (ok) {
      setExReason('')
      setExExpires('')
      setExRule('')
      void reload()
    }
  }

  async function handleRevokeException(id: string) {
    const ok = await patchJson(
      `/api/dq/exceptions/${id}`,
      { action: 'REVOKE', operatorEmail: user?.email ?? '' },
      `exception-${id}`,
      'ยกเลิกข้อยกเว้นแล้ว — หยุดใช้ทันที',
    )
    if (ok) void reload()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-emerald-700" aria-hidden="true" />
            ขอใช้ข้อยกเว้นกฎ
          </CardTitle>
          <CardDescription>
            ต้องระบุเหตุผลและวันหมดอายุเสมอ — ขอแล้วใช้ได้ทันทีจนถึงวันหมดอายุ (สิทธิ์ตามบทบาท: ผู้ขอต้องมี MANAGE_RULES · ทุกรายการบันทึก Audit Trail)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-dataset">ชุดข้อมูล</Label>
            <Select
              value={exDataset}
              onValueChange={(v) => {
                setExDataset(v)
                setExRule('')
              }}
            >
              <SelectTrigger id="ex-dataset">
                <SelectValue placeholder="เลือกชุดข้อมูล" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-rule">กฎที่ขอยกเว้น (ไม่บังคับ)</Label>
            <Select value={exRule || 'none'} onValueChange={(v) => setExRule(v === 'none' ? '' : v)} disabled={!exDataset}>
              <SelectTrigger id="ex-rule">
                <SelectValue placeholder={exDataset ? 'เลือกกฎ (หรือไม่ระบุ)' : 'เลือกชุดข้อมูลก่อน'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุกฎ —</SelectItem>
                {rulesOfDataset.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.column} ({r.conditionName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-reason">เหตุผล (อย่างน้อย 10 ตัวอักษร)</Label>
            <textarea
              id="ex-reason"
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={exReason}
              onChange={(e) => setExReason(e.target.value)}
              placeholder="อธิบายเหตุผลและระยะเวลาที่จำเป็น เพื่อการตรวจสอบย้อนหลัง"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ex-expires">วันหมดอายุ</Label>
              <Input id="ex-expires" type="date" value={exExpires} onChange={(e) => setExExpires(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-requester">ผู้ขอ (ต้องมีสิทธิ์ MANAGE_RULES)</Label>
              <div className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground" aria-label="ผู้ขอ (ผู้ใช้ปัจจุบัน)">
                <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                <span className="min-w-0 truncate">{user ? `${user.name} · ${user.roleTh}` : 'กำลังโหลด…'}</span>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${hasPermission('MANAGE_RULES') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  {hasPermission('MANAGE_RULES') ? 'มีสิทธิ์ขอ' : 'ไม่มีสิทธิ์ MANAGE_RULES'}
                </Badge>
              </div>
            </div>
          </div>

          <Button
            className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleCreateException}
            disabled={!exDataset || exReason.trim().length < 10 || !exExpires || busy !== null}
          >
            <Send className="size-4" aria-hidden="true" />
            {busy === 'create-exception' ? 'กำลังบันทึก…' : 'ขอใช้ข้อยกเว้น (มีผลทันที)'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ทะเบียนข้อยกเว้น — ใช้งานอยู่ ({activeExceptions.length})</CardTitle>
          <CardDescription>ยกเลิกก่อนหมดอายุได้ด้วยสิทธิ์ MANAGE_ISSUES — หมดอายุตามวันที่กำหนดโดยอัตโนมัติ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {activeExceptions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อยกเว้นที่ใช้งานอยู่</p>}
            {activeExceptions.map((x) => (
              <div key={x.id} className="rounded-lg border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[11px]">
                    {x.datasetName}
                  </Badge>
                  {x.ruleLabel && <Badge variant="outline" className="text-[11px]">กฎ: {x.ruleLabel}</Badge>}
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3" aria-hidden="true" />
                    หมดอายุ {fmtDate(x.expiresAt)}
                  </span>
                </div>
                <p className="text-sm">{x.reason}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">ขอใช้โดย {x.requestedBy} · {fmtTime(x.createdAt)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-rose-700 hover:bg-rose-50"
                    onClick={() => handleRevokeException(x.id)}
                    disabled={busy !== null}
                    title={hasPermission('MANAGE_ISSUES') ? 'ยกเลิกข้อยกเว้นนี้ทันที' : 'ต้องมีสิทธิ์ MANAGE_ISSUES'}
                  >
                    <ShieldOff className="size-3.5" aria-hidden="true" />
                    ยกเลิก
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {revokedExceptions.length > 0 && (
            <details className="rounded-lg border bg-slate-50/60 p-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                ยกเลิกแล้ว ({revokedExceptions.length} รายการ)
              </summary>
              <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                {revokedExceptions.slice(0, 12).map((x) => (
                  <li key={x.id}>
                    ⛔ {x.datasetName} — ยกเลิกโดย {x.revokedBy} · {fmtTime(x.revokedAt)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
