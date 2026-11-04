'use client'
// Application shell: top bar (search / notifications / language / density /
// user menu), permission-filtered collapsible sidebar, mobile sheet and the
// platform footer. Navigation is decoupled from routing via the
// 'edqp:navigate' CustomEvent — the page integrator listens for it.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bell, ChevronDown, ChevronRight, CircleAlert, Database, Languages,
  ListChecks, Loader2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Rows3, Rows4,
  Search, ScrollText, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import { canAccessView } from '@/lib/types'
import type { UserDTO, ViewKey } from '@/lib/types'
import { useUi } from '@/lib/store'
import { T, pick, useLang, fmtDateTime } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ClassificationBadge } from '@/components/shared/kit'
import { NAV_GROUPS, NAV_VIEWS } from './nav-config'

interface NotificationItem {
  id: string; titleEn: string; titleTh: string; bodyEn: string; bodyTh: string
  severity: string; readAt?: string | null; link?: string | null; createdAt: string
}
interface SearchResults {
  datasets: { id: string; name: string }[]
  rules: { id: string; code: string; name: string }[]
  issues: { id: string; key: string; title: string }[]
}

const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replaceAll('_', ' ')

function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w.charAt(0) ?? '').join('').toUpperCase()
}

/** Uniform navigation contract: the page integrator listens for this event. */
export function dispatchNavigate(view: ViewKey, params?: Record<string, string>) {
  window.dispatchEvent(new CustomEvent('edqp:navigate', { detail: { view, params } }))
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function NavButton({ item, active, collapsed, onClick }: {
  item: { view: ViewKey; labelEn: string; labelTh: string; icon: React.ElementType }
  active: boolean; collapsed: boolean; onClick: () => void
}) {
  const { lang } = useLang()
  const Icon = item.icon
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? pick(lang, item.labelEn, item.labelTh) : undefined}
      className={cn(
        'group relative flex min-h-[40px] w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-slate-700 outline-none transition-colors',
        'hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-1',
        active && 'bg-teal-50 font-medium text-teal-900 hover:bg-teal-50',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full bg-teal-700" />}
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{pick(lang, item.labelEn, item.labelTh)}</span>}
    </button>
  )
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{pick(lang, item.labelEn, item.labelTh)}</TooltipContent>
    </Tooltip>
  )
}

