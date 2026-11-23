/**
 * Mock 後端的匯入匯出（格式見 docs/data-format.md 與 features/data/format.ts）。
 * 真實後端（M2）需實作相同的端點、驗證規則與回應格式。
 *
 * 匯入一律先在資料副本上執行：dry_run 只回傳預覽；正式匯入成功後才一次替換，不會留下一半的資料。
 */
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  IMPORT_LIMITS,
  TX_CSV_COLUMNS,
  type TxCsvKey,
} from '@/features/data/format'
import { guardFormula, parseCsv, toCsv, unguardFormula } from '@/lib/csv'

import { BASE_CURRENCY, type AccountRecord, type CategoryRecord, type MockDb, type TransactionRecord, type TxType } from './db'
import { now, str, validateAccount, validateCategory, validateTransaction, type Body } from './validate'

const TYPE_LABEL: Record<TxType, string> = { expense: '支出', income: '收入', transfer: '轉帳' }
const TYPE_ALIASES: Record<string, TxType> = {
  支出: 'expense',
  expense: 'expense',
  收入: 'income',
  income: 'income',
  轉帳: 'transfer',
  transfer: 'transfer',
}

export class ImportError extends Error {}

// ── 共用 ──

export function categoryPathName(db: MockDb, id: string | null): string {
  if (!id) return ''
  const c = db.categories.find((x) => x.id === id)
  if (!c) return ''
  const parent = c.parent_id ? db.categories.find((x) => x.id === c.parent_id) : undefined
  return parent ? `${parent.name}/${c.name}` : c.name
}

/** 日期：YYYY-MM-DD、YYYY/M/D、YYYY.M.D、YYYYMMDD、民國年 115/11/19 → YYYY-MM-DD */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  const m = /^(\d{3,4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1]) + (m[1].length === 3 ? 1911 : 0)
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 金額：去掉千分位、貨幣符號、空白；(120) 視為 -120。回傳字串（可能為負）或 null */
export function parseAmount(raw: string): string | null {
  let s = raw.trim().replace(/[,\s]/g, '').replace(/^(NT\$|NTD|TWD|US\$|\$)/i, '').replace(/元$/, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  s = s.replace(/^(NT\$|NTD|TWD|US\$|\$)/i, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return `${negative ? '-' : ''}${s}`
}

const normHeader = (s: string) => s.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ')

// ── 匯出 ──

export function exportTransactionsCsv(db: MockDb, rows: TransactionRecord[]): string {
  const accName = new Map(db.accounts.map((a) => [a.id, a.name]))
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  const text = (s: string) => guardFormula(s)
  return toCsv(
    [
      TX_CSV_COLUMNS.map((c) => c.header),
      ...sorted.map((t) => [
        t.date,
        TYPE_LABEL[t.type],
        t.amount,
        text(accName.get(t.account_id) ?? ''),
        text(categoryPathName(db, t.category_id)),
        text(t.to_account_id ? (accName.get(t.to_account_id) ?? '') : ''),
        t.to_amount ?? '',
        text(t.payee),
        text(t.note),
        text(t.tags.join('、')),
      ]),
    ],
    { bom: true },
  )
}

export function exportBackup(db: MockDb) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now(),
    base_currency: BASE_CURRENCY,
    counts: { accounts: db.accounts.length, categories: db.categories.length, transactions: db.transactions.length },
    accounts: db.accounts,
    categories: db.categories,
    transactions: db.transactions,
  }
}

// ── 匯入收支 CSV ──

export interface ImportOptions {
  dryRun: boolean
  skipDuplicates: boolean
  createCategories: boolean
}

export interface ImportRowResult {
  /** 試算表中的列號（標題為第 1 列） */
  row: number
  status: 'ok' | 'duplicate' | 'error'
  messages: string[]
  data?: { date: string; type: TxType; amount: string; account: string; category: string; to_account: string; payee: string }
}

const dupKey = (t: Pick<TransactionRecord, 'date' | 'type' | 'account_id' | 'amount' | 'to_account_id' | 'payee'>) =>
  [t.date, t.type, t.account_id, t.amount, t.to_account_id ?? '', t.payee].join('|')

