import { Lock, LogIn, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { useTheme } from '@/components/theme-provider'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { visibleNav } from '@/config/nav'
import { loginPath, useLogout, useSession } from '@/features/auth/session'

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const location = useLocation()
  const { user, isGuest } = useSession()
  const logout = useLogout()
  const run = (fn: () => void) => () => {
    onOpenChange(false)
    fn()
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="指令" description="前往頁面或執行指令">
      <CommandInput placeholder="輸入頁面或指令…" />
      <CommandList>
        <CommandEmpty>找不到符合的項目</CommandEmpty>
        {visibleNav(user?.role, isGuest).map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((i) => (
              <CommandItem
                key={i.url}
                value={`${i.title} ${i.url}`}
                onSelect={run(() => navigate(i.locked ? loginPath(i.url) : i.url))}
              >
                <i.icon /> {i.title}
                {i.locked && <Lock className="ml-auto opacity-60" />}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="主題">
          <CommandItem onSelect={run(() => setTheme('light'))}>
            <Sun /> 淺色
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('dark'))}>
            <Moon /> 深色
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('system'))}>
            <Monitor /> 跟隨系統
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="帳號">
          {isGuest ? (
            <CommandItem onSelect={run(() => navigate(loginPath(location.pathname + location.search)))}>
              <LogIn /> 登入
            </CommandItem>
          ) : (
            <CommandItem onSelect={run(logout)}>
              <LogOut /> 登出
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
