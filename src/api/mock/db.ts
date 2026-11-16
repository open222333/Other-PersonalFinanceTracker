/** Mock 資料（記憶體內，重新整理即重置）。欄位與 features/projects/schema.ts 對應。 */
import type { User } from '../types'

export type ProjectStatus = 'active' | 'paused' | 'archived'
export type ProjectPriority = 'low' | 'medium' | 'high'

export interface ProjectRecord {
  id: string
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  owner: string
  created_at: string
  updated_at: string
}

export interface ActivityRecord {
  id: string
  actor: string
  action: string
  target: string
  at: string
}

/** 分析資料（圖表頁）：每日流量 */
export interface TrafficRecord {
  date: string
  visits: number
  visitors: number
  signups: number
}

export interface AnalyticsRecords {
  traffic: TrafficRecord[]
  /** 專案工時與進度（散佈圖），key = project id */
  effort: Record<string, { hours: number; progress: number }>
  latency: { service: string; p95: number }[]
  radar: { metric: string; current: number; previous: number }[]
  /** 7 天 × 12 個兩小時區段的活動次數 */
  heatmap: { day: number; slot: number; value: number }[]
  funnel: { stage: string; value: number }[]
}

export const USERS: (User & { password: string })[] = [
  { id: 'u_1', username: 'admin', name: '系統管理員', email: 'admin@example.com', role: 'admin', password: 'admin' },
  { id: 'u_2', username: 'viewer', name: '檢視者', email: 'viewer@example.com', role: 'viewer', password: 'viewer' },
]

const NAMES = ['記憶平台', '備份系統', '爬蟲排程', '監控告警', '向量搜尋', '視覺工具', '後台管理', '通知中心', '資料匯入', '報表服務']
const SUFFIX = ['API', '前端', '重構', 'v2', '遷移', 'PoC']
const OWNERS = ['Tom', 'Amy', 'Ken', 'Lia', 'Max']
const STATUSES: ProjectStatus[] = ['active', 'active', 'paused', 'archived']
const PRIORITIES: ProjectPriority[] = ['low', 'medium', 'high']

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export function createDb(count = 57) {
  const rand = seededRandom(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const base = Date.UTC(2026, 10, 5)
  const projects: ProjectRecord[] = Array.from({ length: count }, (_, i) => {
    const created = new Date(base - Math.floor(rand() * 180) * 86400000)
    const updated = new Date(created.getTime() + Math.floor(rand() * 30) * 86400000)
    return {
      id: `prj_${String(i + 1).padStart(4, '0')}`,
      name: `${pick(NAMES)} ${pick(SUFFIX)}`,
      description: '範例專案，由 mock API 產生。',
      status: pick(STATUSES),
      priority: pick(PRIORITIES),
      owner: pick(OWNERS),
      created_at: created.toISOString(),
      updated_at: (updated.getTime() > base ? created : updated).toISOString(),
    }
  })
  const activity: ActivityRecord[] = projects.slice(0, 8).map((p, i) => ({
    id: `act_${i}`,
    actor: p.owner,
    action: pick(['建立了', '更新了', '封存了']),
    target: p.name,
    at: p.updated_at,
  }))
  activity.sort((a, b) => b.at.localeCompare(a.at))
  return { users: USERS, projects, activity, analytics: createAnalytics(rand, projects, base), seq: count }
}

function createAnalytics(rand: () => number, projects: ProjectRecord[], base: number): AnalyticsRecords {
  const DAY = 86400000
  // 90 天流量：緩慢成長 + 週末下降 + 雜訊
  const traffic = Array.from({ length: 90 }, (_, i) => {
    const t = base - (89 - i) * DAY
    const weekday = new Date(t).getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1
    const visits = Math.round((3200 + i * 18) * weekend * (0.88 + rand() * 0.24))
    const visitors = Math.round(visits * (0.58 + rand() * 0.08))
    return { date: new Date(t).toISOString().slice(0, 10), visits, visitors, signups: Math.round(visitors * (0.018 + rand() * 0.012)) }
  })
  const effort = Object.fromEntries(
    projects.map((p) => {
      const hours = Math.round(20 + rand() * (p.priority === 'high' ? 380 : p.priority === 'medium' ? 240 : 140))
      const done = p.status === 'archived' ? 100 : Math.min(98, Math.round(hours / 4 + rand() * 45))
      return [p.id, { hours, progress: done }]
    }),
  )
  const latency = ['auth', 'projects', 'search', 'upload', 'report', 'notify']
    .map((service) => ({ service, p95: Math.round(60 + rand() * 540) }))
    .sort((a, b) => b.p95 - a.p95)
  const radar = ['可用性', '回應速度', '錯誤率（反向）', '測試覆蓋', '文件完整', '安全性'].map((metric) => {
    const previous = Math.round(50 + rand() * 35)
    return { metric, previous, current: Math.min(100, previous + Math.round(rand() * 25 - 5)) }
  })
  const heatmap = Array.from({ length: 7 * 12 }, (_, i) => {
    const day = Math.floor(i / 12)
    const slot = i % 12
    const work = day < 5 && slot >= 4 && slot <= 9 ? 1 : 0.25 // 平日 8–20 點較忙
    return { day, slot, value: Math.round((10 + rand() * 30) * work + rand() * 6) }
  })
  let v = 12800
  const funnel = ['造訪', '瀏覽專案', '註冊', '建立專案', '邀請成員'].map((stage, i) => {
    if (i > 0) v = Math.round(v * (0.35 + rand() * 0.3))
    return { stage, value: v }
  })
  return { traffic, effort, latency, radar, heatmap, funnel }
}
