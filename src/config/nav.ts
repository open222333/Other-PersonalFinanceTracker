/** 側欄導覽設定：新增頁面 → 在 router.tsx 加路由、在這裡加項目 */
import { ChartColumn, FolderKanban, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'

import type { User } from '@/api/types'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** 限定角色才顯示（不設 = 全部；設了之後訪客也看不到） */
  roles?: User['role'][]
  /**
   * 需登入才能進入（router.tsx 中放在 <RequireAuth /> 底下的頁面）。
   * 訪客模式下仍會顯示在選單，帶鎖頭圖示，點擊後導向登入頁。
   */
  auth?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { title: '總覽', url: '/dashboard', icon: LayoutDashboard },
      { title: '圖表', url: '/charts', icon: ChartColumn },
      { title: '專案', url: '/projects', icon: FolderKanban },
    ],
  },
  {
    label: 'System',
    items: [{ title: '設定', url: '/settings', icon: Settings, auth: true }],
  },
]

/** 依登入狀態與角色過濾選單；回傳的 locked = 需登入（訪客看得到但點了會去登入） */
export function visibleNav(role: User['role'] | undefined, isGuest: boolean) {
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((i) => !i.roles || (role && i.roles.includes(role)))
      .map((i) => ({ ...i, locked: isGuest && !!i.auth })),
  })).filter((g) => g.items.length > 0)
}
