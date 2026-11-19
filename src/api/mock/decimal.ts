/**
 * Mock 後端用的金額運算：以 1/10000 為單位的整數計算，避免浮點誤差。
 * 只給 mock 使用；真實後端用 Python Decimal + PostgreSQL NUMERIC（見 CLAUDE.md §6）。
 */
export const SCALE = 10_000

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,4}))?$/

/** "1234.5" → 12345000；格式不合回傳 NaN */
export function toUnits(value: string | number): number {
  const m = DECIMAL_RE.exec(String(value).trim())
  if (!m) return NaN
  const units = Number(m[2]) * SCALE + Number((m[3] ?? '').padEnd(4, '0'))
  return m[1] ? -units : units
}

/** 12345000 → "1234.50"（四捨五入到 dp 位小數） */
export function fromUnits(units: number, dp = 2): string {
  const step = 10 ** (4 - dp)
  const abs = Math.round(Math.abs(units) / step) * step
  const int = Math.floor(abs / SCALE)
  const frac = String(abs % SCALE).padStart(4, '0').slice(0, dp)
  const sign = units < 0 && abs > 0 ? '-' : ''
  return `${sign}${int}${dp ? `.${frac}` : ''}`
}

/** 正規化金額字串（例如 "120" → "120.00"），格式不合回傳 null */
export function normalize(value: unknown, { allowNegative = false, allowZero = false } = {}): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const units = toUnits(value)
  if (Number.isNaN(units)) return null
  if (!allowNegative && units < 0) return null
  if (!allowZero && units === 0) return null
  return fromUnits(units)
}
