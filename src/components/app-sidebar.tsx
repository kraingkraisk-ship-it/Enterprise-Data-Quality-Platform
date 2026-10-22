'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { NAV_GROUPS, VIEWS, APP_VERSION, type ViewKey } from '@/lib/views'

/* ------------------------- live nav badges ------------------------- */

interface NavCounts {
  pendingSignals: number
  openIssues: number
  conditions: number
  newFailures: number
}

const INITIAL_COUNTS: NavCounts = { pendingSignals: 0, openIssues: 0, conditions: 0, newFailures: 0 }

/** ดึงตัวเลขสำหรับ badge ของเมนู (เรียกจาก timer callback — ไม่อยู่ใน effect body) */
async function fetchNavCountsInto(onDone: (counts: NavCounts) => void) {
  try {
    const [s, i, c, f] = await Promise.all([
      fetch('/api/dq/signals').then((r) => r.json()),
      fetch('/api/dq/issues?status=OPEN&take=1').then((r) => r.json()),
      fetch('/api/dq/conditions').then((r) => r.json()),
      fetch('/api/dq/failures?status=NEW&take=1').then((r) => r.json()),
    ])
    onDone({
      pendingSignals:
        s?.stats?.pending ??
        (Array.isArray(s?.signals) ? s.signals.filter((v: { status: string }) => v.status === 'PENDING_REVIEW').length : 0),
      openIssues: i?.stats?.OPEN ?? 0,
      conditions: Array.isArray(c?.conditions) ? c.conditions.length : 0,
      newFailures: f?.stats?.NEW ?? 0,
    })
  } catch {
    /* ไม่สำเร็จ — คงค่าเดิมไว้ */
  }
}

function useNavCounts(reloadKey: ViewKey): NavCounts {
  const [counts, setCounts] = useState<NavCounts>(INITIAL_COUNTS)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [s, i, c, f] = await Promise.all([
          fetch('/api/dq/signals').then((r) => r.json()),
          fetch('/api/dq/issues?status=OPEN&take=1').then((r) => r.json()),
          fetch('/api/dq/conditions').then((r) => r.json()),
          fetch('/api/dq/failures?status=NEW&take=1').then((r) => r.json()),
        ])
        if (!alive) return
        setCounts({
          pendingSignals:
            s?.stats?.pending ??
            (Array.isArray(s?.signals) ? s.signals.filter((v: { status: string }) => v.status === 'PENDING_REVIEW').length : 0),
          openIssues: i?.stats?.OPEN ?? 0,
          conditions: Array.isArray(c?.conditions) ? c.conditions.length : 0,
          newFailures: f?.stats?.NEW ?? 0,
        })
      } catch {
        /* ไม่สำเร็จ — คงค่าเดิมไว้ */
      }
    })()
    const timer = setInterval(() => {
      void fetchNavCountsInto(setCounts)
    }, 45_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [reloadKey])

  return counts
}

/* ----------------------------- sidebar ----------------------------- */

interface AppSidebarProps {
  activeView: ViewKey
  onViewChange: (view: ViewKey) => void
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const counts = useNavCounts(activeView)

  function handleNavigate(view: ViewKey) {
    onViewChange(view)
    if (isMobile) setOpenMobile(false)
  }

  function badgeFor(view: ViewKey): number | undefined {
    if (view === 'validation-results' && counts.pendingSignals > 0) return counts.pendingSignals
    if (view === 'issues' && counts.openIssues > 0) return counts.openIssues
    if (view === 'rule-library' && counts.conditions > 0) return counts.conditions
    if (view === 'failed-records' && counts.newFailures > 0) return counts.newFailures
    return undefined
  }

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      {/* ------------------------- brand ------------------------- */}
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">Enterprise DQ Platform</span>
            <span className="truncate text-xs text-muted-foreground">แพลตฟอร์มบริหารคุณภาพข้อมูล</span>
          </div>
        </div>
      </SidebarHeader>

      {/* -------------------------- nav -------------------------- */}
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.labelEn}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              <span>{group.labelTh}</span>
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/70">{group.labelEn}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((key) => {
                  const view = VIEWS[key]
                  const badge = badgeFor(key)
                  return (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton
                        isActive={activeView === key}
                        tooltip={`${view.th} · ${view.en}`}
                        onClick={() => handleNavigate(key)}
                        aria-current={activeView === key ? 'page' : undefined}
                      >
                        <view.icon className="size-4" aria-hidden="true" />
                        <span className="truncate">{view.th}</span>
                      </SidebarMenuButton>
                      {badge !== undefined && (
                        <SidebarMenuBadge
                          className={
                            key === 'issues'
                              ? 'bg-rose-100 text-rose-900'
                              : key === 'failed-records'
                                ? 'bg-rose-100 text-rose-900'
                                : key === 'validation-results'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-slate-100 text-slate-700'
                          }
                        >
                          {badge}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ------------------------- footer ------------------------- */}
      <SidebarFooter>
        <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            ระบบพร้อมใช้งาน
          </div>
          <Separator className="my-2" />
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 border-emerald-300 bg-emerald-50 px-1.5 font-mono text-[10px] text-emerald-800">
              {APP_VERSION}
            </Badge>
            <span className="text-[10px] text-muted-foreground">PDPA Ready · Audit Trail</span>
          </div>
        </div>
        <div className="hidden px-2 py-1 group-data-[collapsible=icon]:block">
          <Badge variant="outline" className="h-5 w-full justify-center border-emerald-300 bg-emerald-50 px-0 font-mono text-[9px] text-emerald-800">
            {APP_VERSION.replace('v0.', '')}
          </Badge>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
