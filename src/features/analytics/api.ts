/**
 * 圖表頁資料（公開端點，訪客也可讀）。
 * 後端格式（snake_case）在這裡轉成前端用的形狀；串接真實後端時只需調整這個檔案。
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { ProjectPriority, ProjectStatus } from '@/features/projects/schema'

export interface TrafficPoint {
  date: string
  visits: number
  visitors: number
  signups: number
}

export type OwnerStatusRow = { owner: string } & Record<ProjectStatus, number>

export interface EffortPoint {
  id: string
  name: string
  priority: ProjectPriority
  hours: number
  progress: number
}

export interface AnalyticsSummary {
  byOwner: OwnerStatusRow[]
  byPriority: { priority: ProjectPriority; count: number }[]
  effort: EffortPoint[]
  latency: { service: string; p95: number }[]
  radar: { metric: string; current: number; previous: number }[]
  heatmap: { day: number; slot: number; value: number }[]
  funnel: { stage: string; value: number }[]
}

export const TRAFFIC_RANGES = [7, 30, 90] as const
export type TrafficRange = (typeof TRAFFIC_RANGES)[number]

export const analyticsKeys = {
  traffic: (days: number) => ['analytics', 'traffic', days] as const,
  summary: ['analytics', 'summary'] as const,
}

export const useTraffic = (days: TrafficRange) =>
  useQuery({
    queryKey: analyticsKeys.traffic(days),
    queryFn: async ({ signal }) => (await api.get<{ items: TrafficPoint[] }>('/analytics/traffic', { days }, signal)).items,
    placeholderData: keepPreviousData, // 切換區間時保留舊圖，不閃爍
  })

interface SummaryResponse {
  by_owner: OwnerStatusRow[]
  by_priority: AnalyticsSummary['byPriority']
  effort: EffortPoint[]
  latency: AnalyticsSummary['latency']
  radar: AnalyticsSummary['radar']
  heatmap: AnalyticsSummary['heatmap']
  funnel: AnalyticsSummary['funnel']
}

export const useAnalyticsSummary = () =>
  useQuery({
    queryKey: analyticsKeys.summary,
    queryFn: async ({ signal }): Promise<AnalyticsSummary> => {
      const r = await api.get<SummaryResponse>('/analytics/summary', undefined, signal)
      return {
        byOwner: r.by_owner,
        byPriority: r.by_priority,
        effort: r.effort,
        latency: r.latency,
        radar: r.radar,
        heatmap: r.heatmap,
        funnel: r.funnel,
      }
    },
  })
