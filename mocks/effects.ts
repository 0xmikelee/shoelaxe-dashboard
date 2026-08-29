import { decide, type DecisionTrigger } from "@/lib/domain/approval";
import type { ListingOutcome } from "@/lib/schemas/wire/listings";
import { iso } from "./clock";
import { db, resolveListing } from "./db";
import { money, moneyOrNull, rate } from "./project";
import { uuidFrom } from "./random";
import type { Cents, HistoryRowStore, ListingRow, UpdateRow } from "./types";

/**
 * The write side, shared by every handler that changes a price.
 *
 * All of it runs through `decide()` from lib/domain — the same function the server decides with — so
 * a group apply in the mock produces the same held/approved mix the real one would. Re-implementing
 * §5 here would make the mock agree with itself and disagree with the product.
 */

const now = (): string => iso(Date.now());

let historySequence = 0;

export function pushHistory(
  listing: ListingRow,
  row: Omit<
    HistoryRowStore,
    "id" | "listing_id" | "product_sku" | "size" | "changed_at" | "actor_id"
  > & { actor_id?: string | null; changed_at?: string },
): void {
  historySequence += 1;
  db.history.unshift({
    id: uuidFrom(`history:new:${listing.id}:${historySequence}`),
    listing_id: listing.id,
    product_sku: listing.product_sku,
    size: listing.size,
    changed_at: row.changed_at ?? now(),
    actor_id: row.actor_id ?? null,
    ...row,
  });
}

/** A held price is a queue row. Without this a group apply that holds prices leaves Screen 1 empty. */
function pushUpdate(listing: ListingRow, fields: Partial<UpdateRow> & Pick<UpdateRow, "status">): UpdateRow {
  const { base } = resolveListing(listing);
  const update: UpdateRow = {
    id: uuidFrom(`update:new:${listing.id}:${db.updates.length}`),
    listing_id: listing.id,
    source: "dashboard",
    cost_cents: base?.costCents ?? 0,
    previous_cost_cents: null,
    previous_cost_at: null,
    approved_price_cents: listing.approved_price_cents,
    new_price_cents: listing.pending_price_cents,
    raw_price_cents: null,
    rounding_applied: false,
    delta_percent_exact: null,
    outcome: null,
    engine: "v2",
    threshold_up_percent: db.settings.auto_approve_up_percent,
    threshold_down_percent: db.settings.auto_approve_down_percent,
    pending_since: listing.pending_since,
    observed_at: base?.costAt ?? null,
    created_at: now(),
    ...fields,
  };
  db.updates.unshift(update);
  return update;
}

const outcomeFor = (
  listing: ListingRow,
  decision: ReturnType<typeof decide>,
): ListingOutcome["outcome"] => {
  switch (decision.outcome) {
    case "auto_approved":
      return "auto_approved";
    case "held_for_approval":
    case "new_listing":
      return "held_for_approval";
    case "needs_margins":
      return "needs_margins";
    case "cost_change":
      // rejected and inactive listings are saved but not re-queued (§5): the write skipped them.
      return listing.approval_status === "rejected" || listing.approval_status === "inactive"
        ? "skipped"
        : "no_change";
    default:
      return "no_change";
  }
};

export interface RecomputeOptions {
  trigger: DecisionTrigger;
  actorLabel: string;
  /** Group apply clears per-size overrides when its scope says to; recorded for the job result. */
  clearedOverride?: boolean;
}

/**
 * Re-price one listing and write the consequences: status, prices, a `price_history` row when the
 * price moved, and a `price_updates` row when it was held.
 */
export function recomputeListing(listing: ListingRow, options: RecomputeOptions): ListingOutcome {
  const { margins, base } = resolveListing(listing);

  if (!base) {
    return {
      listing_id: listing.id,
      size: listing.size,
      outcome: "skipped",
      approval_status: listing.approval_status,
      approved_price: moneyOrNull(listing.approved_price_cents),
      pending_price: moneyOrNull(listing.pending_price_cents),
      raw_price: null,
      rounding_applied: false,
      // The one failure a user can act on, which is why it earns a tooltip rather than a silent skip.
      reason: "missing_cost",
    };
  }

  const before = listing.approved_price_cents;
  const decision = decide({
    listing: {
      status: listing.approval_status,
      approvedPriceCents: listing.approved_price_cents,
      pendingPriceCents: listing.pending_price_cents,
    },
    margins,
    baseCostCents: base.costCents,
    quantityChanged: false,
    roundingEnabled: db.settings.rounding_enabled,
    band: {
      upPercent: db.settings.auto_approve_up_percent,
      downPercent: db.settings.auto_approve_down_percent,
    },
    trigger: options.trigger,
  });

  listing.approval_status = decision.status;
  listing.margins_unresolved = margins === null;
  listing.updated_at = now();

  if (decision.approvedPriceCents !== before) {
    listing.previous_approved_price_cents = before;
    listing.previous_approved_at = listing.approved_at;
    listing.approved_price_cents = decision.approvedPriceCents;
    listing.approved_at = now();
  }

  if (decision.pendingPriceCents === null) {
    listing.pending_price_cents = null;
    listing.pending_since = null;
    listing.pending_update_id = null;
  } else if (decision.pendingPriceCents !== listing.pending_price_cents) {
    listing.pending_price_cents = decision.pendingPriceCents;
    // Kept from the *oldest* unapproved update, not reset by a newer one (§5).
    listing.pending_since ??= now();
  }

  if (decision.writesPriceHistory && before !== decision.approvedPriceCents) {
    pushHistory(listing, {
      change_type: "listing_price",
      source: "dashboard",
      actor_label: options.actorLabel,
      previous_value: moneyOrNull(before),
      new_value: moneyOrNull(decision.approvedPriceCents),
      previous_price_cents: before,
      price_cents: decision.approvedPriceCents,
      previous_quantity: null,
      quantity: null,
      delta_cents:
        before === null || decision.approvedPriceCents === null
          ? null
          : decision.approvedPriceCents - before,
      delta_percent: decision.deltaPercent,
    });
  }

  if (decision.outcome === "held_for_approval") {
    const update = pushUpdate(listing, {
      status:
        decision.deltaPercent === null
          ? listing.approval_status === "pending_new"
            ? "pending_new"
            : "above_threshold"
          : decision.deltaPercent >= 0
            ? "above_threshold"
            : "below_threshold",
      outcome: "held_for_approval",
      new_price_cents: decision.priceCents,
      raw_price_cents: decision.rawPriceCents,
      rounding_applied: decision.roundingApplied,
      delta_percent_exact: decision.deltaPercent,
    });
    listing.pending_update_id = update.id;
  }

  return {
    listing_id: listing.id,
    size: listing.size,
    outcome: outcomeFor(listing, decision),
    approval_status: listing.approval_status,
    approved_price: moneyOrNull(listing.approved_price_cents),
    pending_price: moneyOrNull(listing.pending_price_cents),
    raw_price: moneyOrNull(decision.rawPriceCents),
    rounding_applied: decision.roundingApplied,
    reason: margins === null ? "needs_margins" : null,
  };
}

