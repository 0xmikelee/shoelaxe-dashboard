import { computeSellingPrice } from "@/lib/domain/pricing";
import { resolveMargins, type DefaultMarginRule, type MarginRule } from "@/lib/domain/margins";
import { fromCents, fromCentsOrNull, toCents, toCentsOrNull } from "@/lib/domain/money";
import { productTab, type ApprovalStatus, type Outcome } from "@/lib/domain/types";
import type { Listing, ListingOutcome, ListingSource } from "@/lib/schemas/wire/listings";
import type { ApprovalRow } from "@/lib/schemas/wire/approvals";
import type { Aggregates, MarginSummary, ProductImage } from "@/lib/schemas/wire/products";
import { compareSizes } from "@/lib/format/size";
import type {
  DashboardImage,
  DashboardListing,
  DashboardSettings,
  DashboardSource,
} from "@/lib/repo/dashboard-types";

export const rate4 = (value: number): string => value.toFixed(4);
export const rate1 = (value: number): string => value.toFixed(1);
export const rateOrNull = (value: number | null): string | null =>
  value === null ? null : rate4(value);

export function ruleOf(percent: string | null, fixed: string | null): MarginRule | null {
  if (percent == null && fixed == null) return null;
  return {
    percent: percent == null ? null : Number(percent),
    fixedCents: fixed == null ? null : toCents(fixed),
  };
}

export function defaultsOf(settings: DashboardSettings): DefaultMarginRule {
  return {
    enabled: settings.default_margin_enabled,
    percent: Number(settings.default_margin_percent),
    fixedCents: toCents(settings.default_margin_fixed),
  };
}

export function resolvedFor(listing: DashboardListing, settings: DashboardSettings) {
  const margins = resolveMargins(
    ruleOf(listing.margin_percent, listing.margin_fixed),
    ruleOf(listing.group_margin_percent, listing.group_margin_fixed),
    defaultsOf(settings),
  );
  const baseCents = toCentsOrNull(listing.base_cost);
  const price =
    margins && baseCents != null
      ? computeSellingPrice(baseCents, margins, settings.rounding_enabled)
      : null;
  return { margins, price };
}

export function projectSource(source: DashboardSource): ListingSource {
  return {
    source: source.source,
    cost: source.cost,
    cost_at: source.cost_at,
    previous_cost: source.previous_cost,
    previous_cost_at: source.previous_cost_at,
    quantity: source.quantity,
    last_source_ref: source.last_source_ref,
    last_synced_at: source.last_synced_at,
    editable: source.source === "in_house",
  };
}

export function projectListing(
  listing: DashboardListing,
  sources: readonly DashboardSource[],
  settings: DashboardSettings,
): Listing {
  const { margins, price } = resolvedFor(listing, settings);
  const inHouse = sources.find((s) => s.source === "in_house");
  const approvedCents = toCentsOrNull(listing.approved_price);
  const inHouseCost = toCentsOrNull(inHouse?.cost ?? null);
  const markup =
    inHouseCost && inHouseCost !== 0 && approvedCents !== null
      ? {
          amount: fromCents(approvedCents - inHouseCost),
          percent: rate4(((approvedCents - inHouseCost) / inHouseCost) * 100),
        }
      : null;

  return {
    id: listing.id,
    product_sku: listing.product_sku,
    product_name: listing.product_name,
    name_zh: listing.name_zh,
    size: listing.size,
    currency: "HKD",
    approval_status: listing.approval_status,
    base_cost: listing.base_cost,
    base_cost_source: listing.base_cost_source,
    base_cost_at: listing.base_cost_at,
    margin_percent: margins ? rate4(margins.percent) : null,
    margin_fixed: margins ? fromCents(margins.fixedCents) : null,
    margin_source: margins?.source ?? null,
    margin_override_percent: listing.margin_percent,
    margin_override_fixed: listing.margin_fixed,
    raw_price: price ? fromCents(price.rawCents) : null,
    rounding_applied: price?.roundingApplied ?? false,
    approved_price: listing.approved_price,
    approved_at: listing.approved_at,
    previous_approved_price: listing.previous_approved_price,
    previous_approved_at: listing.previous_approved_at,
    pending_price: listing.pending_price,
    pending_since: listing.pending_since,
    pending_update_id: listing.pending_update_id,
    in_house_markup: markup,
    sources: sources.map(projectSource),
    updated_at: listing.updated_at,
  };
}

