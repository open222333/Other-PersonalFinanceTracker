/** 側欄導覽設定：新增頁面 → 在 router.tsx 加路由、在這裡加項目 */
import { ArrowDownUp, LayoutDashboard, ReceiptText, Settings, Wallet, type LucideIcon } from 'lucide-react'

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
    label: '總覽',
    items: [{ title: '總覽', url: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: '收支',
    items: [
      { title: '收支明細', url: '/transactions', icon: ReceiptText },
      { title: '帳戶', url: '/accounts', icon: Wallet },
    ],
  },
  // M3 起加入「投資」群組（持股、交易、股利），M4 加入「分析」（報表）
  {
    label: '系統',
    items: [
      { title: '匯入匯出', url: '/data', icon: ArrowDownUp },
      { title: '設定', url: '/settings', icon: Settings, auth: true },
    ],
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
