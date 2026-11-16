/**
 * 圖表頁：示範多種圖表（Recharts）。每張圖都附「表格檢視」，資料來自 features/analytics/api.ts。
 * 要新增圖表：在 analytics/api.ts 加欄位、mock/index.ts 加資料，然後複製一個 <ChartCard> 區塊。
 */
import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { HeatmapGrid } from '@/components/charts/heatmap'
import { ChartCard, ChartTooltipContent, type LegendItem } from '@/components/charts/chart'
import { axisProps, barCursor, gridProps, lineCursor, SERIES } from '@/components/charts/theme'
import { PageHeader } from '@/components/common/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRAFFIC_RANGES, useAnalyticsSummary, useTraffic, type EffortPoint, type TrafficRange } from '@/features/analytics/api'
import { PRIORITY_LABEL, PROJECT_STATUS, STATUS_LABEL } from '@/features/projects/schema'

/** 顏色跟著實體走：同一個狀態 / 優先度在每張圖都是同一個顏色 */
const STATUS_COLOR = { active: SERIES[0], paused: SERIES[1], archived: SERIES[2] } as const
const PRIORITY_COLOR = { high: SERIES[0], medium: SERIES[1], low: SERIES[2] } as const

const shortDate = (d: string | number) => String(d).slice(5).replace('-', '/')
const fmt = (n: number) => n.toLocaleString('zh-TW')

