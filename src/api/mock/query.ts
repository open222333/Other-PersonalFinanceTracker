import type { MockDb, TransactionRecord } from './db'
import { toUnits } from './decimal'

/** GET /transactions 與 GET /export/transactions 共用的篩選與排序 */
export function queryTransactions(db: MockDb, query: URLSearchParams): TransactionRecord[] {
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
  return rows
}
