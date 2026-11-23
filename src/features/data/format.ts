/**
 * 匯入匯出格式規格（單一來源）：匯入匯出頁的說明表格、範本檔、mock 後端的欄位對應都由此產生。
 * 完整說明見 docs/data-format.md。
 */
import { toCsv } from '@/lib/csv'

export type TxCsvKey = 'date' | 'type' | 'amount' | 'account' | 'category' | 'to_account' | 'to_amount' | 'payee' | 'note' | 'tags'

export interface CsvColumn {
  key: TxCsvKey
  /** 匯出與範本使用的標題 */
  header: string
  /** 匯入時也接受的標題（不分大小寫、忽略空白） */
  aliases: string[]
  required: boolean
  description: string
  example: string
}

export const TX_CSV_COLUMNS: CsvColumn[] = [
  {
    key: 'date',
    header: '日期',
    aliases: ['date', '交易日期', '交易日', '消費日期', '記帳日期'],
    required: true,
    description: 'YYYY-MM-DD、YYYY/M/D、YYYYMMDD，或民國年 115/11/19',
    example: '2026-11-19',
  },
  {
    key: 'type',
    header: '類型',
    aliases: ['type', '收支', '收支類型'],
    required: false,
    description: '支出、收入、轉帳（或 expense / income / transfer）。留空時依金額正負判斷：負數為支出、正數為收入',
    example: '支出',
  },
  {
    key: 'amount',
    header: '金額',
    aliases: ['amount', '交易金額', '金額(元)', '金額（元）'],
    required: true,
    description: '最多兩位小數；可含千分位逗號、$ 或 NT$。有填類型時取絕對值',
    example: '120',
  },
  {
    key: 'account',
    header: '帳戶',
    aliases: ['account', '帳戶名稱', '轉出帳戶'],
    required: true,
    description: '需與系統中的帳戶名稱完全相同（不會自動建立帳戶）。轉帳時為轉出帳戶',
    example: '現金錢包',
  },
  {
    key: 'category',
    header: '分類',
    aliases: ['category', '類別', '收支分類'],
    required: false,
    description: '收入、支出必填，轉帳留空。子分類以「/」分隔，例如 餐飲/午餐；找不到時可選擇自動建立',
    example: '餐飲/午餐',
  },
  {
    key: 'to_account',
    header: '轉入帳戶',
    aliases: ['to_account', 'to account'],
    required: false,
    description: '轉帳必填',
    example: '',
  },
  {
    key: 'to_amount',
    header: '轉入金額',
    aliases: ['to_amount', 'to amount'],
    required: false,
    description: '跨幣別轉帳必填：轉入帳戶幣別的實際入帳金額；同幣別留空',
    example: '',
  },
  {
    key: 'payee',
    header: '對象',
    aliases: ['payee', '商家', '店家', '摘要', '交易對象'],
    required: false,
    description: '商家、付款人或收款人',
    example: '便當店',
  },
  {
    key: 'note',
    header: '備註',
    aliases: ['note', 'memo', '說明', '附註'],
    required: false,
    description: '任意文字',
    example: '',
  },
  {
    key: 'tags',
    header: '標籤',
    aliases: ['tags', 'tag'],
    required: false,
    description: '多個標籤以逗號或「、」分隔（含逗號時整格需加雙引號，Excel 會自動處理）',
    example: '',
  },
]

/** 範本檔的示範資料（帳戶、分類名稱對應 mock 範例資料） */
export const TX_CSV_TEMPLATE_ROWS: string[][] = [
  ['2026-11-19', '支出', '120', '現金錢包', '餐飲/午餐', '', '', '便當店', '', ''],
  ['2026-11-05', '收入', '68000', '台新 薪轉戶', '薪資', '', '', '公司', '11 月薪資', ''],
  ['2026-11-15', '轉帳', '21373', '台新 薪轉戶', '', '國泰 CUBE 卡', '', '', '繳信用卡費', ''],
  ['2026-11-20', '轉帳', '32150', '台新 薪轉戶', '', '台新 美元帳戶', '1000', '', '換匯', ''],
  ['2026/11/18', '', '-390', '國泰 CUBE 卡', '娛樂/訂閱', '', '', 'Netflix', '類型留空，依負數判斷為支出', '訂閱、影音'],
]

/** 收支 CSV 範本（UTF-8 含 BOM，Excel 可直接開啟） */
export const buildTransactionTemplate = () => toCsv([TX_CSV_COLUMNS.map((c) => c.header), ...TX_CSV_TEMPLATE_ROWS], { bom: true })

/** 匯入限制 */
export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 10_000 }

export const BACKUP_FORMAT = 'pft-backup'
export const BACKUP_VERSION = 1
