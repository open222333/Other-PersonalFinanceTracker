import { Archive, ArchiveRestore, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AccountFormDialog } from '@/features/accounts/account-form-dialog'
import { useAccounts, useDeleteAccount, useSaveAccount } from '@/features/accounts/api'
import { ACCOUNT_TYPE_COLOR, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, type Account } from '@/features/accounts/schema'
import { useSession } from '@/features/auth/session'
import { useDashboardSummary } from '@/features/dashboard/api'
import { BASE_CURRENCY, formatMoney, isNegative } from '@/lib/money'
import { errorMessage } from '@/lib/query'
import { cn } from '@/lib/utils'

function Totals() {
  const s = useDashboardSummary()
  const items = [
    { label: '資產', value: s.data?.assets },
    { label: '負債', value: s.data?.liabilities },
    { label: '淨資產', value: s.data?.net_worth },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((i) => (
        <Card key={i.label} className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription>{i.label}</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {s.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : s.error ? (
              <span className="text-muted-foreground text-sm">無法載入</span>
            ) : (
              <div className="text-2xl font-semibold tabular-nums">{formatMoney(i.value, s.data!.base_currency)}</div>
            )}
          </CardContent>
        </Card>
      ))}
      {!!s.data?.fx_rates.length && (
        <p className="text-muted-foreground text-xs sm:col-span-3">
          外幣以匯率換算為 {s.data.base_currency}：{s.data.fx_rates.map((r) => `1 ${r.currency} = ${r.rate}`).join('、')}
        </p>
      )}
    </div>
  )
}

interface CardProps {
  a: Account
  canEdit: boolean
  onEdit: () => void
  onToggleArchive: () => void
  onDelete: () => void
}

function AccountCard({ a, canEdit, onEdit, onToggleArchive, onDelete }: CardProps) {
  return (
    <Card className={cn('gap-3', a.is_archived && 'opacity-70')}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate">{a.name}</span>
          {a.currency !== BASE_CURRENCY && <Badge variant="outline">{a.currency}</Badge>}
          {a.is_archived && <Badge variant="secondary">已封存</Badge>}
        </CardTitle>
        <CardDescription>{a.transaction_count} 筆收支</CardDescription>
        {canEdit && (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`「${a.name}」的操作`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil /> 編輯
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleArchive}>
                  {a.is_archived ? <ArchiveRestore /> : <Archive />} {a.is_archived ? '取消封存' : '封存'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="text-destructive" /> 刪除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className={cn('text-2xl font-semibold tabular-nums', isNegative(a.balance) && 'text-destructive')}>
          {formatMoney(a.balance, a.currency)}
        </div>
        {a.note && <p className="text-muted-foreground line-clamp-2 text-sm">{a.note}</p>}
        <Button variant="link" size="sm" className="h-auto self-start px-0" asChild>
          <Link to={`/transactions?account_id=${a.id}`}>
            查看收支 <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function AccountsPage() {
  const { canEdit } = useSession()
  const [showArchived, setShowArchived] = useState(false)
  const q = useAccounts({ includeArchived: showArchived })
  const save = useSaveAccount()
  const del = useDeleteAccount()
  const [editing, setEditing] = useState<Account | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Account | null>(null)

  const openForm = (a: Account | null) => {
    setEditing(a)
    setFormOpen(true)
  }
  const toggleArchive = (a: Account) =>
    save.mutate({ id: a.id, data: { is_archived: !a.is_archived } }, { onError: (e) => toast.error(errorMessage(e)) })
  const groups = ACCOUNT_TYPES.map((type) => ({ type, items: (q.data ?? []).filter((a) => a.type === type) })).filter((g) => g.items.length)

  return (
    <>
      <PageHeader
        title="帳戶"
        description="餘額 = 期初餘額 + 所有收支；信用卡、貸款以負數表示欠款"
        actions={
          <>
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived" className="font-normal">
                顯示已封存
              </Label>
            </div>
            {canEdit && (
              <Button onClick={() => openForm(null)}>
                <Plus /> 新增帳戶
              </Button>
            )}
          </>
        }
      />

      <Totals />

      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : !groups.length ? (
        <Card>
          <EmptyState
            title="還沒有帳戶"
            description="先建立一個帳戶（例如現金、銀行），就可以開始記帳"
            action={canEdit && <Button onClick={() => openForm(null)}>新增帳戶</Button>}
          />
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.type} aria-labelledby={`acc-group-${g.type}`} className="flex flex-col gap-3">
            <h2 id={`acc-group-${g.type}`} className="flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: ACCOUNT_TYPE_COLOR[g.type] }} />
              {ACCOUNT_TYPE_LABEL[g.type]}
              <span className="text-muted-foreground font-normal">{g.items.length}</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((a) => (
                <AccountCard
                  key={a.id}
                  a={a}
                  canEdit={canEdit}
                  onEdit={() => openForm(a)}
                  onToggleArchive={() => toggleArchive(a)}
                  onDelete={() => setToDelete(a)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <AccountFormDialog open={formOpen} onOpenChange={setFormOpen} account={editing} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`刪除帳戶「${toDelete?.name ?? ''}」？`}
        description={
          toDelete?.transaction_count
            ? `此帳戶已有 ${toDelete.transaction_count} 筆收支，無法刪除。不再使用的帳戶請改用「封存」。`
            : '刪除後無法復原。'
        }
        confirmText={toDelete?.transaction_count ? (toDelete.is_archived ? '關閉' : '改為封存') : '刪除'}
        destructive={!toDelete?.transaction_count}
        onConfirm={() => {
          const a = toDelete!
          if (!a.transaction_count) del.mutate(a)
          else if (!a.is_archived) toggleArchive(a)
          setToDelete(null)
        }}
      />
    </>
  )
}
