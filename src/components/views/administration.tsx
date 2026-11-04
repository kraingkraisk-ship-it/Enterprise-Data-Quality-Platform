'use client'
// Administration view — SYSTEM_ADMIN only. Users, access grants, policy,
// jobs (with dead-letter triage) and platform health.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Ban, CheckCircle2, ClipboardCopy, Database, HeartPulse,
  KeyRound, Loader2, RefreshCw, ServerCog, ShieldCheck, Users2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { DatasetDTO, JobDTO, PolicySetting, Role, UserDTO } from '@/lib/types'
import { ROLES } from '@/lib/types'
import { cn } from '@/lib/utils'
import { T, fmtDateTime, fmtNumber, useLang } from '@/lib/i18n'
import {
  DataTable, DeniedState, EmptyState, ErrorState, LoadingState, PageShell, StatusBadge, SectionHeading,
} from '@/components/shared/kit'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { ViewCtx } from './ctx'

// ─── Users ────────────────────────────────────────────────────────────────────

function UsersTab({ ctx }: { ctx: ViewCtx }) {
  const { lang } = useLang()
  const [users, setUsers] = useState<(UserDTO & { active: boolean })[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()
  const [pending, setPending] = useState<{ user: UserDTO; role: Role } | null>(null)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await api.listUsers()
      setUsers(res.users)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const changeRole = async () => {
    if (!pending) return
    setActing(true)
    try {
      await api.setUserRole(pending.user.id, pending.role)
      toast.success(lang === 'th' ? `เปลี่ยนบทบาทของ ${pending.user.name} เป็น ${pending.role} แล้ว (บันทึกใน audit trail)` : `${pending.user.name} role set to ${pending.role} (audit-logged)`)
      setPending(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Role change failed')
    } finally {
      setActing(false)
    }
  }

  const columns = useMemo(() => [
    {
      key: 'name', headerEn: 'Name', headerTh: 'ชื่อ',
      render: (u: UserDTO & { active: boolean }) => (
        <span className="flex flex-col">
          <span className="text-xs font-semibold">{u.name}</span>
          <span className="text-xs text-muted-foreground">{u.titleEn ?? u.businessUnit ?? ''}</span>
        </span>
      ),
    },
    { key: 'email', headerEn: 'Email', headerTh: 'อีเมล', render: (u: UserDTO & { active: boolean }) => <span className="font-mono text-xs">{u.email}</span> },
    {
      key: 'role', headerEn: 'Role', headerTh: 'บทบาท',
      render: (u: UserDTO & { active: boolean }) => u.id === ctx.user.id ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Ban className="size-3.5" aria-hidden /><T en="You — self-change locked" th="คุณเอง — ล็อกการเปลี่ยน" /></span>
      ) : (
        <Select value={u.role} onValueChange={(r) => setPending({ user: u, role: r as Role })}>
          <SelectTrigger className="h-9 w-[170px]" aria-label={`Role for ${u.name}`}><SelectValue /></SelectTrigger>
          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
      ),
    },
    {
      key: 'mfa', headerEn: 'MFA', headerTh: 'MFA',
      render: (u: UserDTO & { active: boolean }) => u.mfaEnabled ? (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800"><ShieldCheck className="size-3" aria-hidden />MFA</span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800"><AlertTriangle className="size-3" aria-hidden /><T en="No MFA" th="ไม่มี MFA" /></span>
      ),
    },
    {
      key: 'active', headerEn: 'Active', headerTh: 'ใช้งาน',
      render: (u: UserDTO & { active: boolean }) => u.active
        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden /><T en="Active" th="ใช้งาน" /></span>
        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="size-3.5" aria-hidden /><T en="Inactive" th="ไม่ใช้งาน" /></span>,
    },
  ], [ctx.user.id])

  return (
    <div className="space-y-3">
      {loading ? <LoadingState label={{ en: 'Loading users…', th: 'กำลังโหลดผู้ใช้…' }} />
        : error ? <ErrorState message={error.message} retry={load} /> : (
          <>
            <p className="text-xs text-muted-foreground">
              <T en="Role changes take effect on next request and are recorded with your identity in the audit trail." th="การเปลี่ยนบทบาทมีผลตั้งแต่คำขอถัดไป และถูกบันทึกพร้อมตัวตนของคุณใน audit trail" />
            </p>
            <DataTable
              columns={columns}
              rows={users ?? []}
              rowKey={(u) => u.id}
              caption="Platform users and roles"
              emptyEn="No users found."
              emptyTh="ไม่พบผู้ใช้"
            />
          </>
        )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><T en="Change user role?" th="เปลี่ยนบทบาทผู้ใช้?" /></AlertDialogTitle>
            <AlertDialogDescription>
              <T
                en={`${pending?.user.name ?? ''} will become ${pending?.role ?? ''}. This grants or revokes platform permissions immediately and is audit-logged.`}
                th={`${pending?.user.name ?? ''} จะเป็น ${pending?.role ?? ''} สิทธิ์ในแพลตฟอร์มจะเปลี่ยนทันทีและถูกบันทึกใน audit trail`}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[40px]"><T en="Cancel" th="ยกเลิก" /></AlertDialogCancel>
            <AlertDialogAction className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={acting}
              onClick={(e) => { e.preventDefault(); void changeRole() }}>
              <T en={acting ? 'Saving…' : 'Confirm role change'} th={acting ? 'กำลังบันทึก…' : 'ยืนยันการเปลี่ยนบทบาท'} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Access grants ────────────────────────────────────────────────────────────

interface GrantRow { id?: string; userId?: string; userName?: string; userEmail?: string; level?: string; grantedBy?: string; reason?: string | null; grantedAt?: string }

function GrantsTab() {
  const { lang } = useLang()
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [datasets, setDatasets] = useState<DatasetDTO[]>([])
  const [grants, setGrants] = useState<GrantRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [grantLoading, setGrantLoading] = useState(false)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const [userId, setUserId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [level, setLevel] = useState('VIEW')
  const [reason, setReason] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [u, ds] = await Promise.all([api.listUsers(), api.datasets()])
      setUsers(u.users.map((x) => ({ id: x.id, name: x.name })))
      setDatasets(ds.datasets)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadGrants = useCallback(async (dsId: string) => {
    if (!dsId) { setGrants(null); return }
    setGrantLoading(true)
    try {
      const payload = await api.datasetTabs(dsId, 'access')
      const rows = (payload as { grants?: GrantRow[] }).grants ?? (payload as { access?: GrantRow[] }).access ?? []
      setGrants(rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load grants')
      setGrants([])
    } finally {
      setGrantLoading(false)
    }
  }, [])

  useEffect(() => { void loadGrants(datasetId) }, [datasetId, loadGrants])

  const grant = async () => {
    if (!userId || !datasetId) {
      toast.error(lang === 'th' ? 'เลือกผู้ใช้และชุดข้อมูล' : 'Select a user and a dataset')
      return
    }
    setActing(true)
    try {
      await api.grantDataset({ userId, datasetId, level, reason: reason.trim() || undefined })
      toast.success(lang === 'th' ? 'บันทึกสิทธิ์การเข้าถึงแล้ว (บันทึกใน audit trail)' : 'Access grant saved (audit-logged)')
      setReason('')
      void loadGrants(datasetId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Grant failed')
    } finally {
      setActing(false)
    }
  }

  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? id ?? '—'

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <SectionHeading titleEn="Grant dataset access" titleTh="มอบสิทธิ์เข้าถึงชุดข้อมูล" hintEn="Deny-by-default: grants are the only way in." hintTh="ปฏิเสธเป็นค่าเริ่มต้น: สิทธิ์คือช่องทางเดียวในการเข้าถึง" />
        {loading ? <LoadingState rows={2} label={{ en: 'Loading…', th: 'กำลังโหลด…' }} /> : error ? <ErrorState message={error.message} retry={load} /> : (
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="g-user"><T en="User" th="ผู้ใช้" /></Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="g-user" className="h-10 w-full" aria-label="Grant user"><SelectValue placeholder={lang === 'th' ? 'เลือกผู้ใช้' : 'Select user'} /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-ds"><T en="Dataset" th="ชุดข้อมูล" /></Label>
              <Select value={datasetId} onValueChange={setDatasetId}>
                <SelectTrigger id="g-ds" className="h-10 w-full" aria-label="Grant dataset"><SelectValue placeholder={lang === 'th' ? 'เลือกชุดข้อมูล' : 'Select dataset'} /></SelectTrigger>
                <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-level"><T en="Level" th="ระดับ" /></Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="g-level" className="h-10 w-full" aria-label="Grant level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEW">VIEW</SelectItem>
                  <SelectItem value="MANAGE">MANAGE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-reason"><T en="Reason" th="เหตุผล" /></Label>
              <Input id="g-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" placeholder={lang === 'th' ? 'เช่น โครงการ ML' : 'e.g. ML project'} />
            </div>
            <div className="flex items-end">
              <Button className="min-h-[40px] w-full bg-teal-700 text-white hover:bg-teal-800 md:w-auto" disabled={acting} onClick={grant}>
                <KeyRound className="size-4" aria-hidden /> <T en="Grant access" th="มอบสิทธิ์" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <SectionHeading
          titleEn={datasetId ? `Current grants — ${datasets.find((d) => d.id === datasetId)?.name ?? datasetId}` : 'Current grants'}
          titleTh={datasetId ? `สิทธิ์ปัจจุบัน — ${datasets.find((d) => d.id === datasetId)?.name ?? datasetId}` : 'สิทธิ์ปัจจุบัน'}
        />
        <div className="mt-3">
          {!datasetId ? (
            <EmptyState titleEn="Select a dataset" titleTh="เลือกชุดข้อมูล" bodyEn="Choose a dataset above to list its access grants." bodyTh="เลือกชุดข้อมูลด้านบนเพื่อแสดงรายการสิทธิ์การเข้าถึง" />
          ) : grantLoading ? (
            <LoadingState rows={3} label={{ en: 'Loading grants…', th: 'กำลังโหลดสิทธิ์…' }} />
          ) : (grants?.length ?? 0) === 0 ? (
            <EmptyState titleEn="No explicit grants" titleTh="ไม่มีสิทธิ์ที่มอบไว้" bodyEn="Only the owner and steward roles reach this dataset by default." bodyTh="ค่าเริ่มต้นมีเพียงเจ้าของและผู้ดูแลข้อมูลเท่านั้นที่เข้าถึงได้" />
          ) : (
            <ul className="divide-y rounded-lg border">
              {grants!.map((g, i) => (
                <li key={g.id ?? `${g.userId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <p className="text-xs font-semibold">{g.userName ?? nameOf(g.userId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.grantedBy ? <T en={`granted by ${g.grantedBy}`} th={`มอบโดย ${g.grantedBy}`} /> : null}
                      {g.grantedAt ? ` · ${fmtDateTime(g.grantedAt, lang)}` : ''}
                    </p>
                    {g.reason && <p className="text-xs text-muted-foreground">“{g.reason}”</p>}
                  </div>
                  <span className={cn('rounded border px-1.5 py-0.5 text-xs font-medium', g.level === 'MANAGE' ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-slate-300 bg-slate-50 text-slate-700')}>
                    {g.level ?? 'VIEW'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Policy ───────────────────────────────────────────────────────────────────

const POLICY_GROUP_ORDER = ['score', 'anomaly', 'duplicate', 'drift', 'sla', 'upload', 'ml', 'masking', 'rateLimit']
const POLICY_GROUP_LABEL: Record<string, { en: string; th: string }> = {
  score: { en: 'Scoring', th: 'การให้คะแนน' },
  anomaly: { en: 'Anomaly detection', th: 'การตรวจจับความผิดปกติ' },
  duplicate: { en: 'Duplicate detection', th: 'การตรวจจับข้อมูลซ้ำ' },
  drift: { en: 'Drift monitoring', th: 'การติดตาม drift' },
  sla: { en: 'SLA', th: 'SLA' },
  upload: { en: 'File upload', th: 'การอัปโหลดไฟล์' },
  ml: { en: 'ML lifecycle', th: 'วงจรชีวิต ML' },
  masking: { en: 'PII masking', th: 'การปกปิดข้อมูลส่วนบุคคล' },
  rateLimit: { en: 'Rate limiting', th: 'การจำกัดอัตรา' },
}

function PolicyCard({ setting, onSaved }: { setting: PolicySetting; onSaved: () => void }) {
  const { lang } = useLang()
  const [text, setText] = useState(() => JSON.stringify(setting.value, null, 2))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [acting, setActing] = useState(false)

  const dirty = text !== JSON.stringify(setting.value, null, 2)
  let parseError: string | null = null
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parseError = lang === 'th' ? 'JSON ไม่ถูกต้อง' : 'Invalid JSON'
  }

  const save = async () => {
    if (parseError !== null || !confirmOpen) return
    setActing(true)
    try {
      await api.updatePolicy(setting.key, parsed)
      toast.success(lang === 'th' ? `บันทึกนโยบาย ${setting.key} แล้ว (บันทึกใน audit trail)` : `Policy ${setting.key} saved (audit-logged)`)
      setConfirmOpen(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Policy update failed')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{setting.key}</code>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            <T en={setting.descriptionEn ?? ''} th={setting.descriptionTh ?? setting.descriptionEn ?? ''} />
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {setting.updatedBy ? <T en={`by ${setting.updatedBy}`} th={`โดย ${setting.updatedBy}`} /> : null}
          {setting.updatedAt ? ` · ${fmtDateTime(setting.updatedAt, lang)}` : ''}
        </p>
      </div>
      <Textarea
        aria-label={`Value for ${setting.key}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-2 min-h-[72px] font-mono text-xs"
      />
      {parseError && <p className="mt-1 text-xs text-red-700" role="alert">{parseError}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={!dirty || parseError !== null || acting} onClick={() => setConfirmOpen(true)}>
          <T en="Save" th="บันทึก" />
        </Button>
        {dirty && !parseError && <span className="text-xs text-amber-700"><T en="Unsaved changes" th="มีการแก้ไขที่ยังไม่บันทึก" /></span>}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><T en={`Update policy ${setting.key}?`} th={`อัปเดตนโยบาย ${setting.key}?`} /></AlertDialogTitle>
            <AlertDialogDescription>
              <T
                en="Policy changes affect scoring, detection thresholds, SLA clocks and masking platform-wide. The change is audit-logged with your identity."
                th="การเปลี่ยนนโยบายมีผลต่อการให้คะแนน เกณฑ์การตรวจจับ นาฬิกา SLA และการปกปิดข้อมูลทั่วทั้งแพลตฟอร์ม การเปลี่ยนแปลงถูกบันทึกใน audit trail พร้อมตัวตนของคุณ"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[40px]"><T en="Cancel" th="ยกเลิก" /></AlertDialogCancel>
            <AlertDialogAction className="min-h-[40px] bg-teal-700 text-white hover:bg-teal-800" disabled={acting}
              onClick={(e) => { e.preventDefault(); void save() }}>
              <T en={acting ? 'Saving…' : 'Save policy'} th={acting ? 'กำลังบันทึก…' : 'บันทึกนโยบาย'} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PolicyTab() {
  const [settings, setSettings] = useState<PolicySetting[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await api.policy()
      setSettings(res.settings)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, PolicySetting[]>()
    for (const s of settings ?? []) {
      const g = s.key.split('.')[0] ?? 'other'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(s)
    }
    const keys = [...map.keys()].sort((a, b) => {
      const ia = POLICY_GROUP_ORDER.indexOf(a); const ib = POLICY_GROUP_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    return keys.map((k) => ({ key: k, items: map.get(k)! }))
  }, [settings])

  if (loading) return <LoadingState label={{ en: 'Loading policy…', th: 'กำลังโหลดนโยบาย…' }} />
  if (error) return <ErrorState message={error.message} retry={load} />

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <T en="Values are JSON. Invalid JSON cannot be saved. Every change is versioned in the audit trail." th="ค่าตั้งต้นเป็น JSON บันทึก JSON ที่ไม่ถูกต้องไม่ได้ ทุกการเปลี่ยนแปลงถูกตรวจสอบย้อนหลังได้จาก audit trail" />
      </p>
      {(settings ?? []).length === 0 && <EmptyState titleEn="No policy settings" titleTh="ไม่มีการตั้งค่านโยบาย" bodyEn="Seed the platform to create defaults." bodyTh="รัน seed เพื่อสร้างค่าเริ่มต้น" />}
      {groups.map((g) => (
        <section key={g.key} aria-label={g.key}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ServerCog className="size-4 text-teal-700" aria-hidden />
            <T en={POLICY_GROUP_LABEL[g.key]?.en ?? g.key} th={POLICY_GROUP_LABEL[g.key]?.th ?? g.key} />
            <span className="text-xs font-normal text-muted-foreground">{g.key}.*</span>
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.items.map((s) => <PolicyCard key={s.key} setting={s} onSaved={load} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

const JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD']

function JobsTab() {
  const { lang } = useLang()
  const [status, setStatus] = useState('all')
  const [jobs, setJobs] = useState<JobDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()
  const [pendingCancel, setPendingCancel] = useState<JobDTO | null>(null)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await api.jobs({ status: status === 'all' ? undefined : status, limit: 100 })
      setJobs(res.jobs)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  const cancel = async () => {
    if (!pendingCancel) return
    setActing(true)
    try {
      await api.cancelJob(pendingCancel.id)
      toast.success(lang === 'th' ? `ยกเลิก job ${pendingCancel.id} แล้ว` : `Job ${pendingCancel.id} cancelled`)
      setPendingCancel(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setActing(false)
    }
  }

  const columns = useMemo(() => [
    { key: 'type', headerEn: 'Type', headerTh: 'ประเภท', render: (j: JobDTO) => <span className="text-xs font-semibold">{j.type}</span> },
    { key: 'status', headerEn: 'Status', headerTh: 'สถานะ', render: (j: JobDTO) => <StatusBadge kind={j.status as 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'DEAD'} /> },
    { key: 'attempts', headerEn: 'Attempts / max', headerTh: 'พยายาม / สูงสุด', render: (j: JobDTO) => <span className="text-xs tabular-nums">{j.attempts}/{j.maxAttempts}</span> },
    {
      key: 'idem', headerEn: 'Idempotency key', headerTh: 'คีย์กันซ้ำ',
      render: (j: JobDTO) => (
        <span className="inline-flex items-center gap-1">
          <code className="max-w-[160px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs" title={j.idempotencyKey}>{j.idempotencyKey}</code>
          <button
            type="button" aria-label="Copy idempotency key"
            className="inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={async () => { try { await navigator.clipboard.writeText(j.idempotencyKey); toast.success('Idempotency key copied') } catch { toast.error('Copy failed') } }}
          >
            <ClipboardCopy className="size-3.5" aria-hidden />
          </button>
        </span>
      ),
    },
    { key: 'err', headerEn: 'Last error', headerTh: 'ข้อผิดพลาดล่าสุด', render: (j: JobDTO) => <span className="max-w-[220px] truncate text-xs text-red-700" title={j.lastError ?? ''}>{j.lastError ? (j.lastError.length > 60 ? `${j.lastError.slice(0, 60)}…` : j.lastError) : '—'}</span> },
    { key: 'started', headerEn: 'Started', headerTh: 'เริ่ม', render: (j: JobDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(j.startedAt, lang)}</span> },
    { key: 'finished', headerEn: 'Finished', headerTh: 'เสร็จ', render: (j: JobDTO) => <span className="whitespace-nowrap text-xs">{fmtDateTime(j.finishedAt, lang)}</span> },
    {
      key: 'action', headerEn: '', headerTh: '',
      render: (j: JobDTO) => (j.status === 'QUEUED' || j.status === 'RUNNING') ? (
        <Button variant="outline" className="min-h-[40px] border-red-300 text-red-800 hover:bg-red-50" onClick={() => setPendingCancel(j)}>
          <Ban className="size-3.5" aria-hidden /> <T en="Cancel" th="ยกเลิก" />
        </Button>
      ) : null,
    },
  ], [lang])

  const dead = (jobs ?? []).filter((j) => j.status === 'DEAD')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10 w-[170px]" aria-label="Job status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><T en="All statuses" th="ทุกสถานะ" /></SelectItem>
            {JOB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" className="min-h-[40px]" onClick={load}><RefreshCw className="size-4" aria-hidden /> <T en="Refresh" th="รีเฟรช" /></Button>
      </div>

      {loading ? <LoadingState label={{ en: 'Loading jobs…', th: 'กำลังโหลดงาน…' }} />
        : error ? <ErrorState message={error.message} retry={load} /> : (
          <>
            {dead.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3" role="alert">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
                  <AlertTriangle className="size-4" aria-hidden />
                  <T en={`Dead-letter queue — ${dead.length} job(s)`} th={`คิวงานตาย — ${dead.length} งาน`} />
                </p>
                <p className="mt-1 text-xs text-red-800">
                  <T
                    en="Dead jobs require operator triage; replay by enqueueing with the same idempotency key."
                    th="งานที่ตายต้องให้ผู้ดำเนินการตรวจสอบก่อน การเล่นซ้ำให้จัดคิวด้วย idempotency key เดิม"
                  />
                </p>
                <ul className="mt-2 space-y-1">
                  {dead.slice(0, 5).map((j) => (
                    <li key={j.id} className="font-mono text-xs text-red-900">{j.type} · {j.idempotencyKey} · {j.lastError?.slice(0, 80) ?? ''}</li>
                  ))}
                </ul>
              </div>
            )}
            <DataTable
              columns={columns}
              rows={jobs ?? []}
              rowKey={(j) => j.id}
              caption="Background jobs"
              emptyEn="No jobs match the current filter."
              emptyTh="ไม่พบงานที่ตรงกับตัวกรอง"
            />
          </>
        )}

      <AlertDialog open={!!pendingCancel} onOpenChange={(o) => !o && setPendingCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><T en="Cancel this job?" th="ยกเลิกงานนี้?" /></AlertDialogTitle>
            <AlertDialogDescription>
              <T
                en={`${pendingCancel?.type ?? ''} (${pendingCancel?.id ?? ''}) will be cancelled cooperatively at the next checkpoint. The action is audit-logged.`}
                th={`${pendingCancel?.type ?? ''} (${pendingCancel?.id ?? ''}) จะถูกยกเลิกแบบสารวัตรที่จุดตรวจถัดไป การกระทำถูกบันทึกใน audit trail`}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[40px]"><T en="Keep running" th="ปล่อยเดินต่อ" /></AlertDialogCancel>
            <AlertDialogAction className="min-h-[40px] border border-red-300 bg-red-600 text-white hover:bg-red-700" disabled={acting}
              onClick={(e) => { e.preventDefault(); void cancel() }}>
              <T en={acting ? 'Cancelling…' : 'Cancel job'} th={acting ? 'กำลังยกเลิก…' : 'ยกเลิกงาน'} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Health ───────────────────────────────────────────────────────────────────

const HEALTH_ICON: Record<string, { Icon: React.ElementType; cls: string }> = {
  database: { Icon: Database, cls: 'text-teal-700' },
  worker: { Icon: Activity, cls: 'text-teal-700' },
  storage: { Icon: Database, cls: 'text-teal-700' },
  default: { Icon: HeartPulse, cls: 'text-teal-700' },
}

function HealthTab() {
  const { lang } = useLang()
  const [data, setData] = useState<{ status: string; checks: Record<string, string> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message?: string } | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setData(await api.health())
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const tone = (v: string) => {
    const up = /^(HEALTHY|UP|OK|PASS)$/i.test(v)
    const down = /^(DOWN|FAIL|FAILED|ERROR)$/i.test(v)
    return down ? 'bad' : up ? 'good' : 'warn'
  }

  if (loading) return <LoadingState rows={3} label={{ en: 'Checking health…', th: 'กำลังตรวจสุขภาพระบบ…' }} />
  if (error || !data) return <ErrorState message={error?.message} retry={load} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusBadge kind={tone(data.status) === 'good' ? 'HEALTHY' : tone(data.status) === 'bad' ? 'DOWN' : 'DEGRADED'} label={undefined} />
        <Button variant="outline" className="min-h-[40px]" onClick={load}><RefreshCw className="size-4" aria-hidden /> <T en="Re-check" th="ตรวจอีกครั้ง" /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(data.checks).map(([key, value]) => {
          const meta = HEALTH_ICON[key] ?? HEALTH_ICON.default
          const Icon = meta.Icon
          const t = tone(value)
          return (
            <div key={key} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium capitalize text-muted-foreground">{key}</p>
                <Icon className={cn('size-4', meta.cls)} aria-hidden />
              </div>
              <p className={cn('mt-2 flex items-center gap-1.5 text-lg font-semibold',
                t === 'good' ? 'text-emerald-700' : t === 'bad' ? 'text-red-700' : 'text-amber-700')}>
                {t === 'good' && <CheckCircle2 className="size-5" aria-hidden />}
                {t === 'warn' && <Loader2 className="size-5 animate-spin" aria-hidden />}
                {t === 'bad' && <XCircle className="size-5" aria-hidden />}
                {value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <T en={`Subsystem: ${key}`} th={`ระบบย่อย: ${key}`} />
              </p>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        <T en={`${fmtNumber(Object.keys(data.checks).length, lang)} subsystems monitored.`} th={`ติดตามระบบย่อย ${fmtNumber(Object.keys(data.checks).length, lang)} รายการ`} />
      </p>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AdministrationView({ ctx }: { ctx: ViewCtx }) {
  // Gate without hooks so an unauthorised render never mounts tab state.
  if (ctx.user.role !== 'SYSTEM_ADMIN') return <DeniedState resourceEn="platform administration" />
  return (
    <PageShell
      objective={{
        en: 'Platform administration — users, access grants, policy, jobs and health under one accountable roof.',
        th: 'การดูแลแพลตฟอร์ม — ผู้ใช้ สิทธิ์เข้าถึง นโยบาย งานพื้นหลัง และสุขภาพระบบ ภายใต้การรับผิดชอบชุดเดียว',
      }}
      guidance={{
        en: 'Every mutation here is audit-logged with your identity. Policy changes affect the whole platform immediately.',
        th: 'ทุกการเปลี่ยนแปลงที่นี่ถูกบันทึกใน audit trail พร้อมตัวตนของคุณ การเปลี่ยนนโยบายมีผลต่อทั้งแพลตฟอร์มทันที',
      }}
    >
      <Tabs defaultValue="users">
        <TabsList className="h-auto min-h-[44px] flex-wrap">
          <TabsTrigger value="users" className="gap-1.5"><Users2 className="size-4" aria-hidden /><T en="Users" th="ผู้ใช้" /></TabsTrigger>
          <TabsTrigger value="grants" className="gap-1.5"><KeyRound className="size-4" aria-hidden /><T en="Access grants" th="สิทธิ์เข้าถึง" /></TabsTrigger>
          <TabsTrigger value="policy" className="gap-1.5"><ServerCog className="size-4" aria-hidden /><T en="Policy" th="นโยบาย" /></TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5"><Activity className="size-4" aria-hidden /><T en="Jobs" th="งานพื้นหลัง" /></TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5"><HeartPulse className="size-4" aria-hidden /><T en="Health" th="สุขภาพระบบ" /></TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab ctx={ctx} /></TabsContent>
        <TabsContent value="grants"><GrantsTab /></TabsContent>
        <TabsContent value="policy"><PolicyTab /></TabsContent>
        <TabsContent value="jobs"><JobsTab /></TabsContent>
        <TabsContent value="health"><HealthTab /></TabsContent>
      </Tabs>
    </PageShell>
  )
}