export function writeOutcomeOf(
  outcome: Outcome,
  status: ApprovalStatus,
): ListingOutcome["outcome"] {
  if (outcome === "auto_approved") return "auto_approved";
  if (outcome === "held_for_approval") return "held_for_approval";
  if (outcome === "needs_margins") return "needs_margins";
  if (outcome === "no_change" || outcome === "quantity_change") return "no_change";
  if (status === "needs_margins") return "needs_margins";
  return "skipped";
}

export function listingOutcomeOf(
  listing: DashboardListing,
  settings: DashboardSettings,
  outcome: Outcome,
): ListingOutcome {
  const { price } = resolvedFor(listing, settings);
  return {
    listing_id: listing.id,
    size: listing.size,
    outcome: writeOutcomeOf(outcome, listing.approval_status),
    approval_status: listing.approval_status,
    approved_price: listing.approved_price,
    pending_price: listing.pending_price,
    raw_price: price ? fromCents(price.rawCents) : null,
    rounding_applied: price?.roundingApplied ?? false,
    reason: listing.approval_status === "needs_margins" ? "needs_margins" : null,
  };
}

export function approvalRowStatus(
  outcome: Outcome | null,
  updateStatus: DashboardPriceUpdateStatus,
  delta: number | null,
  listingStatus: ApprovalStatus,
): ApprovalRow["status"] {
  if (outcome === "superseded") return "superseded";
  if (updateStatus === "rejected" || listingStatus === "rejected") return "rejected";
  if (outcome === "needs_margins") return "needs_margins";
  if (outcome === "new_listing") return "pending_new";
  if (outcome === "held_for_approval") {
    if (delta == null) return listingStatus === "pending_new" ? "pending_new" : "above_threshold";
    return delta >= 0 ? "above_threshold" : "below_threshold";
  }
  if (outcome === "auto_approved") return "within_band";
  if (listingStatus === "pending_new") return "pending_new";
  if (listingStatus === "needs_margins") return "needs_margins";
  return "within_band";
}

type DashboardPriceUpdateStatus = "pending" | "applied" | "skipped" | "rejected" | "error";

export function projectApprovalRow(
  listing: DashboardListing,
  sources: readonly DashboardSource[],
  settings: DashboardSettings,
  update: {
    id: string;
    source: ApprovalRow["source"];
    cost: string | null;
    outcome: Outcome | null;
    status: DashboardPriceUpdateStatus;
    engine: "v1" | "v2";
    threshold_up_percent: string | null;
    threshold_down_percent: string | null;
    observed_at: string | null;
    received_at: string;
  },
): ApprovalRow | null {
  if (!update.cost) return null;
  const { price } = resolvedFor(listing, settings);
  const newPrice =
    listing.pending_update_id === update.id
      ? listing.pending_price
      : update.outcome === "auto_approved"
        ? listing.approved_price
        : price
          ? fromCents(price.priceCents)
          : listing.pending_price;
  const approvedCents = toCentsOrNull(listing.approved_price);
  const newCents = toCentsOrNull(newPrice);
  const delta =
    approvedCents && approvedCents !== 0 && newCents != null
      ? ((newCents - approvedCents) / approvedCents) * 100
      : null;
  const inHouse = sources.find((s) => s.source === "in_house");

  return {
    update_id: update.id,
    listing_id: listing.id,
    product_sku: listing.product_sku,
    product_name: listing.product_name,
    name_zh: listing.name_zh,
    size: listing.size,
    source: update.source,
    cost: update.cost,
    previous_cost: inHouse?.previous_cost ?? null,
    previous_cost_at: inHouse?.previous_cost_at ?? null,
    approved_price: listing.approved_price,
    new_price: newPrice,
    raw_price: price ? fromCents(price.rawCents) : null,
    rounding_applied: price?.roundingApplied ?? false,
    delta_percent: delta === null ? null : rate1(delta),
    delta_percent_exact: delta === null ? null : rate4(delta),
    delta_direction: delta === null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    threshold_up_percent: update.threshold_up_percent ?? settings.auto_approve_up_percent,
    threshold_down_percent: update.threshold_down_percent ?? settings.auto_approve_down_percent,
    status: approvalRowStatus(update.outcome, update.status, delta, listing.approval_status),
    approval_status: listing.approval_status,
    outcome: update.outcome,
    engine: update.engine,
    pending_since: listing.pending_since,
    observed_at: update.observed_at,
    created_at: update.received_at,
  };
}

