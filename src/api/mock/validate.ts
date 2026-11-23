/** Mock 後端的輸入驗證（真實後端以 Pydantic 處理）；錯誤格式比照 FastAPI 422 */
import type { AccountRecord, AccountType, CategoryKind, CategoryRecord, MockDb, TransactionRecord, TxType } from './db'
import { normalize } from './decimal'
import { transactionCounts } from './finance'
import { json, type MockResult } from './router'

export const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'credit_card', 'e_wallet', 'brokerage', 'loan']
export const CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR', 'HKD', 'CNY']
export const TX_TYPES: TxType[] = ['expense', 'income', 'transfer']
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type Body = Record<string, unknown>
export type FieldErrors = { field: string; msg: string }[]

export const invalid = (errors: FieldErrors): MockResult =>
  json({ detail: errors.map((e) => ({ loc: ['body', e.field], msg: e.msg, type: 'value_error' })) }, 422)
export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const now = () => new Date().toISOString()

export function validateAccount(db: MockDb, b: Body, current?: AccountRecord) {
  const errors: FieldErrors = []
  const name = str(b.name)
  if (!name) errors.push({ field: 'name', msg: '請輸入名稱' })
  else if (db.accounts.some((a) => a.name === name && a.id !== current?.id)) errors.push({ field: 'name', msg: '名稱已存在' })
  if (!ACCOUNT_TYPES.includes(b.type as AccountType)) errors.push({ field: 'type', msg: '類型不正確' })
  if (!CURRENCIES.includes(b.currency as string)) errors.push({ field: 'currency', msg: '不支援的幣別' })
  else if (current && b.currency !== current.currency && transactionCounts(db, 'account').get(current.id))
    errors.push({ field: 'currency', msg: '已有收支的帳戶不可變更幣別' })
  const opening = normalize(b.opening_balance as string, { allowNegative: true, allowZero: true })
  if (opening === null) errors.push({ field: 'opening_balance', msg: '請輸入金額，最多兩位小數' })
  if (errors.length) return { errors }
  return {
    value: {
      name,
      type: b.type as AccountType,
      currency: b.currency as string,
      opening_balance: opening!,
      note: str(b.note),
      is_archived: !!b.is_archived,
    },
  }
}

export function validateCategory(db: MockDb, b: Body, current?: CategoryRecord) {
  const errors: FieldErrors = []
  const name = str(b.name)
  const kind = (current?.kind ?? b.kind) as CategoryKind
  const parentId = (b.parent_id as string | null) || null
  if (kind !== 'income' && kind !== 'expense') errors.push({ field: 'kind', msg: '類型不正確' })
  if (parentId) {
    const parent = db.categories.find((c) => c.id === parentId)
    if (!parent || parent.kind !== kind) errors.push({ field: 'parent_id', msg: '上層分類不正確' })
    else if (parent.parent_id) errors.push({ field: 'parent_id', msg: '分類最多兩層' })
    else if (current && (parent.id === current.id || db.categories.some((c) => c.parent_id === current.id)))
      errors.push({ field: 'parent_id', msg: '有子分類的分類不可再移到其他分類底下' })
  }
  if (!name) errors.push({ field: 'name', msg: '請輸入名稱' })
  else if (db.categories.some((c) => c.name === name && c.kind === kind && c.parent_id === parentId && c.id !== current?.id))
    errors.push({ field: 'name', msg: '同一層已有相同名稱' })
  if (errors.length) return { errors }
  return { value: { name, kind, parent_id: parentId } }
}

export function validateTransaction(db: MockDb, b: Body, current?: TransactionRecord) {
  const errors: FieldErrors = []
  const type = b.type as TxType
  const account = db.accounts.find((a) => a.id === b.account_id)
  const date = str(b.date)
  if (!DATE_RE.test(date)) errors.push({ field: 'date', msg: '日期格式需為 YYYY-MM-DD' })
  if (!TX_TYPES.includes(type)) errors.push({ field: 'type', msg: '類型不正確' })
  if (!account) errors.push({ field: 'account_id', msg: '請選擇帳戶' })
  else if (account.is_archived && account.id !== current?.account_id) errors.push({ field: 'account_id', msg: '帳戶已封存' })
  const amount = normalize(b.amount as string)
  if (amount === null) errors.push({ field: 'amount', msg: '金額需大於 0，最多兩位小數' })

  let category_id: string | null = null
  let to_account_id: string | null = null
  let to_amount: string | null = null
  if (type === 'transfer') {
    const to = db.accounts.find((a) => a.id === b.to_account_id)
    if (!to) errors.push({ field: 'to_account_id', msg: '請選擇轉入帳戶' })
    else if (to.id === account?.id) errors.push({ field: 'to_account_id', msg: '轉出與轉入帳戶不可相同' })
    else if (to.is_archived && to.id !== current?.to_account_id) errors.push({ field: 'to_account_id', msg: '帳戶已封存' })
    else {
      to_account_id = to.id
      if (account && account.currency !== to.currency) {
        to_amount = normalize(b.to_amount as string)
        if (to_amount === null) errors.push({ field: 'to_amount', msg: `跨幣別轉帳請輸入轉入金額（${to.currency}）` })
      }
    }
  } else if (TX_TYPES.includes(type)) {
    const category = db.categories.find((c) => c.id === b.category_id)
    if (!category) errors.push({ field: 'category_id', msg: '請選擇分類' })
    else if (category.kind !== type) errors.push({ field: 'category_id', msg: `請選擇${type === 'income' ? '收入' : '支出'}分類` })
    else category_id = category.id
  }
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map(str).filter(Boolean))] : []
  if (errors.length) return { errors }
  return {
    value: {
      date,
      type,
      account_id: account!.id,
      amount: amount!,
      category_id,
      to_account_id,
      to_amount,
      payee: str(b.payee),
      note: str(b.note),
      tags,
    },
  }
}

