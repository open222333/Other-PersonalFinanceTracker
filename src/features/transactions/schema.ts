import { z } from 'zod'

import { SERIES } from '@/components/charts/theme'
import { todayYmd } from '@/lib/date'
import { AMOUNT_RE } from '@/lib/money'

export const TX_TYPES = ['expense', 'income', 'transfer'] as const
export type TxType = (typeof TX_TYPES)[number]
export const TX_TYPE_LABEL: Record<TxType, string> = { expense: '支出', income: '收入', transfer: '轉帳' }

/** 顏色跟著收支類型走（所有圖表、標記一致） */
export const TX_TYPE_COLOR: Record<TxType, string> = { income: SERIES[2], expense: SERIES[1], transfer: SERIES[0] }

/** API 資料（金額為字串、一律正數，方向由 type 決定） */
export interface Transaction {
  id: string
  date: string
  type: TxType
  account_id: string
  amount: string
  category_id: string | null
  /** 轉帳：轉入帳戶 */
  to_account_id: string | null
  /** 跨幣別轉帳：轉入帳戶實際入帳金額（轉入帳戶幣別） */
  to_amount: string | null
  payee: string
  note: string
  tags: string[]
  created_at: string
  updated_at: string
}

export type TransactionInput = Omit<Transaction, 'id' | 'created_at' | 'updated_at'>

const amountField = z
  .string()
  .trim()
  .regex(AMOUNT_RE, '請輸入金額，最多兩位小數')
  .refine((v) => Number(v) > 0, '金額需大於 0')

/** 表單欄位（未選的下拉為空字串；標籤以逗號分隔） */
export const transactionForm = z
  .object({
    type: z.enum(TX_TYPES),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '請選擇日期'),
    account_id: z.string().min(1, '請選擇帳戶'),
    amount: amountField,
    category_id: z.string(),
    to_account_id: z.string(),
    to_amount: z.string().trim(),
    payee: z.string().trim().max(100, '最多 100 字'),
    note: z.string().max(500, '最多 500 字'),
    tags: z.string().max(200, '最多 200 字'),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'transfer') {
      if (!v.category_id) ctx.addIssue({ code: 'custom', path: ['category_id'], message: '請選擇分類' })
      return
    }
    if (!v.to_account_id) ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: '請選擇轉入帳戶' })
    else if (v.to_account_id === v.account_id)
      ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: '轉出與轉入帳戶不可相同' })
    if (v.to_amount && !amountField.safeParse(v.to_amount).success)
      ctx.addIssue({ code: 'custom', path: ['to_amount'], message: '請輸入金額，最多兩位小數' })
  })

export type TransactionForm = z.infer<typeof transactionForm>
export const TRANSACTION_FIELDS = Object.keys(transactionForm.shape) as (keyof TransactionForm)[]

export const emptyTransactionForm = (): TransactionForm => ({
  type: 'expense',
  date: todayYmd(),
  account_id: '',
  amount: '',
  category_id: '',
  to_account_id: '',
  to_amount: '',
  payee: '',
  note: '',
  tags: '',
})

export const toForm = (t: Transaction): TransactionForm => ({
  type: t.type,
  date: t.date,
  account_id: t.account_id,
  amount: t.amount,
  category_id: t.category_id ?? '',
  to_account_id: t.to_account_id ?? '',
  to_amount: t.to_amount ?? '',
  payee: t.payee,
  note: t.note,
  tags: t.tags.join(', '),
})

/** 表單 → API；crossCurrency = 轉出 / 轉入帳戶幣別不同 */
export function fromForm(v: TransactionForm, crossCurrency: boolean): TransactionInput {
  const transfer = v.type === 'transfer'
  return {
    type: v.type,
    date: v.date,
    account_id: v.account_id,
    amount: v.amount,
    category_id: transfer ? null : v.category_id || null,
    to_account_id: transfer ? v.to_account_id || null : null,
    to_amount: transfer && crossCurrency ? v.to_amount || null : null,
    payee: v.payee,
    note: v.note.trim(),
    tags: [...new Set(v.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean))],
  }
}
