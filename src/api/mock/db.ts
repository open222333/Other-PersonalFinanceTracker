/**
 * Mock 資料（記憶體內，重新整理即重置）。
 * 欄位對應 features/{accounts,categories,transactions}/schema.ts 與 CLAUDE.md §5。
 * 範例收支以「今天」為基準產生近 6 個月，金額以固定亂數種子產生（每次相同）。
 */
import type { User } from '../types'

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'e_wallet' | 'brokerage' | 'loan'
export type CategoryKind = 'income' | 'expense'
export type TxType = 'income' | 'expense' | 'transfer'

export interface AccountRecord {
  id: string
  name: string
  type: AccountType
  currency: string
  opening_balance: string
  note: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CategoryRecord {
  id: string
  name: string
  kind: CategoryKind
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TransactionRecord {
  id: string
  date: string
  type: TxType
  account_id: string
  amount: string
  category_id: string | null
  to_account_id: string | null
  to_amount: string | null
  payee: string
  note: string
  tags: string[]
  created_at: string
  updated_at: string
}

export const BASE_CURRENCY = 'TWD'

/** 固定匯率（1 單位外幣 = ? 本位幣）；M4 改為每日抓取的 fx_rates */
export const FX_TO_BASE: Record<string, number> = { TWD: 1, USD: 32, JPY: 0.21, EUR: 34.5, HKD: 4.1, CNY: 4.4 }

export const USERS: (User & { password: string })[] = [
  { id: 'u_1', username: 'admin', name: '管理員', email: 'admin@example.com', role: 'admin', password: 'admin' },
  { id: 'u_2', username: 'viewer', name: '檢視者', email: 'viewer@example.com', role: 'viewer', password: 'viewer' },
]

const CATEGORY_TREE: [CategoryKind, string, string[]][] = [
  ['expense', '餐飲', ['早餐', '午餐', '晚餐', '飲料點心']],
  ['expense', '交通', ['大眾運輸', '加油', '停車']],
  ['expense', '居住', ['房租', '水電瓦斯', '網路電話']],
  ['expense', '購物', ['日用品', '服飾', '3C']],
  ['expense', '娛樂', ['訂閱', '電影', '旅遊']],
  ['expense', '醫療', []],
  ['expense', '保險', []],
  ['expense', '其他支出', []],
  ['income', '薪資', []],
  ['income', '獎金', []],
  ['income', '利息', []],
  ['income', '其他收入', []],
]

const ACCOUNTS: Pick<AccountRecord, 'name' | 'type' | 'currency' | 'opening_balance' | 'note'>[] = [
  { name: '台新 薪轉戶', type: 'bank', currency: 'TWD', opening_balance: '150000.00', note: '薪資入帳、房租扣款' },
  { name: '現金錢包', type: 'cash', currency: 'TWD', opening_balance: '3000.00', note: '' },
  { name: 'LINE Pay', type: 'e_wallet', currency: 'TWD', opening_balance: '800.00', note: '' },
  { name: '國泰 CUBE 卡', type: 'credit_card', currency: 'TWD', opening_balance: '0.00', note: '每月 15 日自動扣繳' },
  { name: '永豐 證券交割戶', type: 'brokerage', currency: 'TWD', opening_balance: '50000.00', note: '台股交割' },
  { name: '台新 美元帳戶', type: 'bank', currency: 'USD', opening_balance: '1500.00', note: '' },
  { name: '車貸', type: 'loan', currency: 'TWD', opening_balance: '-320000.00', note: '60 期，每月 20 日繳款' },
]

export const pad = (n: number, len = 2) => String(n).padStart(len, '0')
/** 本地日期 → YYYY-MM-DD */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export type MockDb = ReturnType<typeof createDb>

export function createDb({ today = new Date(), months = 6 } = {}) {
  const rand = seededRandom(42)
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min))
  const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)
  const createdAt = `${ymd(start)}T00:00:00.000Z`

  // ── 分類 ──
  const categories: CategoryRecord[] = []
  const catId = new Map<string, string>()
  let catSeq = 0
  CATEGORY_TREE.forEach(([kind, name, children], i) => {
    const id = `cat_${pad(++catSeq, 4)}`
    catId.set(name, id)
    categories.push({ id, name, kind, parent_id: null, sort_order: i, created_at: createdAt, updated_at: createdAt })
    children.forEach((child, j) => {
      const cid = `cat_${pad(++catSeq, 4)}`
      catId.set(child, cid)
      categories.push({ id: cid, name: child, kind, parent_id: id, sort_order: j, created_at: createdAt, updated_at: createdAt })
    })
  })

  // ── 帳戶 ──
  const accounts: AccountRecord[] = ACCOUNTS.map((a, i) => ({
    ...a,
    id: `acc_${pad(i + 1, 4)}`,
    is_archived: false,
    created_at: createdAt,
    updated_at: createdAt,
  }))
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id
  const BANK = acc('台新 薪轉戶')
  const CASH = acc('現金錢包')
  const WALLET = acc('LINE Pay')
  const CARD = acc('國泰 CUBE 卡')
  const USD = acc('台新 美元帳戶')
  const LOAN = acc('車貸')

  // ── 收支 ──
  const transactions: TransactionRecord[] = []
  let txSeq = 0
  const money = (n: number) => n.toFixed(2)
  const add = (date: string, t: Partial<TransactionRecord> & Pick<TransactionRecord, 'type' | 'account_id' | 'amount'>) => {
    const at = `${date}T${pad(4 + (txSeq % 14))}:${pad(txSeq % 60)}:00.000Z`
    transactions.push({
      id: `tx_${pad(++txSeq, 6)}`,
      date,
      category_id: null,
      to_account_id: null,
      to_amount: null,
      payee: '',
      note: '',
      tags: [],
      created_at: at,
      updated_at: at,
      ...t,
    })
  }
  const expense = (date: string, account_id: string, category: string, amount: number, payee = '', extra: Partial<TransactionRecord> = {}) =>
    add(date, { type: 'expense', account_id, category_id: catId.get(category)!, amount: money(amount), payee, ...extra })
  const income = (date: string, account_id: string, category: string, amount: number, payee = '', extra: Partial<TransactionRecord> = {}) =>
    add(date, { type: 'income', account_id, category_id: catId.get(category)!, amount: money(amount), payee, ...extra })
  const transfer = (date: string, from: string, to: string, amount: number, note: string, to_amount?: number) =>
    add(date, { type: 'transfer', account_id: from, to_account_id: to, amount: money(amount), to_amount: to_amount ? money(to_amount) : null, note })

  const cardByMonth = new Map<string, number>()
  const todayStr = ymd(today)
  for (let d = new Date(start); ymd(d) <= todayStr; d.setDate(d.getDate() + 1)) {
    const date = ymd(d)
    const day = d.getDate()
    const month = date.slice(0, 7)
    const weekday = d.getDay()
    const weekend = weekday === 0 || weekday === 6
    const card = (category: string, amount: number, payee: string, extra: Partial<TransactionRecord> = {}) => {
      cardByMonth.set(month, (cardByMonth.get(month) ?? 0) + amount)
      expense(date, CARD, category, amount, payee, extra)
    }

    // 固定收支
    if (day === 1) expense(date, BANK, '房租', 18000, '房東', { note: '月租' })
    if (day === 2) transfer(date, BANK, WALLET, 4000, 'LINE Pay 儲值')
    if (day === 3) expense(date, WALLET, '大眾運輸', 1200, 'TPASS 月票')
    if (day === 5) income(date, BANK, '薪資', 68000, '公司')
    if (day === 8) card('網路電話', 999, '中華電信')
    if (day === 10 || day === 24) transfer(date, BANK, CASH, 3000, 'ATM 提款')
    if (day === 12) expense(date, BANK, '水電瓦斯', between(900, 2200), '台電')
    if (day === 15) {
      const prev = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7)
      const due = cardByMonth.get(prev)
      if (due) transfer(date, BANK, CARD, due, '繳信用卡費')
    }
    if (day === 18) {
      card('訂閱', 390, 'Netflix', { tags: ['訂閱'] })
      card('訂閱', 149, 'Spotify', { tags: ['訂閱'] })
    }
    if (day === 20) transfer(date, BANK, LOAN, 8500, '車貸月付')
    if (day === 25) income(date, USD, '利息', 3.75, '台新銀行', { note: '美元活存利息' })
    if (day === 28 && d.getMonth() % 3 === 0) expense(date, BANK, '保險', 3600, '國泰人壽', { note: '季繳保費' })
    if (day === 7 || day === 21) card('加油', between(1100, 1500), '中油')
    if (d.getMonth() === 0 && day === 20) income(date, BANK, '獎金', 136000, '公司', { note: '年終獎金' })
    if (Math.floor((d.getTime() - start.getTime()) / 86400000) === 40) {
      transfer(date, BANK, USD, 32150, '換匯：買入 1,000 美元', 1000)
    }

    // 日常消費
    if (rand() < 0.8) expense(date, CASH, '早餐', between(45, 120), '早餐店')
    if (!weekend && rand() < 0.9) expense(date, rand() < 0.5 ? CASH : WALLET, '午餐', between(90, 220), '便當店')
    if (rand() < 0.7) card('晚餐', between(120, 450), weekend ? '餐廳' : '小吃店')
    if (rand() < 0.35) expense(date, WALLET, '飲料點心', between(50, 90), '手搖飲')
    if (rand() < 0.12) card('日用品', between(150, 900), '全聯')
    if (rand() < 0.04) card('服飾', between(600, 2500), 'UNIQLO')
    if (rand() < 0.015) card('3C', between(1500, 12000), 'PChome')
    if (weekend && rand() < 0.1) card('電影', between(300, 700), '威秀影城', { tags: ['休閒'] })
    if (rand() < 0.02) expense(date, CASH, '醫療', between(150, 600), '診所')
    if (weekend && rand() < 0.05) expense(date, CASH, '停車', between(40, 200), '停車場')
  }

  return {
    users: USERS,
    accounts,
    categories,
    transactions,
    seq: { account: accounts.length, category: catSeq, transaction: txSeq },
  }
}
