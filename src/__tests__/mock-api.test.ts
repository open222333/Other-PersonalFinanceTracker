import { beforeEach, describe, expect, it } from 'vitest'

import { createMockTransport } from '@/api/mock'
import { createDb } from '@/api/mock/db'
import { fromUnits, toUnits } from '@/api/mock/decimal'

type Transport = ReturnType<typeof createMockTransport>

const call = async (t: Transport, method: string, url: string, body?: unknown, token = 'mock-token:admin') => {
  const res = await t(`/api/v1${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

const TODAY = new Date(2026, 10, 19) // 2026-11-19
let t: Transport
beforeEach(() => {
  t = createMockTransport({ latencyMs: 0, db: createDb({ today: TODAY }) })
})

/** 取回所有頁（每頁上限 100 筆） */
const all = async (query = '') => {
  const first = (await call(t, 'GET', `/transactions?page_size=100${query}`)).body
  const items = [...first.items]
  for (let page = 2; items.length < first.total; page++) {
    items.push(...(await call(t, 'GET', `/transactions?page_size=100&page=${page}${query}`)).body.items)
  }
  return { ...first, items }
}
const fieldErrors = (body: { detail: { loc: string[] }[] }) => body.detail.map((d) => d.loc.at(-1))

describe('decimal helpers', () => {
  it('round-trips without float errors', () => {
    expect(toUnits('0.1') + toUnits('0.2')).toBe(toUnits('0.3'))
    expect(fromUnits(toUnits('-320000'))).toBe('-320000.00')
    expect(fromUnits(toUnits('3.755'))).toBe('3.76')
    expect(Number.isNaN(toUnits('1,000'))).toBe(true)
  })
})

describe('mock api: auth', () => {
  it('requires login for every finance endpoint', async () => {
    for (const path of ['/accounts', '/categories', '/transactions', '/dashboard/summary']) {
      expect((await call(t, 'GET', path, undefined, '')).status).toBe(401)
    }
    const login = await call(t, 'POST', '/auth/login', { username: 'admin', password: 'admin' }, '')
    expect(login.body.access_token).toBe('mock-token:admin')
    expect(login.body.user.password).toBeUndefined()
  })

  it('keeps viewer read-only', async () => {
    expect((await call(t, 'GET', '/accounts', undefined, 'mock-token:viewer')).status).toBe(200)
    expect((await call(t, 'POST', '/accounts', { name: 'x' }, 'mock-token:viewer')).status).toBe(403)
    expect((await call(t, 'DELETE', '/transactions/tx_000001', undefined, 'mock-token:viewer')).status).toBe(403)
  })
})

describe('mock api: seed data', () => {
  it('only generates transactions up to today, within 6 months', async () => {
    const { items } = await all()
    const dates = items.map((x: { date: string }) => x.date).sort()
    expect(dates[0] >= '2026-06-01').toBe(true)
    expect(dates.at(-1) <= '2026-11-19').toBe(true)
  })

  it('derives account balances from opening balance + transactions', async () => {
    const accounts = (await call(t, 'GET', '/accounts')).body.items
    const { items } = await all()
    for (const a of accounts) {
      let units = toUnits(a.opening_balance)
      for (const x of items) {
        if (x.account_id === a.id) units += x.type === 'income' ? toUnits(x.amount) : -toUnits(x.amount)
        if (x.to_account_id === a.id) units += toUnits(x.to_amount ?? x.amount)
      }
      expect(a.balance).toBe(fromUnits(units))
    }
    const card = accounts.find((a: { type: string }) => a.type === 'credit_card')
    expect(Number(card.balance)).toBeLessThan(0) // 本月刷卡未繳
  })
})

describe('mock api: transactions', () => {
  it('filters by type, date range, account (both sides of transfers) and parent category', async () => {
    const nov = await all('&type=expense&date_from=2026-11-01&date_to=2026-11-30')
    expect(nov.total).toBeGreaterThan(0)
    expect(nov.items.every((x: { type: string; date: string }) => x.type === 'expense' && x.date.startsWith('2026-11'))).toBe(true)

    const cats = (await call(t, 'GET', '/categories')).body.items
    const food = cats.find((c: { name: string }) => c.name === '餐飲')
    const children = new Set(cats.filter((c: { parent_id: string }) => c.parent_id === food.id).map((c: { id: string }) => c.id))
    const byFood = await all(`&category_id=${food.id}`)
    expect(byFood.total).toBeGreaterThan(0)
    expect(byFood.items.every((x: { category_id: string }) => children.has(x.category_id))).toBe(true)

    const accounts = (await call(t, 'GET', '/accounts')).body.items
    const loan = accounts.find((a: { type: string }) => a.type === 'loan')
    const loanTx = await all(`&account_id=${loan.id}`)
    expect(loanTx.items.every((x: { to_account_id: string }) => x.to_account_id === loan.id)).toBe(true)
    expect(loanTx.total).toBe(loan.transaction_count)
  })

  it('returns a server-side summary that excludes transfers', async () => {
    const r = await all('&date_from=2026-11-01&date_to=2026-11-30')
    const incomeOnly = await all('&type=income&date_from=2026-11-01&date_to=2026-11-30')
    expect(r.summary.income).toBe(incomeOnly.summary.income)
    expect(incomeOnly.summary.expense).toBe('0.00')
    expect(toUnits(r.summary.net)).toBe(toUnits(r.summary.income) - toUnits(r.summary.expense))
  })

  it('sorts by amount numerically and paginates', async () => {
    const { body } = await call(t, 'GET', '/transactions?sort=amount&order=desc&page=2&page_size=5')
    expect(body.items).toHaveLength(5)
    expect(body.page).toBe(2)
    const amounts = body.items.map((x: { amount: string }) => Number(x.amount))
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
  })

  it('validates input and normalizes amounts', async () => {
    const cats = (await call(t, 'GET', '/categories')).body.items
    const salary = cats.find((c: { name: string }) => c.name === '薪資')
    const lunch = cats.find((c: { name: string }) => c.name === '午餐')
    const accounts = (await call(t, 'GET', '/accounts')).body.items
    const [bank, cash] = accounts
    const usd = accounts.find((a: { currency: string }) => a.currency === 'USD')

    const wrongKind = await call(t, 'POST', '/transactions', { type: 'expense', date: '2026-11-19', account_id: cash.id, amount: '100', category_id: salary.id })
    expect(wrongKind.status).toBe(422)
    expect(fieldErrors(wrongKind.body)).toEqual(['category_id'])

    const bad = await call(t, 'POST', '/transactions', { type: 'transfer', date: '19/11', account_id: bank.id, to_account_id: bank.id, amount: '-5' })
    expect(fieldErrors(bad.body).sort()).toEqual(['amount', 'date', 'to_account_id'])

    const noToAmount = await call(t, 'POST', '/transactions', { type: 'transfer', date: '2026-11-19', account_id: bank.id, to_account_id: usd.id, amount: '3200' })
    expect(fieldErrors(noToAmount.body)).toEqual(['to_amount'])

    const ok = await call(t, 'POST', '/transactions', {
      type: 'expense',
      date: '2026-11-19',
      account_id: cash.id,
      amount: '120.5',
      category_id: lunch.id,
      to_account_id: bank.id, // 非轉帳時應忽略
      tags: ['公司', ' 公司 ', ''],
    })
    expect(ok.status).toBe(201)
    expect(ok.body).toMatchObject({ amount: '120.50', to_account_id: null, tags: ['公司'] })

    const before = (await call(t, 'GET', `/accounts/${cash.id}`)).body.balance
    expect((await call(t, 'DELETE', `/transactions/${ok.body.id}`)).status).toBe(204)
    const after = (await call(t, 'GET', `/accounts/${cash.id}`)).body.balance
    expect(toUnits(after) - toUnits(before)).toBe(toUnits('120.50'))
  })
})

describe('mock api: accounts & categories', () => {
  it('refuses to delete accounts or categories that are in use', async () => {
    const accounts = (await call(t, 'GET', '/accounts')).body.items
    expect((await call(t, 'DELETE', `/accounts/${accounts[0].id}`)).status).toBe(409)
    expect((await call(t, 'PATCH', `/accounts/${accounts[0].id}`, { currency: 'USD' })).status).toBe(422)

    const created = await call(t, 'POST', '/accounts', { name: '悠遊卡', type: 'e_wallet', currency: 'TWD', opening_balance: '500', note: '' })
    expect(created.body).toMatchObject({ balance: '500.00', transaction_count: 0 })
    expect((await call(t, 'POST', '/accounts', { name: '悠遊卡', type: 'e_wallet', currency: 'TWD', opening_balance: '0' })).status).toBe(422)
    expect((await call(t, 'DELETE', `/accounts/${created.body.id}`)).status).toBe(204)

    const cats = (await call(t, 'GET', '/categories')).body.items
    const food = cats.find((c: { name: string }) => c.name === '餐飲')
    expect((await call(t, 'DELETE', `/categories/${food.id}`)).status).toBe(409)
    const child = await call(t, 'POST', '/categories', { name: '宵夜', kind: 'expense', parent_id: food.id })
    expect(child.status).toBe(201)
    const grandChild = await call(t, 'POST', '/categories', { name: 'x', kind: 'expense', parent_id: child.body.id })
    expect(fieldErrors(grandChild.body)).toEqual(['parent_id'])
    expect((await call(t, 'DELETE', `/categories/${child.body.id}`)).status).toBe(204)
  })

  it('archived accounts stay in totals but are hidden by default', async () => {
    const accounts = (await call(t, 'GET', '/accounts')).body.items
    await call(t, 'PATCH', `/accounts/${accounts[1].id}`, { is_archived: true })
    expect((await call(t, 'GET', '/accounts')).body.total).toBe(accounts.length - 1)
    expect((await call(t, 'GET', '/accounts?include_archived=true')).body.total).toBe(accounts.length)
  })
})

describe('mock api: dashboard', () => {
  it('summarizes net worth and monthly flows in the base currency', async () => {
    const { body: s } = await call(t, 'GET', '/dashboard/summary?month=2026-11')
    expect(s.base_currency).toBe('TWD')
    expect(toUnits(s.net_worth)).toBe(toUnits(s.assets) - toUnits(s.liabilities))
    expect(s.monthly).toHaveLength(6)
    expect(s.monthly.at(-1)).toMatchObject({ month: '2026-11', income: s.month_income, expense: s.month_expense })

    const list = await all('&date_from=2026-11-01&date_to=2026-11-30')
    expect(s.month_income).toBe(list.summary.income)
    expect(s.month_expense).toBe(list.summary.expense)

    const byCategory = s.expense_by_category.reduce((n: number, c: { amount: string }) => n + toUnits(c.amount), 0)
    expect(byCategory).toBe(toUnits(s.month_expense))
    const byType = s.assets_by_type.reduce((n: number, a: { amount: string }) => n + toUnits(a.amount), 0)
    expect(byType).toBe(toUnits(s.assets))
    expect(s.fx_rates).toEqual([{ currency: 'USD', rate: '32' }])
  })
})
