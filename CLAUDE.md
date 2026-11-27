# CLAUDE.md — Personal Finance Tracker（個人財務管理）

個人用的財務管理系統：記錄**收入 / 支出 / 轉帳**、管理**帳戶與預算**、追蹤**股票投資**（交易、持股、損益、股利），並彙整成**淨資產與報表**。

> 本文件是系統架構的唯一依據。架構有變動時先改這裡，再改程式。
> 標示「待確認」的項目是目前採用的預設值，尚未經使用者確認（見 §11）。

---

## 1. 目前狀態

- **M0、M1 已完成**（前端 + mock API）：帳戶、分類、收支明細、總覽、分類管理。進度表見 `README.md`。
- **匯入匯出已完成**（原屬 M5，提前實作）：收支 CSV 匯入（預覽 → 寫入）/ 匯出、完整備份 JSON 匯出 / 還原。格式規格見 `docs/data-format.md`。
- **多會員已定案、尚未實作**：每人有獨立帳本，帳本可邀請其他會員成為共用帳本（§5.1）。目前程式仍是單一帳本。
- 待辦與待決定事項（含與 StockPulse 串接）見 `TODO.md`。
- 尚無後端與資料庫：資料來自 `src/api/mock/`（記憶體內，重新整理即重置）。mock 的端點、驗證與回應格式就是 M2 後端要實作的規格。
- 模板的範例資源（projects、analytics、charts 頁）已移除；模板的訪客模式程式碼保留但關閉，所有頁面都在 `<RequireAuth />` 底下。

## 2. 系統總覽

```
┌────────────┐   /api/v1    ┌──────────────────────┐      ┌────────────┐
│  Web (SPA) │ ───────────▶ │  API (FastAPI)       │ ───▶ │ PostgreSQL │
│  React+Vite│   nginx 代理  │  routers → services  │      └────────────┘
└────────────┘              │  → repositories      │
                            │                      │ ───▶ 外部報價 / 匯率來源
                            │  排程：報價、匯率、    │      （PriceProvider / FxProvider）
                            │  定期收支、淨資產快照  │
                            └──────────────────────┘
```

| 層 | 技術 | 說明 |
|---|---|---|
| 前端 | React 19、Vite、TypeScript、shadcn/ui、Tailwind v4、React Query、TanStack Table、Recharts、react-hook-form + Zod、zustand | 既有模板，位於 repo 根目錄 |
| 後端（待確認） | Python、FastAPI、SQLAlchemy 2、Alembic、Pydantic v2、APScheduler | 新增於 `backend/`；`src/api/adapters.ts` 已相容 FastAPI 回應格式 |
| 資料庫（待確認） | PostgreSQL | 金額需要精確小數（`NUMERIC`） |
| 部署 | Docker Compose：`web`（nginx）+ `api` + `db` | 單機自架，只綁 `127.0.0.1` |

設計前提：**多會員、自架、資料私密**。每位會員的資料以「帳本」隔離，只有帳本成員看得到（§5.1）；關閉訪客模式（`VITE_GUEST_MODE=false`），所有頁面與 API 都需登入。

## 3. 目錄結構（目標）

```
Other-PersonalFinanceTracker/
├── CLAUDE.md
├── README.md
├── src/                          # 前端（沿用模板結構）
│   ├── api/                      # client、adapters、types、mock/
│   ├── config/                   # env.ts、nav.ts
│   ├── features/
│   │   ├── auth/                 # 既有
│   │   ├── accounts/             # 帳戶
│   │   ├── categories/           # 收支分類
│   │   ├── transactions/         # 收入 / 支出 / 轉帳
│   │   ├── budgets/              # 預算
│   │   ├── recurring/            # 定期收支
│   │   ├── investments/          # 標的、交易、持股、股利
│   │   ├── dashboard/            # 總覽（淨資產、本月收支）
│   │   └── reports/              # 報表（取代模板的 analytics）
│   ├── pages/
│   ├── components/               # ui、layout、charts、data-table、common
│   ├── hooks/  lib/  router.tsx
├── backend/                      # 後端（新增）
│   ├── app/
│   │   ├── main.py               # FastAPI app、掛載 router、啟動排程
│   │   ├── core/                 # config、security（JWT、密碼雜湊）、db session
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic 請求 / 回應
│   │   ├── routers/              # 每個資源一個檔案
│   │   ├── services/             # 業務邏輯（持股計算、餘額、報表彙總）
│   │   ├── providers/            # PriceProvider、FxProvider 實作
│   │   └── jobs/                 # 排程工作
│   ├── alembic/                  # 資料庫遷移
│   ├── tests/
│   └── pyproject.toml
├── docker/                       # Dockerfile（web）、nginx.conf.template、Dockerfile.api
└── docker-compose.yml            # web + api + db
```

