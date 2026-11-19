import { useQuery } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { AccountType } from '@/features/accounts/schema'

/** GET /dashboard/summary：金額皆為本位幣字串，由後端計算 */
export interface DashboardSummary {
  base_currency: string
  as_of: string
  month: string
  net_worth: string
  assets: string
  liabilities: string
  month_income: string
  month_expense: string
  month_net: string
  prev_month_income: string
  prev_month_expense: string
  /** 近 6 個月（含本月），舊 → 新 */
  monthly: { month: string; income: string; expense: string; net: string }[]
  /** 本月支出依第一層分類，前 6 名 + 其他 */
  expense_by_category: { category_id: string; name: string; amount: string }[]
  /** 資產配置（只含正餘額） */
  assets_by_type: { type: AccountType; amount: string }[]
  /** 換算用匯率（1 外幣 = rate 本位幣） */
  fx_rates: { currency: string; rate: string }[]
}

export const dashboardKeys = { summary: (month?: string) => ['dashboard', 'summary', month ?? 'current'] as const }

export const useDashboardSummary = (month?: string) =>
  useQuery({
    queryKey: dashboardKeys.summary(month),
    queryFn: ({ signal }) => api.get<DashboardSummary>('/dashboard/summary', { month }, signal),
  })
