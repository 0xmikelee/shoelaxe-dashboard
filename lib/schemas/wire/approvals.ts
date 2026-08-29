import { z } from "zod";
import {
  ApprovalRowStatus,
  ApprovalStatus,
  Count,
  DeltaDirection,
  EventSource,
  Iso,
  Money,
  PriceUpdateOutcome,
  PricingEngine,
  Rate,
  SizeLabel,
  Sku,
} from "./common";

/**
 * Gap 6. §6.2 promised "product, SKU, size, live price, new price, Δ%, pending_since"; the design
 * drew 最新爬取價格 and 上次爬取價, which are *costs*, and no current-price column at all. The row
 * therefore carries both pairs, and Δ belongs to the price pair — never to the two costs.
 */
export const ApprovalRowWire = z.object({
  update_id: z.uuid(),
  listing_id: z.uuid(),
  product_sku: Sku,
  product_name: z.string(),
  name_zh: z.string().nullable(),
  size: SizeLabel,
  source: EventSource,

  /** The cost that arrived, and the previous cost **from the same source** with its timestamp. */
  cost: Money,
  previous_cost: Money.nullable(),
  previous_cost_at: Iso.nullable(),

  /**
   * The live price (`approved_price`, what Shopify would show) and the computed candidate. Both are
   * nullable: `pending_new` has never had an approved price, and `approved_price = 0` is a real row
   * that renders 「—」 as the explicit division guard — a different fact from null, not the same one.
   */
  approved_price: Money.nullable(),
  new_price: Money.nullable(),
  /** Gap 2, so the queue can show 「… = HK$1,530 → HK$1,549（尾數進位）」 without re-rounding. */
  raw_price: Money.nullable(),
  rounding_applied: z.boolean(),

  /**
   * `delta_percent` is the one-decimal display figure; `delta_percent_exact` is the full-precision
   * value the band decision was actually made on. A row can read +10.0% and still be held because
   * the true figure was 10.04% — so never re-derive Δ from two rounded money strings.
   */
  delta_percent: Rate.nullable(),
  delta_percent_exact: Rate.nullable(),
  delta_direction: DeltaDirection.nullable(),

  /** Both thresholds as they stood when this decision was made, not as they stand now. */
  threshold_up_percent: Rate,
  threshold_down_percent: Rate,

  /** The server's stored decision. The badge is read from here, never from the Δ just rendered. */
  status: ApprovalRowStatus,
  /** The listing's current state, which is what gates 確認 / 拒絕 versus 無需處理. */
  approval_status: ApprovalStatus,
  outcome: PriceUpdateOutcome.nullable(),
  /** Five legacy outcome values mean different things per era; /approvals reads across both. */
  engine: PricingEngine,

  /** Kept from the *oldest* unapproved update for this listing, not from this row. */
  pending_since: Iso.nullable(),
  /** When the source observed it, which is not when we received it — retried chunks arrive late. */
  observed_at: Iso.nullable(),
  created_at: Iso,
});

export const ApprovalsListWire = z.array(ApprovalRowWire);

/**
 * Screen 1's four metric cards. Gap 8: these are **lifetime** totals with a 今日 delta and do not
 * follow the table filters — otherwise 通過率 changes as you type. `qk.approvals.stats()` takes no
 * filter argument, which is that rule encoded in a cache key rather than remembered.
 */
export const ApprovalStatsWire = z.object({
  total_crawled: Count,
  crawled_today: Count,
  pending: Count,
  confirmed: Count,
  pass_rate: Rate,
  rejected: Count,
  rejection_rate: Rate,
  /** Oldest unapproved `pending_since` across the queue; null when nothing is waiting. */
  oldest_pending_since: Iso.nullable(),
});

export type ApprovalRow = z.infer<typeof ApprovalRowWire>;
export type ApprovalStats = z.infer<typeof ApprovalStatsWire>;
