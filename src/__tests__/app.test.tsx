import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { env } from '@/config/env'
import { renderApp } from '@/test/render'

const signIn = async () => {
  // mock 模式預填 admin / admin
  await userEvent.click(await screen.findByRole('button', { name: '登入' }))
}

describe('guest mode (default)', () => {
  it('lets guests browse projects read-only, then sign in to edit', async () => {
    const { router } = renderApp('/projects?status=archived')
    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByText('已封存').length).toBeGreaterThan(0))
    expect(router.state.location.pathname).toBe('/projects')
    expect(screen.queryByRole('button', { name: /^新增專案$/ })).not.toBeInTheDocument()
    expect(within(table).queryAllByRole('checkbox')).toHaveLength(0) // 無批次勾選

    await userEvent.click(screen.getByRole('button', { name: /登入以新增專案/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    await signIn()
    // 登入後回到原頁並開啟新增表單
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('redirects protected pages to login and back', async () => {
    const { router } = renderApp('/settings')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.getByRole('link', { name: '先以訪客身分瀏覽' })).toBeInTheDocument()
    await signIn()
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
    expect(await screen.findByText('個人資訊')).toBeInTheDocument()
  })

  it('shows a lock on login-only nav items and a login button in the top bar', async () => {
    renderApp('/dashboard')
    expect(await screen.findByText(/訪客模式/)).toBeInTheDocument()
    expect(screen.getAllByLabelText('需登入').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login?redirect=%2Fdashboard')
  })

  it('renders the charts page for guests with a table view', async () => {
    renderApp('/charts')
    expect(await screen.findByText('流量趨勢')).toBeInTheDocument()
    for (const title of ['負責人專案狀態', '優先度分佈', '服務 P95 延遲', '版本品質指標', '工時與進度', '轉換漏斗', '活動熱力圖']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    const [toTable] = await screen.findAllByRole('button', { name: '表格檢視' })
    await userEvent.click(toTable)
    const table = await screen.findByRole('table')
    expect(within(table).getByText('瀏覽次數')).toBeInTheDocument()
    expect(within(table).getAllByRole('row').length).toBe(31) // 表頭 + 30 天
  })
})

describe('guest mode off', () => {
  afterEach(() => {
    env.guestMode = true
  })

  it('redirects to login, signs in, and shows the projects table', async () => {
    env.guestMode = false
    const { router } = renderApp('/projects?status=archived')
    expect(await screen.findByRole('button', { name: '登入' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('link', { name: '先以訪客身分瀏覽' })).not.toBeInTheDocument()

    await signIn()
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'))
    expect(router.state.location.search).toBe('?status=archived')

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByText('已封存').length).toBeGreaterThan(0))
    expect(within(table).queryByText('進行中')).not.toBeInTheDocument()
    expect(screen.getByText(/共 \d+ 筆/)).toBeInTheDocument()
  })
})

describe('auth', () => {
  it('shows login error for wrong password', async () => {
    renderApp('/login')
    const pw = await screen.findByLabelText('密碼')
    await userEvent.clear(pw)
    await userEvent.type(pw, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登入' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤')
  })

  it('renders 404 inside layout', async () => {
    localStorage.setItem('dashboard:auth', JSON.stringify({ state: { token: 'mock-token:admin', user: null }, version: 0 }))
    const { useAuth } = await import('@/features/auth/store')
    await useAuth.persist.rehydrate()
    renderApp('/does-not-exist')
    expect(await screen.findByText('找不到頁面', { selector: 'h1' })).toBeInTheDocument()
  })
})
