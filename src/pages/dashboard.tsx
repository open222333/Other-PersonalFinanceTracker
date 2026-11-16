import { Archive, ArrowRight, CircleDot, FolderKanban, Flame, LogIn, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartCard, ChartTooltipContent } from '@/components/charts/chart'
import { axisProps, gridProps, lineCursor, SERIES } from '@/components/charts/theme'

import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivity, useStats } from '@/features/dashboard/api'
import { useTraffic } from '@/features/analytics/api'
import { loginPath, useSession } from '@/features/auth/session'
import { formatNumber, formatRelative } from '@/lib/format'

export function DashboardPage() {
  const { user, isGuest, canEdit } = useSession()
  const stats = useStats()
  const activity = useActivity()
  const traffic = useTraffic(30)

  const cards = [
    { label: '專案總數', value: stats.data?.total, icon: FolderKanban, to: '/projects' },
    { label: '進行中', value: stats.data?.active, icon: CircleDot, to: '/projects?status=active' },
    { label: '高優先（進行中）', value: stats.data?.high_priority, icon: Flame, to: '/projects?status=active&priority=high' },
    { label: '已封存', value: stats.data?.archived, icon: Archive, to: '/projects?status=archived' },
  ]

  return (
    <>
      <PageHeader
        title="總覽"
        description={isGuest ? '訪客模式：可瀏覽所有公開資料，登入後可新增與編輯' : `歡迎回來，${user?.name ?? ''}`}
        actions={
          canEdit ? (
            <Button asChild>
              <Link to="/projects?new=1">
                <Plus /> 新增專案
              </Link>
            </Button>
          ) : (
            isGuest && (
              <Button variant="outline" asChild>
                <Link to={loginPath('/projects?new=1')}>
                  <LogIn /> 登入以新增專案
                </Link>
              </Button>
            )
          )
        }
      />

      {stats.error ? (
        <Card>
          <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <Link key={c.label} to={c.to} className="group">
              <Card className="group-hover:border-foreground/20 gap-2 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardDescription>{c.label}</CardDescription>
                  <c.icon className="text-muted-foreground size-4" />
                </CardHeader>
                <CardContent>
                  {stats.isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-3xl font-semibold tabular-nums">{formatNumber(c.value ?? 0)}</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ChartCard
        title="近 30 天流量"
        description="每日瀏覽次數"
        isLoading={traffic.isLoading}
        error={traffic.error}
        onRetry={() => traffic.refetch()}
        height={200}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/charts">
              更多圖表 <ArrowRight />
            </Link>
          </Button>
        }
      >
        <AreaChart data={traffic.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dashTrafficFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.3} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => d.slice(5).replace('-', '/')} minTickGap={32} />
          <YAxis {...axisProps} width={48} tickFormatter={(n: number) => n.toLocaleString('zh-TW')} />
          <Tooltip cursor={lineCursor} content={<ChartTooltipContent names={{ visits: '瀏覽次數' }} />} />
          <Area dataKey="visits" type="monotone" stroke={SERIES[0]} strokeWidth={2} fill="url(#dashTrafficFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
        </AreaChart>
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>最近活動</CardTitle>
          <CardDescription>最新的建立與修改紀錄</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : activity.error ? (
            <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
          ) : !activity.data?.length ? (
            <EmptyState title="尚無活動" />
          ) : (
            <ul className="divide-y">
              {activity.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.actor}</span> {a.action} <span className="font-medium">{a.target}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{formatRelative(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
