# Personal Finance Tracker（個人財務管理）

```
個人自架的財務管理系統：收入 / 支出 / 轉帳、帳戶與預算、股票投資（交易、持股、損益、股利），彙整成淨資產與報表
```

- 架構、資料模型、API 與開發階段：見 [`CLAUDE.md`](./CLAUDE.md)
- 前端由 Template-ReactDashboard 模板建立（React + Vite + TypeScript + shadcn/ui）

測試環境：Node 22

## 目前進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| M0 | 模板改名、關閉訪客模式、移除範例資源 | ✅ |
| M1 | 帳戶、分類、收支明細、總覽（前端 + mock API） | ✅ |
| M2 | 後端（FastAPI + PostgreSQL）、前端改接真實 API | 未開始 |
| M3 | 股票投資：標的、交易、持股、股利 | 未開始 |
| M4 | 自動報價與匯率、淨資產快照、報表 | 未開始 |
| — | 匯入匯出：收支 CSV、完整備份 JSON（原屬 M5，提前完成） | ✅ |
| M5 | 預算、定期收支、資料庫備份 | 未開始 |

目前沒有後端，所有資料來自前端內建的 **mock API**（記憶體內，重新整理即重置），內含近 6 個月的範例收支。

mock 模式的測試帳號（只存在於 `src/api/mock/db.ts`，登入頁不會顯示）：`admin` / `admin`（可編輯）、`viewer` / `viewer`（唯讀）。接上真實後端後由後端管理帳號。

## 功能（M1）

- **總覽**：淨資產（資產 − 負債）、本月收入 / 支出 / 結餘與上月比較、近 6 個月收支圖、本月支出分類、資產配置、最近收支
- **收支明細**：收入、支出、轉帳（含跨幣別轉帳）；依期間、類型、帳戶、分類篩選與搜尋（狀態同步到網址）；篩選結果的收支合計；批次刪除、複製一筆、「儲存並新增下一筆」連續記帳
- **帳戶**：銀行、現金、電子支付、證券交割、信用卡、貸款；餘額由期初餘額 + 收支計算；外幣帳戶以匯率換算到本位幣（TWD）；封存
- **匯入匯出**：收支 CSV 匯入（UTF-8 / Big5 自動判斷，先預覽逐列檢查、略過重複、可自動建立分類）與匯出；完整備份 JSON 下載與還原。格式見 [`docs/data-format.md`](./docs/data-format.md)，範例檔 [`docs/samples/transactions-sample.csv`](./docs/samples/transactions-sample.csv)
- **設定**：收支分類管理（兩層）、外觀、系統資訊
- **權限**：全站需登入；viewer 唯讀

## 本機執行

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest
npm run typecheck
npm run lint         # oxlint
npm run build        # 輸出 dist/
```

## 環境變數

`VITE_` 開頭的變數會**寫進前端 bundle**，不可放任何機密。

| 變數 | 說明 | 開發預設 | 正式預設 |
|---|---|---|---|
| `VITE_APP_NAME` | 側欄與登入頁顯示名稱 | `個人財務` | `個人財務` |
| `VITE_API_BASE_URL` | API 前綴 | `/api/v1` | `/api/v1` |
| `VITE_API_MOCK` | `true` = 使用前端 mock API | `true` | `false` |
| `VITE_GUEST_MODE` | 模板的訪客模式；財務資料屬私密，保持 `false` | `false` | `false` |
| `VITE_API_TIMEOUT_MS` | 請求逾時 | `15000` | `15000` |
| `VITE_API_PROXY_TARGET` | 開發時 `/api` 轉發目標（僅 dev server） | `http://localhost:8000` | — |

本機覆寫用 `.env.development.local`（不入版控）。

## 目錄結構（前端）