export function projectImage(row: DashboardImage): ProductImage {
  return {
    id: row.id,
    url: row.url,
    sort_order: row.sort_order,
    is_primary: row.is_primary,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    created_at: row.created_at,
  };
}

export function projectAggregates(
  listings: readonly DashboardListing[],
  sourcesByListing: ReadonlyMap<string, readonly DashboardSource[]>,
  settings: DashboardSettings,
): Aggregates {
  const resolvedAll = listings.map((l) => ({ listing: l, ...resolvedFor(l, settings) }));
  const costs = listings.flatMap((l) => {
    const c = toCentsOrNull(l.base_cost);
    return c == null ? [] : [c];
  });
  const prices = listings.flatMap((l) => {
    const c = toCentsOrNull(l.approved_price);
    return c == null ? [] : [c];
  });
  const percents = resolvedAll.flatMap((r) => (r.margins ? [r.margins.percent] : []));
  const fixed = resolvedAll.flatMap((r) => (r.margins ? [r.margins.fixedCents] : []));
  const mix = { override: 0, group: 0, default: 0, none: 0 };
  for (const r of resolvedAll) {
    if (!r.margins) mix.none += 1;
    else mix[r.margins.source] += 1;
  }

  let inHouseQuantity = 0;
  let inStock = 0;
  const slots = new Set<string>();
  for (const listing of listings) {
    const sources = sourcesByListing.get(listing.id) ?? [];
    const qty = sources.find((s) => s.source === "in_house")?.quantity ?? 0;
    inHouseQuantity += qty;
    if (qty > 0) inStock += 1;
    for (const s of sources) slots.add(s.source);
  }

  const range = (values: number[]) =>
    values.length === 0 ? null : { min: Math.min(...values), max: Math.max(...values) };
  const costRange = range(costs);
  const priceRange = range(prices);
  const percentRange = range(percents);
  const fixedRange = range(fixed);
  const distinctPrices = new Set(prices);
  const distinctMargins = new Set(resolvedAll.map((r) => `${r.margins?.percent}:${r.margins?.fixedCents}`));

  return {
    size_count: listings.length,
    in_stock_size_count: inStock,
    total_in_house_quantity: inHouseQuantity,
    cost: costRange && { min: fromCents(costRange.min), max: fromCents(costRange.max) },
    price: priceRange && { min: fromCents(priceRange.min), max: fromCents(priceRange.max) },
    margin_percent: percentRange && { min: rate4(percentRange.min), max: rate4(percentRange.max) },
    margin_fixed: fixedRange && { min: fromCents(fixedRange.min), max: fromCents(fixedRange.max) },
    margin_source_mix: mix,
    override_count: listings.filter((l) => l.margin_percent != null || l.margin_fixed != null).length,
    has_size_variance: distinctMargins.size > 1 || distinctPrices.size > 1,
    source_count: slots.size,
  };
}

export function projectMarginSummary(
  listings: readonly DashboardListing[],
  settings: DashboardSettings,
): MarginSummary {
  const pairs = listings
    .map((l) => resolvedFor(l, settings).margins)
    .filter((m): m is NonNullable<typeof m> => m !== null);
  if (pairs.length === 0) {
    return { kind: "none", percent: null, fixed: null, percent_range: null, fixed_range: null };
  }
  const percents = pairs.map((p) => p.percent);
  const fixed = pairs.map((p) => p.fixedCents);
  const uniform = new Set(pairs.map((p) => `${p.percent}:${p.fixedCents}`)).size === 1;
  if (uniform) {
    return {
      kind: "uniform",
      percent: rate4(percents[0]!),
      fixed: fromCents(fixed[0]!),
      percent_range: null,
      fixed_range: null,
    };
  }
  return {
    kind: "mixed",
    percent: null,
    fixed: null,
    percent_range: { min: rate4(Math.min(...percents)), max: rate4(Math.max(...percents)) },
    fixed_range: { min: fromCents(Math.min(...fixed)), max: fromCents(Math.max(...fixed)) },
  };
}

export function productStatusOf(listings: readonly DashboardListing[]): ReturnType<typeof productTab> {
  return productTab(listings.map((l) => l.approval_status));
}

export function sortListings<T extends { size: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareSizes(a.size, b.size));
}

export { fromCentsOrNull };
