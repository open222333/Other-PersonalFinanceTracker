import { z } from 'zod'

export const CATEGORY_KINDS = ['expense', 'income'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]
export const KIND_LABEL: Record<CategoryKind, string> = { expense: '支出', income: '收入' }

export const categoryInput = z.object({
  name: z.string().trim().min(1, '請輸入名稱').max(30, '最多 30 字'),
  kind: z.enum(CATEGORY_KINDS),
  /** null = 第一層；分類最多兩層 */
  parent_id: z.string().nullable(),
})

export type CategoryInput = z.infer<typeof categoryInput>

export interface Category extends CategoryInput {
  id: string
  sort_order: number
  transaction_count: number
  created_at: string
  updated_at: string
}

export interface CategoryNode extends Category {
  children: Category[]
}

/** 平面列表 → 兩層樹（依 sort_order 排序） */
export function buildCategoryTree(categories: Category[], kind: CategoryKind): CategoryNode[] {
  const byOrder = (a: Category, b: Category) => a.sort_order - b.sort_order
  return categories
    .filter((c) => c.kind === kind && !c.parent_id)
    .sort(byOrder)
    .map((c) => ({ ...c, children: categories.filter((x) => x.parent_id === c.id).sort(byOrder) }))
}

export interface CategoryOption {
  value: string
  /** 完整名稱，例如「餐飲 › 午餐」 */
  label: string
  /** 選單內顯示的名稱（子分類只顯示自己的名稱並縮排） */
  short: string
  depth: 0 | 1
}

/** 下拉選單 / 篩選用選項：父分類在前、子分類接在後面 */
export function categoryOptions(categories: Category[], kind?: CategoryKind): CategoryOption[] {
  return (kind ? [kind] : CATEGORY_KINDS).flatMap((k) =>
    buildCategoryTree(categories, k).flatMap((p) => [
      { value: p.id, label: p.name, short: p.name, depth: 0 as const },
      ...p.children.map((c) => ({ value: c.id, label: `${p.name} › ${c.name}`, short: c.name, depth: 1 as const })),
    ]),
  )
}

/** 「餐飲 › 午餐」 */
export function categoryPath(map: Map<string, Category>, id: string | null | undefined): string {
  if (!id) return ''
  const c = map.get(id)
  if (!c) return '（已刪除的分類）'
  const parent = c.parent_id ? map.get(c.parent_id) : undefined
  return parent ? `${parent.name} › ${c.name}` : c.name
}
