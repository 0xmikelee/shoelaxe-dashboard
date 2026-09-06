import { decide, type DecisionListing } from "@/lib/domain/approval";
import { pickBaseCost } from "@/lib/domain/baseCost";
import { fromCents, toCentsOrNull } from "@/lib/domain/money";
import type { Outcome } from "@/lib/domain/types";
import { ApiError, notFound } from "@/lib/http/errors";
import type { SessionActor } from "@/lib/http/session-auth";
import type { Listing, BulkListingResult } from "@/lib/schemas/wire/listings";
import type {
  DashboardListing,
  DashboardRepo,
  DashboardSource,
  ListingStatePatch,
} from "@/lib/repo/dashboard-types";
import { listingOutcomeOf, projectListing, resolvedFor } from "@/lib/services/wire-project";

export interface ListingWriteDeps {
  repo: DashboardRepo;
  publishTarget: "none" | "shopify";
  now: string;
  actor: SessionActor;
}

const syncState = (target: "none" | "shopify") => (target === "shopify" ? "queued" : "deferred");

function decisionListing(listing: DashboardListing): DecisionListing {
  return {
    status: listing.approval_status,
    approvedPriceCents: toCentsOrNull(listing.approved_price),
    pendingPriceCents: toCentsOrNull(listing.pending_price),
  };
}

export function stateFromDecision(
  listing: DashboardListing,
  decision: ReturnType<typeof decide>,
  now: string,
): ListingStatePatch {
  return {
    approval_status: decision.status,
    approved_price: fromCentsOrDecision(decision.approvedPriceCents, listing.approved_price),
    approved_at: decision.status === "approved" ? now : listing.approved_at,
    current_price: fromCentsOrDecision(decision.approvedPriceCents, listing.approved_price),
    pending_price: decision.pendingPriceCents == null ? null : fromCents(decision.pendingPriceCents),
    pending_since:
      decision.pendingPriceCents == null
        ? null
        : listing.pending_since && listing.pending_price != null
          ? listing.pending_since
          : now,
    pending_update_id: decision.pendingPriceCents == null ? null : listing.pending_update_id,
    margin_source: decision.marginSource,
  };
}

function fromCentsOrDecision(cents: number | null, fallback: string | null): string | null {
  return cents == null ? fallback : fromCents(cents);
}

async function hydrate(
  repo: DashboardRepo,
  listing: DashboardListing,
): Promise<{ listing: DashboardListing; sources: DashboardSource[]; settings: Awaited<ReturnType<DashboardRepo["getSettings"]>> }> {
  const [sources, settings] = await Promise.all([repo.listSources(listing.id), repo.getSettings()]);
  return { listing, sources, settings };
}

export async function getListingWire(repo: DashboardRepo, listing: DashboardListing): Promise<Listing> {
  const { sources, settings } = await hydrate(repo, listing);
  return projectListing(listing, sources, settings);
}

export async function approveListing(id: string, deps: ListingWriteDeps): Promise<Listing> {
  const listing = await deps.repo.lockListing(id);
  if (!listing) throw notFound("listing");
  if (listing.approval_status === "inactive") {
    throw new ApiError("listing_inactive", "this size is delisted");
  }
  if (listing.approval_status === "needs_margins") {
    throw new ApiError("needs_margins", "this size has no resolvable margin");
  }
  if (
    (listing.approval_status !== "pending_price" && listing.approval_status !== "pending_new") ||
    listing.pending_price == null
  ) {
    throw new ApiError("not_pending", "this listing has no price waiting for approval");
  }

  const before = listing.approved_price;
  const pending = listing.pending_price;
  const pendingUpdateId = listing.pending_update_id;

  await deps.repo.updateListingState(id, {
    approval_status: "approved",
    approved_price: pending,
    approved_at: deps.now,
    current_price: pending,
    pending_price: null,
    pending_since: null,
    pending_update_id: null,
    margin_source: listing.margin_source,
  });

  if (pendingUpdateId) {
    await deps.repo.markUpdateOutcome(pendingUpdateId, { outcome: "auto_approved", status: "applied" });
  }

  await deps.repo.insertHistory({
    listing_id: listing.id,
    product_name: listing.product_name,
    product_sku: listing.product_sku,
    brand: listing.brand,
    size: listing.size,
    price: pending,
    previous_price: before,
    currency: listing.currency,
    source: "dashboard",
    source_ref: `approve:${listing.id}`,
    quantity: null,
    previous_quantity: null,
    cost: listing.base_cost,
    previous_cost: listing.base_cost,
    change_type: "listing_price",
    actor_label: deps.actor.label,
    actor_id: deps.actor.id,
  });
  await deps.repo.insertAuditLog({
    user_id: deps.actor.id,
    actor_label: deps.actor.label,
    action: "approve",
    target_table: "listings",
    target_id: listing.id,
    before: { approval_status: listing.approval_status, approved_price: before },
    after: { approval_status: "approved", approved_price: pending },
  });
  await deps.repo.enqueueShopifySync(listing.id, syncState(deps.publishTarget));

  const fresh = await deps.repo.findListingById(id);
  return getListingWire(deps.repo, {
    ...(fresh ?? listing),
    previous_approved_price: before,
    previous_approved_at: listing.approved_at,
  });
}

