import { fromCents, fromCentsOrNull } from "@/lib/domain/money";
import { productTab, type ApprovalStatus } from "@/lib/domain/types";
import type { Aggregates, MarginSummary, ProductDetail, ProductRow as ProductRowWire } from "@/lib/schemas/wire/products";
import type { HistoryRow, Listing, ListingSource } from "@/lib/schemas/wire/listings";
import type { ApprovalRow } from "@/lib/schemas/wire/approvals";
import type { GroupDetail, GroupRef, GroupSummary } from "@/lib/schemas/wire/groups";
import type { Job, JobItem, JobSummary } from "@/lib/schemas/wire/jobs";
import type { CrawlRun } from "@/lib/schemas/wire/crawl";
import type { AllowedUser } from "@/lib/schemas/wire/users";
import type { Settings } from "@/lib/schemas/wire/settings";
import type { ProductImage } from "@/lib/schemas/wire/products";
import { resolveForListing } from "./seed";
import { compareSizes } from "./sizes";
import type {
  AllowedUserRow,
  CrawlRunRow,
  DbState,
  GroupRow,
  HistoryRowStore,
  ImageRow,
  JobItemRow,
  JobRow,
  ListingRow,
  ProductRow,
  SettingsRow,
  SourceRow,
  UpdateRow,
} from "./types";

/**
 * Storage rows → wire shapes. The single boundary where integer cents become numeric strings.
 *
 * Everything derivable is derived here rather than stored: resolved margins, `raw_price`,
 * `base_cost`, the aggregates and the product-level tab. A group rule edited by a handler therefore
 * shows up in every projection immediately, which is the whole point of an in-memory database — a
 * dataset that stored its own derived fields would answer the next request with yesterday's price.
 */

export const money = (cents: number): string => fromCents(cents);
export const moneyOrNull = (cents: number | null): string | null => fromCentsOrNull(cents);

/** `Rate` is a numeric string with up to four decimals: margins and stored thresholds use all four. */
export const rate = (value: number): string => value.toFixed(4);
export const rateOrNull = (value: number | null): string | null =>
  value === null ? null : rate(value);
/** The one-decimal *display* figure. Never the value a decision is made on. */
export const rate1 = (value: number): string => value.toFixed(1);

export interface ProjectContext {
  db: DbState;
}

const groupOf = (db: DbState, id: string): GroupRow =>
  db.groups.find((g) => g.id === id) ?? db.groups[0];

export const productOf = (db: DbState, sku: string): ProductRow | undefined =>
  db.products.find((p) => p.sku === sku);

export const listingsOf = (db: DbState, sku: string): ListingRow[] =>
  db.listings.filter((l) => l.product_sku === sku).sort((a, b) => compareSizes(a.size, b.size));

export const imagesOf = (db: DbState, sku: string): ImageRow[] =>
  db.images.filter((i) => i.product_sku === sku).sort((a, b) => a.sort_order - b.sort_order);

export function resolved(db: DbState, listing: ListingRow) {
  const product = productOf(db, listing.product_sku);
  return resolveForListing(
    { groups: db.groups, settings: db.settings },
    listing,
    product?.group_id ?? db.groups[0].id,
  );
}

export const projectSource = (source: SourceRow): ListingSource => ({
  source: source.source,
  cost: moneyOrNull(source.cost_cents),
  cost_at: source.cost_at,
  previous_cost: moneyOrNull(source.previous_cost_cents),
  previous_cost_at: source.previous_cost_at,
  quantity: source.quantity,
  last_source_ref: source.last_source_ref,
  last_synced_at: source.last_synced_at,
  // StockX costs are crawled, never typed. The card renders no control at all; `source_read_only`
  // exists as a backstop for a frontend bug, not as a path the UI is expected to hit.
  editable: source.source === "in_house",
});

