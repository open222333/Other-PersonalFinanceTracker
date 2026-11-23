import { BOM, stripBom } from './csv'

/**
 * 讀取使用者上傳的文字檔：先試 UTF-8，失敗再用 Big5。
 * 台灣的銀行對帳單、或在繁中 Windows 的 Excel 另存的 CSV 常是 Big5。
 */
export async function readTextFile(file: Blob): Promise<{ text: string; encoding: 'UTF-8' | 'Big5' }> {
  const buf = await file.arrayBuffer()
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' }
  } catch {
    return { text: new TextDecoder('big5').decode(buf), encoding: 'Big5' }
  }
}

/** 觸發瀏覽器下載 */
export function saveFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** CSV 下載：補上 BOM，Excel 才會以 UTF-8 開啟（fetch 的 res.text() 會去掉 BOM） */
export const saveCsv = (text: string, filename: string) => saveFile(BOM + stripBom(text), filename, 'text/csv;charset=utf-8')
