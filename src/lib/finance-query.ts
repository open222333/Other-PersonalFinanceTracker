import type { QueryClient } from '@tanstack/react-query'

/**
 * 帳戶、分類、收支彼此相依（餘額、總覽、報表都由收支推導），
 * 任何一項變動後一併 invalidate，避免畫面顯示舊的餘額或統計（CLAUDE.md §14）。
 */
export const FINANCE_QUERY_ROOTS = ['accounts', 'categories', 'transactions', 'dashboard'] as const

export const invalidateFinance = (qc: QueryClient) =>
  Promise.all(FINANCE_QUERY_ROOTS.map((root) => qc.invalidateQueries({ queryKey: [root] })))
