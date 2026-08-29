import { z } from "zod";
import { ChangeType, Money, Quantity, Rate, SizeLabel, Sku } from "@/lib/schemas/wire/common";
import { ExportFormat, IsoDateOrDateTime, PageQuery, SortOrder, csv } from "./common";

/**
 * Gap 20. The six-bar chart wants the newest N price changes; the table below it wants a page of
 * everything. One endpoint serves both: `change_type` narrows, `limit` takes the newest N and
 * bypasses paging.
 */
export const HistoryQuery = PageQuery.extend({
  change_type: csv(ChangeType).optional().describe("Comma-joined change types."),
  from: IsoDateOrDateTime.optional(),
  to: IsoDateOrDateTime.optional(),
  order: SortOrder.default("desc"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Return the newest N rows and ignore paging. Used by the 近 6 次變更 chart."),
  format: ExportFormat,
});

/** Gap 21: the product-scoped variant, which is the one Screen 8's bottom table actually needs. */
export const ProductHistoryQuery = HistoryQuery.extend({
  size: SizeLabel.optional().describe("Omit for 全部尺寸."),
});

/**
 * PATCH /listings/{id}/margins. **Null clears the override**; an absent key leaves it alone. The two
 * are different operations and conflating them silently drops 重設為分組規則.
 */
export const ListingMarginsBody = z.object({
  margin_percent: Rate.nullable().optional(),
  margin_fixed: Money.nullable().optional(),
});

/**
 * POST /listings/{id}/price — §5's manual adjustment. It bypasses the band because a human doing it
 * deliberately *is* the approval, which is why the UI must name the bypass in its confirmation.
 */
export const ListingPriceBody = z.object({
  price: Money,
  reason: z.string().trim().max(500).optional(),
});

export const ListingRejectBody = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** Either an explicit set of ids, or 「核准此產品所有尺寸」. Exactly one must be present. */
export const BulkApproveBody = z.object({
  listing_ids: z.array(z.uuid()).min(1).max(500).optional(),
  product_sku: Sku.optional(),
});

/** The in-house source card. StockX fields are absent by construction, not merely rejected. */
export const InHouseSourceBody = z.object({
  cost: Money.optional(),
  quantity: Quantity.optional(),
});

export type HistoryFilters = z.infer<typeof HistoryQuery>;
export type ProductHistoryFilters = z.infer<typeof ProductHistoryQuery>;
