import { CircleAlert, CircleCheck, DatabaseBackup, Download, FileDown, FileUp, Loader2, RotateCcw } from 'lucide-react'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSession } from '@/features/auth/session'
import {
  downloadBackup,
  downloadTransactionsCsv,
  useImportTransactions,
  useRestoreBackup,
  type ImportOptions,
  type ImportResult,
  type ImportRow,
} from '@/features/data/api'
import { buildTransactionTemplate, IMPORT_LIMITS, TX_CSV_COLUMNS } from '@/features/data/format'
import { TX_TYPE_LABEL } from '@/features/transactions/schema'
import { PERIOD_PRESETS } from '@/lib/date'
import { readTextFile, saveFile } from '@/lib/file'
import { formatMoney } from '@/lib/money'
import { errorMessage } from '@/lib/query'
import { cn } from '@/lib/utils'

// ── 共用 ──

/** 選檔按鈕 + 拖放區 */
function FilePicker({ accept, label, hint, disabled, onFile }: { accept: string; label: string; hint: string; disabled?: boolean; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f && !disabled) onFile(f)
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
        over && 'border-primary bg-accent',
      )}
    >
      <FileUp className="text-muted-foreground size-6" />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </Button>
      <p className="text-muted-foreground text-xs">{hint}</p>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // 允許再次選同一個檔案
          if (f) onFile(f)
        }}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'error' }) {
  return (
    <div className="flex flex-col rounded-md border px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          'text-lg font-semibold tabular-nums',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
          tone === 'error' && value > 0 && 'text-destructive',
        )}
      >
        {value.toLocaleString('zh-TW')}
      </span>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ── 匯出 ──