前端維持在根目錄（不搬到 `web/`），以便日後對照模板更新。`.dockerignore` 需排除 `backend/`。

## 4. 功能模組

| 模組 | 內容 |
|---|---|
| 帳戶 | 現金、銀行、信用卡、電子支付、證券交割戶、貸款；各帳戶有幣別與期初餘額 |
| 收支 | 收入、支出、轉帳（含跨幣別）；分類、對象（payee）、標籤、備註 |
| 分類 | 收入 / 支出各一棵樹，最多兩層；內建預設分類，可自訂 |
| 預算 | 以「月 × 分類」設定上限，顯示執行率與超支提醒 |
| 定期收支 | 薪資、房租、訂閱等規則，由排程自動產生收支 |
| 股票投資 | 標的、買賣交易（含手續費、交易稅）、持股與平均成本、已實現 / 未實現損益、現金與股票股利、分割 |
| 報價與匯率 | 每日收盤價、匯率；自動抓取，並允許手動輸入 |
| 總覽 | 淨資產、本月收入 / 支出 / 結餘、資產配置、淨資產趨勢、最近收支 |
| 報表 | 月收支趨勢、分類占比、現金流、投資績效、股利收入 |
| 匯入匯出 | 收支 CSV 匯入（先預覽、逐列檢查、略過重複）/ 匯出、完整備份 JSON 匯出 / 還原、資料庫備份（`pg_dump`）。格式見 `docs/data-format.md` |

## 5. 資料模型

所有資料表都有 `id`、`created_at`、`updated_at`。財務資料一律屬於某個**帳本**（`ledger_id NOT NULL`），見 §5.1。

```
# 會員與帳本（全域）
users               username, email, name, password_hash, role(admin|member), is_active, last_login_at
ledgers             name, base_currency, created_by
ledger_members      ledger_id, user_id, role(owner|editor|viewer), joined_at     UNIQUE(ledger_id, user_id)
ledger_invitations  ledger_id, invitee_user_id, role, invited_by, status(pending|accepted|declined|revoked), expires_at

# 帳本內的資料（每張表都有 ledger_id）
accounts            name, type, currency, opening_balance, is_archived
categories          name, kind(income|expense), parent_id, sort_order
transactions        date, type(income|expense|transfer), account_id, amount,
                    category_id, to_account_id, to_amount, payee, note, tags[],
                    recurring_rule_id, trade_id, dividend_id, created_by, updated_by
budgets             month(YYYY-MM), category_id, amount
recurring_rules     範本欄位（同 transactions）+ frequency, interval, next_run_on, end_on

trades              date, security_id, account_id, side(buy|sell),
                    quantity, price, fee, tax, note
dividends           date, security_id, account_id, kind(cash|stock),
                    cash_amount, stock_quantity, tax
net_worth_snapshots date, account_id | asset_class, value_in_base_currency

# 市場資料（全域，所有帳本共用）
securities          symbol, market, name, type(stock|etf), currency      UNIQUE(market, symbol)
corporate_actions   date, security_id, kind(split), ratio
price_quotes        security_id, date, close            UNIQUE(security_id, date)
fx_rates            date, base, quote, rate             UNIQUE(date, base, quote)
```

關聯與規則：

