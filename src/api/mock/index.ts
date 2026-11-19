/**
 * Mock API：VITE_API_MOCK=true 時取代 fetch，不需後端即可開發。
 * 端點與回應格式依 CLAUDE.md §7；真實後端（FastAPI）需維持相同格式。
 *
 * 權限模擬：除了 /auth/* 以外全部需要登入；viewer 唯讀（寫入回 403）。
 * publicRead=true 時 GET 不需登入（只為相容模板的訪客模式，財務資料預設不公開）。
 */
import type { Transport } from '../client'
import {
  createDb,
  type AccountRecord,
  type AccountType,
  type CategoryKind,
  type CategoryRecord,
  type MockDb,
  type TransactionRecord,
  type TxType,
} from './db'
import { fromUnits, normalize, toUnits } from './decimal'
import { accountBalances, dashboardSummary, flowSummary, transactionCounts } from './finance'
import { MockRouter, error, json, type MockResult } from './router'

const TOKEN_PREFIX = 'mock-token:'
const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'credit_card', 'e_wallet', 'brokerage', 'loan']
const CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR', 'HKD', 'CNY']
const TX_TYPES: TxType[] = ['expense', 'income', 'transfer']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Body = Record<string, unknown>
type FieldErrors = { field: string; msg: string }[]

const invalid = (errors: FieldErrors): MockResult =>
  json({ detail: errors.map((e) => ({ loc: ['body', e.field], msg: e.msg, type: 'value_error' })) }, 422)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const now = () => new Date().toISOString()

function paginate<T>(rows: T[], query: URLSearchParams, extra: Body = {}) {
  const page = Math.max(1, Number(query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(query.get('page_size') ?? 20)))
  return json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, page_size: pageSize, ...extra })
}

// ── 驗證（真實後端以 Pydantic 處理）──

