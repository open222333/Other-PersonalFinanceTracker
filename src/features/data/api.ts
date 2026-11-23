/** 匯入匯出 API（端點與格式見 CLAUDE.md §7、docs/data-format.md） */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toListQuery } from '@/api/adapters'
import { api } from '@/api/client'
import type { ListParams } from '@/api/types'
import type { TxType } from '@/features/transactions/schema'
import { todayYmd } from '@/lib/date'
import { saveCsv, saveFile } from '@/lib/file'
import { invalidateFinance } from '@/lib/finance-query'

export interface ImportRow {
  /** 試算表中的列號（標題為第 1 列） */
  row: number
  status: 'ok' | 'duplicate' | 'error'
  messages: string[]
  data?: { date: string; type: TxType; amount: string; account: string; category: string; to_account: string; payee: string }
}

export interface ImportResult {
  dry_run: boolean
  total: number
  /** 會匯入（dry_run）或已匯入的筆數 */
  imported: number
  duplicates: number
  errors: number
  created_categories: string[]
  warnings: string[]
  rows: ImportRow[]
}

export interface ImportOptions {
  skip_duplicates: boolean
  create_categories: boolean
}

export interface RestoreResult {
  dry_run: boolean
  exported_at: string | null
  backup: { accounts: number; categories: number; transactions: number }
  current: { accounts: number; categories: number; transactions: number }
}

const stamp = () => todayYmd().replace(/-/g, '')

/** 依目前篩選條件匯出收支 CSV（不分頁） */
export async function downloadTransactionsCsv(params: ListParams = {}) {
  const { page: _page, pageSize: _size, ...filters } = params
  const text = await api.get<string>('/export/transactions', toListQuery(filters))
  saveCsv(text, `收支明細-${stamp()}.csv`)
}

export async function downloadBackup() {
  const backup = await api.get<unknown>('/export/backup')
  saveFile(JSON.stringify(backup, null, 2), `個人財務備份-${stamp()}.json`, 'application/json')
}

export function useImportTransactions() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true }, // 由頁面顯示錯誤
    mutationFn: (v: { content: string; dry_run: boolean } & ImportOptions) => api.post<ImportResult>('/import/transactions', v),
    onSuccess: (r) => {
      if (r.dry_run) return
      invalidateFinance(qc)
      toast.success(`已匯入 ${r.imported} 筆收支`)
    },
  })
}

export function useRestoreBackup() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (v: { backup: unknown; dry_run: boolean }) => api.post<RestoreResult>('/import/backup', v),
    onSuccess: (r) => {
      if (r.dry_run) return
      invalidateFinance(qc)
      toast.success('已還原備份')
    },
  })
}
