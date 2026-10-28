'use client'

/* ------------------------------------------------------------------ */
/* Current User Context (v0.33.0)                                      */
/* ─ ผู้ใช้งานปัจจุบันมาจาก "เซสชันเข้าสู่ระบบจริง" (httpOnly cookie)     */
/*   เดิม (v0.32.0) เป็นการเลือกบุคคลจาก localStorage — ใครก็ปลอมได้     */
/*   v0.33.0 ต้องเข้าสู่ระบบด้วยอีเมล+รหัสผ่าน มุมมอง/สิทธิ์/ผู้ดำเนินการ   */
/*   ทุก action ยึดบัญชีผู้เข้าสู่ระบบเท่านั้น (API บังคับทุกจุด)          */
/* ─ users ยังโหลดจาก /api/rbac/users ไว้ใช้เป็นตัวเลือกเจ้าของ/ผู้อนุมัติ  */
/*   ในฟอร์มต่าง ๆ (ไม่ใช่การเปลี่ยนตัวตนแล้ว)                            */
/* ------------------------------------------------------------------ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ROLES, type PermissionKey, type RoleKey } from '@/lib/rbac'
import { LogOut, UserRound } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  /** ผู้ใช้ทั้งหมดที่ ACTIVE (ใช้เป็นตัวเลือกเจ้าของ/ผู้อนุมัติในฟอร์ม — ไม่ใช่การเปลี่ยนตัวตน) */
  users: CurrentUser[]
  /** ผู้ใช้ปัจจุบันจากเซสชัน — null = ยังไม่เข้าสู่ระบบ */
  user: CurrentUser | null
  /** กำลังตรวจเซสชัน/โหลดรายชื่อผู้ใช้อยู่ */
  loading: boolean
  /** ออกจากระบบ (ล้างเซสชันทั้ง cookie + state) */
  logout: () => Promise<void>
  /** ตรวจสิทธิ์ตามบทบาทของผู้ใช้ปัจจุบัน (client-side preview — API ยังบังคับจริงเสมอ) */
  hasPermission: (p: PermissionKey) => boolean
  /** บทบาทของผู้ใช้ปัจจุบัน (BUSINESS_USER เมื่อยังโหลดไม่เสร็จ) */
  roleKey: RoleKey
}

const UserContext = createContext<UserContextValue | null>(null)

function roleThOf(role: string): string {
  return ROLES[role as RoleKey]?.th ?? role
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  /* ตรวจเซสชันก่อนเสมอ — ผลเป็น null = หน้า login (AuthGate ที่ page.tsx) */
  useEffect(() => {
    let alive = true
    try {
      // ล้าง key เก่าของ v0.32 (การเลือกบุคคลผ่าน localStorage — ไม่ใช้แล้ว)
      window.localStorage.removeItem('dq.currentUserEmail')
    } catch {
      /* ไม่มี localStorage — ข้าม */
    }
    ;(async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' })
        const json = (await res.json().catch(() => ({}))) as { user?: { email: string; name: string; role: string; status: string } | null }
        if (!alive) return
        if (json?.user) {
          setUser({ email: json.user.email, name: json.user.name, role: json.user.role, roleTh: roleThOf(json.user.role), status: json.user.status })
        } else {
          setUser(null)
        }
      } catch {
        if (alive) setUser(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /* โหลดรายชื่อผู้ใช้เมื่อเข้าสู่ระบบแล้ว (API ต้องมีเซสชันจึงเรียกได้) */
  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/rbac/users', { cache: 'no-store' })
        const json = (await res.json().catch(() => ({}))) as { users?: ApiUser[] }
        if (!alive) return
        setUsers(
          (json?.users ?? [])
            .filter((u: ApiUser) => u.status === 'ACTIVE')
            .map((u: ApiUser) => ({ email: u.email, name: u.name, role: u.role, roleTh: roleThOf(u.role), status: u.status })),
        )
      } catch {
        /* โหลดไม่สำเร็จ — ฟอร์มที่ใช้แสดงสถานะว่างได้ */
      }
    })()
    return () => {
      alive = false
    }
  }, [user])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ลบ cookie ไม่สำเร็จก็ยังล้าง state ฝั่ง client */
    }
    setUser(null)
    setUsers([])
  }, [])

  const hasPermission = useCallback(
    (p: PermissionKey) => {
      if (!user) return false
      return (ROLES[user.role as RoleKey]?.permissions ?? []).includes(p)
    },
    [user],
  )

  const roleKey = useMemo<RoleKey>(() => ((user?.role as RoleKey) ?? 'BUSINESS_USER'), [user])

  const value = useMemo<UserContextValue>(
    () => ({ users, user, loading, logout, hasPermission, roleKey }),
    [users, user, loading, logout, hasPermission, roleKey],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useCurrentUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useCurrentUser ต้องใช้ภายใต้ <CurrentUserProvider>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* AccountMenu — บัญชีผู้เข้าสู่ระบบปัจจุบันบน header (v0.33.0)          */
/* แสดงชื่อ/บทบาท + ออกจากระบบ (เดิมเป็น UserSwitcher เลือกบุคคลได้)     */
/* ------------------------------------------------------------------ */

export function AccountMenu() {
  const { user, logout } = useCurrentUser()

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="เมนูบัญชีผู้ใช้งานปัจจุบัน"
        className="inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[15rem]"
      >
        <UserRound className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
        <span className="truncate font-medium">{user.name}</span>
        <span className="hidden shrink-0 text-muted-foreground sm:inline">· {user.roleTh}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 inline-flex w-fit items-center rounded-full border bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            {user.roleTh}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            // v0.33.0 — ออกจากระบบแล้วโหลดใหม่ทั้งหน้า (เหมือนตอน login) ให้ AuthGate ตรวจเซสชันใหม่สะอาดเสมอ
            void logout().then(() => {
              window.location.href = '/'
            })
          }}
          className="gap-2 text-rose-700 focus:text-rose-800"
        >
          <LogOut className="size-4" aria-hidden="true" />
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
