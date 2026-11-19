import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

import { TX_TYPE_COLOR, TX_TYPE_LABEL, type Transaction, type TxType } from './schema'

export function TxTypeBadge({ type }: { type: TxType }) {
  return (
    <Badge variant="outline" className="font-normal">
      <span aria-hidden className="size-2 rounded-full" style={{ background: TX_TYPE_COLOR[type] }} />
      {TX_TYPE_LABEL[type]}
    </Badge>
  )
}

interface AmountProps {
  tx: Pick<Transaction, 'type' | 'amount' | 'to_amount'>
  /** 帳戶幣別 */
  currency: string
  /** 跨幣別轉帳的轉入幣別 */
  toCurrency?: string
  className?: string
}

/** 收支金額：支出「-$120」、收入「+$68,000」（綠色）、轉帳不帶正負號（灰色） */
export function TxAmount({ tx, currency, toCurrency, className }: AmountProps) {
  let text: string
  if (tx.type === 'expense') text = formatMoney(`-${tx.amount}`, currency)
  else if (tx.type === 'income') text = formatMoney(tx.amount, currency, { signed: true })
  else {
    text = formatMoney(tx.amount, currency)
    if (tx.to_amount && toCurrency && toCurrency !== currency) text += ` → ${formatMoney(tx.to_amount, toCurrency)}`
  }
  return (
    <span
      className={cn(
        'font-medium whitespace-nowrap tabular-nums',
        tx.type === 'income' && 'text-emerald-600 dark:text-emerald-400',
        tx.type === 'transfer' && 'text-muted-foreground',
        className,
      )}
    >
      {text}
    </span>
  )
}
