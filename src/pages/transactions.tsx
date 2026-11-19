import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Copy, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { ColumnHeader } from '@/components/data-table/column-header'
import { DataTable } from '@/components/data-table/data-table'
import { FacetedFilter } from '@/components/data-table/faceted-filter'
import { selectionColumn } from '@/components/data-table/selection-column'
import { ViewOptions } from '@/components/data-table/view-options'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountMap } from '@/features/accounts/api'
import { useSession } from '@/features/auth/session'
import { useCategoryMap } from '@/features/categories/api'
import { categoryOptions, categoryPath } from '@/features/categories/schema'
import { useDeleteTransactions, useTransactions, type FlowSummary } from '@/features/transactions/api'
import { TX_TYPE_LABEL, TX_TYPES, toForm, type Transaction, type TransactionForm } from '@/features/transactions/schema'
import { TransactionFormDialog } from '@/features/transactions/transaction-form-dialog'
import { TxAmount, TxTypeBadge } from '@/features/transactions/tx-display'
import { useDebouncedValue } from '@/hooks/use-debounce'
import { useListParams } from '@/hooks/use-list-params'
import { formatDay, matchPreset, PERIOD_PRESETS, todayYmd } from '@/lib/date'
import { BASE_CURRENCY, formatMoney } from '@/lib/money'

const FILTERS = ['type', 'account_id', 'category_id', 'date_from', 'date_to']
const typeOptions = TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABEL[t] }))

function SummaryBar({ summary, loading }: { summary?: FlowSummary; loading: boolean }) {
  const items = [
    { label: '收入', value: summary?.income, className: 'text-emerald-600 dark:text-emerald-400' },
    { label: '支出', value: summary?.expense, className: '' },
    { label: '結餘', value: summary?.net, className: Number(summary?.net) < 0 ? 'text-destructive' : '' },
  ]
  return (
    <dl className="bg-muted/40 flex flex-wrap gap-x-8 gap-y-2 rounded-md border px-4 py-2.5 text-sm" aria-label="篩選結果合計">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className={`font-semibold tabular-nums ${i.className}`}>
            {loading || !summary ? <Skeleton className="inline-block h-4 w-16" /> : formatMoney(i.value, summary.base_currency)}
          </dd>
        </div>
      ))}
      <p className="text-muted-foreground ml-auto self-center text-xs">不含轉帳；外幣以匯率換算為 {summary?.base_currency ?? BASE_CURRENCY}</p>
    </dl>
  )
}

