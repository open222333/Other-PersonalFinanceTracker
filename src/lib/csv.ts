/**
 * CSV 讀寫（RFC 4180）：支援引號、跳脫的雙引號、欄位內換行、CRLF。
 * 前端（範本產生）與 mock 後端（匯入匯出）共用；真實後端用 Python csv 模組。
 */
export const BOM = '\uFEFF'

export const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

/** 依第一行判斷分隔符號（逗號 / Tab / 分號） */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', '\t', ';'].map((d) => [d, first.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

export function parseCsv(input: string, delimiter = detectDelimiter(stripBom(input))): string[][] {
  const text = stripBom(input)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const needsQuote = /[",\r\n]|^\s|\s$/

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[], { bom = false } = {}): string {
  const body = rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v)
          return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\r\n')
  return (bom ? BOM : '') + body + '\r\n'
}

/**
 * 防止 CSV 公式注入：以 = + - @ 開頭的文字欄位在 Excel 會被當成公式執行，前面加上單引號。
 * 匯入時以 unguardFormula() 去掉。只用於文字欄位（金額欄位不要套用）。
 */
export const guardFormula = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)
export const unguardFormula = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s)