export function projectListing(db: DbState, listing: ListingRow): Listing {
  const product = productOf(db, listing.product_sku);
  const { margins, base, price } = resolved(db, listing);
  const inHouse = listing.sources.find((s) => s.source === "in_house");
  const approved = listing.approved_price_cents;

  // Gap 30: 對自有成本毛利 is a markup on the in-house cost (330/1200), not a gross margin (330/1530).
  // Null when there is no in-house cost or it is zero; the amount may be negative.
  const markup =
    inHouse?.cost_cents && inHouse.cost_cents !== 0 && approved !== null
      ? {
          amount: money(approved - inHouse.cost_cents),
          percent: rate(((approved - inHouse.cost_cents) / inHouse.cost_cents) * 100),
        }
      : null;

  return {
    id: listing.id,
    product_sku: listing.product_sku,
    product_name: product?.name ?? listing.product_sku,
    name_zh: product?.name_zh ?? null,
    size: listing.size,
    currency: "HKD",
    approval_status: listing.approval_status,
    base_cost: moneyOrNull(base?.costCents ?? null),
    base_cost_source: base?.slot ?? null,
    base_cost_at: base?.costAt ?? null,
    margin_percent: margins ? rate(margins.percent) : null,
    margin_fixed: margins ? money(margins.fixedCents) : null,
    margin_source: margins?.source ?? null,
    margin_override_percent: rateOrNull(listing.margin_override_percent),
    margin_override_fixed: moneyOrNull(listing.margin_override_fixed_cents),
    raw_price: moneyOrNull(price?.rawCents ?? null),
    rounding_applied: price?.roundingApplied ?? false,
    approved_price: moneyOrNull(approved),
    approved_at: listing.approved_at,
    previous_approved_price: moneyOrNull(listing.previous_approved_price_cents),
    previous_approved_at: listing.previous_approved_at,
    pending_price: moneyOrNull(listing.pending_price_cents),
    pending_since: listing.pending_since,
    pending_update_id: listing.pending_update_id,
    in_house_markup: markup,
    sources: listing.sources.map(projectSource),
    updated_at: listing.updated_at,
  };
}

const rangeOf = (values: readonly number[]): { min: number; max: number } | null =>
  values.length === 0 ? null : { min: Math.min(...values), max: Math.max(...values) };

export function projectAggregates(db: DbState, listings: readonly ListingRow[]): Aggregates {
  const resolvedAll = listings.map((l) => ({ listing: l, ...resolved(db, l) }));
  const costs = resolvedAll.flatMap((r) => (r.base ? [r.base.costCents] : []));
  const prices = listings.flatMap((l) =>
    l.approved_price_cents === null ? [] : [l.approved_price_cents],
  );
  const percents = resolvedAll.flatMap((r) => (r.margins ? [r.margins.percent] : []));
  const fixed = resolvedAll.flatMap((r) => (r.margins ? [r.margins.fixedCents] : []));

  const mix = { override: 0, group: 0, default: 0, none: 0 };
  for (const r of resolvedAll) {
    if (!r.margins) mix.none += 1;
    else mix[r.margins.source] += 1;
  }

  const inHouseQuantity = listings.reduce(
    (sum, l) => sum + (l.sources.find((s) => s.source === "in_house")?.quantity ?? 0),
    0,
  );
  // In-house only, and 在庫尺寸數 with it: StockX reports a constant quantity 1 per size, so counting
  // it would call every size in stock and overstate 總庫存 by exactly the size count (Gap 23).
  const inStock = listings.filter(
    (l) => (l.sources.find((s) => s.source === "in_house")?.quantity ?? 0) > 0,
  ).length;

  const distinctPrices = new Set(prices);
  const distinctMargins = new Set(resolvedAll.map((r) => `${r.margins?.percent}:${r.margins?.fixedCents}`));
  const slots = new Set(listings.flatMap((l) => l.sources.map((s) => s.source)));

  const costRange = rangeOf(costs);
  const priceRange = rangeOf(prices);
  const percentRange = rangeOf(percents);
  const fixedRange = rangeOf(fixed);

  return {
    size_count: listings.length,
    in_stock_size_count: inStock,
    total_in_house_quantity: inHouseQuantity,
    cost: costRange && { min: money(costRange.min), max: money(costRange.max) },
    price: priceRange && { min: money(priceRange.min), max: money(priceRange.max) },
    margin_percent: percentRange && { min: rate(percentRange.min), max: rate(percentRange.max) },
    margin_fixed: fixedRange && { min: money(fixedRange.min), max: money(fixedRange.max) },
    margin_source_mix: mix,
    override_count: listings.filter(
      (l) => l.margin_override_percent !== null || l.margin_override_fixed_cents !== null,
    ).length,
    has_size_variance: distinctMargins.size > 1 || distinctPrices.size > 1,
    source_count: slots.size,
  };
}

export function projectMarginSummary(db: DbState, listings: readonly ListingRow[]): MarginSummary {
  const pairs = listings
    .map((l) => resolved(db, l).margins)
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
      percent: rate(percents[0]),
      fixed: money(fixed[0]),
      percent_range: null,
      fixed_range: null,
    };
  }
  return {
    kind: "mixed",
    percent: null,
    fixed: null,
    percent_range: { min: rate(Math.min(...percents)), max: rate(Math.max(...percents)) },
    fixed_range: { min: money(Math.min(...fixed)), max: money(Math.max(...fixed)) },
  };
}

