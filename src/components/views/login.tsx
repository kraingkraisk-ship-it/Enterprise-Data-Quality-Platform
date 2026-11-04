'use client'
// Sign-in view — split screen with brand panel and persona picker.
// Demo environment: the persona list acts as a mock IdP (production uses OIDC).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award, Binoculars, Brain, Fingerprint, GitBranch, KeyRound, ListChecks, Loader2,
  Lock, Scale, ShieldCheck, Sparkles, UserCog, Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api-client'
import { ROLES, defaultHomeView } from '@/lib/types'
import type { Role, UserDTO } from '@/lib/types'
import { useUi } from '@/lib/store'
import { T, pick, useLang } from '@/lib/i18n'
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/kit'

type PersonaUser = UserDTO & { active: boolean }

const ROLE_META: Record<Role, { icon: React.ElementType; descEn: string; descTh: string }> = {
  SYSTEM_ADMIN: { icon: UserCog, descEn: 'Full platform administration: users, policy and integrations', descTh: 'ดูแลระบบทั้งหมด: ผู้ใช้ นโยบาย และการเชื่อมต่อ' },
  DATA_OWNER: { icon: Award, descEn: 'Accountable for datasets; approves rule versions', descTh: 'รับผิดชอบชุดข้อมูล อนุมัติเวอร์ชันของกฎ' },
  DATA_STEWARD: { icon: Scale, descEn: 'Curates quality rules, profiles data and resolves issues', descTh: 'ดูแลกฎคุณภาพ วิเคราะห์ข้อมูล และแก้ไขปัญหา' },
  DATA_ENGINEER: { icon: Workflow, descEn: 'Operates sources, jobs and validation pipelines', descTh: 'ดูแลแหล่งข้อมูล งานประมวลผล และท่อตรวจสอบ' },
  DATA_ANALYST: { icon: Binoculars, descEn: 'Read-mostly access to profiles, validations and issues', descTh: 'เข้าถึงข้อมูลโดยส่วนใหญ่เพื่ออ่าน: โปรไฟล์ การตรวจสอบ และปัญหา' },
  DATA_SCIENTIST: { icon: Brain, descEn: 'Builds and reviews ML models for detection', descTh: 'สร้างและทบทวนโมเดล ML สำหรับการตรวจจับ' },
  AUDITOR: { icon: Fingerprint, descEn: 'Read-only access to audit evidence and reports', descTh: 'เข้าถึงหลักฐานการตรวจสอบและรายงานแบบอ่านอย่างเดียว' },
  EXECUTIVE: { icon: KeyRound, descEn: 'Executive KPIs and risk oversight', descTh: 'ดู KPI ระดับผู้บริหารและความเสี่ยง' },
}

const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replaceAll('_', ' ')

function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w.charAt(0) ?? '').join('').toUpperCase()
}

