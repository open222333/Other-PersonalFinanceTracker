import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createMockTransport } from '@/api/mock'
import type { User } from '@/api/types'
import { useAuth } from '@/features/auth/store'
import { readTextFile } from '@/lib/file'
import { renderApp } from '@/test/render'

const ADMIN: User = { id: 'u_1', username: 'admin', name: '管理員', role: 'admin' }
const signIn = () => useAuth.getState().setSession({ token: 'mock-token:admin', user: ADMIN })
const today = new Date().toISOString().slice(0, 10)

describe('readTextFile', () => {
  it('falls back to Big5 for non UTF-8 files', async () => {
    expect(await readTextFile(new Blob([Uint8Array.of(0xa4, 0xe9, 0xb4, 0xc1)]))).toEqual({ text: '日期', encoding: 'Big5' })
    expect(await readTextFile(new Blob(['\uFEFF日期']))).toEqual({ text: '日期', encoding: 'UTF-8' })
  })
})

describe('data page', () => {
  it('previews a CSV, shows row errors, then imports the valid rows', async () => {
    signIn()
    renderApp('/data')
    const csv = ['日期,類型,金額,帳戶,分類,對象', `${today},支出,88,現金錢包,餐飲/午餐,匯入測試便當`, `${today},支出,10,沒有這個帳戶,餐飲,x`].join('\n')
    const input = await screen.findByLabelText('選擇 CSV 檔')
    await userEvent.upload(input, new File([csv], '對帳單.csv', { type: 'text/csv' }))

    expect(await screen.findByText('對帳單.csv')).toBeInTheDocument()
    const commit = await screen.findByRole('button', { name: '匯入 1 筆' })
    // 有錯誤時預設只顯示錯誤列
    expect(screen.getByText(/找不到帳戶「沒有這個帳戶」/)).toBeInTheDocument()

    await userEvent.click(commit)
    expect(await screen.findByText('已匯入 1 筆收支')).toBeInTheDocument()
    expect(screen.getByText(/略過錯誤 1 筆/)).toBeInTheDocument()
  })

  it('restores a backup after confirmation', async () => {
    signIn()
    const other = createMockTransport({ latencyMs: 0 })
    const res = await other('/api/v1/export/backup', { method: 'GET', headers: { Authorization: 'Bearer mock-token:admin' } })
    const backup = await res.json()
    backup.transactions = backup.transactions.slice(0, 5)

    renderApp('/data')
    await userEvent.upload(await screen.findByLabelText('選擇備份檔'), new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' }))
    await userEvent.click(await screen.findByRole('button', { name: '還原並取代目前資料' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '還原' }))
    expect(await screen.findByText(/已還原：帳戶 7、分類 \d+、收支 5 筆/)).toBeInTheDocument()
  })

  it('reports invalid backup files', async () => {
    signIn()
    renderApp('/data')
    await userEvent.upload(await screen.findByLabelText('選擇備份檔'), new File(['not json'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByText('無法讀取：不是有效的 JSON 檔')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: '還原並取代目前資料' })).not.toBeInTheDocument())
  })
})