const nextId = (prefix: string, n: number, len: number) => `${prefix}_${String(n).padStart(len, '0')}`

export function importTransactionsCsv(db: MockDb, content: string, opts: ImportOptions) {
  if (new Blob([content]).size > IMPORT_LIMITS.maxBytes) throw new ImportError(`檔案超過 ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB`)
  const table = parseCsv(content).filter((r) => r.some((c) => c.trim() !== ''))
  if (table.length < 2) throw new ImportError('檔案沒有資料列（第一列需為標題）')
  if (table.length - 1 > IMPORT_LIMITS.maxRows) throw new ImportError(`一次最多匯入 ${IMPORT_LIMITS.maxRows.toLocaleString()} 筆`)

  // 標題對應
  const index = new Map<TxCsvKey, number>()
  const warnings: string[] = []
  table[0].forEach((cell, i) => {
    const h = normHeader(cell)
    if (!h) return
    const col = TX_CSV_COLUMNS.find((c) => normHeader(c.header) === h || c.aliases.some((a) => normHeader(a) === h))
    if (!col) warnings.push(`忽略未知欄位「${cell.trim()}」`)
    else if (index.has(col.key)) warnings.push(`欄位「${col.header}」重複，只使用第一個`)
    else index.set(col.key, i)
  })
  const missing = TX_CSV_COLUMNS.filter((c) => c.required && !index.has(c.key)).map((c) => c.header)
  if (missing.length) throw new ImportError(`缺少必要欄位：${missing.join('、')}（第一列需為標題，可下載範本對照）`)

  const work: MockDb = structuredClone(db)
  const existing = new Set(db.transactions.map(dupKey))
  const createdCategories: string[] = []
  const rows: ImportRowResult[] = []
  let imported = 0

  table.slice(1).forEach((cells, i) => {
    const get = (k: TxCsvKey) => (index.has(k) ? unguardFormula((cells[index.get(k)!] ?? '').trim()) : '')
    const row = i + 2
    const messages: string[] = []

    const date = parseDate(get('date'))
    if (!date) messages.push(get('date') ? `日期「${get('date')}」無法辨識` : '缺少日期')

    const amountRaw = get('amount')
    const signed = amountRaw ? parseAmount(amountRaw) : null
    if (signed === null) messages.push(amountRaw ? `金額「${amountRaw}」格式不正確` : '缺少金額')
    const negative = !!signed?.startsWith('-')
    const amount = signed?.replace(/^-/, '') ?? ''
    if (signed !== null && Number(amount) === 0) messages.push('金額不可為 0')

    const typeRaw = get('type')
    let type: TxType | undefined = TYPE_ALIASES[typeRaw.toLowerCase()]
    if (typeRaw && !type) messages.push(`類型「${typeRaw}」需為 支出、收入 或 轉帳`)
    if (!typeRaw && signed !== null) type = negative ? 'expense' : 'income'

    const accountName = get('account')
    const account = work.accounts.find((a) => a.name === accountName)
    if (!accountName) messages.push('缺少帳戶')
    else if (!account) messages.push(`找不到帳戶「${accountName}」，請先在「帳戶」頁建立`)

    let toAccount: AccountRecord | undefined
    let toAmount: string | null = null
    if (type === 'transfer') {
      const name = get('to_account')
      toAccount = work.accounts.find((a) => a.name === name)
      if (!name) messages.push('轉帳需填轉入帳戶')
      else if (!toAccount) messages.push(`找不到轉入帳戶「${name}」`)
      const raw = get('to_amount')
      if (raw) {
        toAmount = parseAmount(raw)?.replace(/^-/, '') ?? null
        if (toAmount === null) messages.push(`轉入金額「${raw}」格式不正確`)
      }
    }

    // 分類：「餐飲/午餐」或「餐飲 › 午餐」
    const categoryPath = get('category')
    const parts = categoryPath
      .split(/\s*[/›>]\s*/)
      .map((p) => p.trim())
      .filter(Boolean)
    let category: CategoryRecord | undefined
    const toCreate: { name: string; parent: string | null }[] = []
    if (type && type !== 'transfer') {
      if (!parts.length) messages.push('收入、支出需填分類')
      else if (parts.length > 2) messages.push(`分類「${categoryPath}」最多兩層`)
      else {
        const top = work.categories.find((c) => c.kind === type && !c.parent_id && c.name === parts[0])
        const child = parts[1] && top ? work.categories.find((c) => c.parent_id === top.id && c.name === parts[1]) : undefined
        category = parts[1] ? child : top
        if (!category) {
          if (!opts.createCategories) messages.push(`找不到${TYPE_LABEL[type]}分類「${parts.join('/')}」`)
          else {
            if (!top) toCreate.push({ name: parts[0], parent: null })
            if (parts[1]) toCreate.push({ name: parts[1], parent: parts[0] })
          }
        }
      }
    }

    const preview = {
      date: date ?? get('date'),
      type: type ?? 'expense',
      amount: signed === null ? amountRaw : amount, // 格式錯誤時顯示原始輸入
      account: accountName,
      category: parts.join('/'),
      to_account: get('to_account'),
      payee: get('payee'),
    }
    if (messages.length) {
      rows.push({ row, status: 'error', messages, data: preview })
      return
    }

    // 需要時自動建立分類
    for (const c of toCreate) {
      const parent = c.parent ? work.categories.find((x) => x.kind === type && !x.parent_id && x.name === c.parent) : undefined
      const r = validateCategory(work, { name: c.name, kind: type, parent_id: parent?.id ?? null })
      if (r.errors) {
        messages.push(...r.errors.map((e) => `分類：${e.msg}`))
        break
      }
      const siblings = work.categories.filter((x) => x.kind === r.value.kind && x.parent_id === r.value.parent_id)
      const created: CategoryRecord = {
        ...r.value,
        id: nextId('cat', ++work.seq.category, 4),
        sort_order: Math.max(-1, ...siblings.map((x) => x.sort_order)) + 1,
        created_at: now(),
        updated_at: now(),
      }
      work.categories.push(created)
      createdCategories.push(c.parent ? `${c.parent}/${c.name}` : c.name)
      category = created
    }

    const body: Body = {
      date,
      type,
      account_id: account!.id,
      amount,
      category_id: category?.id ?? null,
      to_account_id: toAccount?.id ?? null,
      to_amount: toAmount,
      payee: get('payee'),
      note: get('note'),
      tags: get('tags').split(/[,，、;；]/),
    }
    const v = validateTransaction(work, body)
    if (v.errors) {
      rows.push({ row, status: 'error', messages: [...messages, ...v.errors.map((e) => e.msg)], data: preview })
      return
    }
    const duplicate = existing.has(dupKey(v.value))
    if (!(duplicate && opts.skipDuplicates)) {
      const at = now()
      work.transactions.push({ ...v.value, id: nextId('tx', ++work.seq.transaction, 6), created_at: at, updated_at: at })
      imported++
    }
    rows.push({
      row,
      status: duplicate ? 'duplicate' : 'ok',
      messages: duplicate ? [opts.skipDuplicates ? '與現有收支重複，已略過' : '與現有收支重複，仍會匯入'] : [],
      data: { ...preview, amount: v.value.amount },
    })
  })

  if (!opts.dryRun) {
    db.categories = work.categories
    db.transactions = work.transactions
    db.seq = work.seq
  }
  return {
    dry_run: opts.dryRun,
    total: rows.length,
    imported,
    duplicates: rows.filter((r) => r.status === 'duplicate').length,
    errors: rows.filter((r) => r.status === 'error').length,
    created_categories: [...new Set(createdCategories)],
    warnings,
    rows,
  }
}

