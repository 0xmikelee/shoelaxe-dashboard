import { z } from "zod";
import {
  Count,
  ErrorCodeWire,
  Iso,
  ListMeta,
  MarginSummaryKind,
  Money,
  MoneyRange,
  ProductStatusTab,
  Quantity,
  Rate,
  RateRange,
  Sku,
} from "./common";
import { ListingOutcomeWire, ListingWire } from "./listings";
import { GroupRefWire } from "./groups";

/**
 * Gap 13/31, one aggregate object shared by Screens 3, 5 and 7 rather than three near-identical
 * summaries. Every range is null when the product has no listing that can produce it, which is a
 * different statement from a range of zero.
 */
export const AggregatesWire = z.object({
  size_count: Count,
  in_stock_size_count: Count,
  /**
   * Gap 23. **In-house only.** StockX quantity is a constant 1 per size, so summing both sources
   * overstates stock by exactly the size count — a wrong number that looks entirely plausible. The
   * name is the guard: 總庫存 must never be rendered from anything else.
   */
  total_in_house_quantity: Quantity,
  /** Gap 12: cost is per-listing, so the product shows a range that collapses when min === max. */
  cost: MoneyRange.nullable(),
  price: MoneyRange.nullable(),
  margin_percent: RateRange.nullable(),
  margin_fixed: MoneyRange.nullable(),
  /** Drives the 已覆寫 / 使用系統預設 badges. Sums to size_count. */
  margin_source_mix: z.object({
    override: Count,
    group: Count,
    default: Count,
    none: Count,
  }),
  override_count: Count,
  /** The 尺寸差異 badge: margins or prices differ across sizes. */
  has_size_variance: z.boolean(),
  /** Gap 31: distinct `listing_sources` slots across the product — 1 or 2, never assumed. */
  source_count: Count,
});

/** Drives Screen 7's 利潤 cell, including its 「—」 (kind `none`), without the client guessing. */
export const MarginSummaryWire = z.object({
  kind: MarginSummaryKind,
  /** Set only when kind is `uniform`. */
  percent: Rate.nullable(),
  fixed: Money.nullable(),
  /** Set only when kind is `mixed`: 10–20%, HK$100–200. */
  percent_range: RateRange.nullable(),
  fixed_range: MoneyRange.nullable(),
});

export const ProductImageWire = z.object({
  id: z.uuid(),
  url: z.url(),
  sort_order: z.number().int().nonnegative(),
  is_primary: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  created_at: Iso,
});

/** Every image mutation answers with the whole gallery, so a rolled-back drag has one thing to restore. */
export const ProductImagesWire = z.array(ProductImageWire);

export const ProductRowWire = z.object({
  sku: Sku,
  name: z.string(),
  name_zh: z.string().nullable(),
  brand: z.string().nullable(),
  group: GroupRefWire,
  /** Derived from the six listing statuses by productTab() in lib/domain/types.ts (Gap 4). */
  status: ProductStatusTab,
  primary_image_url: z.url().nullable(),
  aggregates: AggregatesWire,
  margin_summary: MarginSummaryWire,
  /** 排序：最新匯入 sorts on this, not on updated_at — an edit is not an import. */
  last_imported_at: Iso.nullable(),
  updated_at: Iso,
  created_at: Iso,
});

export const ProductsListWire = z.array(ProductRowWire);

/** Screen 7's tab counts partition all six listing statuses and sum to `all`. */
export const ProductTabCountsWire = z.object({
  all: Count,
  listed: Count,
  unlisted: Count,
  delisted: Count,
});

export const ProductsListMetaWire = ListMeta.extend({
  /** Respects `q` and `group_id` and deliberately **ignores** `status` — the tabs must not move. */
  counts: ProductTabCountsWire,
});

export const ProductDetailWire = z.object({
  sku: Sku,
  name: z.string(),
  name_zh: z.string().nullable(),
  title: z.string().nullable(),
  body_html: z.string().nullable(),
  vendor: z.string().nullable(),
  product_type: z.string().nullable(),
  tags: z.array(z.string()),
  /**
   * Gap 27: Screen 9's 唯讀參考 field, stamped during ingest from the last `product_name` on a
   * stockx update. Its sibling 內部備註·別名 is cut — it has no column and no write path.
   */
  stockx_name: z.string().nullable(),
  group: GroupRefWire,
  status: ProductStatusTab,
  images: ProductImagesWire,
  listings: z.array(ListingWire),
  aggregates: AggregatesWire,
  margin_summary: MarginSummaryWire,
  last_imported_at: Iso.nullable(),
  updated_at: Iso,
  created_at: Iso,
});

/**
 * PATCH /products/{sku} and POST /products/{sku}/margins (Gap 11) answer identically: the write is
 * transactional, but the §5 decision differs per listing and the UI has to report the mix (Gap 24).
 */
export const ProductWriteResultWire = z.object({
  sku: Sku,
  updated_count: Count,
  held_count: Count,
  needs_margins_count: Count,
  listings: z.array(ListingOutcomeWire),
});

/**
 * Gap 19. Twelve SKUs with three deactivated listings is a 200 that is *partly* a failure; treating
 * the status code as the answer silently loses them, so the per-SKU result is mandatory.
 */
export const ProductBulkResultWire = z.object({
  ok_count: Count,
  failed_count: Count,
  results: z.array(
    z.object({ sku: Sku, ok: z.boolean(), error_code: ErrorCodeWire.nullable() }),
  ),
});

export type Aggregates = z.infer<typeof AggregatesWire>;
export type MarginSummary = z.infer<typeof MarginSummaryWire>;
export type ProductImage = z.infer<typeof ProductImageWire>;
export type ProductRow = z.infer<typeof ProductRowWire>;
export type ProductDetail = z.infer<typeof ProductDetailWire>;
export type ProductsListMeta = z.infer<typeof ProductsListMetaWire>;
export type ProductTabCounts = z.infer<typeof ProductTabCountsWire>;
export type ProductWriteResult = z.infer<typeof ProductWriteResultWire>;
export type ProductBulkResult = z.infer<typeof ProductBulkResultWire>;
