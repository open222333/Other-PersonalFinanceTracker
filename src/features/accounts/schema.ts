import { z } from 'zod'

import { SERIES } from '@/components/charts/theme'
import { CURRENCIES, SIGNED_AMOUNT_RE } from '@/lib/money'

/** 顯示順序：資產類在前、負債類在後 */
export const ACCOUNT_TYPES = ['bank', 'cash', 'e_wallet', 'brokerage', 'credit_card', 'loan'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: '銀行',
  cash: '現金',
  e_wallet: '電子支付',
  brokerage: '證券交割',
  credit_card: '信用卡',
  loan: '貸款',
}

/** 負債類：餘額通常為負數（欠款） */
export const LIABILITY_TYPES: readonly AccountType[] = ['credit_card', 'loan']

/** 顏色跟著帳戶類型走（總覽的資產配置、帳戶頁一致） */
export const ACCOUNT_TYPE_COLOR: Record<AccountType, string> = {
  bank: SERIES[0],
  cash: SERIES[3],
  e_wallet: SERIES[4],
  brokerage: SERIES[6],
  credit_card: SERIES[7],
  loan: SERIES[5],
}

export const accountInput = z.object({
  name: z.string().trim().min(1, '請輸入名稱').max(50, '最多 50 字'),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES),
  opening_balance: z.string().trim().regex(SIGNED_AMOUNT_RE, '請輸入數字，最多兩位小數（負債請輸入負數）'),
  note: z.string().max(200, '最多 200 字'),
  is_archived: z.boolean(),
})

export type AccountInput = z.infer<typeof accountInput>

export interface Account extends AccountInput {
  id: string
  /** 目前餘額（後端計算，帳戶幣別） */
  balance: string
  transaction_count: number
  created_at: string
  updated_at: string
}

export const emptyAccount: AccountInput = {
  name: '',
  type: 'bank',
  currency: 'TWD',
  opening_balance: '0',
  note: '',
  is_archived: false,
}