- **帳戶餘額不存欄位**，由 `opening_balance + Σ transactions` 計算。
- **持股不存表**，由 `trades + dividends(stock) + corporate_actions` 推導（`services/holdings.py`）。
- **股票交易連動現金**：買賣與現金股利會在交割帳戶自動產生一筆 `transactions`（以 `trade_id` / `dividend_id` 連結）；這類收支由系統維護，不可單獨編輯或刪除。
- **轉帳**是單一筆紀錄：`account_id` 轉出、`to_account_id` 轉入；跨幣別時 `to_amount` 記錄實際入帳金額。轉帳不計入收入 / 支出統計。
- **成本法（待確認）**：加權平均成本。賣出時已實現損益 = 賣出淨額 − 平均成本 × 賣出股數。
- **淨資產** = 各帳戶餘額 + 持股市值，全部以當日匯率換算成本位幣；每日由排程寫入 `net_worth_snapshots` 供趨勢圖使用。

### 5.1 帳本與會員

**模型**：會員（user）擁有或加入多個帳本（ledger）。帳本只有一位成員時就是個人帳本；邀請其他會員加入後即為共用帳本，兩者是同一種東西，沒有另外的「共用」旗標。

| 帳本角色 | 可以做的事 |
|---|---|
| `owner` 擁有者 | 全部；包含帳本設定、邀請與移除成員、變更角色、還原備份、刪除帳本 |
| `editor` 編輯者 | 新增 / 修改 / 刪除帳戶、分類、收支、交易；匯入 CSV；匯出 |
| `viewer` 檢視者 | 只能看與匯出 |

全域角色另外只有 `admin`（管理會員帳號）與 `member`；`admin` **不會**因此看得到別人的帳本。

規則：

1. **註冊即建立個人帳本**「我的帳本」（自己是 owner），並寫入預設分類。之後可再「新增帳本」，例如家庭共用帳本，個人帳本保持私密。
2. **邀請**：owner 以對方的帳號或 Email 邀請並指定角色 → 對方在自己的畫面接受後才加入（不能直接把人加進帳本）。邀請 7 天過期，owner 可撤回。
3. **成員管理**：owner 可變更角色、移除成員；成員可自行退出。帳本至少要有一位 owner；最後一位 owner 要退出前必須先移交或刪除帳本。
4. **資料隔離**：帳本內所有資料表都有 `ledger_id`；所有查詢都以帳本過濾；同一筆資料參照的帳戶、分類必須屬於同一帳本。**不是成員的帳本一律回 404**（不透露帳本是否存在）。
5. **名稱唯一性**（帳戶、分類）以帳本為範圍。
6. **記帳人**：收支、交易記錄 `created_by` / `updated_by`；共用帳本的列表與詳細資料顯示是誰記的。
7. **匯入匯出、備份**以帳本為單位：備份只含該帳本；還原只取代該帳本，限 owner。
8. **刪除帳本**：限 owner，需輸入帳本名稱確認，刪除帳本內全部資料。**刪除會員**：自己是唯一 owner 的帳本一併刪除（需確認）；有其他成員的帳本須先移交 owner。
9. **市場資料**（標的、報價、匯率）是全域共用，不屬於任何帳本。
10. **不支援跨帳本轉帳**：個人帳本與共用帳本之間的資金往來，兩邊各記一筆（例如個人帳本記「轉帳出去」支出、共用帳本記收入）。
11. 每個帳本有自己的本位幣（`ledgers.base_currency`），總覽、報表以帳本本位幣計算。

## 6. 金額與數值規則（重要）

1. 後端一律使用 `Decimal`，資料庫用 `NUMERIC`：金額 `NUMERIC(20,4)`、股數與價格 `NUMERIC(20,6)`、匯率 `NUMERIC(20,8)`。**禁止用 float 存或算金額**。
2. API 以**字串**傳遞金額（例如 `"1234.50"`），避免 JSON 浮點誤差。
3. `amount`、`quantity`、`price`、`fee`、`tax` 一律**存正數**，方向由 `type` / `side` 決定。
4. **加總、損益、匯率換算都在後端做**；前端只負責顯示（`Intl.NumberFormat`），不對金額做累加。
5. 每筆金額都跟著幣別；本位幣（待確認，預設 `TWD`）只用於彙總顯示，換算結果不回寫原始資料。
6. 日期：收支與交易用 `date`（不含時區）；時間戳用 UTC 儲存、前端以本地時區顯示。

## 7. API 設計