export async function rejectListing(id: string, reason: string | undefined, deps: ListingWriteDeps): Promise<Listing> {
  const listing = await deps.repo.lockListing(id);
  if (!listing) throw notFound("listing");
  if (listing.approval_status === "inactive") {
    throw new ApiError("listing_inactive", "this size is delisted");
  }
  if (listing.approval_status !== "pending_price" && listing.approval_status !== "pending_new") {
    throw new ApiError("not_pending", "this listing has no price waiting for approval");
  }

  const nextStatus = listing.approval_status === "pending_new" ? "rejected" : "approved";
  const pendingUpdateId = listing.pending_update_id;

  await deps.repo.updateListingState(id, {
    approval_status: nextStatus,
    approved_price: listing.approved_price,
    approved_at: listing.approved_at,
    current_price: listing.approved_price,
    pending_price: null,
    pending_since: null,
    pending_update_id: null,
    margin_source: listing.margin_source,
  });

  if (pendingUpdateId) {
    await deps.repo.markUpdateOutcome(pendingUpdateId, { outcome: "superseded", status: "rejected" });
  }

  await deps.repo.insertHistory({
    listing_id: listing.id,
    product_name: listing.product_name,
    product_sku: listing.product_sku,
    brand: listing.brand,
    size: listing.size,
    price: listing.approved_price,
    previous_price: listing.approved_price,
    currency: listing.currency,
    source: "dashboard",
    source_ref: `reject:${listing.id}`,
    quantity: null,
    previous_quantity: null,
    cost: listing.base_cost,
    previous_cost: listing.base_cost,
    change_type: "listing_status",
    actor_label: deps.actor.label,
    actor_id: deps.actor.id,
  });
  await deps.repo.insertAuditLog({
    user_id: deps.actor.id,
    actor_label: deps.actor.label,
    action: "reject",
    target_table: "listings",
    target_id: listing.id,
    before: { approval_status: listing.approval_status },
    after: { approval_status: nextStatus, reason: reason ?? null },
  });

  const fresh = await deps.repo.findListingById(id);
  return getListingWire(deps.repo, fresh ?? listing);
}

export async function setListingPrice(id: string, price: string, deps: ListingWriteDeps): Promise<Listing> {
  const listing = await deps.repo.lockListing(id);
  if (!listing) throw notFound("listing");
  if (listing.approval_status === "inactive") {
    throw new ApiError("listing_inactive", "this size is delisted");
  }

  const before = listing.approved_price;
  await deps.repo.updateListingState(id, {
    approval_status: "approved",
    approved_price: price,
    approved_at: deps.now,
    current_price: price,
    pending_price: null,
    pending_since: null,
    pending_update_id: null,
    margin_source: listing.margin_source,
  });

  await deps.repo.insertHistory({
    listing_id: listing.id,
    product_name: listing.product_name,
    product_sku: listing.product_sku,
    brand: listing.brand,
    size: listing.size,
    price,
    previous_price: before,
    currency: listing.currency,
    source: "dashboard",
    source_ref: `manual_price:${listing.id}`,
    quantity: null,
    previous_quantity: null,
    cost: listing.base_cost,
    previous_cost: listing.base_cost,
    change_type: "manual_price",
    actor_label: deps.actor.label,
    actor_id: deps.actor.id,
  });
  await deps.repo.insertAuditLog({
    user_id: deps.actor.id,
    actor_label: deps.actor.label,
    action: "set_price",
    target_table: "listings",
    target_id: listing.id,
    before: { approved_price: before },
    after: { approved_price: price },
  });
  await deps.repo.enqueueShopifySync(listing.id, syncState(deps.publishTarget));

  const fresh = await deps.repo.findListingById(id);
  return getListingWire(deps.repo, {
    ...(fresh ?? listing),
    previous_approved_price: before,
    previous_approved_at: listing.approved_at,
  });
}