// ── 還原備份 ──

const isObj = (v: unknown): v is Body => !!v && typeof v === 'object' && !Array.isArray(v)
const seqOf = (ids: string[]) => Math.max(0, ...ids.map((id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0)))

export function restoreBackup(db: MockDb, raw: unknown, { dryRun }: { dryRun: boolean }) {
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new ImportError('不是本系統的備份檔（format 需為 pft-backup）')
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) throw new ImportError(`不支援的備份版本：${String(raw.version)}`)
  for (const key of ['accounts', 'categories', 'transactions'] as const) {
    if (!Array.isArray(raw[key])) throw new ImportError(`備份檔缺少 ${key}`)
  }
  const errors: string[] = []
  const fail = (where: string, msgs: string[]) => errors.length < 20 && errors.push(`${where}：${msgs.join('；')}`)
  const fresh: MockDb = { users: db.users, accounts: [], categories: [], transactions: [], seq: { account: 0, category: 0, transaction: 0 } }
  const seen = new Set<string>()
  const idOf = (r: Body, where: string) => {
    const id = str(r.id)
    if (!id) fail(where, ['缺少 id'])
    else if (seen.has(id)) fail(where, [`id「${id}」重複`])
    else {
      seen.add(id)
      return id
    }
    return null
  }
  const stamp = (r: Body) => ({ created_at: str(r.created_at) || now(), updated_at: str(r.updated_at) || now() })

  const archived = new Set<string>()
  ;(raw.accounts as unknown[]).forEach((a, i) => {
    const where = `accounts[${i}]`
    if (!isObj(a)) return fail(where, ['格式錯誤'])
    const id = idOf(a, where)
    const v = validateAccount(fresh, { ...a, is_archived: false })
    if (v.errors) return fail(`帳戶「${str(a.name) || i}」`, v.errors.map((e) => e.msg))
    if (!id) return
    if (a.is_archived) archived.add(id)
    fresh.accounts.push({ ...v.value, id, ...stamp(a) })
  })

  // 先放第一層分類，子分類才找得到上層
  const cats = (raw.categories as unknown[]).map((c, i) => ({ c, i })).sort((x, y) => Number(isObj(x.c) && !!x.c.parent_id) - Number(isObj(y.c) && !!y.c.parent_id))
  for (const { c, i } of cats) {
    const where = `categories[${i}]`
    if (!isObj(c)) {
      fail(where, ['格式錯誤'])
      continue
    }
    const id = idOf(c, where)
    const v = validateCategory(fresh, c)
    if (v.errors) {
      fail(`分類「${str(c.name) || i}」`, v.errors.map((e) => e.msg))
      continue
    }
    if (id) fresh.categories.push({ ...v.value, id, sort_order: typeof c.sort_order === 'number' ? c.sort_order : i, ...stamp(c) })
  }

  ;(raw.transactions as unknown[]).forEach((t, i) => {
    const where = `transactions[${i}]`
    if (!isObj(t)) return fail(where, ['格式錯誤'])
    const id = idOf(t, where)
    const v = validateTransaction(fresh, t)
    if (v.errors) return fail(`收支 ${str(t.date) || where}（${str(t.id) || i}）`, v.errors.map((e) => e.msg))
    if (id) fresh.transactions.push({ ...v.value, id, ...stamp(t) })
  })

  if (errors.length) throw new ImportError(`備份檔有 ${errors.length >= 20 ? '20 個以上' : errors.length} 個錯誤：${errors.join('\n')}`)
  for (const a of fresh.accounts) a.is_archived = archived.has(a.id)
  fresh.seq = {
    account: seqOf(fresh.accounts.map((a) => a.id)),
    category: seqOf(fresh.categories.map((c) => c.id)),
    transaction: seqOf(fresh.transactions.map((t) => t.id)),
  }
  const counts = (d: MockDb) => ({ accounts: d.accounts.length, categories: d.categories.length, transactions: d.transactions.length })
  const result = { dry_run: dryRun, exported_at: str(raw.exported_at) || null, backup: counts(fresh), current: counts(db) }
  if (!dryRun) {
    db.accounts = fresh.accounts
    db.categories = fresh.categories
    db.transactions = fresh.transactions
    db.seq = fresh.seq
  }
  return result
}

