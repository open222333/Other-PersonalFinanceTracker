/** 分類管理（設定頁）：收入 / 支出各一棵兩層樹，可新增、改名、移動、刪除 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { applyServerErrors, isValidationError } from '@/lib/form-errors'
import { errorMessage } from '@/lib/query'

import { useCategories, useDeleteCategory, useSaveCategory } from './api'
import { buildCategoryTree, CATEGORY_KINDS, categoryInput, KIND_LABEL, type Category, type CategoryInput, type CategoryKind } from './schema'

const NO_PARENT = '__none__'

interface Editing {
  category?: Category
  kind: CategoryKind
  parent_id: string | null
}

function CategoryFormDialog({ editing, onClose, categories }: { editing: Editing | null; onClose: () => void; categories: Category[] }) {
  const save = useSaveCategory()
  const form = useForm<CategoryInput>({ resolver: zodResolver(categoryInput), defaultValues: { name: '', kind: 'expense', parent_id: null } })
  const { errors } = form.formState
  const c = editing?.category
  const hasChildren = !!c && categories.some((x) => x.parent_id === c.id)
  const parents = editing ? categories.filter((x) => x.kind === editing.kind && !x.parent_id && x.id !== c?.id) : []

  useEffect(() => {
    if (!editing) return
    save.reset()
    form.reset({ name: c?.name ?? '', kind: editing.kind, parent_id: c ? c.parent_id : editing.parent_id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const onSubmit = form.handleSubmit((data) =>
    save.mutate(
      { id: c?.id, data: c ? { name: data.name, parent_id: data.parent_id } : data },
      { onSuccess: onClose, onError: (e) => applyServerErrors(e, form.setError, ['name', 'parent_id']) },
    ),
  )

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{c ? '編輯分類' : `新增${editing ? KIND_LABEL[editing.kind] : ''}分類`}</DialogTitle>
          <DialogDescription>{c ? `已有 ${c.transaction_count} 筆收支使用此分類` : '分類最多兩層'}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">名稱</Label>
            <Input id="cat-name" autoComplete="off" aria-invalid={!!errors.name} {...form.register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-parent">上層分類</Label>
            <Controller
              control={form.control}
              name="parent_id"
              render={({ field }) => (
                <Select value={field.value ?? NO_PARENT} onValueChange={(v) => field.onChange(v === NO_PARENT ? null : v)} disabled={hasChildren}>
                  <SelectTrigger id="cat-parent" className="w-full" aria-invalid={!!errors.parent_id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>（無，作為第一層）</SelectItem>
                    {parents.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {hasChildren && <p className="text-muted-foreground text-xs">此分類有子分類，只能留在第一層</p>}
            {errors.parent_id && <p className="text-destructive text-xs">{errors.parent_id.message}</p>}
          </div>
          {save.error && !isValidationError(save.error) && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(save.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              儲存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  c,
  count,
  depth,
  canEdit,
  onAddChild,
  onEdit,
  onDelete,
}: {
  c: Category
  /** 顯示的筆數（第一層含子分類） */
  count: number
  depth: 0 | 1
  canEdit: boolean
  onAddChild?: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="hover:bg-muted/50 group flex h-9 items-center gap-2 rounded-md px-2 text-sm" style={{ paddingLeft: depth ? 28 : 8 }}>
      <span className={depth ? '' : 'font-medium'}>{c.name}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{count} 筆</span>
      {canEdit && (
        <div className="ml-auto flex opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {onAddChild && (
            <Button variant="ghost" size="icon-sm" aria-label={`在「${c.name}」底下新增子分類`} onClick={onAddChild}>
              <Plus />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`編輯「${c.name}」`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`刪除「${c.name}」`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  )
}

export function CategoryManager({ canEdit }: { canEdit: boolean }) {
  const q = useCategories()
  const del = useDeleteCategory()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)
  const categories = q.data ?? []

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>收支分類</CardTitle>
        <CardDescription>最多兩層；已被使用或有子分類的分類無法刪除</CardDescription>
      </CardHeader>
      <CardContent>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {CATEGORY_KINDS.map((kind) => (
              <section key={kind} aria-label={`${KIND_LABEL[kind]}分類`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-sm font-semibold">{KIND_LABEL[kind]}</h3>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setEditing({ kind, parent_id: null })}>
                      <Plus /> 新增{KIND_LABEL[kind]}分類
                    </Button>
                  )}
                </div>
                {q.isLoading
                  ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : buildCategoryTree(categories, kind).map((p) => (
                      <div key={p.id}>
                        <Row
                          c={p}
                          count={p.transaction_count + p.children.reduce((n, ch) => n + ch.transaction_count, 0)}
                          depth={0}
                          canEdit={canEdit}
                          onAddChild={() => setEditing({ kind, parent_id: p.id })}
                          onEdit={() => setEditing({ kind, parent_id: p.parent_id, category: p })}
                          onDelete={() => setToDelete(p)}
                        />
                        {p.children.map((ch) => (
                          <Row
                            key={ch.id}
                            c={ch}
                            count={ch.transaction_count}
                            depth={1}
                            canEdit={canEdit}
                            onEdit={() => setEditing({ kind, parent_id: ch.parent_id, category: ch })}
                            onDelete={() => setToDelete(ch)}
                          />
                        ))}
                      </div>
                    ))}
              </section>
            ))}
          </div>
        )}
      </CardContent>

      <CategoryFormDialog editing={editing} onClose={() => setEditing(null)} categories={categories} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`刪除分類「${toDelete?.name ?? ''}」？`}
        description="刪除後無法復原。"
        confirmText="刪除"
        destructive
        onConfirm={() => {
          del.mutate(toDelete!)
          setToDelete(null)
        }}
      />
    </Card>
  )
}

