import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { User } from '@/api/types'
import { useAuth } from '@/features/auth/store'
import { renderApp } from '@/test/render'

const ADMIN: User = { id: 'u_1', username: 'admin', name: '管理員', role: 'admin' }
const VIEWER: User = { id: 'u_2', username: 'viewer', name: '檢視者', role: 'viewer' }
const signInAs = (user: User) => useAuth.getState().setSession({ token: `mock-token:${user.username}`, user })

describe('auth', () => {
  it('redirects every page to login and comes back after signing in', async () => {
    const { router } = renderApp('/transactions?type=income')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByRole('link', { name: '先以訪客身分瀏覽' })).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: '登入' })) // mock 模式預填 admin / admin
    await waitFor(() => expect(router.state.location.pathname).toBe('/transactions'))
    expect(router.state.location.search).toBe('?type=income')

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByText('收入').length).toBeGreaterThan(0))
    expect(within(table).queryByText('支出')).not.toBeInTheDocument()
  })

  it('shows login error for wrong password', async () => {
    renderApp('/login')
    const pw = await screen.findByLabelText('密碼')
    await userEvent.clear(pw)
    await userEvent.type(pw, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登入' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤')
  })
})

describe('pages', () => {
  it('renders the dashboard summary and charts', async () => {
    signInAs(ADMIN)
    renderApp('/dashboard')
    // 第一次載入 lazy 路由（含 recharts）較慢，放寬等待時間
    expect(await screen.findByText('淨資產', {}, { timeout: 5000 })).toBeInTheDocument()
    for (const label of ['本月收入', '本月支出', '本月結餘']) expect(screen.getByText(label)).toBeInTheDocument()
    for (const title of ['近 6 個月收支', '本月支出分類', '資產配置', '最近收支']) expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /記一筆/ })).toHaveAttribute('href', '/transactions?new=1')

    const [toTable] = await screen.findAllByRole('button', { name: '表格檢視' })
    await userEvent.click(toTable)
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(7) // 表頭 + 6 個月
  })

  it('records an expense and shows it in the list', async () => {
    signInAs(ADMIN)
    renderApp('/transactions?new=1')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^金額/), '1,234')

    // 沒選分類時先擋下
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }))
    expect(await within(dialog).findByText('請選擇分類')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('combobox', { name: '分類' }))
    await userEvent.click(await screen.findByRole('option', { name: '午餐' }))
    await userEvent.type(within(dialog).getByLabelText('商家 / 對象'), '測試便當')
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const row = (await screen.findByText('測試便當')).closest('tr')!
    expect(within(row).getByText('-$1,234')).toBeInTheDocument()
    expect(within(row).getByText('餐飲 › 午餐')).toBeInTheDocument()
  })

  it('lists accounts grouped by type with derived balances', async () => {
    signInAs(ADMIN)
    renderApp('/accounts')
    for (const group of ['銀行', '現金', '電子支付', '證券交割', '信用卡', '貸款']) {
      expect(await screen.findByRole('heading', { name: new RegExp(`^${group}`) })).toBeInTheDocument()
    }
    expect(screen.getByText('台新 美元帳戶')).toBeInTheDocument()
    expect(screen.getByText(/1 USD = 32/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /查看收支/ })[0].getAttribute('href')).toMatch(/^\/transactions\?account_id=acc_/)
  })

  it('manages categories on the settings page', async () => {
    signInAs(ADMIN)
    renderApp('/settings')
    const expense = await screen.findByRole('region', { name: '支出分類' })
    expect(await within(expense).findByText('餐飲')).toBeInTheDocument()
    expect(within(expense).getByText('午餐')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '收入分類' })).getByText('薪資')).toBeInTheDocument()
  })

  it('hides write actions from viewers', async () => {
    signInAs(VIEWER)
    renderApp('/transactions')
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: /記一筆/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('renders 404 inside layout', async () => {
    signInAs(ADMIN)
    renderApp('/does-not-exist')
    expect(await screen.findByText('找不到頁面', { selector: 'h1' })).toBeInTheDocument()
  })
})