/**
 * §5's manual adjustment: a human setting the price *is* the approval, so it bypasses the band and
 * syncs immediately. Recorded as `manual_price` with the user as actor, never as 系統自動.
 */
export function setManualPrice(listing: ListingRow, priceCents: Cents, actorLabel: string): void {
  const before = listing.approved_price_cents;
  listing.previous_approved_price_cents = before;
  listing.previous_approved_at = listing.approved_at;
  listing.approved_price_cents = priceCents;
  listing.approved_at = now();
  listing.pending_price_cents = null;
  listing.pending_since = null;
  listing.pending_update_id = null;
  listing.approval_status = "approved";
  listing.margins_unresolved = false;
  listing.updated_at = now();
  pushHistory(listing, {
    change_type: "manual_price",
    source: "dashboard",
    actor_label: actorLabel,
    previous_value: moneyOrNull(before),
    new_value: money(priceCents),
    previous_price_cents: before,
    price_cents: priceCents,
    previous_quantity: null,
    quantity: null,
    delta_cents: before === null ? null : priceCents - before,
    delta_percent: before === null || before === 0 ? null : ((priceCents - before) / before) * 100,
  });
}

/** 確認: the held price becomes the live one. */
export function approvePending(listing: ListingRow, actorLabel: string): void {
  const before = listing.approved_price_cents;
  const pending = listing.pending_price_cents;
  listing.previous_approved_price_cents = before;
  listing.previous_approved_at = listing.approved_at;
  listing.approved_price_cents = pending;
  listing.approved_at = now();
  listing.approval_status = "approved";
  listing.pending_price_cents = null;
  listing.pending_since = null;
  listing.updated_at = now();

  for (const update of db.updates) {
    if (update.listing_id === listing.id && update.id === listing.pending_update_id) {
      update.outcome = "auto_approved";
      update.status = "within_band";
    }
  }
  listing.pending_update_id = null;

  pushHistory(listing, {
    change_type: "listing_price",
    source: "dashboard",
    actor_label: actorLabel,
    previous_value: moneyOrNull(before),
    new_value: moneyOrNull(pending),
    previous_price_cents: before,
    price_cents: pending,
    previous_quantity: null,
    quantity: null,
    delta_cents: before === null || pending === null ? null : pending - before,
    delta_percent:
      before === null || before === 0 || pending === null ? null : ((pending - before) / before) * 100,
  });
}

export function rejectPending(listing: ListingRow, actorLabel: string, reason?: string): void {
  const previousStatus = listing.approval_status;
  listing.approval_status = "rejected";
  listing.pending_price_cents = null;
  listing.pending_since = null;
  listing.updated_at = now();
  for (const update of db.updates) {
    if (update.id === listing.pending_update_id) update.status = "rejected";
  }
  listing.pending_update_id = null;
  pushHistory(listing, {
    change_type: "listing_status",
    source: "dashboard",
    actor_label: actorLabel,
    previous_value: previousStatus,
    new_value: reason ? `rejected: ${reason}` : "rejected",
    previous_price_cents: listing.approved_price_cents,
    price_cents: listing.approved_price_cents,
    previous_quantity: null,
    quantity: null,
    delta_cents: null,
    delta_percent: null,
  });
}

export function setListingStatus(
  listing: ListingRow,
  status: ListingRow["approval_status"],
  actorLabel: string,
): void {
  const previous = listing.approval_status;
  listing.approval_status = status;
  listing.updated_at = now();
  pushHistory(listing, {
    change_type: "listing_status",
    source: "dashboard",
    actor_label: actorLabel,
    previous_value: previous,
    new_value: status,
    previous_price_cents: listing.approved_price_cents,
    price_cents: listing.approved_price_cents,
    previous_quantity: null,
    quantity: null,
    delta_cents: null,
    delta_percent: null,
  });
}

export function recordMarginChange(
  listing: ListingRow,
  previousPercent: number | null,
  actorLabel: string,
): void {
  pushHistory(listing, {
    change_type: "margin_percent",
    source: "dashboard",
    actor_label: actorLabel,
    previous_value: previousPercent === null ? null : rate(previousPercent),
    new_value: listing.margin_override_percent === null ? null : rate(listing.margin_override_percent),
    previous_price_cents: listing.approved_price_cents,
    price_cents: listing.approved_price_cents,
    previous_quantity: null,
    quantity: null,
    delta_cents: null,
    delta_percent: null,
  });
}
