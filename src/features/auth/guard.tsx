/**
 * 登入閘門：
 * - <RequireAuth />            需登入，未登入導向登入頁（帶回原網址）
 * - <RequireAuth allowGuest /> 訪客模式（VITE_GUEST_MODE=true）時不登入也可瀏覽；關閉時同 <RequireAuth />
 */
import { Navigate, Outlet, useLocation } from 'react-router'

import { env } from '@/config/env'

import { loginPath } from './session'
import { useAuth } from './store'

export function RequireAuth({ allowGuest = false }: { allowGuest?: boolean }) {
  const token = useAuth((s) => s.token)
  const location = useLocation()
  if (token || (allowGuest && env.guestMode)) return <Outlet />
  return <Navigate to={loginPath(location.pathname + location.search)} replace />
}
