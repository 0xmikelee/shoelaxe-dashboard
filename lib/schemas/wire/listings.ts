import { z } from "zod";
import {
  ApprovalStatus,
  ChangeType,
  Count,
  ListingWriteOutcome,
  ErrorCodeWire,
  EventSource,
  Iso,
  JobItemReason,
  ListMeta,
  ListingSourceSlot,
  MarginSource,
  Money,
  Quantity,
  Rate,
  SizeLabel,
  Sku,
} from "./common";

/**
 * A listing is one product+size. Screens 1, 3 and 8 all render it, so it is defined once here and
 * embedded rather than re-shaped per screen.
 */

/**
 * One `listing_sources` row. Screen 8 draws two cards from this array — and Gap 31 is why the array
 * is the truth rather than a constant: a listing may have only one source, and 套用於全部 2 個來源
 * must count real rows.
 */
export const ListingSourceWire = z.object({
  source: ListingSourceSlot,
  cost: Money.nullable(),
  /**
   * When this source last supplied a *cost*, not when it was last touched. base_cost ownership is
   * decided on this field: `last_synced_at` also moves on a quantity-only sync, which would let a
   * StockX quantity ping steal ownership from a fresher in-house cost.
   */
  cost_at: Iso.nullable(),
  /** Gap 29: the StockX cost *is* the lowest ask, so 市場最低價 is a duplicate. This is 較上次. */
  previous_cost: Money.nullable(),
  previous_cost_at: Iso.nullable(),
  quantity: Quantity,
  last_source_ref: z.string().nullable(),
  last_synced_at: Iso.nullable(),
  /**
   * False for `stockx`. The read-only source card must render no editable control at all; the
   * `source_read_only` error exists only as a backstop for a frontend bug.
   */
  editable: z.boolean(),
});

export const ListingWire = z.object({
  id: z.uuid(),
  product_sku: Sku,
  product_name: z.string(),
  name_zh: z.string().nullable(),
  size: SizeLabel,
  currency: z.literal("HKD"),
  approval_status: ApprovalStatus,

  base_cost: Money.nullable(),
  /** 來自最新價格變動 has to name which source won; a base matching neither source is a data bug. */
  base_cost_source: ListingSourceSlot.nullable(),
  base_cost_at: Iso.nullable(),

  /** The resolved margins actually used, after override → group → system default (§5). */
  margin_percent: Rate.nullable(),
  margin_fixed: Money.nullable(),
  margin_source: MarginSource.nullable(),
  /** The per-size override as stored. Null means "no override", which is what 已覆寫 keys off. */
  margin_override_percent: Rate.nullable(),
  margin_override_fixed: Money.nullable(),

  /**
   * Gap 2. `raw_price` is the formula result before x49/x99 rounding, `approved_price` is after.
   * Carrying both is what stops Screens 2, 3 and 8 each re-implementing the rounding rule in
   * JavaScript and drifting from the server that made the band decision.
   */
  raw_price: Money.nullable(),
  rounding_applied: z.boolean(),

  approved_price: Money.nullable(),
  approved_at: Iso.nullable(),
  previous_approved_price: Money.nullable(),
  previous_approved_at: Iso.nullable(),

  pending_price: Money.nullable(),
  pending_since: Iso.nullable(),
  pending_update_id: z.uuid().nullable(),

  /**
   * Gap 30: 對自有成本毛利 is a markup on cost (330/1200 = 27.5%), not a gross margin (330/1530).
   * Pinned server-side so the two are not confused again. Null when the in-house cost is null or
   * zero; `amount` may be negative when the selling price is below the in-house cost.
   */
  in_house_markup: z.object({ amount: Money, percent: Rate }).nullable(),

  sources: z.array(ListingSourceWire),
  updated_at: Iso,
});

export const ListingsWire = z.array(ListingWire);

/**
 * One `price_history` row, product-scoped so `GET /listings/{id}/history` and Gap 21's
 * `GET /products/{sku}/history` return the identical shape — Screen 8's bottom table has a 尺寸
 * column and a 全部尺寸 filter, which is only expressible if size rides on the row.
 *
 * `previous_value`/`new_value` are the display pair for 變更內容 and carry whatever `change_type`
 * names: a rate ("15.0000"), money ("150.00") or a status. `previous_price`/`price` are always the
 * listing's selling price, which is what 售價變化 and the six-bar chart read.
 */
export const HistoryRowWire = z.object({
  id: z.uuid(),
  listing_id: z.uuid(),
  product_sku: Sku,
  size: SizeLabel,
  changed_at: Iso,
  change_type: ChangeType,
  source: EventSource,
  /** 系統自動 · 爬取更新 · 分組批次更新 · or the user's name. Rendered verbatim. */
  actor_label: z.string(),
  actor_id: z.uuid().nullable(),
  previous_value: z.string().nullable(),
  new_value: z.string().nullable(),
  previous_price: Money.nullable(),
  price: Money.nullable(),
  previous_quantity: Quantity.nullable(),
  quantity: Quantity.nullable(),
  delta: Money.nullable(),
  delta_percent: Rate.nullable(),
});

export const HistoryListWire = z.array(HistoryRowWire);

/**
 * GET /listings/{id}. §6.2 also promised an "inbound log (last 20)"; Gap 32 found it has no
 * consumer, so it is not here — an unread field is a field that rots.
 */
export const ListingDetailWire = ListingWire.extend({
  group_id: z.uuid(),
  group_name: z.string(),
  /** The last 20 rows, newest first. The full set is the paged history endpoint. */
  history: z.array(HistoryRowWire),
});

export const HistoryListMetaWire = ListMeta.extend({
  /** The sizes present in the unfiltered set, for the 全部尺寸 selector. Sorted by the size collator. */
  sizes: z.array(SizeLabel),
});

/**
 * Gap 24. A write touching several sizes is transactional, so there is no partial-failure state —
 * but the §5 decision differs per listing, and Screen 8 has to say 「3 個尺寸已更新，2 個尺寸的新售價
 * 需審核」. That sentence is not derivable from a 200.
 */
export const ListingOutcomeWire = z.object({
  listing_id: z.uuid(),
  size: SizeLabel,
  outcome: ListingWriteOutcome,
  approval_status: ApprovalStatus,
  approved_price: Money.nullable(),
  pending_price: Money.nullable(),
  raw_price: Money.nullable(),
  rounding_applied: z.boolean(),
  reason: JobItemReason.nullable(),
});

/** POST /listings/bulk-approve. Partial by nature, so it reports per id rather than a bare count. */
export const BulkListingResultWire = z.object({
  ok_count: Count,
  failed_count: Count,
  results: z.array(
    z.object({
      listing_id: z.uuid(),
      size: SizeLabel,
      ok: z.boolean(),
      error_code: ErrorCodeWire.nullable(),
    }),
  ),
});

export type Listing = z.infer<typeof ListingWire>;
export type ListingSource = z.infer<typeof ListingSourceWire>;
export type ListingDetail = z.infer<typeof ListingDetailWire>;
export type HistoryRow = z.infer<typeof HistoryRowWire>;
export type HistoryListMeta = z.infer<typeof HistoryListMetaWire>;
export type ListingOutcome = z.infer<typeof ListingOutcomeWire>;
export type BulkListingResult = z.infer<typeof BulkListingResultWire>;