前綴 `/api/v1`。**帳本內的資源都在 `/ledgers/{ledger_id}` 底下**（例如 `/ledgers/{ledger_id}/transactions`；下表省略此前綴），後端以共用的相依函式檢查成員與角色，非成員回 404、角色不足回 403。驗證錯誤回 422，格式比照 FastAPI：`{ detail: [{ loc: ['body', '<欄位>'], msg }] }`，前端會回填到對應欄位；業務規則衝突回 409 `{ detail }`。列表統一支援 `page`、`page_size`、`q`、`sort`、`order` 與資源專屬篩選，回應 `{ items, total, page, page_size }`；錯誤回應 `{ detail }`（與 `adapters.ts` 一致）。

| 資源 | 端點 |
|---|---|
| 驗證（全域） | `POST /auth/login`、`POST /auth/register`（可由設定關閉）、`GET /auth/me`、`POST /auth/change-password` |
| 帳本（全域） | `GET/POST /ledgers`（我參與的帳本，含我的角色與成員數）、`GET/PATCH/DELETE /ledgers/{id}`、`POST /ledgers/{id}/leave`、`POST /ledgers/{id}/transfer-ownership` |
| 成員與邀請 | `GET /ledgers/{id}/members`、`PATCH/DELETE /ledgers/{id}/members/{user_id}`、`GET/POST /ledgers/{id}/invitations`、`DELETE /ledgers/{id}/invitations/{inv_id}`；被邀請者：`GET /me/invitations`、`POST /me/invitations/{inv_id}/accept`、`/decline` |
| 會員管理（全域，admin） | `GET/POST /admin/users`、`PATCH /admin/users/{id}`（停用、重設密碼、角色） |
| 市場資料（全域） | 標的、報價、匯率端點不在帳本底下（見下方） |
| 帳戶 | `GET/POST /accounts`（`include_archived=true` 含已封存）、`GET/PATCH/DELETE /accounts/{id}`；回應含計算後的 `balance` 與 `transaction_count`；有收支的帳戶不可刪除（409）或改幣別（422） |
| 分類 | `GET/POST /categories`、`PATCH/DELETE /categories/{id}`；回應含 `transaction_count`；已使用或有子分類不可刪除（409） |
| 收支 | `GET/POST /transactions`、`GET/PATCH/DELETE /transactions/{id}`、`POST /transactions/bulk-delete`；篩選 `q`、`type`、`account_id`（含轉入方）、`category_id`（含子分類）、`date_from`、`date_to`，可多選（逗號分隔）；排序 `date` / `amount`；列表回應另含 `summary`（篩選結果的收入 / 支出 / 結餘，本位幣） |
| 預算 | `GET /budgets?month=`、`PUT /budgets`（含執行金額） |
| 定期收支 | `GET/POST /recurring-rules`、`PATCH/DELETE /recurring-rules/{id}` |
| 標的 | `GET/POST /securities`、`PATCH /securities/{id}` |
| 交易 | `GET/POST /trades`、`PATCH/DELETE /trades/{id}` |
| 股利 | `GET/POST /dividends`、`PATCH/DELETE /dividends/{id}` |
| 持股 | `GET /holdings`（股數、平均成本、市值、未實現損益、報酬率） |
| 報價 | `GET /quotes?security_id=&from=&to=`、`PUT /quotes`（手動輸入）、`POST /quotes/refresh` |
| 匯率 | `GET /fx-rates`、`PUT /fx-rates` |
| 總覽 | `GET /dashboard/summary?month=YYYY-MM`（淨資產、本月與上月收支、近 6 月收支、本月支出分類、資產配置、使用中的匯率） |
| 報表 | `GET /reports/cashflow`、`/reports/categories`、`/reports/net-worth`、`/reports/investments`、`/reports/dividends` |
| 匯入匯出 | `GET /export/transactions`（CSV，篩選同收支列表）、`GET /export/backup`（JSON）、`POST /import/transactions`（`dry_run` 預覽）、`POST /import/backup`（`dry_run` 預覽，確認後取代全部）；M3 加 `POST /import/trades`。格式與回應見 `docs/data-format.md` |

## 8. 前端頁面與導覽