```
src/
├── api/
│   ├── client.ts             # fetch 包裝、ApiError、401 自動登出
│   ├── adapters.ts           # ★ 後端回應格式轉換（串接後端只改這裡）
│   └── mock/                 # mock 後端：db（範例資料）、finance（餘額 / 彙總）、decimal（整數金額運算）、validate（驗證）、query（收支篩選）、data-io（匯入匯出）、index（端點）
├── config/                   # env.ts、nav.ts（側欄）
├── features/
│   ├── accounts/             # 帳戶：schema、api hooks、表單
│   ├── categories/           # 分類：schema、api hooks、分類管理
│   ├── transactions/         # 收支：schema、api hooks、表單、金額顯示
│   ├── dashboard/            # 總覽彙總 API
│   ├── data/                 # 匯入匯出：format.ts（★ CSV 欄位規格）、api
│   └── auth/                 # 登入、權限
├── pages/                    # dashboard、transactions、accounts、data、settings、login、errors
├── components/               # ui（shadcn）、layout、charts、data-table、common
├── lib/
│   ├── money.ts              # 金額顯示與輸入格式（只顯示，不做計算）
│   ├── date.ts               # 日期、月份、期間預設
│   ├── form-errors.ts        # 後端 422 錯誤回填表單欄位
│   ├── csv.ts / file.ts      # CSV 讀寫、檔案讀取（UTF-8 / Big5）與下載
│   └── finance-query.ts      # 財務資料變動後一併 invalidate
└── router.tsx                # ★ 路由
```

## 金額規則

詳見 `CLAUDE.md` §6，重點：

- API 以**字串**傳金額（`"1234.50"`），收支金額一律正數，方向由 `type` 決定
- **加總、餘額、換算都在後端做**（mock 中以整數單位計算，見 `api/mock/decimal.ts`）；前端只用 `formatMoney()` 顯示
- 圖表需要數字時用 `chartValue()` 轉換，轉換結果只用於繪圖

## 開發指南

### 新增頁面

1. `src/pages/` 建立頁面元件
2. `src/router.tsx` 加路由（`lazy` 載入、`handle: { crumb: '名稱' }`），放在 `<RequireAuth />` 底下
3. `src/config/nav.ts` 加側欄項目

### 新增資源（CRUD）

以 `features/transactions/` 為範本：

| 檔案 | 內容 |
|---|---|
| `schema.ts` | 型別、Zod 表單 schema、選項顯示文字、表單 ↔ API 轉換 |
| `api.ts` | query key、`useXxx` / `useSaveXxx` / `useDeleteXxx`；成功後呼叫 `invalidateFinance()` |
| `*-form-dialog.tsx` | 新增 / 編輯表單；`applyServerErrors()` 回填後端 422 錯誤 |
| `pages/*.tsx` | 欄位定義 + DataTable + 工具列 |
| `api/mock/index.ts` | mock 端點（含驗證，格式比照 FastAPI） |

### 資料表格

- 列表狀態用 `useListParams()` 同步到網址，例如 `/transactions?type=expense&date_from=2026-11-01&date_to=2026-11-30&sort=amount&order=desc`
- 篩選或換頁後清除勾選，避免誤刪畫面外的資料
- 欄位：`ColumnHeader`（排序）、`selectionColumn()`（勾選）、`meta.label`（欄位設定選單名稱）；篩選：`FacetedFilter`（多選，值以逗號分隔）

### 圖表

共用元件在 `src/components/charts/`（`ChartCard`、`ChartTooltipContent`、`theme.ts`）：

- 顏色跟著資料實體走：收入 / 支出 / 轉帳用 `TX_TYPE_COLOR`，帳戶類型用 `ACCOUNT_TYPE_COLOR`，所有圖表一致
- 不做雙 Y 軸；每張圖提供 `table`（表格檢視）
- recharts 只在進入總覽頁時下載（lazy 路由）

### 登入與權限

- token 存在 `localStorage`（`pft:auth`）；任何請求回 401 → 清除登入狀態並導向登入頁
- `useSession()` 取得 `{ user, canEdit }`；viewer 的 `canEdit` 為 false
- 登入 / 登出時清除 React Query 快取
- **前端權限只是 UI**，後端必須自行檢查

## Docker

```bash
docker compose up -d --build                                  # http://localhost:8080，/api 轉到主機 8000
VITE_API_MOCK=true docker compose up -d --build               # 沒有後端，以 mock 展示
```

- `VITE_*` 是**建置參數**（改了要重新 build）；`API_UPSTREAM` 是執行時環境變數
- 只綁 `127.0.0.1`；對外請經反向代理 + HTTPS
