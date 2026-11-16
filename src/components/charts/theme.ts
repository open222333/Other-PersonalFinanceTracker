/**
 * 圖表樣式常數
 * - SERIES：固定順序的分類色（index.css 的 --chart-1..8，淺色 / 深色各自校正過、色弱可辨）
 *   第 9 個以上的系列不要再加顏色，請併入「其他」或改用篩選 / 小倍數圖
 * - axisProps / gridProps：淡化的座標軸與格線
 */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`)

/** 座標軸：無軸線、無刻度線、次要文字色 */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
  tickMargin: 8,
} as const

export const gridProps = { stroke: 'var(--border)', strokeDasharray: '0', vertical: false } as const

/** Tooltip 游標：折線 / 面積用細直線，長條用淡色底塊 */
export const lineCursor = { stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' }
export const barCursor = { fill: 'var(--muted)', opacity: 0.6 }