function SideNav({ user, currentView, collapsed, onNavigate }: {
  user: UserDTO; currentView: ViewKey | null; collapsed: boolean; onNavigate?: () => void
}) {
  const { lang } = useLang()
  const groups = useMemo(
    () => NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => canAccessView(user.role, i.view)) }))
      .filter((g) => g.items.length > 0),
    [user.role],
  )
  return (
    <nav aria-label="Primary" className={cn('flex flex-col gap-4 overflow-y-auto px-2 py-3 edqp-scroll', collapsed && 'items-stretch')}>
      {groups.map((g) => (
        <div key={g.groupEn}>
          {collapsed ? (
            <div aria-hidden className="mx-2 mb-1.5 border-t" />
          ) : (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pick(lang, g.groupEn, g.groupTh)}
            </p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.view}>
                <NavButton
                  item={item}
                  active={currentView === item.view}
                  collapsed={collapsed}
                  onClick={() => { dispatchNavigate(item.view); onNavigate?.() }}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="px-2 text-xs text-muted-foreground">
          <T en="No navigation items available for your role." th="ไม่มีรายการเมนูสำหรับบทบาทของคุณ" />
        </p>
      )}
    </nav>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell({ children, user, onLogout, breadcrumb }: {
  children: React.ReactNode
  user: UserDTO
  onLogout: () => void
  breadcrumb?: { label: string }[]
}) {
  const { lang, toggle } = useLang()
  const isMobile = useIsMobile()
  const { sidebarCollapsed, toggleSidebar, density, setDensity } = useUi()
  const [currentView, setCurrentView] = useState<ViewKey | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Track the active view from the navigation contract (the page integrator
  // dispatches 'edqp:navigate' whenever the rendered view changes).
  useEffect(() => {
    const onNav = (e: Event) => {
      const view = (e as CustomEvent<{ view?: ViewKey }>).detail?.view
      if (view) setCurrentView(view)
    }
    window.addEventListener('edqp:navigate', onNav)
    return () => window.removeEventListener('edqp:navigate', onNav)
  }, [])

  // ── Global search ──
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ q: string; data: SearchResults } | null>(null)
  const [errorQ, setErrorQ] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      api.search(q)
        .then((r) => { if (!cancelled) { setResult({ q, data: r }); setErrorQ(null) } })
        .catch(() => { if (!cancelled) setErrorQ(q) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  // ── Notifications ──
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotificationItem[] | null>(null)
  const [notifLoading, setNotifLoading] = useState(false)
  // Invoked from the popover open handler (an event, not an effect).
  const loadNotifs = useCallback(() => {
    setNotifLoading(true)
    api.notifications()
      .then((r) => setNotifs(r.notifications))
      .catch(() => setNotifs([]))
      .finally(() => setNotifLoading(false))
  }, [])
  const unreadCount = notifs?.filter((n) => !n.readAt).length ?? 0

  const openNotification = async (n: NotificationItem) => {
    if (!n.readAt) {
      setNotifs((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev)
      try { await api.markNotificationRead(n.id) } catch { /* optimistic update kept */ }
    }
    const raw = n.link?.replace(/^\/#\/?/, '') ?? ''
    const known = raw.split('/')[0]
    if (known && (NAV_VIEWS as string[]).includes(known) && canAccessView(user.role, known as ViewKey)) {
      dispatchNavigate(known as ViewKey)
      setNotifOpen(false)
    }
  }

  // ── User menu ──
  const [loggingOut, setLoggingOut] = useState(false)
  const handleLogout = async () => {
    setLoggingOut(true)
    try { await api.logout() } catch { /* session cleared client-side regardless */ }
    onLogout()
  }

  const goTo = useCallback((view: ViewKey, params?: Record<string, string>) => {
    dispatchNavigate(view, params)
    setSearchOpen(false)
    setNotifOpen(false)
    setMobileOpen(false)
    setQuery('')
  }, [])

  const collapsed = sidebarCollapsed
  const displayName = lang === 'th' ? (user.nameTh || user.name) : user.name
  const initials = initialsOf(user.name)
  const hasNotifsData = notifs !== null
  const trimmedQuery = query.trim()
  const searching = trimmedQuery.length >= 2 && result?.q !== trimmedQuery && errorQ !== trimmedQuery
  const searchError = trimmedQuery.length >= 2 && errorQ === trimmedQuery
  const searchResults = result?.q === trimmedQuery ? result.data : null

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f8]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-teal-800 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        <T en="Skip to main content" th="ข้ามไปยังเนื้อหาหลัก" />
      </a>

      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1.5 border-b bg-white px-2.5 md:px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              aria-label={pick(lang, 'Toggle navigation menu', 'สลับเมนูนำทาง')}
              onClick={() => (isMobile ? setMobileOpen(true) : toggleSidebar())}
            >
              {isMobile ? <Menu className="size-5" aria-hidden /> : collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMobile ? <T en="Open menu" th="เปิดเมนู" /> : <T en="Collapse or expand sidebar" th="ย่อหรือขยายแถบเมนู" />}</TooltipContent>
        </Tooltip>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
          {breadcrumb && breadcrumb.length > 0 ? (
            <ol className="flex min-w-0 items-center gap-1 text-sm">
              {breadcrumb.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className={cn('truncate', i === breadcrumb.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground')} aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>
                    {b.label}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="truncate text-sm text-muted-foreground">
              <T en="Data Quality Platform" th="แพลตฟอร์มคุณภาพข้อมูล" />
            </p>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {/* Global search */}
          <Popover open={searchOpen} onOpenChange={(o) => { setSearchOpen(o); if (o) { setResult(null); setErrorQ(null) } }}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-10 justify-start gap-2 px-2.5 text-muted-foreground md:w-56 lg:w-72"
                aria-label={pick(lang, 'Search datasets, rules and issues', 'ค้นหาชุดข้อมูล กฎ และปัญหา')}
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="hidden md:inline md:truncate">
                  <T en="Search datasets, rules, issues…" th="ค้นหาชุดข้อมูล กฎ ปัญหา…" />
                </span>
                <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground lg:inline">⌘K</kbd>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-1rem)] p-0">
              <Command shouldFilter={false} className="rounded-lg">
                <CommandInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder={pick(lang, 'Type to search…', 'พิมพ์เพื่อค้นหา…')}
                />
                <CommandList className="max-h-[360px] edqp-scroll">
                  {searching && (
                    <p role="status" className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> <T en="Searching…" th="กำลังค้นหา…" />
                    </p>
                  )}
                  {!searching && searchError && (
                    <p role="alert" className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-700">
                      <AlertTriangle className="size-4" aria-hidden /> <T en="Search is unavailable right now." th="ระบบค้นหาไม่พร้อมใช้งานขณะนี้" />
                    </p>
                  )}
                  {!searching && !searchError && searchResults && (
                    <>
                      <CommandEmpty>
                        <T en="No results found." th="ไม่พบผลลัพธ์" />
                      </CommandEmpty>
                      {(searchResults.datasets.length > 0 || searchResults.rules.length > 0 || searchResults.issues.length > 0) && (
                        <>
                          {searchResults.datasets.length > 0 && (
                            <CommandGroup heading={<T en="Datasets" th="ชุดข้อมูล" />}>
                              {searchResults.datasets.map((d) => (
                                <CommandItem key={d.id} value={`ds-${d.id}`} onSelect={() => goTo('dataset-detail', { id: d.id })} className="min-h-[40px]">
                                  <Database className="size-4 text-teal-700" aria-hidden />
                                  <span className="truncate">{d.name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {searchResults.rules.length > 0 && (
                            <CommandGroup heading={<T en="Rules" th="กฎคุณภาพ" />}>
                              {searchResults.rules.map((r) => (
                                <CommandItem key={r.id} value={`rule-${r.id}`} onSelect={() => goTo('rules')} className="min-h-[40px]">
                                  <ListChecks className="size-4 text-teal-700" aria-hidden />
                                  <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                                  <span className="truncate">{r.name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {searchResults.issues.length > 0 && (
                            <CommandGroup heading={<T en="Issues" th="ปัญหาข้อมูล" />}>
                              {searchResults.issues.map((i) => (
                                <CommandItem key={i.id} value={`issue-${i.id}`} onSelect={() => goTo('issues')} className="min-h-[40px]">
                                  <CircleAlert className="size-4 text-orange-700" aria-hidden />
                                  <span className="font-mono text-xs text-muted-foreground">{i.key}</span>
                                  <span className="truncate">{i.title}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </>
                      )}
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Notifications */}
          <Popover open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) loadNotifs() }}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-10"
                aria-label={pick(
                  lang,
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications',
                  unreadCount > 0 ? `การแจ้งเตือน ${unreadCount} รายการที่ยังไม่ได้อ่าน` : 'การแจ้งเตือน',
                )}
              >
                <Bell className="size-5" aria-hidden />
                {unreadCount > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-600 ring-2 ring-white" />}
                <span className="sr-only">
                  {unreadCount > 0
                    ? <T en={`${unreadCount} unread notifications`} th={`มี ${unreadCount} รายการที่ยังไม่ได้อ่าน`} />
                    : <T en="No unread notifications" th="ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน" />}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-1rem)] p-0">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-semibold"><T en="Notifications" th="การแจ้งเตือน" /></p>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                    <span aria-hidden className="size-1.5 rounded-full bg-red-600" />
                    <T en={`${unreadCount} unread`} th={`${unreadCount} รายการที่ยังไม่ได้อ่าน`} />
                  </span>
                )}
              </div>
              {notifLoading && (
                <p role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> <T en="Loading notifications…" th="กำลังโหลดการแจ้งเตือน…" />
                </p>
              )}
              {!notifLoading && hasNotifsData && notifs.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground"><T en="No notifications yet." th="ยังไม่มีการแจ้งเตือน" /></p>
              )}
              {!notifLoading && hasNotifsData && notifs.length > 0 && (
                <ul className="max-h-[380px] overflow-y-auto edqp-scroll">
                  {notifs.map((n) => (
                    <li key={n.id} className={cn('border-b last:border-0', !n.readAt && 'bg-teal-50/40')}>
                      <button
                        type="button"
                        onClick={() => void openNotification(n)}
                        className="flex min-h-[48px] w-full flex-col items-start gap-0.5 px-3 py-2 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700"
                      >
                        <span className="flex w-full items-center gap-2">
                          {!n.readAt && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-teal-600" />}
                          <span className={cn('truncate text-sm', n.readAt ? 'text-foreground/80' : 'font-medium text-foreground')}>
                            <T en={n.titleEn} th={n.titleTh} />
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{fmtDateTime(n.createdAt, lang)}</span>
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground"><T en={n.bodyEn} th={n.bodyTh} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>

          {/* Language toggle */}
          <Button
            variant="ghost"
            className="hidden min-h-[40px] gap-1.5 px-2 sm:inline-flex"
            onClick={toggle}
            aria-label={pick(lang, 'Switch language', 'สลับภาษา')}
          >
            <Languages className="size-4 text-muted-foreground" aria-hidden />
            <span className={cn('text-xs', lang === 'en' ? 'font-bold text-teal-800' : 'text-muted-foreground')}>EN</span>
            <span aria-hidden className="text-xs text-slate-300">|</span>
            <span className={cn('text-xs', lang === 'th' ? 'font-bold text-teal-800' : 'text-muted-foreground')}>ไทย</span>
          </Button>

          {/* Density toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-10 sm:inline-flex"
                onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
                aria-pressed={density === 'compact'}
                aria-label={pick(
                  lang,
                  density === 'comfortable' ? 'Table density: comfortable. Switch to compact' : 'Table density: compact. Switch to comfortable',
                  density === 'comfortable' ? 'ความหนาแน่นตาราง: ปกติ สลับเป็นกระชับ' : 'ความหนาแน่นตาราง: กระชับ สลับเป็นปกติ',
                )}
              >
                {density === 'comfortable' ? <Rows3 className="size-4" aria-hidden /> : <Rows4 className="size-4" aria-hidden />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {density === 'comfortable'
                ? <T en="Comfortable density — switch to compact" th="ความหนาแน่นปกติ — สลับเป็นกระชับ" />
                : <T en="Compact density — switch to comfortable" th="ความหนาแน่นกระชับ — สลับเป็นปกติ" />}
            </TooltipContent>
          </Tooltip>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="min-h-[40px] gap-2 pl-1 pr-1.5 sm:pr-2" aria-label={pick(lang, 'Account menu', 'เมนูบัญชีผู้ใช้')}>
                <Avatar className="size-8">
                  <AvatarFallback className="bg-teal-700 text-xs font-semibold text-white">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-sm font-medium lg:inline">{displayName}</span>
                <ChevronDown className="hidden size-4 text-muted-foreground lg:inline" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="space-y-1">
                <p className="text-sm font-semibold">{displayName}</p>
                <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
                <p className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-900">
                    <ShieldCheck className="size-3" aria-hidden />{roleLabel(user.role)}
                  </span>
                  {user.mfaEnabled && (
                    <span className="rounded border bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700">MFA</span>
                  )}
                </p>
                {(user.titleEn || user.titleTh) && (
                  <p className="pt-0.5 text-xs font-normal text-muted-foreground">
                    {pick(lang, user.titleEn ?? '', user.titleTh ?? user.titleEn ?? '')}
                    {user.businessUnit ? ` · ${user.businessUnit}` : ''}
                  </p>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void handleLogout()}
                className="min-h-[40px] cursor-pointer text-red-800 focus:bg-red-50 focus:text-red-900"
              >
                {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
                <T en="Sign out" th="ออกจากระบบ" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex w-full flex-1">
        <aside
          aria-label="Sidebar"
          className={cn('sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-hidden border-r bg-white transition-[width] duration-200 md:flex', collapsed ? 'w-14' : 'w-60')}
        >
          <SideNav user={user} currentView={currentView} collapsed={collapsed} />
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-3 py-4 focus:outline-none md:px-6 md:py-6">
          {children}
        </main>
      </div>

      {/* Mobile navigation sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-5 text-teal-700" aria-hidden />
              <T en="Data Quality Platform" th="แพลตฟอร์มคุณภาพข้อมูล" />
            </SheetTitle>
            <SheetDescription className="sr-only"><T en="Primary navigation" th="เมนูนำทางหลัก" /></SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <SideNav user={user} currentView={currentView} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white">
        <div className="flex flex-col items-start justify-between gap-1 px-4 py-2.5 text-xs text-muted-foreground md:flex-row md:items-center">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              <T en="Enterprise Data Quality Platform v1.0" th="แพลตฟอร์มคุณภาพข้อมูลองค์กร v1.0" />
            </span>
            <ClassificationBadge level="INTERNAL" />
          </p>
          <p className="flex items-center gap-1.5">
            <ScrollText className="size-3.5" aria-hidden />
            <T en="© 2025 · PDPA-aware · Audit-ready" th="© 2025 · คำนึงถึง PDPA · พร้อมรับการตรวจสอบ" />
          </p>
        </div>
      </footer>
    </div>
  )
}
