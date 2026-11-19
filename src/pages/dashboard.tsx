import { ArrowRight, Landmark, Plus, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartCard, ChartTooltipContent, type LegendItem } from '@/components/charts/chart'
import { axisProps, barCursor, gridProps } from '@/components/charts/theme'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountMap } from '@/features/accounts/api'
import { ACCOUNT_TYPE_COLOR, ACCOUNT_TYPE_LABEL } from '@/features/accounts/schema'
import { useSession } from '@/features/auth/session'
import { useCategoryMap } from '@/features/categories/api'
import { categoryPath } from '@/features/categories/schema'
import { useDashboardSummary } from '@/features/dashboard/api'
import { useTransactions } from '@/features/transactions/api'
import { TX_TYPE_COLOR } from '@/features/transactions/schema'
import { TxAmount } from '@/features/transactions/tx-display'
import { formatDay, formatMonth, monthRange } from '@/lib/date'
import { BASE_CURRENCY, chartValue, formatCompact, formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

function StatCard({
  label,
  icon: Icon,
  to,
  loading,
  children,
  hint,
}: {
  label: string
  icon: typeof Wallet
  to: string
  loading: boolean
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <Link to={to} className="group">
      <Card className="group-hover:border-foreground/20 h-full gap-2 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <Icon className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {loading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-semibold tabular-nums">{children}</div>}
          {hint && !loading && <div className="text-muted-foreground text-xs">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  )
}

/** 本月與上月比較：「比上月多 12%」 */
function compare(current: string, previous: string, label: string) {
  const c = Number(current)
  const p = Number(previous)
  if (!p) return null
  const pct = Math.round(((c - p) / p) * 100)
  if (pct === 0) return `與上月${label}相同`
  return `比上月${pct > 0 ? '多' : '少'} ${Math.abs(pct)}%`
}

const flowLegend: LegendItem[] = [
  { label: '收入', color: TX_TYPE_COLOR.income },
  { label: '支出', color: TX_TYPE_COLOR.expense },
]

export function DashboardPage() {
  const { user, canEdit } = useSession()
  const s = useDashboardSummary()
  const recent = useTransactions({ page: 1, pageSize: 8, sort: 'date', order: 'desc' })
  const accounts = useAccountMap()
  const categories = useCategoryMap()

  const d = s.data
  const cur = d?.base_currency ?? BASE_CURRENCY
  const month = d?.month
  const range = month ? monthRange(month) : undefined
  const monthLink = (type: string) => (range ? `/transactions?type=${type}&date_from=${range.from}&date_to=${range.to}` : '/transactions')
  const money = (v?: string) => formatMoney(v, cur)

  const monthly = (d?.monthly ?? []).map((m) => ({ label: formatMonth(m.month), month: m.month, income: chartValue(m.income), expense: chartValue(m.expense) }))
  const byCategory = (d?.expense_by_category ?? []).map((c) => ({ ...c, value: chartValue(c.amount) }))
  const allocation = (d?.assets_by_type ?? []).map((a) => ({ ...a, name: ACCOUNT_TYPE_LABEL[a.type], value: chartValue(a.amount) }))
  const loading = { isLoading: s.isLoading, error: s.error, onRetry: () => s.refetch() }

  return (
    <>
      <PageHeader
        title="總覽"
        description={`${user?.name ? `${user.name}，` : ''}${month ? formatMonth(month, true) : '本月'}的財務狀況`}
        actions={
          canEdit && (
            <Button asChild>
              <Link to="/transactions?new=1">
                <Plus /> 記一筆
              </Link>
            </Button>
          )
        }
      />

      {s.error ? (
        <Card>
          <ErrorState error={s.error} onRetry={() => s.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="淨資產" icon={Landmark} to="/accounts" loading={s.isLoading} hint={d && `資產 ${money(d.assets)} − 負債 ${money(d.liabilities)}`}>
            {money(d?.net_worth)}
          </StatCard>
          <StatCard label="本月收入" icon={TrendingUp} to={monthLink('income')} loading={s.isLoading} hint={d && compare(d.month_income, d.prev_month_income, '收入')}>
            <span className="text-emerald-600 dark:text-emerald-400">{money(d?.month_income)}</span>
          </StatCard>
          <StatCard label="本月支出" icon={TrendingDown} to={monthLink('expense')} loading={s.isLoading} hint={d && compare(d.month_expense, d.prev_month_expense, '支出')}>
            {money(d?.month_expense)}
          </StatCard>
          <StatCard label="本月結餘" icon={Wallet} to={monthLink('income,expense')} loading={s.isLoading} hint="收入 − 支出，不含轉帳">
            <span className={cn(Number(d?.month_net) < 0 && 'text-destructive')}>{formatMoney(d?.month_net, cur, { signed: true })}</span>
          </StatCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          title="近 6 個月收支"
          description={`本位幣 ${cur}，不含轉帳`}
          legend={flowLegend}
          {...loading}
          height={240}
          table={{
            columns: [
              { key: 'month', label: '月份' },
              { key: 'income', label: '收入', numeric: true },
              { key: 'expense', label: '支出', numeric: true },
              { key: 'net', label: '結餘', numeric: true },
            ],
            rows: [...(d?.monthly ?? [])].reverse().map((m) => ({ month: formatMonth(m.month, true), income: money(m.income), expense: money(m.expense), net: money(m.net) })),
          }}
        >
          <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%" barGap={4}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={56} tickFormatter={formatCompact} />
            <Tooltip cursor={barCursor} content={<ChartTooltipContent names={{ income: '收入', expense: '支出' }} valueFormatter={(v) => formatMoney(v, cur)} />} />
            <Bar dataKey="income" fill={TX_TYPE_COLOR.income} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill={TX_TYPE_COLOR.expense} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="本月支出分類"
          description="依第一層分類"
          {...loading}
          raw={!byCategory.length}
          height={Math.max(160, byCategory.length * 40)}
          table={{
            columns: [
              { key: 'name', label: '分類' },
              { key: 'amount', label: '金額', numeric: true },
            ],
            rows: byCategory.map((c) => ({ name: c.name, amount: money(c.amount) })),
          }}
        >
          {byCategory.length ? (
            <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap="28%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" {...axisProps} width={72} />
              <Tooltip cursor={barCursor} content={<ChartTooltipContent hideLabel names={{ value: '支出' }} valueFormatter={(v) => formatMoney(v, cur)} />} />
              <Bar dataKey="value" fill={TX_TYPE_COLOR.expense} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="value" position="right" className="fill-muted-foreground" fontSize={12} formatter={(v) => formatMoney(Number(v), cur)} />
              </Bar>
            </BarChart>
          ) : (
            <EmptyState title="本月尚無支出" />
          )}
        </ChartCard>

        <ChartCard
          title="資產配置"
          description="依帳戶類型（不含負債）"
          legend={allocation.map((a) => ({ label: a.name, color: ACCOUNT_TYPE_COLOR[a.type] }))}
          {...loading}
          height={220}
          table={{
            columns: [
              { key: 'name', label: '類型' },
              { key: 'amount', label: '金額', numeric: true },
              { key: 'share', label: '占比', numeric: true },
            ],
            rows: allocation.map((a) => ({
              name: a.name,
              amount: money(a.amount),
              share: `${Math.round((a.value / (chartValue(d?.assets ?? '0') || 1)) * 100)}%`,
            })),
          }}
        >
          <PieChart>
            <Tooltip content={<ChartTooltipContent hideLabel valueFormatter={(v) => formatMoney(v, cur)} />} />
            <Pie data={allocation} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={1} stroke="var(--card)" strokeWidth={2} cornerRadius={4}>
              {allocation.map((a) => (
                <Cell key={a.type} fill={ACCOUNT_TYPE_COLOR[a.type]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近收支</CardTitle>
          <CardDescription>最新 8 筆</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/transactions">
                全部收支 <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {recent.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : recent.error ? (
            <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
          ) : !recent.data?.items.length ? (
            <EmptyState title="還沒有收支紀錄" description="按「記一筆」開始記帳" />
          ) : (
            <ul className="divide-y">
              {recent.data.items.map((t) => {
                const acc = accounts.map.get(t.account_id)
                const to = t.to_account_id ? accounts.map.get(t.to_account_id) : undefined
                const title =
                  t.type === 'transfer' ? `${acc?.name ?? '?'} → ${to?.name ?? '?'}` : t.payee || categoryPath(categories.map, t.category_id)
                const sub = t.type === 'transfer' ? t.note || '轉帳' : [categoryPath(categories.map, t.category_id), acc?.name].filter(Boolean).join(' · ')
                return (
                  <li key={t.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">{formatDay(t.date)}</span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{title}</div>
                        <div className="text-muted-foreground truncate text-xs">{sub}</div>
                      </div>
                    </div>
                    <TxAmount tx={t} currency={acc?.currency ?? BASE_CURRENCY} toCurrency={to?.currency} />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

