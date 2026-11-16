/**
 * 路由：handle.crumb 會顯示在頂欄麵包屑。新增頁面時同步更新 config/nav.ts。
 *
 * 登入規則（訪客模式 VITE_GUEST_MODE=true 時）：
 * - <RequireAuth allowGuest /> 底下 = 公開頁，未登入可瀏覽（寫入操作在頁面內以 useSession().canEdit 控制）
 * - <RequireAuth />            底下 = 需登入，未登入導向登入頁
 * 關閉訪客模式時兩者都需要登入。
 *
 * 頁面以 lazy 載入（各自拆成獨立 chunk，例如圖表頁的 recharts 只在進入時下載）。
 */
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { PageLoader } from '@/components/common/states'
import { RequireAuth } from '@/features/auth/guard'
import { NotFoundPage, RouteErrorPage } from '@/pages/errors'
import { LoginPage } from '@/pages/login'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageLoader />,
    children: [
      {
        element: <RequireAuth allowGuest />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            lazy: () => import('@/pages/dashboard').then((m) => ({ Component: m.DashboardPage })),
            handle: { crumb: '總覽' },
          },
          {
            path: 'charts',
            lazy: () => import('@/pages/charts').then((m) => ({ Component: m.ChartsPage })),
            handle: { crumb: '圖表' },
          },
          {
            path: 'projects',
            lazy: () => import('@/pages/projects').then((m) => ({ Component: m.ProjectsPage })),
            handle: { crumb: '專案' },
          },
          { path: '*', element: <NotFoundPage />, handle: { crumb: '找不到頁面' } },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'settings',
            lazy: () => import('@/pages/settings').then((m) => ({ Component: m.SettingsPage })),
            handle: { crumb: '設定' },
          },
        ],
      },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
