import type { UserDTO, ViewKey } from '@/lib/types'

// Standard props for every view component (integrated by the shell in page.tsx)
export interface ViewCtx {
  user: UserDTO
  navigate: (view: ViewKey, params?: Record<string, string>) => void
  params: Record<string, string>
}