export function TransactionsPage() {
  const { params, update, searchParams, setExtra } = useListParams({ sort: 'date', order: 'desc', pageSize: 20, filters: FILTERS })
  const { canEdit } = useSession()
  const query = useTransactions(params)
  const accounts = useAccountMap()
  const categories = useCategoryMap()
  const del = useDeleteTransactions()

  const [search, setSearch] = useState(params.q ?? '')
  const debounced = useDebouncedValue(search)
  useEffect(() => {
    if ((params.q ?? '') !== debounced) update({ q: debounced || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const [selection, setSelection] = useState<RowSelectionState>({})
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [defaults, setDefaults] = useState<Partial<TransactionForm> | undefined>()
  const [formOpen, setFormOpen] = useState(canEdit && searchParams.get('new') === '1')
  const [toDelete, setToDelete] = useState<Transaction[] | null>(null)
  const [customPeriod, setCustomPeriod] = useState(false)

  useEffect(() => setSelection({}), [params])

  const openCreate = (preset?: Partial<TransactionForm>) => {
    setEditing(null)
    // 只篩選一個帳戶時，預設記在該帳戶
    const onlyAccount = typeof params.account_id === 'string' && !params.account_id.includes(',') ? params.account_id : undefined
    setDefaults(preset ?? (onlyAccount ? { account_id: onlyAccount } : undefined))
    setFormOpen(true)
  }
  const openEdit = (t: Transaction) => {
    setEditing(t)
    setFormOpen(true)
  }
  const duplicate = (t: Transaction) => openCreate({ ...toForm(t), date: todayYmd() })

  const accountName = (id: string | null) => (id ? (accounts.map.get(id)?.name ?? '（已刪除的帳戶）') : '')
  const currencyOf = (id: string | null) => (id ? (accounts.map.get(id)?.currency ?? BASE_CURRENCY) : BASE_CURRENCY)

  const accountOptions = useMemo(
    () => [...accounts.map.values()].map((a) => ({ value: a.id, label: a.is_archived ? `${a.name}（已封存）` : a.name })),
    [accounts.map],
  )
  const catOptions = useMemo(() => categoryOptions([...categories.map.values()]).map((o) => ({ value: o.value, label: o.label })), [categories.map])

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      ...(canEdit ? [selectionColumn<Transaction>()] : []),
      {
        accessorKey: 'date',
        meta: { label: '日期' },
        enableHiding: false,
        header: ({ column }) => <ColumnHeader column={column} title="日期" />,
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDay(row.original.date)}</span>,
      },
      {
        accessorKey: 'type',
        meta: { label: '類型' },
        enableSorting: false,
        header: '類型',
        cell: ({ row }) => <TxTypeBadge type={row.original.type} />,
      },
      {
        id: 'category',
        meta: { label: '分類' },
        enableSorting: false,
        header: '分類',
        cell: ({ row }) =>
          row.original.type === 'transfer' ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="whitespace-nowrap">{categoryPath(categories.map, row.original.category_id)}</span>
          ),
      },
      {
        id: 'account',
        meta: { label: '帳戶' },
        enableSorting: false,
        header: '帳戶',
        cell: ({ row }) => {
          const t = row.original
          return (
            <span className="whitespace-nowrap">
              {accountName(t.account_id)}
              {t.type === 'transfer' && <> → {accountName(t.to_account_id)}</>}
            </span>
          )
        },
      },
      {
        id: 'detail',
        meta: { label: '對象 / 備註' },
        enableSorting: false,
        header: '對象 / 備註',
        cell: ({ row }) => {
          const t = row.original
          return (
            <div className="flex max-w-[22rem] min-w-0 items-center gap-2">
              <div className="min-w-0">
                {t.payee && <div className="truncate">{t.payee}</div>}
                {t.note && <div className="text-muted-foreground truncate text-xs">{t.note}</div>}
              </div>
              {t.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: 'amount',
        meta: { label: '金額' },
        enableHiding: false,
        header: ({ column }) => (
          <div className="flex justify-end">
            <ColumnHeader column={column} title="金額" className="-mr-2 ml-0" />
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <TxAmount tx={row.original} currency={currencyOf(row.original.account_id)} toCurrency={currencyOf(row.original.to_account_id)} />
          </div>
        ),
      },
      ...(canEdit
        ? [
            {
              id: 'actions',
              enableHiding: false,
              enableSorting: false,
              cell: ({ row }) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="操作">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(row.original)}>
                        <Pencil /> 編輯
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate(row.original)}>
                        <Copy /> 複製為今天的新收支
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete([row.original])}>
                        <Trash2 className="text-destructive" /> 刪除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ),
            } satisfies ColumnDef<Transaction>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, accounts.map, categories.map],
  )

  const rows = query.data?.items
  const selectedRows = rows?.filter((r) => selection[r.id]) ?? []
  const dateFrom = params.date_from as string | undefined
  const dateTo = params.date_to as string | undefined
  const preset = customPeriod ? 'custom' : matchPreset(dateFrom, dateTo)
  const hasFilters = !!(params.q || FILTERS.some((f) => params[f]))

  return (
    <>
      <PageHeader
        title="收支明細"
        description="收入、支出與帳戶間轉帳"
        actions={
          canEdit && (
            <Button onClick={() => openCreate()}>
              <Plus /> 記一筆
            </Button>
          )
        }
      />

      <SummaryBar summary={query.data?.summary} loading={query.isLoading} />

      <DataTable
        tableId="transactions"
        columns={columns}
        data={rows}
        total={query.data?.total ?? 0}
        params={params}
        onParamsChange={update}
        getRowId={(r) => r.id}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        onRowClick={canEdit ? openEdit : undefined}
        toolbar={(table) => (
          <>
            <div className="relative w-full sm:w-56">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="搜尋對象、備註、標籤…"
                className="h-8 pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="搜尋"
              />
            </div>
            <Select
              value={preset}
              onValueChange={(v) => {
                if (v === 'custom') return setCustomPeriod(true)
                setCustomPeriod(false)
                const r = PERIOD_PRESETS.find((p) => p.value === v)!.range()
                update({ date_from: r.from, date_to: r.to })
              }}
            >
              <SelectTrigger size="sm" className="w-32" aria-label="期間">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">自訂期間</SelectItem>
              </SelectContent>
            </Select>
            {preset === 'custom' && (
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  className="h-8 w-36"
                  aria-label="起始日"
                  value={dateFrom ?? ''}
                  max={dateTo}
                  onChange={(e) => update({ date_from: e.target.value || undefined })}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="date"
                  className="h-8 w-36"
                  aria-label="結束日"
                  value={dateTo ?? ''}
                  min={dateFrom}
                  onChange={(e) => update({ date_to: e.target.value || undefined })}
                />
              </div>
            )}
            <FacetedFilter title="類型" options={typeOptions} value={params.type as string} onChange={(v) => update({ type: v })} />
            <FacetedFilter title="帳戶" options={accountOptions} value={params.account_id as string} onChange={(v) => update({ account_id: v })} />
            <FacetedFilter title="分類" options={catOptions} value={params.category_id as string} onChange={(v) => update({ category_id: v })} />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setCustomPeriod(false)
                  update(Object.fromEntries(['q', ...FILTERS].map((k) => [k, undefined])))
                }}
              >
                重設 <X />
              </Button>
            )}
            {selectedRows.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setToDelete(selectedRows)}>
                <Trash2 /> 刪除 {selectedRows.length} 筆
              </Button>
            )}
            <ViewOptions table={table} />
          </>
        )}
      />

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o && searchParams.get('new')) setExtra('new', null)
        }}
        transaction={editing}
        defaults={defaults}
        onDelete={(t) => setToDelete([t])}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`刪除 ${toDelete?.length ?? 0} 筆收支？`}
        description="刪除後帳戶餘額會跟著更新，且無法復原。"
        confirmText="刪除"
        destructive
        onConfirm={() => {
          const ids = toDelete!.map((t) => t.id)
          del.mutate(ids, {
            onSuccess: () => {
              setSelection({})
              if (editing && ids.includes(editing.id)) setFormOpen(false)
            },
          })
          setToDelete(null)
        }}
      />
    </>
  )
}
