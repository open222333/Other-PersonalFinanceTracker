/** 日期工具：收支日期為不含時區的 YYYY-MM-DD（CLAUDE.md §6） */
const pad = (n: number) => String(n).padStart(2, '0')

export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayYmd = () => toYmd(new Date())
export const currentMonth = () => todayYmd().slice(0, 7)

/** "2026-11" → 該月第一天與最後一天 */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  return { from: `${month}-01`, to: toYmd(new Date(y, m, 0)) }
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** "2026-11" → "11月"；long=true → "2026 年 11 月" */
export const formatMonth = (month: string, long = false) =>
  long ? `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月` : `${Number(month.slice(5))}月`

const weekday = new Intl.DateTimeFormat('zh-TW', { weekday: 'short' })
/** "2026-11-19" → "11/19（四）"；不同年份時加上年份 */
export function formatDay(ymd: string, now = new Date()) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const w = weekday.format(date).replace('週', '')
  return `${y !== now.getFullYear() ? `${y}/` : ''}${m}/${d}（${w}）`
}

export interface PeriodPreset {
  value: string
  label: string
  range: () => { from?: string; to?: string }
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { value: 'all', label: '全部期間', range: () => ({}) },
  { value: 'this_month', label: '本月', range: () => monthRange(currentMonth()) },
  { value: 'last_month', label: '上月', range: () => monthRange(shiftMonth(currentMonth(), -1)) },
  {
    value: 'last_3_months',
    label: '近 3 個月',
    range: () => ({ from: monthRange(shiftMonth(currentMonth(), -2)).from, to: monthRange(currentMonth()).to }),
  },
  { value: 'this_year', label: '今年', range: () => ({ from: `${currentMonth().slice(0, 4)}-01-01`, to: `${currentMonth().slice(0, 4)}-12-31` }) },
]

/** 目前的 from / to 對應哪個預設期間；都不符合回傳 'custom' */
export function matchPreset(from?: string, to?: string) {
  const hit = PERIOD_PRESETS.find((p) => {
    const r = p.range()
    return (r.from ?? '') === (from ?? '') && (r.to ?? '') === (to ?? '')
  })
  return hit?.value ?? 'custom'
}
