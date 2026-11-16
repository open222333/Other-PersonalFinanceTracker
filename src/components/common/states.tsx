import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/query'

export function EmptyState({ title = '沒有資料', description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox className="text-muted-foreground size-8" />
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <AlertTriangle className="text-destructive size-8" />
      <p className="font-medium">載入失敗</p>
      <p className="text-muted-foreground text-sm">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> 重試
        </Button>
      )}
    </div>
  )
}

/** 頁面載入中（lazy 路由首次載入時顯示） */
export function PageLoader() {
  return (
    <div className="text-muted-foreground flex h-full min-h-[40vh] items-center justify-center" role="status" aria-label="載入中">
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}
