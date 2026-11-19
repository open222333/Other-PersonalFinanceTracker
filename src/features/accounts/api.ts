/** 帳戶：API 呼叫 + React Query hooks */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'

import { toPaginated } from '@/api/adapters'
import { api } from '@/api/client'
import { invalidateFinance } from '@/lib/finance-query'

import type { Account, AccountInput } from './schema'

const BASE = '/accounts'

export const accountKeys = {
  all: ['accounts'] as const,
  list: (includeArchived: boolean) => [...accountKeys.all, 'list', { includeArchived }] as const,
}

export function useAccounts({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: accountKeys.list(includeArchived),
    queryFn: async ({ signal }) =>
      toPaginated<Account>(await api.get(BASE, { include_archived: includeArchived || undefined }, signal)).items,
  })
}

/** id → 帳戶（含已封存，供列表顯示名稱） */
export function useAccountMap() {
  const q = useAccounts({ includeArchived: true })
  const map = useMemo(() => new Map((q.data ?? []).map((a) => [a.id, a])), [q.data])
  return { ...q, map }
}

export function useSaveAccount() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true }, // 由表單顯示錯誤
    mutationFn: ({ id, data }: { id?: string; data: Partial<AccountInput> }) =>
      id ? api.patch<Account>(`${BASE}/${id}`, data) : api.post<Account>(BASE, data),
    onSuccess: (a, { id, data }) => {
      invalidateFinance(qc)
      if (!id) toast.success(`已建立「${a.name}」`)
      else if (Object.keys(data).length === 1 && 'is_archived' in data) toast.success(a.is_archived ? `已封存「${a.name}」` : `已取消封存「${a.name}」`)
      else toast.success(`已更新「${a.name}」`)
    },
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Account) => api.delete(`${BASE}/${a.id}`),
    onSuccess: (_r, a) => {
      invalidateFinance(qc)
      toast.success(`已刪除「${a.name}」`)
    },
  })
}
