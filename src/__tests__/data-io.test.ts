import { beforeEach, describe, expect, it } from 'vitest'

import { createMockTransport } from '@/api/mock'
import { parseAmount, parseDate } from '@/api/mock/data-io'
import { createDb } from '@/api/mock/db'
import { buildTransactionTemplate, TX_CSV_COLUMNS } from '@/features/data/format'
import { BOM, guardFormula, parseCsv, stripBom, toCsv, unguardFormula } from '@/lib/csv'

import sample from '../../docs/samples/transactions-sample.csv?raw'

type Transport = ReturnType<typeof createMockTransport>
let t: Transport

const request = (method: string, url: string, body?: unknown, token = 'mock-token:admin') =>
  t(`/api/v1${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
const call = async (method: string, url: string, body?: unknown, token?: string) => {
  const res = await request(method, url, body, token)
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}
const importCsv = (content: string, opts: Record<string, unknown> = {}) => call('POST', '/import/transactions', { content, ...opts })
const count = async () => (await call('GET', '/transactions?page_size=1')).body.total as number

beforeEach(() => {
  t = createMockTransport({ latencyMs: 0, db: createDb({ today: new Date(2026, 10, 19) }) })
})

describe('csv helpers', () => {
  it('parses quotes, escaped quotes, newlines, CRLF and BOM', () => {
    const text = '\uFEFF日期,備註\r\n2026-11-19,"含,逗號"\r\n2026-11-20,"多""引號""\n換行"\r\n'
    expect(parseCsv(text)).toEqual([
      ['日期', '備註'],
      ['2026-11-19', '含,逗號'],
      ['2026-11-20', '多"引號"\n換行'],
    ])
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('round-trips through toCsv and guards formulas', () => {
    const rows = [['a,b', 'x"y', ' lead', '=SUM(A1)']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
    expect(guardFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(unguardFormula(guardFormula('@cmd'))).toBe('@cmd')
    expect(unguardFormula("'normal")).toBe("'normal")
  })

  it('parses dates and amounts in common formats', () => {
    expect(parseDate('2026/1/5')).toBe('2026-01-05')
    expect(parseDate('20261119')).toBe('2026-11-19')
    expect(parseDate('115/11/19')).toBe('2026-11-19') // 民國年
    expect(parseDate('2026-02-30')).toBeNull()
    expect(parseAmount('NT$1,234.5')).toBe('1234.5')
    expect(parseAmount('(390)')).toBe('-390')
    expect(parseAmount('-$12')).toBe('-12')
    expect(parseAmount('1.234')).toBeNull()
  })

  it('builds a template whose headers match the spec', () => {
    const [header, ...rows] = parseCsv(buildTransactionTemplate())
    expect(header).toEqual(TX_CSV_COLUMNS.map((c) => c.header))
    expect(rows.length).toBeGreaterThan(3)
    // docs/samples 的範例檔需與頁面下載的範本一致
    expect(buildTransactionTemplate().startsWith(BOM)).toBe(true)
    expect(stripBom(sample)).toBe(stripBom(buildTransactionTemplate()))
  })
})

describe('export', () => {
  it('exports filtered transactions as CSV with BOM, oldest first', async () => {
    const res = await request('GET', '/export/transactions?type=income&date_from=2026-11-01&date_to=2026-11-30')
    expect(res.headers.get('content-type')).toContain('text/csv')
    const bytes = new Uint8Array(await res.clone().arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM（res.text() 會去掉，前端下載時需補回）
    const text = await res.text()
    const [header, ...rows] = parseCsv(text)
    expect(header[0]).toBe('日期')
    expect(rows.every((r) => r[1] === '收入' && r[0].startsWith('2026-11'))).toBe(true)
    expect([...rows.map((r) => r[0])].sort()).toEqual(rows.map((r) => r[0]))
  })

  it('re-importing an export only finds duplicates', async () => {
    const before = await count()
    const csv = await (await request('GET', '/export/transactions?date_from=2026-11-01')).text()
    const preview = await importCsv(csv)
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ dry_run: true, errors: 0, imported: 0, created_categories: [] })
    expect(preview.body.duplicates).toBe(preview.body.total)
    expect(await count()).toBe(before)
  })
})

describe('import transactions', () => {
  const header = '日期,類型,金額,帳戶,分類,轉入帳戶,轉入金額,對象,備註,標籤'

  it('previews without writing, then imports valid rows and skips errors', async () => {
    const before = await count()
    const csv = [
      header,
      '2026/11/21,支出,"1,234",現金錢包,餐飲/午餐,,,新便當店,,"公司、報帳"',
      '2026-11-21,,-80,LINE Pay,寵物/飼料,,,寵物店,類型由負數判斷,',
      '2026-11-21,轉帳,3200,台新 薪轉戶,,台新 美元帳戶,100,,換匯,',
      '2026-11-21,支出,50,不存在的帳戶,餐飲,,,,,',
      '2026-13-01,收入,abc,現金錢包,薪資,,,,,',
      ',,,,,,,,,',
    ].join('\n')

    const preview = await importCsv(csv)
    expect(preview.body).toMatchObject({ dry_run: true, total: 5, imported: 3, errors: 2, created_categories: ['寵物', '寵物/飼料'] })
    expect(preview.body.rows.map((r: { status: string }) => r.status)).toEqual(['ok', 'ok', 'ok', 'error', 'error'])
    expect(preview.body.rows[3]).toMatchObject({ row: 5, messages: ['找不到帳戶「不存在的帳戶」，請先在「帳戶」頁建立'] })
    expect(preview.body.rows[4].messages).toEqual(['日期「2026-13-01」無法辨識', '金額「abc」格式不正確'])
    expect(preview.body.rows[4].data).toMatchObject({ date: '2026-13-01', amount: 'abc' })
    expect(await count()).toBe(before) // 預覽不寫入

    const done = await importCsv(csv, { dry_run: false })
    expect(done.body).toMatchObject({ dry_run: false, imported: 3 })
    expect(await count()).toBe(before + 3)
    const { body } = await call('GET', '/transactions?q=新便當店')
    expect(body.items[0]).toMatchObject({ date: '2026-11-21', amount: '1234.00', tags: ['公司', '報帳'] })
    const cats = (await call('GET', '/categories')).body.items
    expect(cats.some((c: { name: string }) => c.name === '飼料')).toBe(true)

    // 再匯入一次：全部視為重複
    const again = await importCsv(csv, { dry_run: false })
    expect(again.body).toMatchObject({ imported: 0, duplicates: 3 })
  })

  it('accepts English headers, reports unknown columns and missing categories when auto-create is off', async () => {
    const csv = 'Date,Amount,Account,Category,Extra\n2026-11-21,-10,現金錢包,不存在,x\n'
    const r = await importCsv(csv, { create_categories: false })
    expect(r.body.warnings).toEqual(['忽略未知欄位「Extra」'])
    expect(r.body.rows[0].messages).toEqual(['找不到支出分類「不存在」'])
  })

  it('rejects files without required columns, and viewers', async () => {
    const r = await importCsv('日期,備註\n2026-11-21,x\n')
    expect(r.status).toBe(422)
    expect(r.body.detail).toContain('缺少必要欄位：金額、帳戶')
    expect((await call('POST', '/import/transactions', { content: 'x' }, 'mock-token:viewer')).status).toBe(403)
  })

  it('requires to_amount for cross-currency transfers', async () => {
    const r = await importCsv(`${header}\n2026-11-21,轉帳,3200,台新 薪轉戶,,台新 美元帳戶,,,,\n`)
    expect(r.body.rows[0].messages).toEqual(['跨幣別轉帳請輸入轉入金額（USD）'])
  })
})

describe('backup', () => {
  it('restores a backup exactly, and validates before replacing', async () => {
    const backup = (await call('GET', '/export/backup')).body
    expect(backup).toMatchObject({ format: 'pft-backup', version: 1 })

    // 改動資料後還原
    await call('DELETE', `/transactions/${backup.transactions[0].id}`)
    await call('PATCH', `/accounts/${backup.accounts[1].id}`, { is_archived: true })
    const preview = await call('POST', '/import/backup', { backup })
    expect(preview.body).toMatchObject({ dry_run: true, backup: backup.counts })
    expect(preview.body.current.transactions).toBe(backup.counts.transactions - 1)

    const done = await call('POST', '/import/backup', { backup, dry_run: false })
    expect(done.status).toBe(200)
    const after = (await call('GET', '/export/backup')).body
    expect(after.transactions).toEqual(backup.transactions)
    expect(after.accounts).toEqual(backup.accounts)
    expect(after.categories).toEqual(expect.arrayContaining(backup.categories))

    // 還原後新增的 id 不會撞號
    const created = await call('POST', '/accounts', { name: '新帳戶', type: 'cash', currency: 'TWD', opening_balance: '0' })
    expect(backup.accounts.some((a: { id: string }) => a.id === created.body.id)).toBe(false)
  })

  it('rejects broken backups without touching data', async () => {
    const backup = (await call('GET', '/export/backup')).body
    const before = await count()
    const broken = { ...backup, transactions: [...backup.transactions, { ...backup.transactions[0] }, { id: 'x', account_id: 'nope' }] }
    const r = await call('POST', '/import/backup', { backup: broken, dry_run: false })
    expect(r.status).toBe(422)
    expect(r.body.detail).toMatch(/id「tx_000001」重複/)
    expect(r.body.detail).toMatch(/請選擇帳戶/)
    expect(await count()).toBe(before)
    expect((await call('POST', '/import/backup', { backup: { format: 'other' } })).status).toBe(422)
  })
})
