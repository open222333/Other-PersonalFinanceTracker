/**
 * 熱力圖（CSS grid）：列 = 星期、欄 = 兩小時時段，顏色 = 單一藍色由淺到深（--chart-seq-1..7）。
 * 滑過格子會在上方顯示數值；完整數值請用卡片的表格檢視。
 */
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

const DAYS = ['一', '二', '三', '四', '五', '六', '日']
const STEPS = 7

interface Cell {
  day: number
  slot: number
  value: number
}

export function HeatmapGrid({ data, unit = '次' }: { data: Cell[]; unit?: string }) {
  const [hover, setHover] = useState<Cell | null>(null)
  const slots = Math.max(...data.map((d) => d.slot)) + 1
  const max = Math.max(1, ...data.map((d) => d.value))
  const step = (v: number) => Math.min(STEPS, Math.max(1, Math.ceil((v / max) * STEPS)))
  const grid = useMemo(() => {
    const m = new Map(data.map((d) => [`${d.day}:${d.slot}`, d]))
    return DAYS.map((_, day) => Array.from({ length: slots }, (_, slot) => m.get(`${day}:${slot}`) ?? { day, slot, value: 0 }))
  }, [data, slots])
  const label = (c: Cell) => `週${DAYS[c.day]} ${c.slot * 2}–${c.slot * 2 + 2} 時：${c.value.toLocaleString('zh-TW')} ${unit}`

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground h-4 text-xs" aria-live="polite">
        {hover ? <span className="text-foreground font-medium">{label(hover)}</span> : '將滑鼠移到格子上查看數值'}
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[36rem] gap-[2px]"
          style={{ gridTemplateColumns: `2rem repeat(${slots}, minmax(0, 1fr))` }}
          onMouseLeave={() => setHover(null)}
          role="grid"
          aria-label="活動熱力圖"
        >
          {grid.map((row, day) => (
            <div key={day} role="row" className="contents">
              <div role="rowheader" className="text-muted-foreground flex items-center text-xs">
                週{DAYS[day]}
              </div>
              {row.map((c) => (
                <div
                  key={c.slot}
                  role="gridcell"
                  aria-label={label(c)}
                  title={label(c)}
                  onMouseEnter={() => setHover(c)}
                  className={cn(
                    'h-7 rounded-[4px] transition-[outline] outline-offset-1 hover:outline-2 hover:outline-[var(--foreground)]',
                    c.value === 0 && 'bg-muted',
                  )}
                  style={c.value ? { background: `var(--chart-seq-${step(c.value)})` } : undefined}
                />
              ))}
            </div>
          ))}
          <div />
          {Array.from({ length: slots }, (_, s) => (
            <div key={s} className="text-muted-foreground text-center text-[10px] tabular-nums">
              {s % 2 === 0 ? `${s * 2}` : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>少</span>
        <div className="flex gap-[2px]">
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className="h-3 w-5 rounded-[3px]" style={{ background: `var(--chart-seq-${i + 1})` }} />
          ))}
        </div>
        <span>多</span>
        <span className="ml-2">（時段：0–24 時）</span>
      </div>
    </div>
  )
}
