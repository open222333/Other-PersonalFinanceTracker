import { ChevronRight, LogIn, LogOut, Menu, Monitor, Moon, Search, Settings, Sun } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useMatches, useNavigate } from 'react-router'

import { useTheme } from '@/components/theme-provider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { loginPath, useLogout, useSession } from '@/features/auth/session'

import { Brand, SidebarNav } from './sidebar'

export interface RouteHandle {
  crumb?: string
}

function Breadcrumbs() {
  const crumbs = useMatches()
    .filter((m) => (m.handle as RouteHandle | undefined)?.crumb)
    .map((m) => ({ to: m.pathname, label: (m.handle as RouteHandle).crumb! }))
  return (
    <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={c.to} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium">{c.label}</span>
          ) : (
            <Link to={c.to} className="text-muted-foreground hover:text-foreground truncate">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

export function Topbar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const { user, isGuest } = useSession()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="開啟選單">
        <Menu />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 gap-0 p-0">
          <SheetTitle className="sr-only">選單</SheetTitle>
          <SheetDescription className="sr-only">主要導覽</SheetDescription>
          <Brand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" className="text-muted-foreground hidden w-48 justify-start sm:flex" onClick={onOpenCommand}>
          <Search />
          <span>搜尋…</span>
          <kbd className="bg-muted ml-auto rounded px-1.5 text-[10px] font-medium">⌘K</kbd>
        </Button>
        <Button variant="ghost" size="icon-sm" className="sm:hidden" onClick={onOpenCommand} aria-label="搜尋">
          <Search />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="主題">
              <ThemeIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun /> 淺色
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon /> 深色
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor /> 跟隨系統
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isGuest ? (
          <Button size="sm" className="ml-1" asChild>
            <Link to={loginPath(location.pathname + location.search)}>
              <LogIn /> 登入
            </Link>
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="帳號選單">
                <Avatar className="size-7">
                  <AvatarFallback>{user?.name?.slice(0, 1) ?? '?'}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-foreground">
                <div className="font-medium">{user?.name}</div>
                <div className="text-muted-foreground text-xs font-normal">
                  {user?.username} · {user?.role}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings /> 設定
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout}>
                <LogOut /> 登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
