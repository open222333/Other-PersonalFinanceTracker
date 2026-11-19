/** 收支分類：API 呼叫 + React Query hooks */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'

import { toPaginated } from '@/api/adapters'
import { api } from '@/api/client'
import { invalidateFinance } from '@/lib/finance-query'

import type { Category, CategoryInput } from './schema'

const BASE = '/categories'

export const categoryKeys = { all: ['categories'] as const }

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async ({ signal }) => toPaginated<Category>(await api.get(BASE, undefined, signal)).items,
    staleTime: 5 * 60_000, // 分類很少變動
  })
}

export function useCategoryMap() {
  const q = useCategories()
  const map = useMemo(() => new Map((q.data ?? []).map((c) => [c.id, c])), [q.data])
  return { ...q, map }
}

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, data }: { id?: string; data: Partial<CategoryInput> }) =>
      id ? api.patch<Category>(`${BASE}/${id}`, data) : api.post<Category>(BASE, data),
    onSuccess: (c, { id }) => {
      invalidateFinance(qc)
      toast.success(id ? `已更新「${c.name}」` : `已新增分類「${c.name}」`)
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: Category) => api.delete(`${BASE}/${c.id}`),
    onSuccess: (_r, c) => {
      invalidateFinance(qc)
      toast.success(`已刪除分類「${c.name}」`)
    },
  })
}
