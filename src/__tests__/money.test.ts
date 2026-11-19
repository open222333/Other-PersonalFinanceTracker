import { describe, expect, it } from 'vitest'

import { formatDay, matchPreset, monthRange, shiftMonth } from '@/lib/date'
import { AMOUNT_RE, formatMoney, SIGNED_AMOUNT_RE } from '@/lib/money'
import { categoryOptions, type Category } from '@/features/categories/schema'
import { fromForm, emptyTransactionForm, transactionForm } from '@/features/transactions/schema'

describe('money', () => {
  it('formats by currency', () => {
    expect(formatMoney('1234')).toBe('$1,234')
    expect(formatMoney('1234.5')).toBe('$1,234.5')
    expect(formatMoney('-320000')).toBe('-$320,000')
    expect(formatMoney('68000', 'TWD', { signed: true })).toBe('+$68,000')
    expect(formatMoney('3.5', 'USD')).toBe('US$3.50')
    expect(formatMoney(null)).toBe('—')
  })

  it('validates amount input', () => {
    expect(AMOUNT_RE.test('120.50')).toBe(true)
    expect(AMOUNT_RE.test('-1')).toBe(false)
    expect(AMOUNT_RE.test('1.234')).toBe(false)
    expect(SIGNED_AMOUNT_RE.test('-320000')).toBe(true)
  })
})

describe('date', () => {
  it('handles month ranges and shifting', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(formatDay('2026-11-19', new Date(2026, 10, 19))).toBe('11/19（四）')
    expect(formatDay('2025-12-31', new Date(2026, 10, 19))).toBe('2025/12/31（三）')
    expect(matchPreset()).toBe('all')
    expect(matchPreset('2000-01-01', '2000-01-02')).toBe('custom')
  })
})

describe('categories', () => {
  it('builds options with parents before children', () => {
    const base = { transaction_count: 0, created_at: '', updated_at: '' }
    const cats: Category[] = [
      { ...base, id: 'c2', name: '午餐', kind: 'expense', parent_id: 'c1', sort_order: 0 },
      { ...base, id: 'c1', name: '餐飲', kind: 'expense', parent_id: null, sort_order: 0 },
      { ...base, id: 'c3', name: '薪資', kind: 'income', parent_id: null, sort_order: 0 },
    ]
    expect(categoryOptions(cats, 'expense').map((o) => o.label)).toEqual(['餐飲', '餐飲 › 午餐'])
    expect(categoryOptions(cats).map((o) => o.value)).toEqual(['c1', 'c2', 'c3'])
  })
})

describe('transaction form', () => {
  const valid = { ...emptyTransactionForm(), account_id: 'a1', amount: '100', category_id: 'c1' }

  it('requires category for income / expense and a different target for transfers', () => {
    expect(transactionForm.safeParse(valid).success).toBe(true)
    expect(transactionForm.safeParse({ ...valid, category_id: '' }).success).toBe(false)
    const transfer = transactionForm.safeParse({ ...valid, type: 'transfer', to_account_id: 'a1' })
    expect(transfer.success).toBe(false)
    expect(transfer.error?.issues[0].path).toEqual(['to_account_id'])
    expect(transactionForm.safeParse({ ...valid, amount: '0' }).success).toBe(false)
  })

  it('maps form values to the API shape', () => {
    expect(fromForm({ ...valid, tags: '旅遊，公司, 旅遊 ,' }, false)).toMatchObject({ category_id: 'c1', to_account_id: null, tags: ['旅遊', '公司'] })
    const transfer = fromForm({ ...valid, type: 'transfer', to_account_id: 'a2', to_amount: '10' }, false)
    expect(transfer).toMatchObject({ category_id: null, to_account_id: 'a2', to_amount: null })
    expect(fromForm({ ...valid, type: 'transfer', to_account_id: 'a2', to_amount: '10' }, true).to_amount).toBe('10')
  })
})
