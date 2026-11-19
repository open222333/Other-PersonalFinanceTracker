import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAccounts } from '@/features/accounts/api'
import type { Account } from '@/features/accounts/schema'
import { useCategories } from '@/features/categories/api'
import { categoryOptions } from '@/features/categories/schema'
import { applyServerErrors, isValidationError } from '@/lib/form-errors'
import { BASE_CURRENCY, cleanAmountInput } from '@/lib/money'
import { errorMessage } from '@/lib/query'
import { cn } from '@/lib/utils'

import { useSaveTransaction } from './api'
import {
  emptyTransactionForm,
  fromForm,
  toForm,
  TRANSACTION_FIELDS,
  transactionForm,
  TX_TYPE_LABEL,
  TX_TYPES,
  type Transaction,
  type TransactionForm,
  type TxType,
} from './schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 有值 = 編輯 */
  transaction?: Transaction | null
  /** 新增時的預設值（例如從篩選中的帳戶、或「複製」一筆） */
  defaults?: Partial<TransactionForm>
  onDelete?: (t: Transaction) => void
}

const LAST_KEY = 'tx:last'

/** 記住上次使用的類型 / 帳戶，加快連續記帳 */
function loadLast(): Partial<TransactionForm> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const accountLabel = (a: Account) => `${a.name}${a.currency !== BASE_CURRENCY ? `（${a.currency}）` : ''}${a.is_archived ? '［已封存］' : ''}`

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-destructive text-xs">{message}</p> : null
}

