'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Send, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ROLES, ROLE_LIST, type PermissionKey } from '@/lib/rbac'

/* ------------------------------------------------------------------ */
/* Exceptions Panel — คำขอยกเว้นกฎ + การอนุมัติตามบทบาท (RBAC)           */
/* เดิมอยู่ใน CoreFeaturesConsole (แท็บ 4) — v0.13.0 ย้ายมาเป็น          */
/* แท็บ "ข้อยกเว้น & การอนุมัติ" ของหน้า DQ Issues                       */
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
  status: string
  expiresAt: string
  decidedBy: string | null
  decidedAt: string | null
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

/** เลือกผู้ดำเนินการ — แสดงบทบาท + ติเครื่องหมายผู้ที่ไม่มีสิทธิ์ */
function OperatorSelect({
  value,
  onChange,
  permission,
  id,
  users,
}: {
  value: string
  onChange: (v: string) => void
  permission: PermissionKey
  id: string
  users: ApiUser[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="เลือกผู้ดำเนินการ" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {users.map((u) => {
          const allowed = ROLES[u.role as keyof typeof ROLES]?.permissions.includes(permission) ?? false
          return (
            <SelectItem key={u.id} value={u.email}>
              {u.name} — {ROLE_LIST.find((r) => r.key === u.role)?.th}
              {!allowed ? ' (ไม่มีสิทธิ์)' : ''}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

export default function ExceptionsPanel() {
  const { toast } = useToast()

  const [users, setUsers] = useState<ApiUser[]>([])
  const [datasets, setDatasets] = useState<ApiDataset[]>([])
  const [rules, setRules] = useState<ApiRule[]>([])
  const [exceptions, setExceptions] = useState<ApiException[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // form
  const [exDataset, setExDataset] = useState('')
  const [exRule, setExRule] = useState('')
  const [exReason, setExReason] = useState('')
  const [exExpires, setExExpires] = useState('')
  const [exRequester, setExRequester] = useState('malee.steward@company.co.th')
  const [exApprover, setExApprover] = useState('somchai.owner@company.co.th')

  const activeUsers = useMemo(() => users.filter((u) => u.status === 'ACTIVE'), [users])
  const pendingExceptions = useMemo(() => exceptions.filter((x) => x.status === 'PENDING'), [exceptions])
  const decidedExceptions = useMemo(() => exceptions.filter((x) => x.status !== 'PENDING'), [exceptions])
  const rulesOfDataset = useMemo(() => rules?.filter((r) => r.enabled && r.datasetIds.includes(exDataset)) ?? [], [rules, exDataset])

  const reload = useCallback(async () => {
    try {
      const [u, d, r, x] = await Promise.all([
        fetch('/api/rbac/users').then((res) => res.json()),
        fetch('/api/rbac/datasets').then((res) => res.json()),
        fetch('/api/dq/rules').then((res) => res.json()),
        fetch('/api/dq/exceptions').then((res) => res.json()),
      ])
      setUsers(u.users ?? [])
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
        requestedByEmail: exRequester,
      },
      'create-exception',
      'ส่งคำขอข้อยกเว้นแล้ว (รอผู้อนุมัติ)',
    )
    if (ok) {
      setExReason('')
      setExExpires('')
      setExRule('')
      void reload()
    }
  }

  async function handleDecideException(id: string, action: 'APPROVE' | 'REJECT') {
    const ok = await patchJson(
      `/api/dq/exceptions/${id}`,
      { action, approverEmail: exApprover },
      `exception-${id}`,
      action === 'APPROVE' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว',
    )
    if (ok) void reload()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-emerald-700" aria-hidden="true" />
            ขอข้อยกเว้นกฎ
          </CardTitle>
          <CardDescription>ทุกคำขอต้องระบุเหตุผลและวันหมดอายุ พร้อมรอการอนุมัติจากบทบาทที่มีสิทธิ์</CardDescription>
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
              <OperatorSelect id="ex-requester" value={exRequester} onChange={setExRequester} permission="MANAGE_RULES" users={activeUsers} />
            </div>
          </div>

          <Button
            className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleCreateException}
            disabled={!exDataset || exReason.trim().length < 10 || !exExpires || busy !== null}
          >
            <Send className="size-4" aria-hidden="true" />
            {busy === 'create-exception' ? 'กำลังส่ง…' : 'ส่งคำขอข้อยกเว้น'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">รอการอนุมัติ ({pendingExceptions.length})</CardTitle>
          <CardDescription>เฉพาะบทบาทที่มีสิทธิ์ APPROVE_EXCEPTIONS เท่านั้นที่อนุมัติได้ (ลองเลือกบทบาทอื่นเพื่อทดสอบ)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-approver">ผู้อนุมัติ</Label>
            <OperatorSelect id="ex-approver" value={exApprover} onChange={setExApprover} permission="APPROVE_EXCEPTIONS" users={activeUsers} />
          </div>

          <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {pendingExceptions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีคำขอรออนุมัติ</p>}
            {pendingExceptions.map((x) => (
              <div key={x.id} className="rounded-lg border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[11px]">
                    {x.datasetName}
                  </Badge>
                  {x.ruleLabel && <Badge variant="outline" className="text-[11px]">กฎ: {x.ruleLabel}</Badge>}
                  <span>หมดอายุ {fmtDate(x.expiresAt)}</span>
                </div>
                <p className="text-sm">{x.reason}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">ขอโดย {x.requestedBy} · {fmtTime(x.createdAt)}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleDecideException(x.id, 'APPROVE')}
                    disabled={busy !== null}
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    อนุมัติ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-rose-700 hover:bg-rose-50"
                    onClick={() => handleDecideException(x.id, 'REJECT')}
                    disabled={busy !== null}
                  >
                    <XCircle className="size-3.5" aria-hidden="true" />
                    ปฏิเสธ
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {decidedExceptions.length > 0 && (
            <details className="rounded-lg border bg-slate-50/60 p-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                ตัดสินแล้ว ({decidedExceptions.length} รายการ)
              </summary>
              <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                {decidedExceptions.slice(0, 12).map((x) => (
                  <li key={x.id}>
                    {x.status === 'APPROVED' ? '✅' : '❌'} {x.datasetName} — {x.status === 'APPROVED' ? 'อนุมัติ' : 'ปฏิเสธ'}โดย {x.decidedBy} ·{' '}
                    {fmtTime(x.decidedAt)}
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
