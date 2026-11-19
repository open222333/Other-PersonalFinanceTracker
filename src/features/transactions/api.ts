/** 收支：API 呼叫 + React Query hooks */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toListQuery, toPaginated } from '@/api/adapters'
import { api } from '@/api/client'
import type { ListParams, Paginated } from '@/api/types'
import { invalidateFinance } from '@/lib/finance-query'

import type { Transaction, TransactionInput } from './schema'

const BASE = '/transactions'

/** 目前篩選條件下的收入 / 支出合計（本位幣，後端計算，不含轉帳） */
export interface FlowSummary {
  base_currency: string
  income: string
  expense: string
  net: string
}

export interface TransactionList extends Paginated<Transaction> {
  summary?: FlowSummary
}

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (p: ListParams) => [...transactionKeys.all, 'list', p] as const,
}

export function useTransactions(params: ListParams) {
  return useQuery({
    queryKey: transactionKeys.list(params),
    queryFn: async ({ signal }): Promise<TransactionList> => {
      const raw = await api.get<{ summary?: FlowSummary }>(BASE, toListQuery(params), signal)
      return { ...toPaginated<Transaction>(raw, params), summary: raw?.summary }
    },
    placeholderData: keepPreviousData,
  })
}

export function useSaveTransaction() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true }, // 由表單顯示錯誤
    mutationFn: ({ id, data }: { id?: string; data: TransactionInput }) =>
      id ? api.patch<Transaction>(`${BASE}/${id}`, data) : api.post<Transaction>(BASE, data),
    onSuccess: (_t, { id }) => {
      invalidateFinance(qc)
      toast.success(id ? '已更新收支' : '已新增收支')
    },
  })
}

export function useDeleteTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      ids.length === 1 ? api.delete(`${BASE}/${ids[0]}`) : api.post(`${BASE}/bulk-delete`, { ids }),
    onSuccess: (_r, ids) => {
      invalidateFinance(qc)
      toast.success(`已刪除 ${ids.length} 筆收支`)
    },
  })
}