export default function LoginView({ onLogin }: { onLogin?: (user: UserDTO) => void }) {
  const { lang } = useLang()
  const setUser = useUi((s) => s.setUser)
  const [users, setUsers] = useState<PersonaUser[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ message?: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [signInError, setSignInError] = useState<{ message?: string; userId: string } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.personas()
      .then((r) => { if (!cancelled) { setUsers(r.users); setLoadError(null); setLoading(false) } })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError({ message: e instanceof Error ? e.message : undefined })
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [tick])

  const fetchUsers = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    setTick((t) => t + 1)
  }, [])

  const grouped = useMemo(() => {
    const list = users ?? []
    return ROLES
      .map((role) => ({ role, people: list.filter((u) => u.role === role) }))
      .filter((g) => g.people.length > 0)
  }, [users])

  const signIn = async (u: PersonaUser) => {
    setBusyId(u.id)
    setSignInError(null)
    try {
      const { user } = await api.login(u.id)
      setUser(user)
      onLogin?.(user)
      if (!onLogin) {
        // Registry fallback: route to the role's home view via the navigation contract.
        window.dispatchEvent(new CustomEvent('edqp:navigate', { detail: { view: defaultHomeView(user.role) } }))
      }
    } catch (e) {
      setSignInError({ message: e instanceof ApiError ? e.message : undefined, userId: u.id })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid min-h-screen bg-[#f5f6f8] lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-teal-900 p-10 text-white lg:flex">
        <div>
          <p className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-white/10 ring-1 ring-white/25">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Enterprise Platform</span>
          </p>
          <h1 className="mt-8 text-3xl font-semibold leading-tight">
            Enterprise Data Quality Platform
          </h1>
          <p className="mt-1 text-lg text-teal-100">แพลตฟอร์มคุณภาพข้อมูลสำหรับองค์กร</p>

          <ul className="mt-10 space-y-5">
            {[
              { Icon: ListChecks, en: 'Rule-based validation across nine DQ dimensions', th: 'การตรวจสอบตามกฎครอบคลุม 9 มิติคุณภาพข้อมูล' },
              { Icon: Sparkles, en: 'ML anomaly, duplicate and drift detection with human review', th: 'ตรวจจับความผิดปกติ ข้อมูลซ้ำ และ drift ด้วย ML ภายใต้การทบทวนโดยมนุษย์' },
              { Icon: GitBranch, en: 'Versioned rule approvals with full lineage', th: 'การอนุมัติกฎแบบมีเวอร์ชัน ตรวจสอบที่มาย้อนกลับได้' },
              { Icon: Lock, en: 'Immutable, audit-ready trail of every action', th: 'บันทึกการดำเนินการทุกรายการแบบแก้ไขไม่ได้ พร้อมรับการตรวจสอบ' },
            ].map(({ Icon, en, th }) => (
              <li key={en} className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-teal-300" aria-hidden />
                <span className="text-sm leading-relaxed text-teal-50"><T en={en} th={th} /></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 flex items-center gap-2 text-xs text-teal-200">
          <Lock className="size-3.5" aria-hidden />
          <T en="Demo environment · SSO/OIDC-ready · PDPA-aware" th="สภาพแวดล้อมสาธิต · รองรับ SSO/OIDC · คำนึงถึง PDPA" />
        </p>
      </aside>

      {/* Sign-in card */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-5 lg:hidden">
            <p className="flex items-center gap-2 text-teal-900">
              <ShieldCheck className="size-6" aria-hidden />
              <span className="text-lg font-semibold">Data Quality Platform</span>
            </p>
          </div>
          <h2 className="text-2xl font-semibold text-foreground"><T en="Sign in" th="เข้าสู่ระบบ" /></h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <T
              en="Demo environment — select a persona to sign in. SSO/OIDC-ready."
              th="สภาพแวดล้อมสาธิต — เลือกบุคลิกเพื่อเข้าสู่ระบบ รองรับ SSO/OIDC"
            />
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-teal-700" aria-hidden />
            <T
              en="MFA-ready: personas marked MFA require a second factor in production. Sessions use signed httpOnly cookies."
              th="รองรับ MFA: บุคลิกที่ระบุ MFA ต้องยืนยันขั้นที่สองเมื่อใช้งานจริง เซสชันใช้คุกกี้ httpOnly ที่ลงลายเซ็น"
            />
          </p>

          {signInError && (
            <div role="alert" className="mt-4">
              <ErrorState
                message={signInError.message ?? pick(lang, 'Sign-in failed. The persona may be inactive.', 'เข้าสู่ระบบไม่สำเร็จ บุคลิกอาจถูกปิดใช้งาน')}
                retry={() => {
                  const u = users?.find((x) => x.id === signInError.userId)
                  if (u) void signIn(u)
                }}
              />
            </div>
          )}

          <div className="mt-4">
            {loading && <LoadingState rows={4} label={{ en: 'Loading personas…', th: 'กำลังโหลดบุคลิกผู้ใช้…' }} />}
            {!loading && loadError && (
              <ErrorState
                message={loadError.message ?? pick(lang, 'Could not load the persona list (identity provider).', 'โหลดรายชื่อบุคลิกผู้ใช้ (ผู้ให้บริการตัวตน) ไม่สำเร็จ')}
                retry={fetchUsers}
              />
            )}
            {!loading && !loadError && users && users.length === 0 && (
              <EmptyState
                titleEn="No personas available"
                titleTh="ไม่มีบุคลิกผู้ใช้ให้เลือก"
                bodyEn="The identity provider returned no accounts. Reset the demo seed and try again."
                bodyTh="ผู้ให้บริการตัวตนไม่มีบัญชีใด ๆ รีเซ็ตข้อมูลสาธิตแล้วลองอีกครั้ง"
              />
            )}
            {!loading && !loadError && users && users.length > 0 && (
              <div className="space-y-5">
                {grouped.map(({ role, people }) => {
                  const meta = ROLE_META[role]
                  const RoleIcon = meta.icon
                  return (
                    <section key={role} aria-labelledby={`role-${role}`}>
                      <div className="mb-1.5 flex items-baseline gap-2">
                        <h3 id={`role-${role}`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-900">
                          <RoleIcon className="size-3.5" aria-hidden />
                          {roleLabel(role)}
                        </h3>
                        <span className="truncate text-xs text-muted-foreground">{pick(lang, meta.descEn, meta.descTh)}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {people.map((u) => {
                          const busy = busyId === u.id
                          return (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => void signIn(u)}
                                disabled={!u.active || busyId !== null}
                                aria-label={pick(
                                  lang,
                                  `Sign in as ${u.name}${u.mfaEnabled ? ' (MFA)' : ''}`,
                                  `เข้าสู่ระบบเป็น ${u.nameTh || u.name}${u.mfaEnabled ? ' (MFA)' : ''}`,
                                )}
                                className={cn(
                                  'flex min-h-[48px] w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors',
                                  'hover:border-teal-400 hover:bg-teal-50/60 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-1',
                                  (!u.active || busyId !== null) && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-card',
                                )}
                              >
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-semibold text-teal-900">
                                  {busy ? <Loader2 className="size-4 animate-spin text-teal-800" aria-hidden /> : initialsOf(u.name)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {pick(lang, u.name, u.nameTh || u.name)}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end gap-1">
                                  <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                                    {roleLabel(u.role)}
                                  </span>
                                  {u.mfaEnabled && (
                                    <span className="inline-flex items-center gap-0.5 rounded border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-900">
                                      <ShieldCheck className="size-3" aria-hidden />MFA
                                    </span>
                                  )}
                                  {!u.active && (
                                    <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                                      <T en="Inactive" th="ปิดใช้งาน" />
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </div>

          <p className="mt-6 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
            <T
              en="All sign-ins are recorded in the immutable audit trail. Access is deny-by-default and filtered by role."
              th="การเข้าสู่ระบบทุกครั้งจะถูกบันทึกในร่องรอยการตรวจสอบที่แก้ไขไม่ได้ การเข้าถึงถูกปฏิเสธเป็นค่าเริ่มต้นและกรองตามบทบาท"
            />
          </p>
        </div>
      </main>
    </div>
  )
}
