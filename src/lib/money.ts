/**
 * 金額顯示與輸入格式。
 * 前端只負責「顯示」：加總、換算、損益一律由後端計算後以字串傳回（CLAUDE.md §6）。
 */
export const BASE_CURRENCY = 'TWD'

export const CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR', 'HKD', 'CNY'] as const
export type Currency = (typeof CURRENCIES)[number]
export const CURRENCY_LABEL: Record<Currency, string> = {
  TWD: '新台幣',
  USD: '美元',
  JPY: '日圓',
  EUR: '歐元',
  HKD: '港幣',
  CNY: '人民幣',
}

/** 習慣不顯示小數的幣別（有小數時仍會顯示） */
const WHOLE_UNIT = new Set(['TWD', 'JPY', 'KRW'])

/** 正數金額：最多 14 位整數、2 位小數 */
export const AMOUNT_RE = /^\d{1,14}(\.\d{1,2})?$/
/** 可為負數（期初餘額：負債帳戶） */
export const SIGNED_AMOUNT_RE = /^-?\d{1,14}(\.\d{1,2})?$/

const formatters = new Map<string, Intl.NumberFormat>()
function formatter(currency: string, signed: boolean) {
  const key = `${currency}:${signed}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency,
      minimumFractionDigits: WHOLE_UNIT.has(currency) ? 0 : 2,
      maximumFractionDigits: 2,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    formatters.set(key, f)
  }
  return f
}

/** "1234.5" + TWD → "$1,234.5"；signed=true 時正數加 "+" */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: string = BASE_CURRENCY,
  { signed = false }: { signed?: boolean } = {},
): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = typeof amount === 'number' ? amount : Number(amount)
  return Number.isFinite(n) ? formatter(currency, signed).format(n) : String(amount)
}

/** 圖表座標軸用的精簡格式（12.3萬） */
const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })
export const formatCompact = (n: number) => compact.format(n)

/** 後端金額字串 → 數字，只用於圖表繪製（不可再拿來計算） */
export const chartValue = (amount: string) => Number(amount)

export const isNegative = (amount: string) => Number(amount) < 0

/** 去掉使用者輸入的千分位逗號與空白 */
export const cleanAmountInput = (s: string) => s.replace(/[,\s]/g, '')