| 路由 | 頁面 | 主要元件 |
|---|---|---|
| （全域） | 帳本切換器 | 側欄頂端切換目前帳本、顯示角色與共用人數、「新增帳本」；有待接受的邀請時顯示提示 |
| `/dashboard` | 總覽 | 統計卡片、淨資產趨勢、資產配置環圈圖、最近收支 |
| `/transactions` | 收支明細 | DataTable + 表單 Dialog + 詳細 Sheet（由模板 `projects` 改寫） |
| `/accounts` | 帳戶 | 依類型分組的帳戶卡片與餘額 |
| `/budgets` | 預算 | 月份切換、各分類執行率 |
| `/investments/holdings` | 持股 | 持股表、配置圖、損益 |
| `/investments/trades` | 交易紀錄 | DataTable CRUD |
| `/investments/dividends` | 股利 | DataTable CRUD、年度股利統計 |
| `/reports` | 報表 | 由模板 `charts` 改寫 |
| `/data` | 匯入匯出 | 匯出 CSV / 備份、匯入 CSV（預覽表）、還原備份 |
| `/settings` | 設定 | 分類管理、定期收支（帳本層級） |
| `/ledger` | 帳本設定 | 名稱、本位幣、成員與角色、邀請、退出 / 移交 / 刪除帳本 |
| `/account` | 我的帳號 | 個人資料、修改密碼、待接受的邀請、外觀 |
| `/admin/users` | 會員管理 | 限 admin：新增、停用、重設密碼 |

側欄分組（`src/config/nav.ts`）：**總覽**／**收支**（明細、帳戶、預算）／**投資**（持股、交易、股利）／**分析**（報表）／**系統**（匯入匯出、設定、帳本設定）。

前端帳本狀態：目前帳本 id 存在 store（記住上次選擇），API client 自動加上 `/ledgers/{id}` 前綴，React Query 的 key 都包含帳本 id；切換帳本時清除帳本相關快取。`canEdit` 等權限改由**帳本角色**決定，不再看全域角色。

## 9. 排程與外部資料

| 工作 | 頻率 | 內容 |
|---|---|---|
| 抓取報價 | 每個交易日收盤後 | 更新持有中標的的 `price_quotes` |
| 抓取匯率 | 每日 | 更新用到的幣別對 `fx_rates` |
| 定期收支 | 每日 | 依 `recurring_rules.next_run_on` 產生收支（逐帳本） |
| 淨資產快照 | 每日（報價更新後） | 逐帳本寫入 `net_worth_snapshots` |

- 排程以 APScheduler 跑在 API 行程內（自架、會員數少，不另開 worker）；報價、匯率是全域工作，只抓所有帳本持有中的標的與用到的幣別。
- 報價與匯率透過 `PriceProvider` / `FxProvider` 介面存取，依 `securities.market` 選擇實作；**實際資料來源待確認**，選定前需先查證其使用條款與穩定性。
- 外部來源失敗不可影響主功能：沿用最近一筆報價並在介面標示日期，且一律可手動輸入。

## 10. 安全與資料保護

- 財務資料屬私密：關閉訪客模式；所有 API 需驗證；服務只綁 `127.0.0.1`，對外需經反向代理 + HTTPS。
- 密碼以 argon2 / bcrypt 雜湊；JWT 密鑰、資料庫密碼放 `.env`（已在 `.gitignore`），**不可提交**。`.env.development` / `.env.production` 只放非機密的 `VITE_*`。
- 前端權限只是 UI，後端必須自行檢查。
- **帳本隔離是最重要的安全規則**：每個帳本內的端點都要有「別的帳本的 id → 404」與「角色不足 → 403」的測試；查詢一律由帳本相依函式取得 `ledger_id`，不信任請求內容中的 `ledger_id`。
- 系統管理員（`admin`）只能管理帳號，不能讀取他人帳本；預設關閉公開註冊（`ALLOW_REGISTRATION=false`），由 admin 建立帳號。
- 之後可改為 httpOnly cookie（做法見 `README.md` 注意事項）。
- 定期 `pg_dump` 備份；提供全量匯出（備份 JSON），確保資料可攜。
- 匯入一律先 `dry_run` 預覽，正式匯入在副本 / DB transaction 中完成，失敗不留下部分資料；匯出 CSV 需防公式注入（見 `docs/data-format.md`）。
- 測試與 mock 只使用假資料，不放入真實帳號或金額。

