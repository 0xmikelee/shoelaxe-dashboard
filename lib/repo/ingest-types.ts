import type { ApprovalStatus, EventSource, ListingSourceSlot, MarginSource, Outcome } from "@/lib/domain/types";

export type PriceUpdateStatus = "pending" | "applied" | "skipped" | "rejected" | "error";

export interface PriceUpdateRow {
  id: string;
  product_sku: string;
  product_name: string;
  brand: string;
  size: string;
  currency: string;
  cost: string | null;
  quantity: number | null;
  source: EventSource;
  source_ref: string | null;
  stockx_internal_id: string | null;
  listing_id: string | null;
  history_id: string | null;
  status: PriceUpdateStatus;
  outcome: Outcome | null;
  error_message: string | null;
  received_at: string;
  applied_at: string | null;
  engine: "v1" | "v2";
  observed_at: string | null;
  threshold_up_percent: string | null;
  threshold_down_percent: string | null;
}

export interface ProductRow {
  id: string;
  product_sku: string;
  product_name: string;
  brand: string;
  stockx_internal_id: string | null;
  product_group_id: string;
  /** Set after a successful KicksDB write; sheet name/brand must not overwrite it. */
  kicks_enriched_at?: string | null;
}

export interface ListingRow {
  id: string;
  product_id: string;
  size: string;
  currency: string;
  source: "stockx" | "google_sheet";
  last_source_ref: string | null;
  cost: string | null;
  margin_percent: string | null;
  margin_fixed: string | null;
  current_price: string | null;
  approval_status: ApprovalStatus;
  approved_price: string | null;
  approved_at: string | null;
  base_cost: string | null;
  base_cost_source: ListingSourceSlot | null;
  base_cost_at: string | null;
  pending_price: string | null;
  pending_since: string | null;
  pending_update_id: string | null;
  margin_source: MarginSource | null;
}

export interface ListingSourceRow {
  id: string;
  listing_id: string;
  source: ListingSourceSlot;
  cost: string | null;
  cost_at: string | null;
  quantity: number;
  last_source_ref: string | null;
  last_synced_at: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  margin_percent: string | null;
  margin_fixed: string | null;
  is_default: boolean;
}

export interface PricingSettingsRow {
  auto_approve_up_percent: string;
  auto_approve_down_percent: string;
  default_margin_enabled: boolean;
  default_margin_percent: string;
  default_margin_fixed: string;
  rounding_enabled: boolean;
}

export interface CrawlRunRow {
  id: string;
  run_id: string;
  source: string;
  trigger: string;
  started_at: string;
  item_count: number;
  ok_count: number;
  error_count: number;
}

export interface UnapprovedUpdateRow {
  id: string;
  observedAt: string;
}

export interface InsertPriceUpdateInput {
  product_sku: string;
  product_name: string;
  brand: string;
  size: string;
  currency: string;
  cost: string | null;
  quantity: number | null;
  source: EventSource;
  source_ref: string;
  stockx_internal_id: string | null;
  observed_at: string;
}

export interface InsertProductInput {
  product_sku: string;
  product_name: string;
  brand: string;
  stockx_internal_id: string | null;
  product_group_id: string;
}

export interface InsertListingInput {
  product_id: string;
  size: string;
  currency: string;
  source: "stockx" | "google_sheet";
  last_source_ref: string | null;
  cost: string | null;
}

export interface UpsertSourceInput {
  listing_id: string;
  source: ListingSourceSlot;
  cost: string | null;
  costAt: string | null;
  quantity: number;
  last_source_ref: string | null;
  last_synced_at: string;
  writeCost: boolean;
}

export interface ListingPatch {
  last_source_ref: string | null;
  cost: string | null;
  current_price: string | null;
  approval_status: ApprovalStatus;
  approved_price: string | null;
  approved_at: string | null;
  base_cost: string | null;
  base_cost_source: ListingSourceSlot | null;
  base_cost_at: string | null;
  pending_price: string | null;
  pending_since: string | null;
  pending_update_id: string | null;
  margin_source: MarginSource | null;
}

export interface FinalizePriceUpdateInput {
  status: PriceUpdateStatus;
  outcome: Outcome | null;
  error_message: string | null;
  listing_id: string | null;
  history_id: string | null;
  applied_at: string | null;
  threshold_up_percent: string | null;
  threshold_down_percent: string | null;
}

export interface InsertHistoryInput {
  listing_id: string;
  product_name: string;
  product_sku: string;
  brand: string;
  size: string;
  price: string | null;
  previous_price: string | null;
  currency: string;
  source: EventSource;
  source_ref: string;
  quantity: number | null;
  previous_quantity: number | null;
  cost: string | null;
  previous_cost: string | null;
  change_type: "cost" | "quantity" | "listing_price" | "listing_status";
  actor_label: string;
}

export interface InsertCrawlRunInput {
  run_id: string;
  source: string;
  trigger: string;
  started_at: string;
}

/**
 * Persistence for one ingest item (and the crawl-run bookkeeping around a batch).
 * postgres.js tagged-template SQL stays in the Postgres implementation; tests use an in-memory one.
 */
export interface IngestRepo {
  findPriceUpdateBySourceRef(
    source: EventSource,
    sourceRef: string,
  ): Promise<PriceUpdateRow | null>;
  insertPriceUpdate(input: InsertPriceUpdateInput): Promise<PriceUpdateRow>;

  getDefaultGroup(): Promise<GroupRow>;
  getGroup(id: string): Promise<GroupRow>;
  getPricingSettings(): Promise<PricingSettingsRow>;

  findProductBySku(sku: string): Promise<ProductRow | null>;
  insertProduct(input: InsertProductInput): Promise<ProductRow>;
  touchProduct(
    id: string,
    fields: { product_name: string; brand: string; stockx_internal_id: string | null },
  ): Promise<void>;

  findListing(productId: string, size: string, currency: string): Promise<ListingRow | null>;
  insertListing(input: InsertListingInput): Promise<ListingRow>;
  lockListing(id: string): Promise<ListingRow>;
  updateListing(id: string, patch: ListingPatch): Promise<void>;

  listListingSources(listingId: string): Promise<ListingSourceRow[]>;
  upsertListingSource(input: UpsertSourceInput): Promise<ListingSourceRow>;

  listUnapprovedUpdates(listingId: string): Promise<UnapprovedUpdateRow[]>;
  markSuperseded(ids: readonly string[]): Promise<void>;

  insertPriceHistory(input: InsertHistoryInput): Promise<{ id: string }>;
  finalizePriceUpdate(id: string, patch: FinalizePriceUpdateInput): Promise<PriceUpdateRow>;

  insertAuditLog(entry: {
    actor_label: string;
    action: string;
    target_table: string;
    target_id: string | null;
    before: unknown;
    after: unknown;
  }): Promise<void>;
  enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<void>;

  findCrawlRun(runId: string): Promise<CrawlRunRow | null>;
  insertCrawlRun(input: InsertCrawlRunInput): Promise<CrawlRunRow>;
  incrementCrawlRun(
    runId: string,
    delta: { items: number; ok: number; error: number },
    finishedAt: string,
  ): Promise<void>;
}
