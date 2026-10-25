'use client'

/* ------------------------------------------------------------------ */
/* Current User Context (v0.32.0)                                      */
/* ─ ผู้ใช้งานปัจจุบันของแอป — แหล่งเดียว (single source of truth)       */
/*   เดิมทุกหน้ามี selector บทบาท/ผู้ดำเนินการของตัวเอง (9 จุด)           */
/*   ทำให้สลับบทบาทแล้วไม่มีผลข้ามหน้า — v0.32.0 รวมเป็นตัวเดียวที่ header */
/* ─ ใช้เป็นทั้ง (1) มุมมองผู้ชม (PII masking / สิทธิ์ดูหน้า) และ         */
/*   (2) ผู้ดำเนินการ (operatorEmail ของทุก action — audit trail ตามจริง) */
/* ─ จำค่าไว้ใน localStorage เพื่อให้รีเฟรชแล้วยังอยู่บทบาทเดิม          */
/* ------------------------------------------------------------------ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROLES, type PermissionKey, type RoleKey } from '@/lib/rbac'
import { UserRound } from 'lucide-react'

export interface CurrentUser {
  email: string
  name: string
  role: string
  roleTh: string
  status: string
}

interface ApiUser {
  id?: string
  email: string
  name: string
  role: string
  status: string
}

interface UserContextValue {
  /** ผู้ใช้ทั้งหมดที่ ACTIVE (ตัวเลือกของ switcher) */
  users: CurrentUser[]
  /** ผู้ใช้ปัจจุบัน — null ระหว่างโหลด */
  user: CurrentUser | null
  /** กำลังโหลดรายชื่อผู้ใช้อยู่ */
  loading: boolean
  /** เปลี่ยนผู้ใช้ปัจจุบัน (ทั้งระบบทุกหน้าเปลี่ยนตามทันที) */
  setUserEmail: (email: string) => void
  /** ตรวจสิทธิ์ตามบทบาทของผู้ใช้ปัจจุบัน (client-side preview — API ยังบังคับจริงเสมอ) */
  hasPermission: (p: PermissionKey) => boolean
  /** บทบาทของผู้ใช้ปัจจุบัน (BUSINESS_USER เมื่อยังโหลดไม่เสร็จ) */
  roleKey: RoleKey
}

const STORAGE_KEY = 'dq.currentUserEmail'
const UserContext = createContext<UserContextValue | null>(null)

function roleThOf(role: string): string {
  return ROLES[role as RoleKey]?.th ?? role
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [userEmail, setUserEmailState] = useState('')
  const [loading, setLoading] = useState(true)

  /* โหลดรายชื่อผู้ใช้ครั้งเดียว + ค่าที่จำไว้จาก localStorage */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/rbac/users')
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        const all: CurrentUser[] = (json?.users ?? [])
          .filter((u: ApiUser) => u.status === 'ACTIVE')
          .map((u: ApiUser) => ({ email: u.email, name: u.name, role: u.role, roleTh: roleThOf(u.role), status: u.status }))
        setUsers(all)
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) ?? '' : ''
        const valid =
          all.find((u) => u.email === saved) ??
          all.find((u) => u.email === 'somchai.owner@company.co.th') ??
          all[0] ??
          null
        if (valid) setUserEmailState(valid.email)
      } catch {
        /* โหลดไม่สำเร็จ — หน้าที่ใช้ก็แสดงสถานะว่างได้ */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const setUserEmail = useCallback((email: string) => {
    setUserEmailState(email)
    try {
      window.localStorage.setItem(STORAGE_KEY, email)
    } catch {
      /* localStorage ใช้ไม่ได้ (โหมดส่วนตัว) — ใช้ในหน่วยความจำอย่างเดียว */
    }
  }, [])

  const user = useMemo(() => users.find((u) => u.email === userEmail) ?? null, [users, userEmail])

  const hasPermission = useCallback(
    (p: PermissionKey) => {
      if (!user) return false
      return (ROLES[user.role as RoleKey]?.permissions ?? []).includes(p)
    },
    [user],
  )

  const roleKey = useMemo<RoleKey>(() => ((user?.role as RoleKey) ?? 'BUSINESS_USER'), [user])

  const value = useMemo<UserContextValue>(
    () => ({ users, user, loading, setUserEmail, hasPermission, roleKey }),
    [users, user, loading, setUserEmail, hasPermission, roleKey],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useCurrentUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useCurrentUser ต้องใช้ภายใต้ <CurrentUserProvider>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* UserSwitcher — ตัวเลือกผู้ใช้ปัจจุบันบน header (ใช้ได้ทุกหน้า)         */
/* ------------------------------------------------------------------ */

export function UserSwitcher() {
  const { users, user, setUserEmail, loading } = useCurrentUser()

  if (loading && !user) {
    return (
      <span
        className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <UserRound className="size-3.5" aria-hidden="true" /> กำลังโหลด…
      </span>
    )
  }

  return (
    <Select value={user?.email ?? undefined} onValueChange={setUserEmail}>
      <SelectTrigger
        aria-label="เลือกผู้ใช้งานปัจจุบัน (มุมมองและสิทธิ์ทั้งระบบ)"
        className="h-9 w-auto max-w-[11rem] gap-1.5 text-xs sm:max-w-[15rem]"
      >
        <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
        <SelectValue placeholder="— ผู้ใช้งาน —" />
      </SelectTrigger>
      <SelectContent align="end" className="max-h-80">
        {users.map((u) => (
          <SelectItem key={u.email} value={u.email} className="text-xs">
            <span className="font-medium">{u.name}</span>
            <span className="text-muted-foreground"> · {u.roleTh}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