function validateAccount(db: MockDb, b: Body, current?: AccountRecord) {
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

function validateCategory(db: MockDb, b: Body, current?: CategoryRecord) {
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

function validateTransaction(db: MockDb, b: Body, current?: TransactionRecord) {
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

export function createMockTransport({ latencyMs = 300, db = createDb(), publicRead = false } = {}): Transport {
  const router = new MockRouter()

  const currentUser = (headers: Headers) => {
    const auth = headers.get('Authorization') ?? ''
    const username = auth.startsWith(`Bearer ${TOKEN_PREFIX}`) ? auth.slice(`Bearer ${TOKEN_PREFIX}`.length) : ''
    return db.users.find((u) => u.username === username)
  }
  const publicUser = ({ password: _password, ...u }: (typeof db.users)[number]) => u
  const readOnly = (headers: Headers) => currentUser(headers)?.role === 'viewer'
  const FORBIDDEN = error(403, '檢視者無法修改資料')

  // ── auth ──
  router.on('POST', '/auth/login', ({ body }) => {
    const { username, password } = (body ?? {}) as Record<string, string>
    const user = db.users.find((u) => u.username === username && u.password === password)
    if (!user) return error(401, '帳號或密碼錯誤')
    return json({ access_token: TOKEN_PREFIX + user.username, user: publicUser(user) })
  })
  router.on('GET', '/auth/me', ({ headers }) => {
    const user = currentUser(headers)
    return user ? json(publicUser(user)) : error(401, '未登入或登入已過期')
  })

  // ── accounts ──
  const accountOut = (a: AccountRecord, balances = accountBalances(db), counts = transactionCounts(db, 'account')) => ({
    ...a,
    balance: fromUnits(balances.get(a.id) ?? 0),
    transaction_count: counts.get(a.id) ?? 0,
  })
  router.on('GET', '/accounts', ({ query }) => {
    const balances = accountBalances(db)
    const counts = transactionCounts(db, 'account')
    const rows = db.accounts.filter((a) => query.get('include_archived') === 'true' || !a.is_archived)
    return json({ items: rows.map((a) => accountOut(a, balances, counts)), total: rows.length })
  })
  router.on('GET', '/accounts/:id', ({ params }) => {
    const a = db.accounts.find((x) => x.id === params.id)
    return a ? json(accountOut(a)) : error(404, '找不到帳戶')
  })
  router.on('POST', '/accounts', ({ body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const r = validateAccount(db, (body ?? {}) as Body)
    if (r.errors) return invalid(r.errors)
    const a: AccountRecord = { ...r.value, id: `acc_${String(++db.seq.account).padStart(4, '0')}`, created_at: now(), updated_at: now() }
    db.accounts.push(a)
    return json(accountOut(a), 201)
  })
  router.on('PATCH', '/accounts/:id', ({ params, body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const i = db.accounts.findIndex((x) => x.id === params.id)
    if (i < 0) return error(404, '找不到帳戶')
    const r = validateAccount(db, { ...db.accounts[i], ...(body as Body) }, db.accounts[i])
    if (r.errors) return invalid(r.errors)
    db.accounts[i] = { ...db.accounts[i], ...r.value, updated_at: now() }
    return json(accountOut(db.accounts[i]))
  })
  router.on('DELETE', '/accounts/:id', ({ params, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const used = transactionCounts(db, 'account').get(params.id) ?? 0
    if (used) return error(409, `此帳戶已有 ${used} 筆收支，無法刪除；可改為封存`)
    db.accounts = db.accounts.filter((x) => x.id !== params.id)
    return undefined
  })

  // ── categories ──
  const categoryOut = (c: CategoryRecord, counts = transactionCounts(db, 'category')) => ({ ...c, transaction_count: counts.get(c.id) ?? 0 })
  router.on('GET', '/categories', ({ query }) => {
    const kind = query.get('kind')
    const counts = transactionCounts(db, 'category')
    const rows = db.categories
      .filter((c) => !kind || c.kind === kind)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => categoryOut(c, counts))
    return json({ items: rows, total: rows.length })
  })
  router.on('POST', '/categories', ({ body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const r = validateCategory(db, (body ?? {}) as Body)
    if (r.errors) return invalid(r.errors)
    const siblings = db.categories.filter((c) => c.kind === r.value.kind && c.parent_id === r.value.parent_id)
    const c: CategoryRecord = {
      ...r.value,
      id: `cat_${String(++db.seq.category).padStart(4, '0')}`,
      sort_order: Math.max(-1, ...siblings.map((s) => s.sort_order)) + 1,
      created_at: now(),
      updated_at: now(),
    }
    db.categories.push(c)
    return json(categoryOut(c), 201)
  })
  router.on('PATCH', '/categories/:id', ({ params, body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const i = db.categories.findIndex((x) => x.id === params.id)
    if (i < 0) return error(404, '找不到分類')
    const r = validateCategory(db, { ...db.categories[i], ...(body as Body) }, db.categories[i])
    if (r.errors) return invalid(r.errors)
    db.categories[i] = { ...db.categories[i], ...r.value, updated_at: now() }
    return json(categoryOut(db.categories[i]))
  })
  router.on('DELETE', '/categories/:id', ({ params, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    if (db.categories.some((c) => c.parent_id === params.id)) return error(409, '請先刪除或移動子分類')
    const used = transactionCounts(db, 'category').get(params.id) ?? 0
    if (used) return error(409, `此分類已有 ${used} 筆收支，無法刪除`)
    db.categories = db.categories.filter((x) => x.id !== params.id)
    return undefined
  })

  // ── transactions（q / type / account_id / category_id / date_from / date_to / sort / order / page / page_size）──
  router.on('GET', '/transactions', ({ query }) => {
    let rows = [...db.transactions]
    const list = (key: string) => query.get(key)?.split(',').filter(Boolean) ?? []
    const types = list('type')
    if (types.length) rows = rows.filter((t) => types.includes(t.type))
    const accounts = list('account_id')
    if (accounts.length) rows = rows.filter((t) => accounts.includes(t.account_id) || (!!t.to_account_id && accounts.includes(t.to_account_id)))
    const cats = list('category_id')
    if (cats.length) {
      // 選上層分類時包含其子分類
      const ids = new Set(cats.flatMap((id) => [id, ...db.categories.filter((c) => c.parent_id === id).map((c) => c.id)]))
      rows = rows.filter((t) => t.category_id && ids.has(t.category_id))
    }
    const from = query.get('date_from')
    const to = query.get('date_to')
    if (from) rows = rows.filter((t) => t.date >= from)
    if (to) rows = rows.filter((t) => t.date <= to)
    const q = query.get('q')?.trim().toLowerCase()
    if (q) {
      const catName = new Map(db.categories.map((c) => [c.id, c.name.toLowerCase()]))
      rows = rows.filter(
        (t) =>
          t.payee.toLowerCase().includes(q) ||
          t.note.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          (!!t.category_id && !!catName.get(t.category_id)?.includes(q)),
      )
    }
    const dir = query.get('order') === 'asc' ? 1 : -1
    const sort = query.get('sort') === 'amount' ? 'amount' : 'date'
    rows.sort((a, b) => {
      const primary = sort === 'amount' ? toUnits(a.amount) - toUnits(b.amount) : a.date.localeCompare(b.date)
      return (primary || a.created_at.localeCompare(b.created_at)) * dir
    })
    return paginate(rows, query, { summary: flowSummary(db, rows) })
  })
  router.on('GET', '/transactions/:id', ({ params }) => {
    const t = db.transactions.find((x) => x.id === params.id)
    return t ? json(t) : error(404, '找不到收支紀錄')
  })
  router.on('POST', '/transactions', ({ body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const r = validateTransaction(db, (body ?? {}) as Body)
    if (r.errors) return invalid(r.errors)
    const t: TransactionRecord = { ...r.value, id: `tx_${String(++db.seq.transaction).padStart(6, '0')}`, created_at: now(), updated_at: now() }
    db.transactions.push(t)
    return json(t, 201)
  })
  router.on('PATCH', '/transactions/:id', ({ params, body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const i = db.transactions.findIndex((x) => x.id === params.id)
    if (i < 0) return error(404, '找不到收支紀錄')
    const r = validateTransaction(db, { ...db.transactions[i], ...(body as Body) }, db.transactions[i])
    if (r.errors) return invalid(r.errors)
    db.transactions[i] = { ...db.transactions[i], ...r.value, updated_at: now() }
    return json(db.transactions[i])
  })
  router.on('DELETE', '/transactions/:id', ({ params, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    db.transactions = db.transactions.filter((x) => x.id !== params.id)
    return undefined
  })
  router.on('POST', '/transactions/bulk-delete', ({ body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const ids = new Set(((body ?? {}) as { ids?: string[] }).ids ?? [])
    const before = db.transactions.length
    db.transactions = db.transactions.filter((x) => !ids.has(x.id))
    return json({ deleted: before - db.transactions.length })
  })

  // ── dashboard ──
  router.on('GET', '/dashboard/summary', ({ query }) => {
    const month = query.get('month') ?? undefined
    if (month && !/^\d{4}-\d{2}$/.test(month)) return error(422, 'month 格式需為 YYYY-MM')
    return json(dashboardSummary(db, month))
  })

  return async (input, init) => {
    const url = new URL(input, 'http://mock.local')
    const path = url.pathname.replace(/^.*?\/api\/v\d+/, '') || '/'
    const headers = new Headers(init.headers)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, latencyMs)
      init.signal?.addEventListener('abort', () => (clearTimeout(t), reject(init.signal!.reason)))
    })
    // /auth/* 以外都需登入（/auth/me 由 handler 自行回 401）
    const method = (init.method ?? 'GET').toUpperCase()
    const isPublic = path.startsWith('/auth/') || (publicRead && method === 'GET')
    if (!isPublic && !currentUser(headers)) {
      return new Response(JSON.stringify({ detail: '未登入或登入已過期' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await router.handle(method, path, url.searchParams, body, headers)
    const status = res?.status ?? 200
    return new Response(status === 204 || res?.body === undefined ? null : JSON.stringify(res.body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
}