export const projectGroupRef = (group: GroupRow): GroupRef => ({
  id: group.id,
  name: group.name,
  is_default: group.is_default,
});

export function projectGroupSummary(db: DbState, group: GroupRow): GroupSummary {
  const products = db.products.filter((p) => p.group_id === group.id);
  const skus = new Set(products.map((p) => p.sku));
  return {
    ...projectGroupRef(group),
    margin_percent: rateOrNull(group.margin_percent),
    margin_fixed: moneyOrNull(group.margin_fixed_cents),
    product_count: products.length,
    listing_count: db.listings.filter((l) => skus.has(l.product_sku)).length,
    updated_at: group.updated_at,
  };
}

export function projectGroupDetail(db: DbState, group: GroupRow): GroupDetail {
  const skus = new Set(db.products.filter((p) => p.group_id === group.id).map((p) => p.sku));
  const listings = db.listings.filter((l) => skus.has(l.product_sku));

  // Two invariants Screen 4's 96 / 78 / 18 depends on: all = group_rule_only + overridden_only, and
  // all + ineligible.total = listing_count. Inactive and rejected sizes are ineligible, never scope.
  const eligible = listings.filter(
    (l) => l.approval_status !== "inactive" && l.approval_status !== "rejected",
  );
  const withCost = eligible.filter((l) => resolved(db, l).base !== null);
  const overridden = withCost.filter(
    (l) => l.margin_override_percent !== null || l.margin_override_fixed_cents !== null,
  );

  return {
    ...projectGroupSummary(db, group),
    scope_counts: {
      all: withCost.length,
      group_rule_only: withCost.length - overridden.length,
      overridden_only: overridden.length,
    },
    ineligible: {
      total: listings.length - withCost.length,
      inactive: listings.filter((l) => l.approval_status === "inactive").length,
      rejected: listings.filter((l) => l.approval_status === "rejected").length,
      missing_cost: eligible.length - withCost.length,
    },
  };
}

export const projectImage = (image: ImageRow): ProductImage => ({
  id: image.id,
  url: image.url,
  sort_order: image.sort_order,
  is_primary: image.is_primary,
  width: image.width,
  height: image.height,
  bytes: image.bytes,
  created_at: image.created_at,
});

const statusesOf = (listings: readonly ListingRow[]): ApprovalStatus[] =>
  listings.map((l) => l.approval_status);

export function projectProductRow(db: DbState, product: ProductRow): ProductRowWire {
  const listings = listingsOf(db, product.sku);
  const images = imagesOf(db, product.sku);
  return {
    sku: product.sku,
    name: product.name,
    name_zh: product.name_zh,
    brand: product.brand,
    group: projectGroupRef(groupOf(db, product.group_id)),
    status: productTab(statusesOf(listings)),
    primary_image_url: images.find((i) => i.is_primary)?.url ?? images[0]?.url ?? null,
    aggregates: projectAggregates(db, listings),
    margin_summary: projectMarginSummary(db, listings),
    last_imported_at: product.last_imported_at,
    updated_at: product.updated_at,
    created_at: product.created_at,
  };
}

export function projectProductDetail(db: DbState, product: ProductRow): ProductDetail {
  const listings = listingsOf(db, product.sku);
  return {
    sku: product.sku,
    name: product.name,
    name_zh: product.name_zh,
    title: product.title,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: product.tags,
    stockx_name: product.stockx_name,
    group: projectGroupRef(groupOf(db, product.group_id)),
    status: productTab(statusesOf(listings)),
    images: imagesOf(db, product.sku).map(projectImage),
    listings: listings.map((l) => projectListing(db, l)),
    aggregates: projectAggregates(db, listings),
    margin_summary: projectMarginSummary(db, listings),
    last_imported_at: product.last_imported_at,
    updated_at: product.updated_at,
    created_at: product.created_at,
  };
}