function ExportCard() {
  const [period, setPeriod] = useState('all')
  const [busy, setBusy] = useState<'csv' | 'backup' | null>(null)
  const run = async (kind: 'csv' | 'backup') => {
    setBusy(kind)
    try {
      if (kind === 'csv') {
        const r = PERIOD_PRESETS.find((p) => p.value === period)!.range()
        await downloadTransactionsCsv({ date_from: r.from, date_to: r.to })
      } else await downloadBackup()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>匯出</CardTitle>
        <CardDescription>下載後可用 Excel / Numbers / Google 試算表開啟，或留作備份</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <Section title="收支明細（CSV）" description="格式與匯入相同，可編輯後再匯入。收支頁也能依目前篩選匯出。">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36" aria-label="匯出期間">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => run('csv')} disabled={!!busy}>
              {busy === 'csv' ? <Loader2 className="animate-spin" /> : <FileDown />} 下載 CSV
            </Button>
          </div>
        </Section>
        <Section title="完整備份（JSON）" description="包含所有帳戶、分類與收支，可在「還原備份」整份還原。">
          <div>
            <Button variant="outline" onClick={() => run('backup')} disabled={!!busy}>
              {busy === 'backup' ? <Loader2 className="animate-spin" /> : <DatabaseBackup />} 下載備份
            </Button>
          </div>
        </Section>
      </CardContent>
    </Card>
  )
}

// ── 匯入收支 CSV ──

function FormatHelp() {
  return (
    <details className="group rounded-md border">
      <summary className="hover:bg-muted/50 cursor-pointer px-4 py-2.5 text-sm font-medium select-none">CSV 格式說明</summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4 text-sm">
        <ul className="text-muted-foreground list-disc space-y-1 pl-5">
          <li>第一列為標題；欄位順序不拘，認不得的欄位會略過。標題也可用英文（date、amount、account…）</li>
          <li>編碼：UTF-8 或 Big5（自動判斷）；分隔符號：逗號、Tab 或分號（自動判斷）</li>
          <li>
            重複判斷：日期、類型、帳戶、金額、轉入帳戶、對象都與現有收支相同時視為重複；同一檔案內的相同資料不視為重複
          </li>
          <li>
            上限：{IMPORT_LIMITS.maxRows.toLocaleString()} 筆、{IMPORT_LIMITS.maxBytes / 1024 / 1024} MB。帳戶不會自動建立，請先在
            <Link to="/accounts" className="text-foreground mx-1 underline underline-offset-4">
              帳戶
            </Link>
            頁建立
          </li>
        </ul>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>欄位</TableHead>
                <TableHead>必填</TableHead>
                <TableHead>說明</TableHead>
                <TableHead>範例</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TX_CSV_COLUMNS.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {c.header}
                    <div className="text-muted-foreground text-xs font-normal">{c.key}</div>
                  </TableCell>
                  <TableCell>{c.required ? <Badge variant="secondary">必填</Badge> : <span className="text-muted-foreground">選填</span>}</TableCell>
                  <TableCell className="min-w-64 whitespace-normal">{c.description}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.example ? <code>{c.example}</code> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </details>
  )
}

const STATUS = {
  ok: { label: '可匯入', icon: CircleCheck, className: 'text-emerald-600 dark:text-emerald-400' },
  duplicate: { label: '重複', icon: RotateCcw, className: 'text-amber-600 dark:text-amber-400' },
  error: { label: '錯誤', icon: CircleAlert, className: 'text-destructive' },
} as const

const PREVIEW_LIMIT = 200

function PreviewTable({ rows }: { rows: ImportRow[] }) {
  const [filter, setFilter] = useState<'all' | ImportRow['status']>(rows.some((r) => r.status === 'error') ? 'error' : 'all')
  const shown = rows.filter((r) => filter === 'all' || r.status === filter)
  const counts = { all: rows.length, ok: 0, duplicate: 0, error: 0 }
  rows.forEach((r) => counts[r.status]++)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="篩選預覽">
        {(['all', 'error', 'duplicate', 'ok'] as const).map((k) => (
          <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'ghost'} aria-pressed={filter === k} onClick={() => setFilter(k)} disabled={!counts[k]}>
            {k === 'all' ? '全部' : STATUS[k].label} {counts[k]}
          </Button>
        ))}
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="bg-background sticky top-0">
            <TableRow>
              <TableHead className="w-14">列</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>日期</TableHead>
              <TableHead>類型</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>帳戶</TableHead>
              <TableHead>分類 / 轉入</TableHead>
              <TableHead>對象</TableHead>
              <TableHead>訊息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.slice(0, PREVIEW_LIMIT).map((r) => {
              const s = STATUS[r.status]
              const d = r.data
              return (
                <TableRow key={r.row} className={cn(r.status === 'error' && 'bg-destructive/5')}>
                  <TableCell className="text-muted-foreground tabular-nums">{r.row}</TableCell>
                  <TableCell>
                    <span className={cn('flex items-center gap-1 whitespace-nowrap', s.className)}>
                      <s.icon className="size-3.5" /> {s.label}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{d?.date}</TableCell>
                  <TableCell className="whitespace-nowrap">{d && TX_TYPE_LABEL[d.type]}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{d?.amount && !Number.isNaN(Number(d.amount)) ? formatMoney(d.amount) : d?.amount}</TableCell>
                  <TableCell className="whitespace-nowrap">{d?.account}</TableCell>
                  <TableCell className="whitespace-nowrap">{d?.type === 'transfer' ? `→ ${d.to_account}` : d?.category}</TableCell>
                  <TableCell className="max-w-40 truncate">{d?.payee}</TableCell>
                  <TableCell className={cn('min-w-48 text-xs whitespace-normal', r.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                    {r.messages.join('；')}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {shown.length > PREVIEW_LIMIT && <p className="text-muted-foreground text-xs">只顯示前 {PREVIEW_LIMIT} 列（共 {shown.length} 列）</p>}
      <p className="text-muted-foreground text-xs">金額以帳戶幣別顯示</p>
    </div>
  )
}

function ImportCard({ canEdit }: { canEdit: boolean }) {
  const mutation = useImportTransactions()
  const [file, setFile] = useState<{ name: string; content: string; encoding: string } | null>(null)
  const [options, setOptions] = useState<ImportOptions>({ skip_duplicates: true, create_categories: true })
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)

  const runPreview = (content: string, opts: ImportOptions) => {
    setPreview(null)
    mutation.mutate({ content, dry_run: true, ...opts }, { onSuccess: setPreview })
  }
  const pick = async (f: File) => {
    setDone(null)
    if (f.size > IMPORT_LIMITS.maxBytes) {
      toast.error(`檔案超過 ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB`)
      return
    }
    const { text, encoding } = await readTextFile(f)
    setFile({ name: f.name, content: text, encoding })
    runPreview(text, options)
  }
  const changeOption = (patch: Partial<ImportOptions>) => {
    const next = { ...options, ...patch }
    setOptions(next)
    if (file) runPreview(file.content, next)
  }
  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    mutation.reset()
  }
  const commit = () =>
    mutation.mutate(
      { content: file!.content, dry_run: false, ...options },
      {
        onSuccess: (r) => {
          setDone(r)
          setPreview(null)
          setFile(null)
        },
      },
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>匯入收支（CSV）</CardTitle>
        <CardDescription>匯入銀行 / 信用卡對帳單或自行整理的收支。會先預覽並檢查每一列，確認後才寫入。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => saveFile(buildTransactionTemplate(), '收支匯入範本.csv', 'text/csv;charset=utf-8')}>
            <Download /> 下載範本
          </Button>
        </div>
        <FormatHelp />

        {!canEdit ? (
          <p className="text-muted-foreground text-sm">檢視者無法匯入資料。</p>
        ) : done ? (
          <div role="status" className="flex flex-col items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 font-medium">
              <CircleCheck className="size-5 text-emerald-600" /> 已匯入 {done.imported.toLocaleString()} 筆收支
            </p>
            <p className="text-muted-foreground text-sm">
              {[
                done.duplicates && `略過重複 ${done.duplicates} 筆`,
                done.errors && `略過錯誤 ${done.errors} 筆`,
                done.created_categories.length && `新增分類：${done.created_categories.join('、')}`,
              ]
                .filter(Boolean)
                .join('；') || '全部成功'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" asChild>
                <Link to="/transactions">查看收支</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                匯入其他檔案
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Switch id="opt-skip" checked={options.skip_duplicates} onCheckedChange={(v) => changeOption({ skip_duplicates: v })} />
                <Label htmlFor="opt-skip" className="font-normal">
                  略過與現有收支重複的資料
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="opt-create" checked={options.create_categories} onCheckedChange={(v) => changeOption({ create_categories: v })} />
                <Label htmlFor="opt-create" className="font-normal">
                  自動建立找不到的分類
                </Label>
              </div>
            </div>

            {!file ? (
              <FilePicker accept=".csv,.tsv,.txt,text/csv" label="選擇 CSV 檔" hint="或把檔案拖曳到這裡" onFile={pick} />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <FileUp className="text-muted-foreground size-4" />
                <span className="font-medium">{file.name}</span>
                <Badge variant="outline">{file.encoding}</Badge>
                <Button variant="ghost" size="sm" onClick={reset}>
                  重新選擇
                </Button>
              </div>
            )}

            {mutation.isPending && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                <Loader2 className="size-4 animate-spin" /> {mutation.variables?.dry_run ? '檢查中…' : '匯入中…'}
              </p>
            )}
            {mutation.error && (
              <p role="alert" className="text-destructive text-sm whitespace-pre-line">
                {errorMessage(mutation.error)}
              </p>
            )}

            {preview && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="資料列" value={preview.total} />
                  <Stat label="將匯入" value={preview.imported} tone="ok" />
                  <Stat label="重複" value={preview.duplicates} tone="warn" />
                  <Stat label="錯誤（會略過）" value={preview.errors} tone="error" />
                </div>
                {(preview.created_categories.length > 0 || preview.warnings.length > 0) && (
                  <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                    {preview.created_categories.length > 0 && <li>將新增分類：{preview.created_categories.join('、')}</li>}
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {preview.rows.length > 0 && <PreviewTable key={file?.name + JSON.stringify(options)} rows={preview.rows} />}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {preview.errors > 0 && <span className="text-muted-foreground text-sm">修正錯誤後重新選擇檔案，或直接匯入其餘資料</span>}
                  <Button onClick={commit} disabled={!preview.imported || mutation.isPending}>
                    匯入 {preview.imported.toLocaleString()} 筆
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── 還原備份 ──

function RestoreCard({ canEdit }: { canEdit: boolean }) {
  const mutation = useRestoreBackup()
  const [backup, setBackup] = useState<{ name: string; data: unknown } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const preview = mutation.data?.dry_run ? mutation.data : null

  const pick = async (f: File) => {
    setParseError(null)
    mutation.reset()
    let data: unknown
    try {
      data = JSON.parse((await readTextFile(f)).text)
    } catch {
      setBackup(null)
      setParseError('無法讀取：不是有效的 JSON 檔')
      return
    }
    setBackup({ name: f.name, data })
    mutation.mutate({ backup: data, dry_run: true })
  }
  const counts = (c: { accounts: number; categories: number; transactions: number }) =>
    `帳戶 ${c.accounts}、分類 ${c.categories}、收支 ${c.transactions.toLocaleString()} 筆`

  return (
    <Card>
      <CardHeader>
        <CardTitle>還原備份</CardTitle>
        <CardDescription>以「完整備份（JSON）」取代目前所有帳戶、分類與收支。建議先下載一份目前的備份。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canEdit ? (
          <p className="text-muted-foreground text-sm">檢視者無法還原備份。</p>
        ) : (
          <>
            <FilePicker accept=".json,application/json" label="選擇備份檔" hint="副檔名 .json，由本系統匯出" onFile={pick} />
            {backup && (
              <p className="flex items-center gap-2 text-sm">
                <FileUp className="text-muted-foreground size-4" /> <span className="font-medium">{backup.name}</span>
              </p>
            )}
            {mutation.isPending && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                <Loader2 className="size-4 animate-spin" /> 檢查中…
              </p>
            )}
            {(parseError || mutation.error) && (
              <p role="alert" className="text-destructive text-sm whitespace-pre-line">
                {parseError ?? errorMessage(mutation.error)}
              </p>
            )}
            {mutation.data && !mutation.data.dry_run && (
              <p role="status" className="flex items-center gap-2 text-sm font-medium">
                <CircleCheck className="size-4 text-emerald-600" /> 已還原：{counts(mutation.data.backup)}
              </p>
            )}
            {preview && (
              <div className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
                <div className="grid gap-1 sm:grid-cols-[6rem_1fr]">
                  <span className="text-muted-foreground">備份內容</span>
                  <span>
                    {counts(preview.backup)}
                    {preview.exported_at && <span className="text-muted-foreground">（{new Date(preview.exported_at).toLocaleString('zh-TW')} 匯出）</span>}
                  </span>
                  <span className="text-muted-foreground">目前資料</span>
                  <span>{counts(preview.current)}</span>
                </div>
                <div>
                  <Button variant="destructive" onClick={() => setConfirm(true)}>
                    還原並取代目前資料
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="還原備份並取代目前資料？"
        description={preview ? `目前的 ${counts(preview.current)} 會被刪除，換成備份中的資料，且無法復原。` : ''}
        confirmText="還原"
        destructive
        onConfirm={() => {
          setConfirm(false)
          mutation.mutate({ backup: backup!.data, dry_run: false }, { onSuccess: () => setBackup(null) })
        }}
      />
    </Card>
  )
}

export function DataPage() {
  const { canEdit } = useSession()
  return (
    <>
      <PageHeader title="匯入匯出" description="匯入 CSV 收支、匯出收支或完整備份、還原備份" />
      <ExportCard />
      <ImportCard canEdit={canEdit} />
      <RestoreCard canEdit={canEdit} />
    </>
  )
}
