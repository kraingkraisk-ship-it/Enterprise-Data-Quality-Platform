'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  Eye,
  Pencil,
  X,
  ScrollText,
  Database,
  EyeOff,
  RefreshCw,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_KEYS,
  ROLE_LIST,
  type PermissionKey,
  type RoleKey,
} from '@/lib/rbac'

/* ------------------------------- types ---------------------------------- */

interface ApiUser {
  id: string
  email: string
  name: string
  role: string
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  updatedAt: string
}

interface ApiGrant {
  id: string
  datasetId: string
  roleId: string
  level: 'VIEW' | 'MANAGE'
}

interface ApiDataset {
  id: string
  name: string
  sourceType: string
  piiEnabled: boolean
  status: string
  grants: ApiGrant[]
}

interface ApiAuditLog {
  id: string
  action: string
  actor: string
  target: string
  detail: string
  createdAt: string
}

const SOURCE_LABELS: Record<string, string> = {
  CSV: 'CSV',
  EXCEL: 'Excel',
  POSTGRESQL: 'PostgreSQL',
  MSSQL: 'MS SQL Server',
  REST_API: 'REST API',
}

const AUDIT_STYLES: Record<string, { th: string; className: string }> = {
  CREATE_USER: { th: 'สร้างบัญชี', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  ASSIGN_ROLE: { th: 'เปลี่ยนบทบาท', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  SUSPEND_USER: { th: 'ระงับบัญชี', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  ACTIVATE_USER: { th: 'เปิดบัญชี', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  GRANT_ACCESS: { th: 'มอบสิทธิ์', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  REVOKE_ACCESS: { th: 'ยกเลิกสิทธิ์', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  SET_ACCESS_LEVEL: { th: 'ปรับระดับสิทธิ์', className: 'bg-amber-50 text-amber-900 border-amber-200' },
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

/* ----------------------------- component --------------------------------- */

export default function RbacConsole() {
  const { toast } = useToast()

  const [users, setUsers] = useState<ApiUser[] | null>(null)
  const [datasets, setDatasets] = useState<ApiDataset[] | null>(null)
  const [logs, setLogs] = useState<ApiAuditLog[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // add-user dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<RoleKey | ''>('')

  // dataset access form state
  const [grantRole, setGrantRole] = useState<Record<string, RoleKey>>({})
  const [grantLevel, setGrantLevel] = useState<Record<string, 'VIEW' | 'MANAGE'>>({})

  const refetch = useCallback(() => setReloadTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [u, d, a] = await Promise.all([
          fetch('/api/rbac/users').then((r) => r.json()),
          fetch('/api/rbac/datasets').then((r) => r.json()),
          fetch('/api/rbac/audit?limit=80').then((r) => r.json()),
        ])
        if (!alive) return
        setUsers(u.users ?? [])
        setDatasets(d.datasets ?? [])
        setLogs(a.logs ?? [])
      } catch {
        if (!alive) return
        setUsers([])
        setDatasets([])
        setLogs([])
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const u of users ?? []) counts[u.role] = (counts[u.role] ?? 0) + 1
    return counts
  }, [users])

  /* ---------------------------- mutations ------------------------------- */

  async function patchUser(id: string, patch: { role?: string; status?: string }, key: string) {
    setBusy(key)
    try {
      const res = await fetch(`/api/rbac/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'ไม่สำเร็จ', description: json.error ?? 'เกิดข้อผิดพลาด', variant: 'destructive' })
        return
      }
      toast({ title: 'สำเร็จ', description: 'บันทึกการเปลี่ยนแปลงและเขียน Audit Log แล้ว' })
      refetch()
    } catch {
      toast({ title: 'ขัดข้อง', description: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function createUser() {
    if (!newName.trim() || !newEmail.trim() || !newRole) {
      toast({ title: 'ข้อมูลไม่ครบ', description: 'กรุณากรอกชื่อ อีเมล และเลือกบทบาท', variant: 'destructive' })
      return
    }
    setBusy('create')
    try {
      const res = await fetch('/api/rbac/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'ไม่สำเร็จ', description: json.error ?? 'เกิดข้อผิดพลาด', variant: 'destructive' })
        return
      }
      toast({ title: 'สร้างบัญชีสำเร็จ', description: `${json.user.name} (${json.user.email})` })
      setDialogOpen(false)
      setNewName('')
      setNewEmail('')
      setNewRole('')
      refetch()
    } catch {
      toast({ title: 'ขัดข้อง', description: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function datasetAccess(
    datasetId: string,
    action: 'GRANT' | 'REVOKE' | 'SET_LEVEL',
    roleId: string,
    level?: string,
    key?: string,
  ) {
    if (key) setBusy(key)
    try {
      const res = await fetch(`/api/rbac/datasets/${datasetId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, roleId, level }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'ไม่สำเร็จ', description: json.error ?? 'เกิดข้อผิดพลาด', variant: 'destructive' })
        return
      }
      toast({ title: 'สำเร็จ', description: 'ปรับสิทธิ์การเข้าถึงและเขียน Audit Log แล้ว' })
      refetch()
    } catch {
      toast({ title: 'ขัดข้อง', description: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      if (key) setBusy(null)
    }
  }

  /* ------------------------------ render -------------------------------- */

  return (
    <Tabs defaultValue="matrix" className="w-full">
      <TabsList className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted/70 p-1 sm:grid-cols-4">
        <TabsTrigger value="matrix" className="gap-1.5">
          <ShieldCheck className="size-4" aria-hidden="true" />
          สิทธิ์ตามบทบาท
        </TabsTrigger>
        <TabsTrigger value="users" className="gap-1.5">
          <Users className="size-4" aria-hidden="true" />
          ผู้ใช้ในระบบ
        </TabsTrigger>
        <TabsTrigger value="datasets" className="gap-1.5">
          <Database className="size-4" aria-hidden="true" />
          เข้าถึงชุดข้อมูล
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-1.5">
          <ScrollText className="size-4" aria-hidden="true" />
          บันทึกตรวจสอบ
        </TabsTrigger>
      </TabsList>

      {/* --------------------------- MATRIX TAB --------------------------- */}
      <TabsContent value="matrix" className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ตารางสิทธิ์ตามบทบาท (Permission Matrix)</CardTitle>
            <CardDescription>
              8 บทบาท × 8 กลุ่มสิทธิ์ — เลื่อนแนวนอนเพื่อดูทั้งหมด · หลักการ: ให้สิทธิ์น้อยที่สุด (Least Privilege)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[28rem] overflow-auto rounded-lg border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <caption className="sr-only">ตารางแสดงสิทธิ์ของแต่ละบทบาทผู้ใช้</caption>
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">
                      กลุ่มสิทธิ์
                    </th>
                    {ROLE_LIST.map((r) => (
                      <th scope="col" key={r.key} className="px-3 py-2.5 text-center align-bottom font-semibold">
                        <span className="block whitespace-nowrap">{r.th}</span>
                        <span className="block text-[10px] font-normal text-muted-foreground">{r.en}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_KEYS.map((p) => (
                    <tr key={p} className="border-t transition-colors hover:bg-emerald-50/40">
                      <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-2.5 text-left font-medium">
                        {PERMISSION_LABELS[p].th}
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {PERMISSION_LABELS[p].en}
                        </span>
                      </th>
                      {ROLE_LIST.map((r) => (
                        <td key={`${r.key}-${p}`} className="px-3 py-2.5 text-center">
                          {r.permissions.includes(p) ? (
                            <>
                              <Check className="mx-auto size-4 text-emerald-600" aria-hidden="true" />
                              <span className="sr-only">{r.th} มีสิทธิ์ {PERMISSION_LABELS[p].th}</span>
                            </>
                          ) : (
                            <>
                              <Minus className="mx-auto size-4 text-slate-300" aria-hidden="true" />
                              <span className="sr-only">{r.th} ไม่มีสิทธิ์ {PERMISSION_LABELS[p].th}</span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_LIST.map((r) => (
            <Card key={r.key} className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{r.th}</CardTitle>
                <CardDescription className="text-xs">
                  {r.en} · {roleCounts[r.key] ?? 0} บัญชีในระบบ
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <p className="text-xs text-muted-foreground">{r.desc}</p>
                <Separator />
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <EyeOff className="mt-0.5 size-3 shrink-0 text-emerald-700" aria-hidden="true" />
                  {r.scope}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      {/* --------------------------- USERS TAB ---------------------------- */}
      <TabsContent value="users" className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            ทั้งหมด <strong className="text-foreground">{users?.length ?? '…'}</strong> บัญชี · เปลี่ยนบทบาทหรือสถานะได้ทันที (บันทึกลงฐานข้อมูลจริง)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={refetch}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              รีเฟรช
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                  <UserPlus className="size-3.5" aria-hidden="true" />
                  เพิ่มผู้ใช้
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>เพิ่มผู้ใช้ใหม่</DialogTitle>
                  <DialogDescription>สร้างบัญชีและกำหนดบทบาทเริ่มต้น — การกระทำจะถูกบันทึกใน Audit Log</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-name">ชื่อ–นามสกุล</Label>
                    <Input
                      id="new-user-name"
                      placeholder="เช่น สมหญิง ใจดี"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-email">อีเมลองค์กร</Label>
                    <Input
                      id="new-user-email"
                      type="email"
                      placeholder="name@company.co.th"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-user-role">บทบาท</Label>
                    <Select value={newRole || undefined} onValueChange={(v) => setNewRole(v as RoleKey)}>
                      <SelectTrigger id="new-user-role" className="w-full">
                        <SelectValue placeholder="เลือกบทบาทผู้ใช้" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_LIST.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.th} ({r.en})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={createUser}
                    disabled={busy === 'create'}
                  >
                    {busy === 'create' ? 'กำลังบันทึก…' : 'สร้างบัญชี'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="max-h-[30rem] overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">รายชื่อผู้ใช้ในระบบพร้อมบทบาทและสถานะ</caption>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 text-left">
                    <th scope="col" className="px-4 py-2.5 font-semibold">ชื่อ / อีเมล</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">บทบาท</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">สถานะ</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {users === null && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">กำลังโหลดข้อมูล…</td>
                    </tr>
                  )}
                  {users?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">ไม่พบผู้ใช้ในระบบ</td>
                    </tr>
                  )}
                  {users?.map((u) => (
                    <tr key={u.id} className="border-t transition-colors hover:bg-emerald-50/30">
                      <td className="px-4 py-2.5">
                        <span className="block font-medium">{u.name}</span>
                        <span className="block text-xs text-muted-foreground">{u.email}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Select
                          value={u.role}
                          onValueChange={(v) => patchUser(u.id, { role: v }, `role-${u.id}`)}
                          disabled={busy === `role-${u.id}`}
                        >
                          <SelectTrigger className="h-8 w-[210px] text-xs" aria-label={`เปลี่ยนบทบาทของ ${u.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_LIST.map((r) => (
                              <SelectItem key={r.key} value={r.key}>
                                {r.th} ({r.en})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5">
                        {u.status === 'ACTIVE' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">ใช้งาน</Badge>
                        ) : (
                          <Badge variant="destructive">ระงับ</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {u.status === 'ACTIVE' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-rose-200 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            disabled={busy === `status-${u.id}`}
                            onClick={() => patchUser(u.id, { status: 'SUSPENDED' }, `status-${u.id}`)}
                          >
                            ระงับบัญชี
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50"
                            disabled={busy === `status-${u.id}`}
                            onClick={() => patchUser(u.id, { status: 'ACTIVE' }, `status-${u.id}`)}
                          >
                            เปิดใช้งาน
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
          กฎธุรกิจ: ระบบจะป้องกันการเปลี่ยนบทบาทหรือระงับบัญชี <strong>ผู้ดูแลระบบ ACTIVE บัญชีสุดท้าย</strong> เสมอ
        </p>
      </TabsContent>

      {/* -------------------------- DATASETS TAB --------------------------- */}
      <TabsContent value="datasets" className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          สิทธิ์ระดับชุดข้อมูล (Dataset-level Isolation) — บทบาทที่ไม่ได้รับมอบสิทธิ์จะมองไม่เห็นชุดข้อมูลนั้นทั้งหมด
        </p>
        {datasets === null && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">กำลังโหลดข้อมูล…</CardContent>
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {datasets?.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">{d.name}</CardTitle>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {SOURCE_LABELS[d.sourceType] ?? d.sourceType}
                      </Badge>
                      {d.piiEnabled ? (
                        <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-900">
                          <EyeOff className="size-3" aria-hidden="true" />
                          ปิดบัง PII
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">ไม่มี PII</Badge>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    {d.grants.length} บทบาท
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {d.grants.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
                    >
                      <Eye className="size-3 text-emerald-700" aria-hidden="true" />
                      <span className="font-medium">
                        {ROLE_KEYS.includes(g.roleId as RoleKey) ? ROLE_LIST.find((r) => r.key === g.roleId)?.th : g.roleId}
                      </span>
                      <span className="text-muted-foreground">({g.level})</span>
                      <button
                        type="button"
                        aria-label={`ยกเลิกสิทธิ์บทบาท ${g.roleId} จาก ${d.name}`}
                        className="ml-0.5 rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        disabled={busy === `revoke-${d.id}-${g.roleId}`}
                        onClick={() => datasetAccess(d.id, 'REVOKE', g.roleId, undefined, `revoke-${d.id}-${g.roleId}`)}
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {d.grants.length === 0 && (
                    <span className="text-xs text-muted-foreground">ยังไม่มีบทบาทที่ได้รับสิทธิ์</span>
                  )}
                </div>
                <Separator />
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={grantRole[d.id] || undefined}
                    onValueChange={(v) => setGrantRole((s) => ({ ...s, [d.id]: v as RoleKey }))}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-xs" aria-label={`เลือกบทบาทเพื่อมอบสิทธิ์ ${d.name}`}>
                      <SelectValue placeholder="เลือกบทบาท…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_LIST.filter((r) => !d.grants.some((g) => g.roleId === r.key)).map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.th} ({r.en})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={grantLevel[d.id] || 'VIEW'}
                    onValueChange={(v) => setGrantLevel((s) => ({ ...s, [d.id]: v as 'VIEW' | 'MANAGE' }))}
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs" aria-label={`เลือกระดับสิทธิ์สำหรับ ${d.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEW">VIEW — ดู</SelectItem>
                      <SelectItem value="MANAGE">MANAGE — จัดการ</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 border-emerald-300 text-xs text-emerald-800 hover:bg-emerald-50"
                    disabled={
                      busy === `grant-${d.id}` || !grantRole[d.id] || d.grants.some((g) => g.roleId === grantRole[d.id])
                    }
                    onClick={() => {
                      const roleId = grantRole[d.id]
                      if (!roleId) return
                      datasetAccess(d.id, 'GRANT', roleId, grantLevel[d.id] ?? 'VIEW', `grant-${d.id}`)
                    }}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    มอบสิทธิ์
                  </Button>
                  {d.grants
                    .filter((g) => g.level === 'MANAGE')
                    .map((g) => (
                      <Button
                        key={`down-${g.id}`}
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-xs text-muted-foreground"
                        disabled={busy === `level-${d.id}-${g.roleId}`}
                        onClick={() => datasetAccess(d.id, 'SET_LEVEL', g.roleId, 'VIEW', `level-${d.id}-${g.roleId}`)}
                      >
                        <Pencil className="size-3" aria-hidden="true" />
                        ลดสิทธิ์ {ROLE_LIST.find((r) => r.key === g.roleId)?.th ?? g.roleId} เป็น VIEW
                      </Button>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      {/* --------------------------- AUDIT TAB ----------------------------- */}
      <TabsContent value="audit" className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            ทุกการเปลี่ยนแปลงสิทธิ์ถูกบันทึกอัตโนมัติ — ตรวจสอบย้อนหลังได้ 100%
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refetch}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            รีเฟรช
          </Button>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">บันทึกการตรวจสอบ (Audit Trail)</CardTitle>
            <CardDescription>เรียงจากใหม่ → เก่า (สูงสุด 80 รายการ)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="max-h-96 divide-y overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100">
              {logs === null && (
                <li className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดข้อมูล…</li>
              )}
              {logs?.length === 0 && (
                <li className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</li>
              )}
              {logs?.map((log) => {
                const style = AUDIT_STYLES[log.action] ?? { th: log.action, className: 'bg-muted text-foreground border-border' }
                return (
                  <li key={log.id} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-start sm:gap-3">
                    <Badge variant="outline" className={`shrink-0 ${style.className}`}>
                      {style.th}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{log.detail}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        โดย {log.actor} · {fmtTime(log.createdAt)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
