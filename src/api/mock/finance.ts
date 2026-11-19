/**
 * Mock 後端的計算邏輯：帳戶餘額、本位幣換算、總覽彙總。
 * 對應真實後端的 services/（CLAUDE.md §5：餘額不存欄位，由期初餘額 + 收支推導）。
 */
import { BASE_CURRENCY, FX_TO_BASE, pad, ymd, type AccountType, type MockDb, type TransactionRecord } from './db'
import { fromUnits, toUnits } from './decimal'

/** 外幣 units → 本位幣 units */
export const toBase = (units: number, currency: string) => Math.round(units * (FX_TO_BASE[currency] ?? 1))

/** 各帳戶目前餘額（units） */
export function accountBalances(db: MockDb): Map<string, number> {
  const bal = new Map(db.accounts.map((a) => [a.id, toUnits(a.opening_balance)]))
  const addTo = (id: string, units: number) => bal.set(id, (bal.get(id) ?? 0) + units)
  for (const t of db.transactions) {
    const amount = toUnits(t.amount)
    if (t.type === 'income') addTo(t.account_id, amount)
    else if (t.type === 'expense') addTo(t.account_id, -amount)
    else {
      addTo(t.account_id, -amount)
      addTo(t.to_account_id!, t.to_amount ? toUnits(t.to_amount) : amount)
    }
  }
  return bal
}

export function transactionCounts(db: MockDb, key: 'account' | 'category'): Map<string, number> {
  const counts = new Map<string, number>()
  const inc = (id: string | null) => id && counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const t of db.transactions) {
    if (key === 'account') {
      inc(t.account_id)
      inc(t.to_account_id)
    } else inc(t.category_id)
  }
  return counts
}

/** 收入 / 支出合計（本位幣 units，不含轉帳） */
export function sumFlows(db: MockDb, rows: TransactionRecord[]) {
  const currency = new Map(db.accounts.map((a) => [a.id, a.currency]))
  let income = 0
  let expense = 0
  for (const t of rows) {
    if (t.type === 'transfer') continue
    const units = toBase(toUnits(t.amount), currency.get(t.account_id) ?? BASE_CURRENCY)
    if (t.type === 'income') income += units
    else expense += units
  }
  return { income, expense }
}

export const flowSummary = (db: MockDb, rows: TransactionRecord[]) => {
  const { income, expense } = sumFlows(db, rows)
  return { base_currency: BASE_CURRENCY, income: fromUnits(income), expense: fromUnits(expense), net: fromUnits(income - expense) }
}

export const monthOf = (date: string) => date.slice(0, 7)

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** GET /dashboard/summary */
export function dashboardSummary(db: MockDb, month = ymd(new Date()).slice(0, 7)) {
  const balances = accountBalances(db)
  let assets = 0
  let liabilities = 0
  const byType = new Map<AccountType, number>()
  for (const a of db.accounts) {
    const value = toBase(balances.get(a.id) ?? 0, a.currency)
    // 負債類帳戶有正餘額（例如信用卡溢繳）仍視為資產；一般帳戶透支視為負債
    if (value >= 0) {
      assets += value
      byType.set(a.type, (byType.get(a.type) ?? 0) + value)
    } else liabilities += -value
  }

  const inMonth = (m: string) => db.transactions.filter((t) => monthOf(t.date) === m)
  const current = sumFlows(db, inMonth(month))
  const previous = sumFlows(db, inMonth(shiftMonth(month, -1)))

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5)
    const f = sumFlows(db, inMonth(m))
    return { month: m, income: fromUnits(f.income), expense: fromUnits(f.expense), net: fromUnits(f.income - f.expense) }
  })

  // 本月支出依「第一層分類」彙總，前 6 名以外併入「其他」
  const cats = new Map(db.categories.map((c) => [c.id, c]))
  const currency = new Map(db.accounts.map((a) => [a.id, a.currency]))
  const byCategory = new Map<string, number>()
  for (const t of inMonth(month)) {
    if (t.type !== 'expense' || !t.category_id) continue
    const c = cats.get(t.category_id)
    const top = c?.parent_id ?? c?.id ?? 'unknown'
    byCategory.set(top, (byCategory.get(top) ?? 0) + toBase(toUnits(t.amount), currency.get(t.account_id) ?? BASE_CURRENCY))
  }
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 6).map(([id, units]) => ({ category_id: id, name: cats.get(id)?.name ?? '未分類', amount: fromUnits(units) }))
  const rest = ranked.slice(6).reduce((n, [, units]) => n + units, 0)
  if (rest > 0) top.push({ category_id: 'other', name: '其他', amount: fromUnits(rest) })

  const TYPE_ORDER: AccountType[] = ['bank', 'cash', 'e_wallet', 'brokerage', 'credit_card', 'loan']
  return {
    base_currency: BASE_CURRENCY,
    as_of: ymd(new Date()),
    month,
    net_worth: fromUnits(assets - liabilities),
    assets: fromUnits(assets),
    liabilities: fromUnits(liabilities),
    month_income: fromUnits(current.income),
    month_expense: fromUnits(current.expense),
    month_net: fromUnits(current.income - current.expense),
    prev_month_income: fromUnits(previous.income),
    prev_month_expense: fromUnits(previous.expense),
    monthly,
    expense_by_category: top,
    assets_by_type: TYPE_ORDER.filter((t) => (byType.get(t) ?? 0) > 0).map((type) => ({ type, amount: fromUnits(byType.get(type)!) })),
    fx_rates: Object.entries(FX_TO_BASE)
      .filter(([c]) => c !== BASE_CURRENCY && db.accounts.some((a) => a.currency === c))
      .map(([currency, rate]) => ({ currency, rate: String(rate) })),
  }
}
