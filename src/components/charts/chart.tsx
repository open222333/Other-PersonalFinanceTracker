/**
 * 圖表共用元件（Recharts）
 * - ChartCard：卡片外框 + 圖例 + 「圖表 / 表格」切換（表格檢視讓色弱、螢幕閱讀器也讀得到數值）
 * - ChartTooltipContent：統一樣式的 hover 提示
 * 色彩與座標軸設定在 ./theme.ts
 *
 * 規則：顏色跟著「資料實體」走（同一個狀態在每張圖都同色）；不要用雙 Y 軸，量級不同就拆成兩張圖。
 */
import { ChartColumn, Table2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface LegendItem {
  label: string
  color: string
  /** 圖例形狀：線（折線）或方塊（面積、長條） */
  shape?: 'line' | 'square' | 'dot'
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              'inline-block shrink-0',
              i.shape === 'line' ? 'h-0.5 w-3.5 rounded-full' : i.shape === 'dot' ? 'size-2.5 rounded-full' : 'size-2.5 rounded-[3px]',
            )}
            style={{ background: i.color }}
          />
          <span className="text-foreground">{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

interface TooltipItem {
  name?: string | number
  value?: unknown
  color?: string
  fill?: string
  stroke?: string
  dataKey?: unknown
  payload?: Record<string, unknown>
}

export interface ChartTooltipContentProps {
  active?: boolean
  label?: string | number
  payload?: readonly TooltipItem[]
  /** 標題（x 軸值）格式化 */
  labelFormatter?: (label: string | number, items: readonly TooltipItem[]) => ReactNode
  /** 數值格式化 */
  valueFormatter?: (value: number, item: TooltipItem) => ReactNode
  /** 系列名稱對應（dataKey → 顯示名稱） */
  names?: Record<string, string>
  hideLabel?: boolean
}

/** 用法：<Tooltip content={<ChartTooltipContent names={...} />} /> */
export function ChartTooltipContent({
  active,
  label,
  payload,
  labelFormatter,
  valueFormatter = (v) => v.toLocaleString('zh-TW'),
  names,
  hideLabel,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover text-popover-foreground min-w-36 rounded-lg border px-3 py-2 text-xs shadow-md">
      {!hideLabel && label !== undefined && (
        <div className="mb-1.5 font-medium">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      )}
      <ul className="flex flex-col gap-1">
        {payload.map((item, i) => {
          const key = String(item.dataKey ?? item.name ?? i)
          const color = item.color ?? item.stroke ?? item.fill ?? (item.payload?.fill as string | undefined)
          return (
            <li key={key} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
              <span className="text-muted-foreground">{names?.[key] ?? item.name}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">
                {typeof item.value === 'number' ? valueFormatter(item.value, item) : String(item.value ?? '')}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export interface ChartTable {
  columns: { key: string; label: string; numeric?: boolean }[]
  /** 每列一個物件，依 columns 的 key 取值 */
  rows: readonly object[]
}

interface ChartCardProps {
  title: string
  description?: string
  /** 卡片右上角的控制項（例如時間區間） */
  action?: ReactNode
  legend?: LegendItem[]
  /** 表格檢視的資料；提供時顯示「圖表 / 表格」切換 */
  table?: ChartTable
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  /** 圖表高度（px） */
  height?: number
  className?: string
  /** 一般為 Recharts 圖表（會包進 ResponsiveContainer）；raw=true 時直接渲染（例如 CSS 熱力圖） */
  children: ReactNode
  raw?: boolean
}

export function ChartCard({
  title,
  description,
  action,
  legend,
  table,
  isLoading,
  error,
  onRetry,
  height = 260,
  className,
  children,
  raw,
}: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const showTable = view === 'table' && table

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction className="flex items-center gap-2">
          {action}
          {table && (
            <div className="flex rounded-md border p-0.5" role="group" aria-label={`${title}：檢視方式`}>
              <Button
                variant={view === 'chart' ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="size-7"
                aria-pressed={view === 'chart'}
                aria-label="圖表檢視"
                onClick={() => setView('chart')}
              >
                <ChartColumn />
              </Button>
              <Button
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="size-7"
                aria-pressed={view === 'table'}
                aria-label="表格檢視"
                onClick={() => setView('table')}
              >
                <Table2 />
              </Button>
            </div>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : showTable ? (
          <div className="overflow-y-auto" style={{ maxHeight: height + 28 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((c) => (
                    <TableHead key={c.key} className={cn(c.numeric && 'text-right')}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row, i) => {
                  const r = row as Record<string, ReactNode>
                  return (
                    <TableRow key={i}>
                      {table.columns.map((c) => (
                        <TableCell key={c.key} className={cn(c.numeric && 'text-right tabular-nums')}>
                          {typeof r[c.key] === 'number' ? (r[c.key] as number).toLocaleString('zh-TW') : r[c.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            {legend && legend.length > 1 && <ChartLegend items={legend} />}
            {raw ? (
              children
            ) : (
              <div style={{ height }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {children}
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
