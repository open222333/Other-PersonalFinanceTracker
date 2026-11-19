import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { applyServerErrors, isValidationError } from '@/lib/form-errors'
import { cleanAmountInput, CURRENCIES, CURRENCY_LABEL } from '@/lib/money'
import { errorMessage } from '@/lib/query'

import { useSaveAccount } from './api'
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, accountInput, emptyAccount, LIABILITY_TYPES, type Account, type AccountInput } from './schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null
}

const FIELDS = Object.keys(emptyAccount)

export function AccountFormDialog({ open, onOpenChange, account }: Props) {
  const save = useSaveAccount()
  const form = useForm<AccountInput>({ resolver: zodResolver(accountInput), defaultValues: emptyAccount })
  const { errors } = form.formState
  const type = form.watch('type')
  const hasTransactions = !!account?.transaction_count

  useEffect(() => {
    if (!open) return
    save.reset()
    form.reset(
      account
        ? {
            name: account.name,
            type: account.type,
            currency: account.currency,
            opening_balance: account.opening_balance,
            note: account.note,
            is_archived: account.is_archived,
          }
        : emptyAccount,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account])

  const onSubmit = form.handleSubmit((data) =>
    save.mutate(
      { id: account?.id, data },
      { onSuccess: () => onOpenChange(false), onError: (e) => applyServerErrors(e, form.setError, FIELDS) },
    ),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? '編輯帳戶' : '新增帳戶'}</DialogTitle>
          <DialogDescription>餘額由期初餘額加上所有收支計算，不需手動調整</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="acc-name">名稱</Label>
            <Input id="acc-name" placeholder="例如：台新 薪轉戶" aria-invalid={!!errors.name} {...form.register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="acc-type">類型</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="acc-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ACCOUNT_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acc-currency">幣別</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={hasTransactions}>
                    <SelectTrigger id="acc-currency" className="w-full" aria-invalid={!!errors.currency}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c} {CURRENCY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {hasTransactions && <p className="text-muted-foreground text-xs">已有收支，無法變更幣別</p>}
              {errors.currency && <p className="text-destructive text-xs">{errors.currency.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="acc-opening">期初餘額</Label>
            <Input
              id="acc-opening"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={!!errors.opening_balance}
              {...form.register('opening_balance', { setValueAs: (v: string) => cleanAmountInput(v ?? '') })}
            />
            <p className="text-muted-foreground text-xs">
              {LIABILITY_TYPES.includes(type) ? '欠款請輸入負數，例如車貸剩餘 32 萬輸入 -320000' : '開始記帳當下的餘額'}
            </p>
            {errors.opening_balance && <p className="text-destructive text-xs">{errors.opening_balance.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="acc-note">備註</Label>
            <Textarea id="acc-note" rows={2} aria-invalid={!!errors.note} {...form.register('note')} />
            {errors.note && <p className="text-destructive text-xs">{errors.note.message}</p>}
          </div>
          {save.error && !isValidationError(save.error) && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(save.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {account ? '儲存' : '建立'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
