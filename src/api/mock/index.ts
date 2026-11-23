/**
 * Mock API：VITE_API_MOCK=true 時取代 fetch，不需後端即可開發。
 * 端點與回應格式依 CLAUDE.md §7；真實後端（FastAPI）需維持相同格式。
 *
 * 權限模擬：除了 /auth/* 以外全部需要登入；viewer 唯讀（寫入回 403）。
 * publicRead=true 時 GET 不需登入（只為相容模板的訪客模式，財務資料預設不公開）。
 */
import type { Transport } from '../client'
import { createDb, type AccountRecord, type CategoryRecord, type TransactionRecord } from './db'
import { fromUnits } from './decimal'
import { accountBalances, dashboardSummary, flowSummary, transactionCounts } from './finance'
import { exportBackup, exportTransactionsCsv, ImportError, importTransactionsCsv, restoreBackup } from './data-io'
import { queryTransactions } from './query'
import { MockRouter, error, json, text } from './router'
import { invalid, now, validateAccount, validateCategory, validateTransaction, type Body } from './validate'

const TOKEN_PREFIX = 'mock-token:'
function paginate<T>(rows: T[], query: URLSearchParams, extra: Body = {}) {
  const page = Math.max(1, Number(query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(query.get('page_size') ?? 20)))
  return json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, page_size: pageSize, ...extra })
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
    const rows = queryTransactions(db, query)
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

  // ── 匯入匯出（格式見 docs/data-format.md）──
  router.on('GET', '/export/transactions', ({ query }) =>
    text(exportTransactionsCsv(db, queryTransactions(db, query)), 'text/csv; charset=utf-8'),
  )
  router.on('GET', '/export/backup', () => json(exportBackup(db)))
  router.on('POST', '/import/transactions', ({ body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const b = (body ?? {}) as Body
    if (typeof b.content !== 'string') return error(422, '請提供 CSV 內容（content）')
    try {
      return json(
        importTransactionsCsv(db, b.content, {
          dryRun: b.dry_run !== false,
          skipDuplicates: b.skip_duplicates !== false,
          createCategories: b.create_categories !== false,
        }),
      )
    } catch (e) {
      if (e instanceof ImportError) return error(422, e.message)
      throw e
    }
  })
  router.on('POST', '/import/backup', ({ body, headers }) => {
    if (readOnly(headers)) return FORBIDDEN
    const b = (body ?? {}) as Body
    try {
      return json(restoreBackup(db, b.backup, { dryRun: b.dry_run !== false }))
    } catch (e) {
      if (e instanceof ImportError) return error(422, e.message)
      throw e
    }
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
    if (res?.contentType) return new Response(String(res.body ?? ''), { status, headers: { 'content-type': res.contentType } })
    return new Response(status === 204 || res?.body === undefined ? null : JSON.stringify(res.body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
}
