'use client'
// Global client state (Zustand): session user, table density, saved filters.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserDTO } from '@/lib/types'

interface UiState {
  user: UserDTO | null
  setUser: (u: UserDTO | null) => void
  density: 'comfortable' | 'compact'
  setDensity: (d: 'comfortable' | 'compact') => void
  savedFilters: Record<string, Record<string, string>>
  saveFilter: (view: string, filter: Record<string, string>) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      density: 'comfortable',
      setDensity: (d) => set({ density: d }),
      savedFilters: {},
      saveFilter: (view, filter) => set((s) => ({ savedFilters: { ...s.savedFilters, [view]: filter } })),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'edqp.ui', partialize: (s) => ({ density: s.density, savedFilters: s.savedFilters, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
)