export function projectApprovalRow(db: DbState, update: UpdateRow): ApprovalRow | null {
  const listing = db.listings.find((l) => l.id === update.listing_id);
  if (!listing) return null;
  const product = productOf(db, listing.product_sku);
  const delta = update.delta_percent_exact;
  return {
    update_id: update.id,
    listing_id: listing.id,
    product_sku: listing.product_sku,
    product_name: product?.name ?? listing.product_sku,
    name_zh: product?.name_zh ?? null,
    size: listing.size,
    source: update.source,
    cost: money(update.cost_cents),
    previous_cost: moneyOrNull(update.previous_cost_cents),
    previous_cost_at: update.previous_cost_at,
    approved_price: moneyOrNull(update.approved_price_cents),
    new_price: moneyOrNull(update.new_price_cents),
    raw_price: moneyOrNull(update.raw_price_cents),
    rounding_applied: update.rounding_applied,
    delta_percent: delta === null ? null : rate1(delta),
    delta_percent_exact: delta === null ? null : rate(delta),
    delta_direction: delta === null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    threshold_up_percent: rate(update.threshold_up_percent),
    threshold_down_percent: rate(update.threshold_down_percent),
    status: update.status,
    approval_status: listing.approval_status,
    outcome: update.outcome,
    engine: update.engine,
    pending_since: update.pending_since,
    observed_at: update.observed_at,
    created_at: update.created_at,
  };
}

export const projectHistoryRow = (row: HistoryRowStore): HistoryRow => ({
  id: row.id,
  listing_id: row.listing_id,
  product_sku: row.product_sku,
  size: row.size,
  changed_at: row.changed_at,
  change_type: row.change_type,
  source: row.source,
  actor_label: row.actor_label,
  actor_id: row.actor_id,
  previous_value: row.previous_value,
  new_value: row.new_value,
  previous_price: moneyOrNull(row.previous_price_cents),
  price: moneyOrNull(row.price_cents),
  previous_quantity: row.previous_quantity,
  quantity: row.quantity,
  delta: moneyOrNull(row.delta_cents),
  delta_percent: row.delta_percent === null ? null : rate(row.delta_percent),
});

export const projectJobItem = (item: JobItemRow): JobItem => ({
  id: item.id,
  listing_id: item.listing_id,
  product_sku: item.product_sku,
  size: item.size,
  status: item.status,
  reason: item.reason,
  attempts: item.attempts,
  updated_at: item.updated_at,
});

export const projectJobSummary = (job: JobRow): JobSummary => ({
  id: job.id,
  kind: job.kind,
  scope_key: job.scope_key,
  status: job.status,
  total: job.total,
  done: job.done,
  ok_count: job.ok_count,
  failed_count: job.failed_count,
  created_at: job.created_at,
  started_at: job.started_at,
  finished_at: job.finished_at,
  last_error: job.last_error,
});

export const projectJob = (job: JobRow, items: readonly JobItemRow[]): Job => ({
  ...projectJobSummary(job),
  result: job.result && {
    updated_count: job.result.updated_count,
    overridden_cleared_count: job.result.overridden_cleared_count,
    held_count: job.result.held_count,
    average_price_before: moneyOrNull(job.result.average_price_before_cents),
    average_price_after: moneyOrNull(job.result.average_price_after_cents),
  },
  items: items.map(projectJobItem),
});

export const projectCrawlRun = (run: CrawlRunRow): CrawlRun => ({
  id: run.id,
  run_id: run.run_id,
  source: run.source,
  trigger: run.trigger,
  started_at: run.started_at,
  finished_at: run.finished_at,
  item_count: run.item_count,
  ok_count: run.ok_count,
  error_count: run.error_count,
});

export const projectSettings = (settings: SettingsRow): Settings => ({
  auto_approve_up_percent: rate(settings.auto_approve_up_percent),
  auto_approve_down_percent: rate(settings.auto_approve_down_percent),
  default_margin_enabled: settings.default_margin_enabled,
  default_margin_percent: rate(settings.default_margin_percent),
  default_margin_fixed: money(settings.default_margin_fixed_cents),
  rounding_enabled: settings.rounding_enabled,
  crawl_cadence_minutes: settings.crawl_cadence_minutes,
  updated_at: settings.updated_at,
  updated_by_name: settings.updated_by_name,
});

export const projectAllowedUser = (user: AllowedUserRow, selfEmail: string): AllowedUser => ({
  email: user.email,
  name: user.name,
  added_at: user.added_at,
  added_by_name: user.added_by_name,
  // Gap 28: 移除 is disabled on your own row, which the client cannot know without being told.
  is_self: user.email === selfEmail,
});

export type ProductTabName = "listed" | "unlisted" | "delisted";

export const productTabOf = (db: DbState, product: ProductRow): ProductTabName =>
  productTab(statusesOf(listingsOf(db, product.sku)));
