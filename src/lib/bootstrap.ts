/** 啟動設定：把 API client 接上登入狀態與 mock transport */
import { toast } from 'sonner'

import { configureClient } from '@/api/client'
import { env } from '@/config/env'
import { useAuth } from '@/features/auth/store'

export async function bootstrap() {
  configureClient({
    getToken: () => useAuth.getState().token,
    onUnauthorized: () => {
      if (!useAuth.getState().token) return
      useAuth.getState().clear()
      // 訪客模式：留在目前頁面（公開頁繼續可看；需登入的頁面由 <RequireAuth> 自動導向登入）
      if (env.guestMode) {
        toast.warning('登入已過期，請重新登入')
        return
      }
      const here = window.location.pathname + window.location.search
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign(`/login?redirect=${encodeURIComponent(here)}&expired=1`)
      }
    },
  })
  // 直接比對 import.meta.env 讓正式 build 完全移除 mock 程式碼
  if (import.meta.env.VITE_API_MOCK === 'true') {
    const { createMockTransport } = await import('@/api/mock') // 正式 build 未啟用時不載入
    configureClient({ transport: createMockTransport({ publicRead: env.guestMode }) })
    console.info('[mock] 使用前端 mock API（測試帳號見 README）')
  }
}
