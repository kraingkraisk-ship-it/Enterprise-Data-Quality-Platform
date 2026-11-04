'use client'
// Lightweight bilingual i18n: views declare EN/TH text inline via <T> or useLang().
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Lang = 'en' | 'th'

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; toggle: () => void }
const Ctx = createContext<LangCtx>({ lang: 'en', setLang: () => {}, toggle: () => {} })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')
  useEffect(() => {
    // Hydrate persisted language preference (async read keeps effect setState-free)
    const saved = window.localStorage.getItem('edqp.lang')
    if (saved === 'th' || saved === 'en') {
      queueMicrotask(() => setLangState(saved))
      document.documentElement.lang = saved === 'th' ? 'th-TH' : 'en-US'
    }
  }, [])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    window.localStorage.setItem('edqp.lang', l)
    document.documentElement.lang = l === 'th' ? 'th-TH' : 'en-US'
  }, [])
  const toggle = useCallback(() => setLang(lang === 'en' ? 'th' : 'en'), [lang, setLang])
  return <Ctx.Provider value={{ lang, setLang, toggle }}>{children}</Ctx.Provider>
}

export function useLang() {
  const { lang, setLang, toggle } = useContext(Ctx)
  return { lang, setLang, toggle, isTh: lang === 'th' }
}

/** Inline bilingual text node. */
export function T({ en, th }: { en: string; th: string }) {
  const { lang } = useContext(Ctx)
  return <>{lang === 'th' ? th : en}</>
}

/** Pick a bilingual string. */
export function pick(lang: Lang, en: string, th: string): string {
  return lang === 'th' ? th : en
}

// ─── Locale-aware formatting (Asia/Bangkok) ───────────────────────────────────
export function fmtDateTime(d: string | Date | null | undefined, lang: Lang): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  })
}

export function fmtDate(d: string | Date | null | undefined, lang: Lang): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })
}

export function fmtNumber(n: number | null | undefined, lang: Lang, opts?: Intl.NumberFormatOptions): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', opts)
}

export function fmtPercent(n: number | null | undefined, lang: Lang, digits = 1): string {
  if (n == null || isNaN(n)) return '—'
  return `${n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function fmtDuration(ms: number | null | undefined, lang: Lang): string {
  if (ms == null) return '—'
  if (ms < 1000) return lang === 'th' ? `${ms} มส.` : `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}${lang === 'th' ? ' วิ' : 's'}`
  return `${Math.floor(s / 60)}${lang === 'th' ? ' นาที ' : 'm '}${Math.round(s % 60)}${lang === 'th' ? ' วิ' : 's'}`
}