export async function bulkApproveListings(
  body: { listing_ids?: string[]; product_sku?: string },
  deps: ListingWriteDeps,
): Promise<BulkListingResult> {
  if (!body.listing_ids?.length && !body.product_sku) {
    throw new ApiError("validation_failed", "pass listing_ids or product_sku");
  }
  const ids = body.listing_ids?.length
    ? body.listing_ids
    : await deps.repo.listListingIdsBySku(body.product_sku!);

  const results = [];
  for (const listingId of ids) {
    const listing = await deps.repo.findListingById(listingId);
    if (!listing) {
      results.push({ listing_id: listingId, size: "—", ok: false, error_code: "not_found" as const });
      continue;
    }
    try {
      await approveListing(listingId, deps);
      results.push({ listing_id: listingId, size: listing.size, ok: true, error_code: null });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "internal_error";
      results.push({ listing_id: listingId, size: listing.size, ok: false, error_code: code });
    }
  }
  return {
    ok_count: results.filter((r) => r.ok).length,
    failed_count: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function recomputeListing(
  listingId: string,
  deps: ListingWriteDeps,
  trigger: "ingest" | "batch" | "manual" = "ingest",
): Promise<ReturnType<typeof listingOutcomeOf>> {
  const listing = await deps.repo.lockListing(listingId);
  if (!listing) throw notFound("listing");
  const sources = await deps.repo.listSources(listingId);
  const settings = await deps.repo.getSettings();
  const { margins } = resolvedFor(listing, settings);
  const base = pickBaseCost(
    sources.map((s) => ({
      slot: s.source,
      costCents: toCentsOrNull(s.cost),
      costAt: s.cost_at,
    })),
    null,
  );
  const baseCostCents = base?.costCents ?? toCentsOrNull(listing.base_cost);
  if (baseCostCents == null && listing.approval_status !== "inactive") {
    await deps.repo.updateListingState(listingId, {
      approval_status: listing.approval_status === "approved" || listing.approval_status === "pending_price"
        ? listing.approval_status
        : "needs_margins",
      approved_price: listing.approved_price,
      approved_at: listing.approved_at,
      current_price: listing.approved_price,
      pending_price: listing.pending_price,
      pending_since: listing.pending_since,
      pending_update_id: listing.pending_update_id,
      margin_source: null,
    });
    const fresh = (await deps.repo.findListingById(listingId)) ?? listing;
    return listingOutcomeOf(fresh, settings, "needs_margins");
  }

  const decision = decide({
    listing: decisionListing(listing),
    margins,
    baseCostCents: baseCostCents ?? 0,
    quantityChanged: false,
    roundingEnabled: settings.rounding_enabled,
    band: {
      upPercent: Number(settings.auto_approve_up_percent),
      downPercent: Number(settings.auto_approve_down_percent),
    },
    trigger,
  });

  const patch = stateFromDecision(listing, decision, deps.now);
  if (base) {
    patch.base_cost = fromCents(base.costCents);
    patch.base_cost_source = base.slot;
    patch.base_cost_at = base.costAt;
  }
  await deps.repo.updateListingState(listingId, patch);

  if (decision.writesPriceHistory) {
    await deps.repo.insertHistory({
      listing_id: listing.id,
      product_name: listing.product_name,
      product_sku: listing.product_sku,
      brand: listing.brand,
      size: listing.size,
      price: fromCentsOrDecision(decision.approvedPriceCents, listing.approved_price),
      previous_price: listing.approved_price,
      currency: listing.currency,
      source: "dashboard",
      source_ref: `recompute:${listing.id}`,
      quantity: null,
      previous_quantity: null,
      cost: listing.base_cost,
      previous_cost: listing.base_cost,
      change_type: "listing_price",
      actor_label: deps.actor.label,
      actor_id: deps.actor.id,
    });
  }
  if (decision.enqueuePublish) {
    await deps.repo.enqueueShopifySync(listing.id, syncState(deps.publishTarget));
  }

  const fresh = (await deps.repo.findListingById(listingId)) ?? listing;
  return listingOutcomeOf(fresh, settings, decision.outcome as Outcome);
}
