import { describe, expect, it } from 'vitest'

import { createMockTransport } from '@/api/mock'

const call = async (t: ReturnType<typeof createMockTransport>, method: string, url: string, body?: unknown, token = 'mock-token:admin') => {
  const res = await t(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

describe('mock api', () => {
  const t = createMockTransport({ latencyMs: 0 })

  it('allows anonymous reads but requires auth for writes', async () => {
    expect((await call(t, 'GET', '/api/v1/projects', undefined, '')).status).toBe(200)
    expect((await call(t, 'GET', '/api/v1/auth/me', undefined, '')).status).toBe(401)
    expect((await call(t, 'POST', '/api/v1/projects', { name: 'anon' }, '')).status).toBe(401)
    expect((await call(t, 'DELETE', '/api/v1/projects/prj_0001', undefined, '')).status).toBe(401)
    const login = await call(t, 'POST', '/api/v1/auth/login', { username: 'admin', password: 'admin' }, '')
    expect(login.body.access_token).toBe('mock-token:admin')
    expect(login.body.user.password).toBeUndefined()
  })

  it('requires auth for reads when publicRead is off', async () => {
    const closed = createMockTransport({ latencyMs: 0, publicRead: false })
    expect((await call(closed, 'GET', '/api/v1/projects', undefined, '')).status).toBe(401)
    expect((await call(closed, 'GET', '/api/v1/projects')).status).toBe(200)
  })

  it('serves analytics data', async () => {
    const traffic = await call(t, 'GET', '/api/v1/analytics/traffic?days=7', undefined, '')
    expect(traffic.body.items).toHaveLength(7)
    expect(Object.keys(traffic.body.items[0])).toEqual(['date', 'visits', 'visitors', 'signups'])
    const { body } = await call(t, 'GET', '/api/v1/analytics/summary', undefined, '')
    const projects = await call(t, 'GET', '/api/v1/projects?page_size=1', undefined, '')
    const owned = body.by_owner.reduce((n: number, r: Record<string, number>) => n + r.active + r.paused + r.archived, 0)
    expect(owned).toBe(projects.body.total)
    expect(body.effort).toHaveLength(projects.body.total)
    expect(body.heatmap).toHaveLength(7 * 12)
    const funnel = body.funnel.map((f: { value: number }) => f.value)
    expect([...funnel].sort((a, b) => b - a)).toEqual(funnel)
  })

  it('filters, sorts and paginates', async () => {
    const { body } = await call(t, 'GET', '/api/v1/projects?status=active,paused&sort=name&order=asc&page=2&page_size=5')
    expect(body.items).toHaveLength(5)
    expect(body.page).toBe(2)
    expect(body.items.every((p: { status: string }) => ['active', 'paused'].includes(p.status))).toBe(true)
    const names = body.items.map((p: { name: string }) => p.name)
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names)
  })

  it('creates, rejects duplicates, deletes; viewer is read-only', async () => {
    const created = await call(t, 'POST', '/api/v1/projects', { name: 'X1', description: '', status: 'active', priority: 'low', owner: 'me' })
    expect(created.status).toBe(201)
    const dup = await call(t, 'POST', '/api/v1/projects', { name: 'X1' })
    expect(dup.status).toBe(422)
    expect((await call(t, 'DELETE', `/api/v1/projects/${created.body.id}`, undefined, 'mock-token:viewer')).status).toBe(403)
    expect((await call(t, 'DELETE', `/api/v1/projects/${created.body.id}`)).status).toBe(204)
    expect((await call(t, 'GET', `/api/v1/projects/${created.body.id}`)).status).toBe(404)
  })
})
