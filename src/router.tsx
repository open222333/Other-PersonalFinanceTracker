/**
 * 路由：handle.crumb 會顯示在頂欄麵包屑。新增頁面時同步更新 config/nav.ts。
 *
 * 財務資料屬私密：所有頁面都放在 <RequireAuth /> 底下（未登入導向登入頁並帶回原網址），
 * 不使用模板的 <RequireAuth allowGuest />。
 *
 * 頁面以 lazy 載入（各自拆成獨立 chunk，例如總覽的 recharts 只在進入時下載）。
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
        element: <RequireAuth />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            lazy: () => import('@/pages/dashboard').then((m) => ({ Component: m.DashboardPage })),
            handle: { crumb: '總覽' },
          },
          {
            path: 'transactions',
            lazy: () => import('@/pages/transactions').then((m) => ({ Component: m.TransactionsPage })),
            handle: { crumb: '收支明細' },
          },
          {
            path: 'accounts',
            lazy: () => import('@/pages/accounts').then((m) => ({ Component: m.AccountsPage })),
            handle: { crumb: '帳戶' },
          },
          {
            path: 'settings',
            lazy: () => import('@/pages/settings').then((m) => ({ Component: m.SettingsPage })),
            handle: { crumb: '設定' },
          },
          { path: '*', element: <NotFoundPage />, handle: { crumb: '找不到頁面' } },
        ],
      },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
