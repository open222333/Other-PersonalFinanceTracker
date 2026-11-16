/** 登入狀態相關 hooks：目前身分、導向登入、登出 */
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

import type { User } from '@/api/types'
import { env } from '@/config/env'

import { hasRole, useAuth } from './store'

/** 登入頁網址（登入後導回 redirect） */
export const loginPath = (redirect?: string) =>
  redirect && redirect !== '/' ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'

/** 登出後的去處：訪客模式回總覽（仍可瀏覽），否則回登入頁 */
export const afterLogoutPath = () => (env.guestMode ? '/dashboard' : '/login')

export interface SessionInfo {
  user: User | null
  isAuthenticated: boolean
  /** 未登入、以訪客身分瀏覽 */
  isGuest: boolean
  /** 可新增 / 編輯 / 刪除（admin、operator） */
  canEdit: boolean
}

export function useSession(): SessionInfo {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  return {
    user,
    isAuthenticated: !!token,
    isGuest: !token,
    canEdit: !!token && hasRole(user, 'admin', 'operator'),
  }
}

/** 回傳一個函式：導向登入頁，登入後回到 target（預設為目前網址） */
export function useLoginRedirect() {
  const navigate = useNavigate()
  const here = useLocation()
  const current = here.pathname + here.search
  return useCallback((target: string = current) => navigate(loginPath(target)), [navigate, current])
}

export function useLogout() {
  const clear = useAuth((s) => s.clear)
  const navigate = useNavigate()
  return () => {
    clear()
    navigate(afterLogoutPath(), { replace: true })
  }
}
