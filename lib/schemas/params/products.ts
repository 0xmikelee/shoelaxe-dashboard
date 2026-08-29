import { z } from "zod";
import { ApplyScope, Money, ProductStatusTab, Rate, Sku } from "@/lib/schemas/wire/common";
import { PageQuery, Search, SortOrder, csv } from "./common";
import { InHouseSourceBody } from "./listings";

/** 排序：最新匯入 is the default. An edit is not an import, so it does not sort on updated_at. */
export const ProductsSort = z
  .enum(["last_imported_at", "name", "sku", "size_count", "price", "updated_at"])
  .default("last_imported_at");

export const ProductsFilter = z.object({
  q: Search,
  /** `all` is the 全部 tab. Tab counts in `meta.counts` deliberately ignore this parameter. */
  status: z.enum(["all", ...ProductStatusTab.options]).default("all"),
  group_id: z.uuid().optional(),
  /**
   * Gap 17. Screen 5's 其他分組 filter, comma-joined. Note 未分組 **does not exist** — every product
   * is in exactly one group and 預設分組 is the catch-all, so that filter label is a lie and the
   * accurate one is 預設分組.
   */
  exclude_group_id: csv(z.uuid()).optional().describe("Comma-joined group ids to exclude."),
  sort: ProductsSort,
  order: SortOrder.default("desc"),
});

export const ProductsQuery = ProductsFilter.extend(PageQuery.shape);

/** 匯出清單 uses the identical filters, minus paging — the export is of the filter, not the page. */
export const ProductsExportQuery = ProductsFilter;

/**
 * The Screen 8 draft, committed transactionally in one call.
 *
 * The tri-state rule is the whole subtlety: **absent** means untouched, **null** means clear, and a
 * value means set. The backend distinguishes them with `Object.hasOwn`, so a client draft that
 * models "cleared" as `undefined` will serialise it away and the reset silently will not happen.
 */
export const ProductListingPatch = z.object({
  id: z.uuid(),
  /** Null clears the per-size override back to the group rule. */
  margin_override: z
    .object({
      margin_percent: Rate.nullable().optional(),
      margin_fixed: Money.nullable().optional(),
    })
    .nullable()
    .optional(),
  in_house: InHouseSourceBody.optional(),
});
export type ProductListingPatch = z.infer<typeof ProductListingPatch>;

export const ProductPatchBody = z.object({
  /** `products.name`, the EN name behind Screen 9's 英文名稱; §6.2 calls the field `name_en`. */
  name: z.string().trim().min(1).max(120).optional(),
  name_zh: z.string().trim().min(1).max(120).optional(),
  content: z
    .object({
      title: z.string().max(255),
      body_html: z.string().max(50_000),
      vendor: z.string().max(120),
      product_type: z.string().max(120),
      tags: z.array(z.string().max(60)).max(50),
    })
    .partial()
    .optional(),
  /** 已上架 / 已下架 only. `unlisted` is derived from listing state and is not settable. */
  status: z.enum(["listed", "delisted"]).optional(),
  /**
   * Image ids in display order, primary first. Here as well as on /images/reorder so the draft
   * commits as one transaction — the design summarises 上架圖片順序已調整 inside the same save bar.
   */
  image_order: z.array(z.uuid()).max(8).optional(),
  listings: z.array(ProductListingPatch).max(64).optional(),
});

/**
 * Gap 11. 套用至所有尺寸 has no endpoint that fits: /groups/{id}/apply is group-scoped and
 * /listings/{id}/margins is one size. N is small, so this stays synchronous — and it reuses the
 * group-apply scope vocabulary so both drive the same component.
 */
export const ProductMarginsBody = z.object({
  scope: ApplyScope,
  margin_percent: Rate.optional(),
  margin_fixed: Money.optional(),
});

/**
 * Gap 19. §6.2 admits the 批次操作 menu is undefined in the design; it is defined here as
 * 指派分組 / 下架 / 重新上架, operating on the **selection** and never on the whole filter.
 */
export const ProductsBulkBody = z.object({
  skus: z.array(Sku).min(1).max(200),
  action: z.enum(["assign_group", "deactivate", "reactivate"]),
  /** Required when action is `assign_group`, ignored otherwise. */
  group_id: z.uuid().optional(),
});

export const ProductImagePatchBody = z.object({
  is_primary: z.literal(true).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const ProductImagesReorderBody = z.object({
  image_ids: z.array(z.uuid()).min(1).max(8),
});

export type ProductsFilters = z.infer<typeof ProductsQuery>;
export type ProductPatch = z.infer<typeof ProductPatchBody>;
