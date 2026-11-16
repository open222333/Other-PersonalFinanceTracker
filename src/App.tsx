import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'

import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/store'
import { createQueryClient } from '@/lib/query'
import { createRouter } from '@/router'

export default function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createRouter)
  // 登入 / 登出 / 切換帳號時清掉快取並重新查詢，避免前一個身分的資料殘留（例如訪客 → 登入後看到更多欄位）
  useEffect(
    () =>
      useAuth.subscribe((s, prev) => {
        if (s.token !== prev.token) queryClient.resetQueries()
      }),
    [queryClient],
  )
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