## 11. 待確認決策

| # | 項目 | 目前預設 | 替代方案 |
|---|---|---|---|
| 1 | 後端框架 | FastAPI | 沿用 Template-PythonFlaskAPI |
| 2 | 資料庫 | PostgreSQL | SQLite（最簡單，但需自行處理小數精度） |
| 3 | 本位幣與市場 | TWD；台股 + 美股 | 依實際持有調整 |
| 4 | 成本計算 | 加權平均成本 | FIFO |
| 5 | 報價 / 匯率來源 | 未定（介面先行，支援手動輸入） | — |
| 6 | 使用者 | ✅ 已決定：多會員，各自獨立帳本，可邀請成為共用帳本（§5.1） | — |
| 8 | 註冊方式 | 關閉公開註冊，由 admin 建立帳號 | 開放註冊（`ALLOW_REGISTRATION=true`） |
| 9 | 跨帳本彙總 | 不做（每個帳本各自看） | 「我的全部帳本」合併淨資產 |
| 7 | 範圍 | 僅股票 / ETF | 基金、債券、加密貨幣、不動產 |

## 12. 開發階段

| 階段 | 內容 |
|---|---|
| M0 ✅ | 模板改名（`package.json`、`VITE_APP_NAME`、README）、關閉訪客模式、移除範例資源 |
| M1 ✅ | 前端 + mock API：帳戶、分類、收支明細、總覽 |
| M1.5 | 多會員與帳本（先在 mock 實作，作為 M2 規格）：帳本切換器、帳本設定與成員、邀請、帳本角色權限、資料改以帳本隔離、會員管理 |
| M2 | 後端骨架：FastAPI、資料庫遷移、登入 / 註冊、帳本與成員；帳戶 / 分類 / 收支 API（帳本隔離）；前端改接真實後端；compose 加入 `api`、`db` |
| M3 | 投資：標的、交易、持股計算、股利、手動報價 |
| M4 | 自動報價與匯率、淨資產快照、報表 |
| M5 | 預算、定期收支、資料庫備份（匯入匯出已提前完成） |

每個階段先更新 mock（`src/api/mock/`）與型別，再實作後端，確保前端可獨立開發。

## 13. 指令

```bash
# 前端（repo 根目錄，Node 22）
npm install
npm run dev          # http://localhost:5173，預設使用 mock API
npm run typecheck
npm run lint         # oxlint
npm run test         # vitest
npm run build

# Docker
docker compose up -d --build     # http://localhost:8080
```

後端建立後在此補上 `backend/` 的啟動、遷移與測試指令。

## 14. 開發慣例

- **新增資源**依 `README.md`「新增資源（CRUD）」的檔案配置：`features/<name>/schema.ts`（Zod）、`api.ts`（React Query hooks）、表單 Dialog、詳細 Sheet、`pages/<name>.tsx`、mock 端點。
- **新增頁面**同步改 `src/router.tsx`（lazy 載入、`handle.crumb`）與 `src/config/nav.ts`。
- 後端回應格式差異只在 `src/api/adapters.ts` 處理，不散落在各 feature。
- 列表狀態（搜尋、篩選、排序、分頁）一律用 `useListParams` 同步到網址。
- 圖表遵守 `README.md`「圖表」的規則：固定配色、不做雙 Y 軸、每張圖提供表格檢視。收入 / 支出 / 各資產類別在所有圖表使用同一顏色。
- 介面文字使用繁體中文；程式識別字、API 欄位（snake_case）與 commit 訊息使用英文。
- 變動收支或交易後，invalidate 所有相依查詢（帳戶餘額、總覽、報表、持股）。
- 後端分層：`routers`（HTTP）→ `services`（業務邏輯）→ `models`（資料）；計算邏輯（持股、損益、餘額）必須有單元測試。
- 提交前需通過 `npm run typecheck`、`npm run lint`、`npm run test`。
- Git：直接在 `main` 上 commit，不另開分支；只在使用者要求時 commit，不主動 push。commit 訊息用英文。
