import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

import { ApiError } from '@/api/client'

export const isValidationError = (e: unknown) => e instanceof ApiError && e.status === 422

/**
 * 後端 422 驗證錯誤（FastAPI detail 陣列）對應回表單欄位。
 * 回傳是否有任何錯誤對應到欄位；沒有對應到的錯誤由呼叫端以一般訊息顯示。
 */
export function applyServerErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  if (!isValidationError(e)) return false
  const detail = ((e as ApiError).body as { detail?: { loc?: string[]; msg?: string }[] })?.detail
  if (!Array.isArray(detail)) return false
  let applied = false
  for (const d of detail) {
    const field = d.loc?.at(-1)
    if (field && fields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message: d.msg ?? '格式錯誤' })
      applied = true
    }
  }
  return applied
}
