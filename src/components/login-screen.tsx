'use client'

/* ------------------------------------------------------------------ */
/* LoginScreen (v0.33.0) — หน้าเข้าสู่ระบบของทั้งระบบ                   */
/* อีเมล + รหัสผ่าน → POST /api/auth/login → ตั้ง httpOnly cookie      */
/* การ์ด "บัญชีทดลองใช้งาน" ให้คลิกกรอกเร็ว (demo accounts)             */
/* ------------------------------------------------------------------ */

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLES } from '@/lib/rbac'

const DEMO_ACCOUNTS = [
  { email: 'somchai.owner@company.co.th', role: 'DATA_OWNER' },
  { email: 'aree.analyst@company.co.th', role: 'DQ_ANALYST' },
  { email: 'wisit.executive@company.co.th', role: 'EXECUTIVE' },
  { email: 'sys.admin@company.co.th', role: 'SYS_ADMIN' },
]

const DEMO_PASSWORD = 'Dq@2025'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        // โหลดใหม่ทั้งหน้า — บังคับ CurrentUserProvider ตรวจเซสชันใหม่ให้สะอาด
        window.location.reload()
        return
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      setError(json?.error ?? 'เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่')
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-emerald-50/70 to-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
            <ShieldCheck className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Enterprise Data Quality Platform</h1>
          <p className="mt-1 text-sm text-muted-foreground">แพลตฟอร์มบริหารคุณภาพข้อมูลระดับองค์กร</p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">เข้าสู่ระบบ</h2>
          <p className="mt-1 text-xs text-muted-foreground">ใช้อีเมลและรหัสผ่านของบัญชีผู้ใช้ในระบบ</p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">อีเมล</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  placeholder="name@company.co.th"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  required
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">รหัสผ่าน</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPw ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div id="login-error" role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy || !email || !password}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังตรวจสอบ…
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </Button>
          </form>
        </div>

        {/* บัญชีทดลองใช้งาน (demo) — คลิกกรอกเร็ว */}
        <div className="mt-4 rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground">บัญชีทดลองใช้งาน — คลิกเพื่อกรอก (รหัสผ่านทุกบัญชี: {DEMO_PASSWORD})</h3>
          <ul className="mt-2.5 grid gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email)
                    setPassword(DEMO_PASSWORD)
                    setError('')
                  }}
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
                >
                  <span className="truncate font-medium">{a.email}</span>
                  <span className="shrink-0 rounded-full border bg-emerald-50 px-2 py-0.5 text-[10.5px] text-emerald-800">
                    {ROLES[a.role as keyof typeof ROLES]?.th ?? a.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
            รหัสผ่านนี้เป็นค่าเริ่มต้นสำหรับข้อมูลสาธิต — ควรเปลี่ยนเมื่อใช้งานจริง และทุกความพยายามเข้าสู่ระบบ (สำเร็จ/ไม่สำเร็จ) ถูกบันทึกในศูนย์บันทึกตรวจสอบ
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginScreen
