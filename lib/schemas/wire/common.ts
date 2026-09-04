import { z } from "zod";
import { BATCH_BYPASSES_BAND as DOMAIN_BATCH_BYPASSES_BAND } from "@/lib/domain/approval";
import { LISTING_TAB_BY_STATUS } from "@/lib/domain/types";
import { ERROR_CODES, type ErrorCode } from "@/lib/http/errors";

/**
 * Shared wire primitives. Every schema here must be JSON-native — scripts/build-openapi.ts runs
 * z.toJSONSchema with `unrepresentable: "throw"`, so a z.date() or a transform fails the build
 * rather than quietly lying in the spec.
 */

/**
 * Money crosses the wire as a numeric string, never a float. Postgres numeric arrives as a string
 * and stays one until lib/domain/money.ts converts it to integer cents at the domain boundary.
 */
export const Money = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "money must be a numeric string with at most 2 decimals");

/** A percentage rate as a numeric string, e.g. margin_percent "15.0000". */
export const Rate = z.string().regex(/^-?\d+(\.\d{1,4})?$/);

/**
 * A rate that is a magnitude, not a signed offset.
 *
 * The approval thresholds are the design's 上限/下限 — both are distances from the approved price,
 * and `withinBand` reads them as positive magnitudes. A stored `"-10"` would make
 * `-diff * 100 <= approved * -10` false for every decrease, silently switching off the entire
 * lower half of the band with no error anywhere and no way to notice except prices never
 * auto-approving downward again.
 */
export const NonNegativeRate = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "rate must be a non-negative numeric string");

/**
 * RFC 3339. Displayed in Asia/Hong_Kong; never stored or transmitted in local time.
 *
 * `offset: true` is required, not cosmetic: Postgres and PostgREST emit `+00:00` rather than `Z`,
 * so the bare `z.iso.datetime()` would reject every timestamp the moment a real handler returns a
 * driver value. The mocks emit `toISOString()` (`Z`), which is exactly why this would otherwise
 * have stayed invisible until M5.
 */
export const Iso = z.iso.datetime({ offset: true });

export const Publishing = z.object({
  enabled: z.boolean(),
});

export const Pagination = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  per_page: z.number().int().min(1),
  total_pages: z.number().int().nonnegative(),
});

/** Sizes are rendered verbatim: "US 9", "US 7.5", "US 7Y", "EU 41". Never re-parsed for display. */
export const SizeLabel = z.string().min(1).max(16);

export const Sku = z.string().min(1).max(64);

export const ApprovalStatus = z.enum([
  "approved",
  "pending_new",
  "pending_price",
  "needs_margins",
  "rejected",
  "inactive",
]);

export const MarginSource = z.enum(["override", "group", "default"]);

export const ListingSourceSlot = z.enum(["stockx", "in_house"]);

export const EventSource = z.enum(["stockx", "google_sheet", "dashboard"]);

// ---------------------------------------------------------------------------
// Appended for the Phase 2 contract (FE-0). Everything above is the M2 seed.
// ---------------------------------------------------------------------------

/** Quantities are whole pairs. Zero is legal — sold out is a real state, not a missing value. */
export const Quantity = z.number().int().nonnegative();

export const Count = z.number().int().nonnegative();

export const MoneyRange = z.object({ min: Money, max: Money });
export const RateRange = z.object({ min: Rate, max: Rate });

/**
 * The full error union as a wire enum, for item-level failures inside a 200 response.
 *
 * Deliberately the *same* vocabulary as the HTTP envelope rather than a parallel one: Gap 19's bulk
 * response hides failures inside a success, and reusing the union means the frontend's exhaustive
 * ErrorCode → Chinese message map already covers them.
 */
export const ErrorCodeWire = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

/** Every list response's meta. `total` is required — the design prints 共 128 筆 in three places. */
export const ListMeta = Pagination.extend({ publishing: Publishing });

/** Screen 7's three tabs, and the product-level derivation of six listing statuses (Gap 4). */
export const ProductStatusTab = z.enum(["listed", "unlisted", "delisted"]);

/**
 * Gap 4, resolved. `pending_price` is a listing that is **live at its old approved price** while a
 * new one waits, so it belongs under 已上架 with a secondary indicator — never under 未上架. Getting
 * this backwards mislabels the most important rows in the product.
 *
 * The table itself lives in lib/domain/types.ts and is aliased here rather than restated: it is the
 * single edit point, and two copies of a reversible decision is one copy too many. The annotation
 * is the check that the domain's six statuses are exactly the wire enum's. `productTab()` beside it
 * derives Screen 7's product-level tab, so the three counts partition all six values and sum to 全部.
 */
