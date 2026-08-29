import { computeSellingPrice, deltaPercent, withinBand } from "@/lib/domain/pricing";
import {
  assertNever,
  DomainError,
  type ApprovalBand,
  type ApprovalStatus,
  type MarginSource,
  type Outcome,
} from "@/lib/domain/types";
import type { ResolvedMargins } from "@/lib/domain/margins";

/**
 * API-GAPS Gap 1, taking the recommended answer: a human-initiated batch — group apply, group
 * membership change, group-deletion reassignment, `products/bulk assign_group` — IS the approval and
 * bypasses the ±band, exactly as §5 already grants `POST /listings/:id/price`. §4's 分組批次更新 actor
 * label has no other reading, and Screen 4's success state reports the new average price as applied.
 *
 * Reversing the decision is this one line: with it false a group apply files every out-of-band size
 * into the approval queue, and Screen 4 state D and Screen 5 need a 「N 個尺寸待審核」 line.
 *
 * Typed `boolean` rather than left as a literal so flipping it does not turn the branches below into
 * dead code the compiler prunes.
 */
export const BATCH_BYPASSES_BAND: boolean = true;

/** Who caused this recompute. Only a human-initiated one may bypass the band. */
export type DecisionTrigger = "ingest" | "batch" | "manual";

/**
 * One value per §5 situation, and the column `tests/fixtures/decision-table.csv` is keyed on.
 * Branch coverage proves the code does what it says; the reason names are what let a reviewer check
 * that what it says is the brief.
 */
export type DecisionReason =
  | "no_listing"
  | "no_margins"
  | "no_margins_live"
  | "listing_rejected"
  | "listing_inactive"
  | "price_unchanged"
  | "quantity_only"
  | "human_bypass"
  | "no_approved_price"
  | "zero_approved_price"
  | "within_band"
  | "outside_band";

/** The subset of `price_updates.outcome` the v2 engine's decision step can emit. */
export type DecisionOutcome = Extract<
  Outcome,
  | "new_listing"
  | "needs_margins"
  | "cost_change"
  | "quantity_change"
  | "no_change"
  | "auto_approved"
  | "held_for_approval"
>;

export interface DecisionListing {
  status: ApprovalStatus;
  /** The live price — what Shopify shows. NULL for a listing that has never been approved. */
  approvedPriceCents: number | null;
  pendingPriceCents: number | null;
}

export interface DecisionInput {
  /** NULL when the listing did not exist before this update (§5 row 1). */
  listing: DecisionListing | null;
  /** Resolved by lib/domain/margins.ts; NULL when the §5 chain came up empty (§5 row 2). */
  margins: ResolvedMargins | null;
  /**
   * base_cost after this update, in cents. Required: ingest rejects a costless item with
   * `missing_cost`, and every recompute path runs over listings that already have a base cost.
   */
  baseCostCents: number;
  /** Whether this update also moved the in-house quantity. Inventory syncs without approval (§5). */
  quantityChanged: boolean;
  roundingEnabled: boolean;
  band: ApprovalBand;
  trigger: DecisionTrigger;
}

export interface Decision {
  /** `listings.approval_status` after this update. */
  status: ApprovalStatus;
  outcome: DecisionOutcome;
  reason: DecisionReason;
  /** `listings.approved_price` after this update. Unchanged unless the decision approves. */
  approvedPriceCents: number | null;
  /** `listings.pending_price` after this update. NULL clears it — and with it `pending_since`. */
  pendingPriceCents: number | null;
  /** The price §5 computed, whether or not it was applied. NULL when nothing could be priced. */
  priceCents: number | null;
  rawPriceCents: number | null;
  roundingApplied: boolean;
  marginSource: MarginSource | null;
  /** For display and for `/approvals`; NULL when there is no usable denominator. */
  deltaPercent: number | null;
  /** Write a `listing_price` row to price_history. */
  writesPriceHistory: boolean;
  /** Enqueue a shopify_sync_jobs row. */
  enqueuePublish: boolean;
}

/**
 * §5's decision table.
 *
 * Δ is measured against the **approved** price, never against the previously computed one: 1000 → 1200
 * held, then 1250 arrives; against 1200 that is +4% and sneaks through, against 1000 it is +25% and
 * stays held.
 *
 * The band bypass is a band bypass only. It never turns a listing that was never live into a live one
 * — that transition is `POST /listings/:id/approve`, deliberately, so a group apply cannot publish a
 * variant nobody has ever approved.
 */