export function ChartsPage() {
  const [range, setRange] = useState<TrafficRange>(30)
  const traffic = useTraffic(range)
  const summary = useAnalyticsSummary()
  const s = summary.data
  const t = traffic.data ?? []

  const rangeSelect = (
    <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as TrafficRange)}>
      <SelectTrigger size="sm" className="w-28" aria-label="時間區間">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRAFFIC_RANGES.map((d) => (
          <SelectItem key={d} value={String(d)}>
            近 {d} 天
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const trafficLegend: LegendItem[] = [
    { label: '瀏覽次數', color: SERIES[0], shape: 'line' },
    { label: '不重複訪客', color: SERIES[1], shape: 'line' },
  ]
  const statusLegend: LegendItem[] = PROJECT_STATUS.map((st) => ({ label: STATUS_LABEL[st], color: STATUS_COLOR[st] }))
  const priorityLegend: LegendItem[] = (['high', 'medium', 'low'] as const).map((p) => ({
    label: `${PRIORITY_LABEL[p]}優先`,
    color: PRIORITY_COLOR[p],
    shape: 'dot',
  }))
  const radarLegend: LegendItem[] = [
    { label: '本版', color: SERIES[0] },
    { label: '上一版', color: SERIES[1] },
  ]
  const priorityTotal = s?.byPriority.reduce((a, b) => a + b.count, 0) ?? 0
  const loading = { isLoading: summary.isLoading, error: summary.error, onRetry: () => summary.refetch() }

  return (
    <>
      <PageHeader title="圖表" description="多種圖表範例：折線、面積、長條、堆疊、環圈、雷達、散佈、漏斗、熱力圖；每張都可切換成表格" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. 折線圖：時間趨勢（兩個同量級的系列） */}
        <ChartCard
          className="lg:col-span-2"
          title="流量趨勢"
          description="每日瀏覽次數與不重複訪客"
          action={rangeSelect}
          legend={trafficLegend}
          isLoading={traffic.isLoading}
          error={traffic.error}
          onRetry={() => traffic.refetch()}
          height={280}
          table={{
            columns: [
              { key: 'date', label: '日期' },
              { key: 'visits', label: '瀏覽次數', numeric: true },
              { key: 'visitors', label: '不重複訪客', numeric: true },
            ],
            rows: [...t].reverse(),
          }}
        >
          <LineChart data={t} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={24} />
            <YAxis {...axisProps} width={48} tickFormatter={fmt} />
            <Tooltip
              cursor={lineCursor}
              content={<ChartTooltipContent names={{ visits: '瀏覽次數', visitors: '不重複訪客' }} />}
            />
            <Line dataKey="visits" type="monotone" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
            <Line dataKey="visitors" type="monotone" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
          </LineChart>
        </ChartCard>

        {/* 2. 面積圖：單一系列的累積感 */}
        <ChartCard
          title="每日註冊"
          description={`近 ${range} 天新註冊人數`}
          isLoading={traffic.isLoading}
          error={traffic.error}
          onRetry={() => traffic.refetch()}
          table={{
            columns: [
              { key: 'date', label: '日期' },
              { key: 'signups', label: '註冊人數', numeric: true },
            ],
            rows: [...t].reverse(),
          }}
        >
          <AreaChart data={t} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[2]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={SERIES[2]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={24} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <Tooltip cursor={lineCursor} content={<ChartTooltipContent names={{ signups: '註冊人數' }} />} />
            <Area dataKey="signups" type="monotone" stroke={SERIES[2]} strokeWidth={2} fill="url(#signupFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
          </AreaChart>
        </ChartCard>

        {/* 3. 堆疊長條圖：組成（每位負責人的專案狀態） */}
        <ChartCard
          title="負責人專案狀態"
          description="依負責人統計，專案新增 / 刪除後即時更新"
          legend={statusLegend}
          {...loading}
          table={
            s && {
              columns: [
                { key: 'owner', label: '負責人' },
                ...PROJECT_STATUS.map((st) => ({ key: st, label: STATUS_LABEL[st], numeric: true })),
              ],
              rows: s.byOwner,
            }
          }
        >
          <BarChart data={s?.byOwner} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="owner" {...axisProps} />
            <YAxis {...axisProps} width={32} allowDecimals={false} />
            <Tooltip cursor={barCursor} content={<ChartTooltipContent names={STATUS_LABEL} />} />
            {PROJECT_STATUS.map((st, i) => (
              <Bar
                key={st}
                dataKey={st}
                stackId="status"
                fill={STATUS_COLOR[st]}
                stroke="var(--card)"
                strokeWidth={2}
                radius={i === PROJECT_STATUS.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ChartCard>

        {/* 4. 環圈圖：少數類別的占比 */}
        <ChartCard
          title="優先度分佈"
          description="全部專案依優先度"
          legend={priorityLegend}
          {...loading}
          table={
            s && {
              columns: [
                { key: 'label', label: '優先度' },
                { key: 'count', label: '專案數', numeric: true },
                { key: 'share', label: '占比', numeric: true },
              ],
              rows: s.byPriority.map((p) => ({
                label: PRIORITY_LABEL[p.priority],
                count: p.count,
                share: `${Math.round((p.count / (priorityTotal || 1)) * 100)}%`,
              })),
            }
          }
        >
          <PieChart>
            <Tooltip content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={s?.byPriority.map((p) => ({ ...p, name: `${PRIORITY_LABEL[p.priority]}優先` }))}
              dataKey="count"
              nameKey="name"
              innerRadius="58%"
              outerRadius="85%"
              paddingAngle={1}
              stroke="var(--card)"
              strokeWidth={2}
              cornerRadius={4}
            >
              {s?.byPriority.map((p) => <Cell key={p.priority} fill={PRIORITY_COLOR[p.priority]} />)}
            </Pie>
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
              <tspan x="50%" dy="-0.5em" className="fill-foreground text-2xl font-semibold">
                {fmt(priorityTotal)}
              </tspan>
              <tspan x="50%" dy="1.6em" className="fill-muted-foreground text-xs">
                專案總數
              </tspan>
            </text>
          </PieChart>
        </ChartCard>

        {/* 5. 橫向長條圖：排名（類別名稱較長時好讀） */}
        <ChartCard
          title="服務 P95 延遲"
          description="毫秒，由慢到快"
          {...loading}
          table={
            s && {
              columns: [
                { key: 'service', label: '服務' },
                { key: 'p95', label: 'P95（ms）', numeric: true },
              ],
              rows: s.latency,
            }
          }
        >
          <BarChart data={s?.latency} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid {...gridProps} vertical horizontal={false} />
            <XAxis type="number" {...axisProps} hide />
            <YAxis type="category" dataKey="service" {...axisProps} width={64} />
            <Tooltip cursor={barCursor} content={<ChartTooltipContent names={{ p95: 'P95' }} valueFormatter={(v) => `${fmt(v)} ms`} />} />
            <Bar dataKey="p95" fill={SERIES[0]} radius={[0, 4, 4, 0]}>
              <LabelList dataKey="p95" position="right" className="fill-muted-foreground" fontSize={12} formatter={(v) => `${v} ms`} />
            </Bar>
          </BarChart>
        </ChartCard>

        {/* 6. 雷達圖：多指標比較兩個版本 */}
        <ChartCard
          title="版本品質指標"
          description="0–100 分，本版 vs 上一版"
          legend={radarLegend}
          {...loading}
          table={
            s && {
              columns: [
                { key: 'metric', label: '指標' },
                { key: 'current', label: '本版', numeric: true },
                { key: 'previous', label: '上一版', numeric: true },
              ],
              rows: s.radar,
            }
          }
        >
          <RadarChart data={s?.radar} outerRadius="72%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={<ChartTooltipContent names={{ current: '本版', previous: '上一版' }} />} />
            <Radar dataKey="previous" stroke={SERIES[1]} strokeWidth={2} fill={SERIES[1]} fillOpacity={0.12} />
            <Radar dataKey="current" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.2} />
          </RadarChart>
        </ChartCard>

        {/* 7. 散佈圖：兩個數值的關係（最多 3 組，超過請改用篩選或小倍數圖） */}
        <ChartCard
          title="工時與進度"
          description="每個點是一個專案，依優先度分組"
          legend={priorityLegend}
          {...loading}
          table={
            s && {
              columns: [
                { key: 'name', label: '專案' },
                { key: 'priority', label: '優先度' },
                { key: 'hours', label: '工時（h）', numeric: true },
                { key: 'progress', label: '進度（%）', numeric: true },
              ],
              rows: s.effort.map((e) => ({ ...e, priority: PRIORITY_LABEL[e.priority] })),
            }
          }
        >
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} vertical />
            <XAxis type="number" dataKey="hours" name="工時" unit="h" {...axisProps} />
            <YAxis type="number" dataKey="progress" name="進度" unit="%" domain={[0, 100]} {...axisProps} width={44} />
            <ZAxis range={[64, 64]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--muted-foreground)' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as EffortPoint | undefined
                if (!active || !p) return null
                return (
                  <ChartTooltipContent
                    active
                    label={p.name}
                    payload={[
                      { name: '工時', value: p.hours, color: PRIORITY_COLOR[p.priority] },
                      { name: '進度', value: p.progress, color: PRIORITY_COLOR[p.priority] },
                    ]}
                    valueFormatter={(v, item) => (item.name === '工時' ? `${v} h` : `${v}%`)}
                  />
                )
              }}
            />
            {(['high', 'medium', 'low'] as const).map((pr) => (
              <Scatter
                key={pr}
                name={`${PRIORITY_LABEL[pr]}優先`}
                data={s?.effort.filter((e) => e.priority === pr)}
                fill={PRIORITY_COLOR[pr]}
                fillOpacity={0.85}
                stroke="var(--card)"
                strokeWidth={1.5}
              />
            ))}
          </ScatterChart>
        </ChartCard>

        {/* 8. 漏斗（以橫向長條呈現，比梯形漏斗好比較） */}
        <ChartCard
          title="轉換漏斗"
          description="各階段人數與相對上一階段的轉換率"
          {...loading}
          table={
            s && {
              columns: [
                { key: 'stage', label: '階段' },
                { key: 'value', label: '人數', numeric: true },
                { key: 'rate', label: '轉換率', numeric: true },
              ],
              rows: s.funnel.map((f, i) => ({
                ...f,
                rate: i === 0 ? '—' : `${((f.value / s.funnel[i - 1].value) * 100).toFixed(1)}%`,
              })),
            }
          }
        >
          <BarChart data={s?.funnel} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="22%">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="stage" {...axisProps} width={72} />
            <Tooltip cursor={barCursor} content={<ChartTooltipContent names={{ value: '人數' }} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {s?.funnel.map((f, i) => <Cell key={f.stage} fill={`var(--chart-seq-${7 - i})`} />)}
              <LabelList dataKey="value" position="right" className="fill-muted-foreground" fontSize={12} formatter={(v) => fmt(Number(v))} />
            </Bar>
          </BarChart>
        </ChartCard>

        {/* 9. 熱力圖：兩個類別維度 × 數值（Recharts 沒有，用 CSS grid 實作） */}
        <ChartCard
          className="lg:col-span-2"
          title="活動熱力圖"
          description="近一週每兩小時的操作次數"
          raw
          {...loading}
          table={
            s && {
              columns: [
                { key: 'day', label: '星期' },
                { key: 'slot', label: '時段' },
                { key: 'value', label: '次數', numeric: true },
              ],
              rows: s.heatmap.map((h) => ({ day: `週${'一二三四五六日'[h.day]}`, slot: `${h.slot * 2}–${h.slot * 2 + 2} 時`, value: h.value })),
            }
          }
        >
          {s && <HeatmapGrid data={s.heatmap} />}
        </ChartCard>
      </div>
    </>
  )
}