export const LISTING_STATUS_TAB: Readonly<
  Record<z.infer<typeof ApprovalStatus>, z.infer<typeof ProductStatusTab>>
> = LISTING_TAB_BY_STATUS;

/**
 * Gap 1, resolved: a human-initiated batch (group apply, membership change, group-deletion
 * reassignment, products/bulk assign_group) **is** the approval and bypasses the ±band, exactly as
 * §5 already grants POST /listings/:id/price. §4's 分組批次更新 actor label only makes sense this way.
 *
 * Re-exported from lib/domain/approval.ts, which owns it. Reversing the decision is that one line
 * plus the copy it gates: with it false, group apply files every out-of-band size into the queue
 * and `would_hold_for_approval` stops being informational.
 */
export const BATCH_BYPASSES_BAND: boolean = DOMAIN_BATCH_BYPASSES_BAND;

/** Direction of a price delta. `flat` is a real answer; a null delta is a different one (Gap 6). */
export const DeltaDirection = z.enum(["up", "down", "flat"]);

/**
 * `price_updates.outcome` across both engines. The first eight are legacy rows the old RPC wrote and
 * cannot be rewritten — the log is append-only — which is why `engine` exists to disambiguate them.
 */
export const PriceUpdateOutcome = z.enum([
  "new_listing",
  "price_change",
  "quantity_change",
  "no_change",
  "error",
  "cost_change",
  "margin_change",
  "listing_price_change",
  "held_for_approval",
  "auto_approved",
  "superseded",
  "needs_margins",
  "unknown_sku",
  "invalid_currency",
  "missing_cost",
  "invalid_size",
]);

/** Five of the outcome values above mean different things per era. Never read one without the other. */
export const PricingEngine = z.enum(["v1", "v2"]);

/**
 * What a write did to one listing, reported per-listing in a mutation response (Gap 24).
 *
 * Deliberately NOT named DecisionOutcome: `lib/domain/approval.ts` exports a type by that name with
 * different members, and two same-named exports in one repo is an import footgun for the M5 ingest
 * work. This is also not `PriceUpdateOutcome` — `skipped` is a `price_updates.status` value, not one
 * of the widened `price_updates_outcome_check` values, so the two vocabularies must not be conflated.
 * `mocks/effects.ts` holds the (lossy) mapping from the domain outcome to this one.
 */
export const ListingWriteOutcome = z.enum([
  "auto_approved",
  "held_for_approval",
  "needs_margins",
  "no_change",
  "skipped",
]);

/**
 * Screen 1's 狀態 column. The design draws three values; Gap 9 adds the four it cannot express.
 * Always rendered from this server-decided field, never re-derived from the Δ the client just
 * formatted — a row can read +10.0% and still be held because the true figure was 10.04%.
 */
export const ApprovalRowStatus = z.enum([
  "above_threshold",
  "below_threshold",
  "within_band",
  "pending_new",
  "needs_margins",
  "rejected",
  "superseded",
]);

export const JobStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "deferred",
]);

export const JobKind = z.enum(["group_apply", "settings_recompute", "group_rule_recompute"]);

/**
 * `job_items.reason`. Machine-readable per failed size even though the design's state E shows only
 * the SKU/size list — `missing_cost` is the one failure a user can act on, so it earns a tooltip.
 */
export const JobItemReason = z.enum([
  "missing_cost",
  "needs_margins",
  "listing_inactive",
  "shopify_error",
  "internal_error",
]);

export const ChangeType = z.enum([
  "cost",
  "margin_percent",
  "margin_fixed",
  "listing_price",
  "quantity",
  "listing_status",
  "margin_source",
  "manual_price",
]);

/** Shared by group apply, its preview and the product-level 套用至所有尺寸 (Gap 11). */
export const ApplyScope = z.enum(["all", "group_rule_only", "overridden_only"]);

export const MarginSummaryKind = z.enum(["uniform", "mixed", "none"]);

/** Crawl runs come from the two ingest transports only; `dashboard` is not a crawl. */
export const CrawlSource = z.enum(["stockx", "google_sheet"]);
export const CrawlTrigger = z.enum(["cron", "manual"]);

/** ok / stale / never, used separately for the Apps Script trigger and for the worker (Screen 2). */
export const Liveness = z.enum(["ok", "stale", "never"]);