export function decide(input: DecisionInput): Decision {
  const { listing, margins, band, trigger, quantityChanged } = input;
  const marginSource = margins?.source ?? null;

  const make = (
    over: Partial<Decision> & Pick<Decision, "status" | "outcome" | "reason">,
  ): Decision => ({
    approvedPriceCents: listing?.approvedPriceCents ?? null,
    pendingPriceCents: listing?.pendingPriceCents ?? null,
    priceCents: null,
    rawPriceCents: null,
    roundingApplied: false,
    marginSource,
    deltaPercent: null,
    writesPriceHistory: false,
    enqueuePublish: false,
    ...over,
  });

  const priced = (resolved: ResolvedMargins) =>
    computeSellingPrice(input.baseCostCents, resolved, input.roundingEnabled);

  if (listing === null) {
    // A brand-new listing with no margin chain is blocked on the margins, not on the review: it
    // cannot be approved until someone sets them, and 未設定利潤 says so where 待審核（新產品） does not.
    if (margins === null) {
      return make({ status: "needs_margins", outcome: "needs_margins", reason: "no_margins" });
    }
    const price = priced(margins);
    return make({
      status: "pending_new",
      outcome: "new_listing",
      reason: "no_listing",
      pendingPriceCents: price.priceCents,
      priceCents: price.priceCents,
      rawPriceCents: price.rawCents,
      roundingApplied: price.roundingApplied,
    });
  }

  switch (listing.status) {
    // Cost and stock are still saved by the caller; the listing is simply not re-queued until a
    // human reactivates it, so nothing here prices, publishes or changes its status.
    case "rejected":
      return make({ status: "rejected", outcome: "cost_change", reason: "listing_rejected" });
    case "inactive":
      return make({ status: "inactive", outcome: "cost_change", reason: "listing_inactive" });
    case "approved":
    case "pending_price":
    case "pending_new":
    case "needs_margins":
      break;
    default:
      return assertNever(listing.status, "decide: approval_status");
  }

  const live = listing.status === "approved" || listing.status === "pending_price";

  if (margins === null) {
    // Disabling the system default must never retroactively unapprove a live price: the listing keeps
    // its approved price and simply stops being recomputable until margins come back.
    if (live) {
      return make({
        status: listing.status,
        outcome: "needs_margins",
        reason: "no_margins_live",
        marginSource: null,
        // Nothing can be re-priced, but stock is not priced: §5 syncs inventory immediately on a live
        // listing, and an empty margin chain is a pricing fact, not a reason to hold back a quantity.
        enqueuePublish: quantityChanged,
      });
    }
    return make({
      status: "needs_margins",
      outcome: "needs_margins",
      reason: "no_margins",
      pendingPriceCents: null,
    });
  }

  const price = priced(margins);

  const unchanged = (
    status: ApprovalStatus,
    pendingPriceCents: number | null,
    /** 0 only where the price it did not move from is the *approved* one. Δ has no other denominator. */
    delta: number | null,
  ): Decision =>
    make({
      status,
      // Load-bearing, not an optimisation: rounding to x49/x99 collapses small cost moves onto the
      // same price, so without this early-out every hourly crawl writes history and enqueues a
      // publish for a price that did not move.
      outcome: quantityChanged ? "quantity_change" : "no_change",
      reason: quantityChanged ? "quantity_only" : "price_unchanged",
      pendingPriceCents,
      priceCents: price.priceCents,
      rawPriceCents: price.rawCents,
      roundingApplied: price.roundingApplied,
      deltaPercent: delta,
      enqueuePublish: live && quantityChanged,
    });

  const held = (status: ApprovalStatus, reason: DecisionReason, delta: number | null): Decision =>
    make({
      status,
      outcome: "held_for_approval",
      reason,
      pendingPriceCents: price.priceCents,
      priceCents: price.priceCents,
      rawPriceCents: price.rawCents,
      roundingApplied: price.roundingApplied,
      deltaPercent: delta,
      // The price waits for a human, but stock does not: §5 syncs inventory immediately.
      enqueuePublish: live && quantityChanged,
    });

  const approve = (reason: DecisionReason, delta: number | null): Decision =>
    make({
      status: "approved",
      outcome: "auto_approved",
      reason,
      approvedPriceCents: price.priceCents,
      pendingPriceCents: null,
      priceCents: price.priceCents,
      rawPriceCents: price.rawCents,
      roundingApplied: price.roundingApplied,
      deltaPercent: delta,
      writesPriceHistory: true,
      enqueuePublish: true,
    });

  if (!live) {
    // pending_new and needs_margins have never been approved, so there is no denominator and no live
    // price to compare against — every recompute simply restates the proposal.
    if (price.priceCents === listing.pendingPriceCents) {
      // Δ stays NULL, exactly as on the held path below: the proposal not moving is not the same
      // statement as a 0% move away from a live price this listing has never had.
      return unchanged("pending_new", listing.pendingPriceCents, null);
    }
    return held("pending_new", "no_approved_price", null);
  }

  const approved = listing.approvedPriceCents;
  if (approved === null) {
    // Unreachable through the schema: 011 adds
    // `check (approval_status <> 'approved' or approved_price is not null)`, and pending_price is only
    // ever entered from approved. Reaching it means that constraint was dropped, and dividing by NULL
    // silently would publish a wrong price.
    throw new DomainError(`listing is ${listing.status} with no approved price`);
  }

  if (price.priceCents === approved) {
    // Clears a stale proposal too: the held price is moot once the computed price is the live one.
    return unchanged("approved", null, 0);
  }

  const delta = approved === 0 ? null : deltaPercent(price.priceCents, approved);

  if (trigger === "manual" || (trigger === "batch" && BATCH_BYPASSES_BAND)) {
    return approve("human_bypass", delta);
  }

  if (approved === 0) {
    // The explicit division guard. HK$0 is a real approved price, not a missing one, and every
    // relative move away from it is infinite — so it is always a human's call.
    return held("pending_price", "zero_approved_price", null);
  }

  return withinBand(price.priceCents, approved, band)
    ? approve("within_band", delta)
    : held("pending_price", "outside_band", delta);
}
