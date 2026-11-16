/** 環境變數（.env / .env.development / .env.production，VITE_ 前綴才會進前端） */
export const env = {
  appName: import.meta.env.VITE_APP_NAME || 'Dashboard',
  /** API 前綴；開發時由 Vite proxy 轉到後端，正式環境由 nginx 轉發 */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, ''),
  /** true = 使用前端內建的 mock API（不需後端） */
  apiMock: import.meta.env.VITE_API_MOCK === 'true',
  /**
   * true（預設）= 訪客模式：不登入可瀏覽公開頁面（總覽、圖表、專案列表），新增 / 編輯 / 刪除與設定頁需登入。
   * false = 所有頁面都需登入。
   */
  guestMode: import.meta.env.VITE_GUEST_MODE !== 'false',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000),
}