export function TransactionFormDialog({ open, onOpenChange, transaction, defaults, onDelete }: Props) {
  const save = useSaveTransaction()
  const accountsQ = useAccounts({ includeArchived: true })
  const categoriesQ = useCategories()
  const form = useForm<TransactionForm>({ resolver: zodResolver(transactionForm), defaultValues: emptyTransactionForm() })
  const { errors } = form.formState

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data])
  const [type, accountId, toAccountId] = form.watch(['type', 'account_id', 'to_account_id'])
  // 可選：未封存的帳戶 + 編輯中這筆原本使用的帳戶
  const selectable = (current: string) => accounts.filter((a) => !a.is_archived || a.id === current)
  const fromAccount = accounts.find((a) => a.id === accountId)
  const toAccount = accounts.find((a) => a.id === toAccountId)
  const crossCurrency = type === 'transfer' && !!fromAccount && !!toAccount && fromAccount.currency !== toAccount.currency
  const options = useMemo(
    () => (type === 'transfer' ? [] : categoryOptions(categoriesQ.data ?? [], type)),
    [categoriesQ.data, type],
  )

  useEffect(() => {
    if (!open) return
    save.reset()
    if (transaction) {
      form.reset(toForm(transaction))
      return
    }
    const last = loadLast()
    const firstActive = accounts.find((a) => !a.is_archived)?.id ?? ''
    const lastAccount = accounts.some((a) => a.id === last.account_id && !a.is_archived) ? last.account_id : undefined
    form.reset({
      ...emptyTransactionForm(),
      type: last.type ?? 'expense',
      account_id: lastAccount ?? firstActive,
      ...defaults,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, defaults])

  // 帳戶清單晚到時補上預設帳戶
  useEffect(() => {
    if (open && !transaction && !form.getValues('account_id')) {
      const first = accounts.find((a) => !a.is_archived)
      if (first) form.setValue('account_id', first.id)
    }
  }, [open, transaction, accounts, form])

  const changeType = (next: TxType) => {
    form.setValue('type', next)
    form.clearErrors()
    if (next === 'transfer') form.setValue('category_id', '')
    else {
      form.setValue('to_account_id', '')
      form.setValue('to_amount', '')
      const kind = categoriesQ.data?.find((c) => c.id === form.getValues('category_id'))?.kind
      if (kind !== next) form.setValue('category_id', '')
    }
  }

  const submit = (keepOpen: boolean) =>
    form.handleSubmit((v) => {
      if (crossCurrency && !v.to_amount) {
        form.setError('to_amount', { message: `跨幣別轉帳請輸入轉入金額（${toAccount!.currency}）` })
        return
      }
      save.mutate(
        { id: transaction?.id, data: fromForm(v, crossCurrency) },
        {
          onSuccess: () => {
            try {
              localStorage.setItem(LAST_KEY, JSON.stringify({ type: v.type, account_id: v.account_id }))
            } catch {
              /* ignore */
            }
            if (keepOpen) {
              // 連續記帳：保留類型、日期、帳戶、分類，清空金額與說明
              form.reset({ ...v, amount: '', to_amount: '', payee: '', note: '', tags: '' })
              form.setFocus('amount')
            } else onOpenChange(false)
          },
          onError: (e) => applyServerErrors(e, form.setError, TRANSACTION_FIELDS),
        },
      )
    })

  const showGeneralError = save.error && !isValidationError(save.error)
  const amountProps = (name: 'amount' | 'to_amount') => form.register(name, { setValueAs: (v: string) => cleanAmountInput(v ?? '') })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transaction ? '編輯收支' : '記一筆'}</DialogTitle>
          <DialogDescription>{transaction ? `建立於 ${transaction.created_at.slice(0, 10)}` : '金額一律輸入正數，方向由類型決定'}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit(false)} noValidate>
          <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1" role="radiogroup" aria-label="類型">
            {TX_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                variant="ghost"
                size="sm"
                className={cn('h-8', type === t && 'bg-background hover:bg-background shadow-sm')}
                onClick={() => changeType(t)}
              >
                {TX_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-amount">金額{fromAccount && fromAccount.currency !== BASE_CURRENCY ? `（${fromAccount.currency}）` : ''}</Label>
              <Input id="tx-amount" inputMode="decimal" autoComplete="off" placeholder="0" aria-invalid={!!errors.amount} {...amountProps('amount')} />
              <FieldError message={errors.amount?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-date">日期</Label>
              <Input id="tx-date" type="date" aria-invalid={!!errors.date} {...form.register('date')} />
              <FieldError message={errors.date?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-account">{type === 'transfer' ? '轉出帳戶' : '帳戶'}</Label>
              <Controller
                control={form.control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="tx-account" className="w-full" aria-invalid={!!errors.account_id}>
                      <SelectValue placeholder="選擇帳戶" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectable(field.value).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.account_id?.message} />
            </div>

            {type === 'transfer' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="tx-to-account">轉入帳戶</Label>
                <Controller
                  control={form.control}
                  name="to_account_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="tx-to-account" className="w-full" aria-invalid={!!errors.to_account_id}>
                        <SelectValue placeholder="選擇帳戶" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectable(field.value)
                          .filter((a) => a.id !== accountId)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {accountLabel(a)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.to_account_id?.message} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="tx-category">分類</Label>
                <Controller
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="tx-category" className="w-full" aria-invalid={!!errors.category_id}>
                        <SelectValue placeholder="選擇分類" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.value} value={o.value} className={cn(o.depth === 1 && 'pl-6')}>
                            {o.depth === 1 ? o.short : <span className="font-medium">{o.short}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.category_id?.message} />
              </div>
            )}
          </div>

          {crossCurrency && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-to-amount">轉入金額（{toAccount!.currency}）</Label>
              <Input id="tx-to-amount" inputMode="decimal" autoComplete="off" aria-invalid={!!errors.to_amount} {...amountProps('to_amount')} />
              <p className="text-muted-foreground text-xs">跨幣別轉帳請填實際入帳金額，系統不會自動換算</p>
              <FieldError message={errors.to_amount?.message} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-payee">{type === 'income' ? '來源' : type === 'transfer' ? '對象（選填）' : '商家 / 對象'}</Label>
              <Input id="tx-payee" autoComplete="off" aria-invalid={!!errors.payee} {...form.register('payee')} />
              <FieldError message={errors.payee?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-tags">標籤</Label>
              <Input id="tx-tags" autoComplete="off" placeholder="以逗號分隔，例如：旅遊, 公司報帳" aria-invalid={!!errors.tags} {...form.register('tags')} />
              <FieldError message={errors.tags?.message} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-note">備註</Label>
            <Textarea id="tx-note" rows={2} aria-invalid={!!errors.note} {...form.register('note')} />
            <FieldError message={errors.note?.message} />
          </div>

          {showGeneralError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(save.error)}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {transaction && onDelete && (
              <Button type="button" variant="ghost" className="text-destructive mr-auto" onClick={() => onDelete(transaction)}>
                <Trash2 /> 刪除
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {!transaction && (
              <Button type="button" variant="secondary" disabled={save.isPending} onClick={submit(true)}>
                儲存並新增下一筆
              </Button>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              儲存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
