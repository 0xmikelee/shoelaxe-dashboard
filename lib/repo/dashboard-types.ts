import type {
  ApprovalStatus,
  EventSource,
  ListingSourceSlot,
  MarginSource,
  Outcome,
} from "@/lib/domain/types";
import type { ApprovalsFilters } from "@/lib/schemas/params/approvals";
import type { SessionActor } from "@/lib/http/session-auth";

export interface DashboardSettings {
  auto_approve_up_percent: string;
  auto_approve_down_percent: string;
  default_margin_enabled: boolean;
  default_margin_percent: string;
  default_margin_fixed: string;
  rounding_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
}

export interface DashboardGroup {
  id: string;
  name: string;
  margin_percent: string | null;
  margin_fixed: string | null;
  is_default: boolean;
}

export interface DashboardProduct {
  id: string;
  product_sku: string;
  product_name: string;
  name_zh: string | null;
  brand: string | null;
  title: string | null;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  stockx_name: string | null;
  product_group_id: string;
  last_imported_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardListing {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  name_zh: string | null;
  brand: string;
  size: string;
  currency: string;
  group_id: string;
  group_name: string;
  group_is_default: boolean;
  group_margin_percent: string | null;
  group_margin_fixed: string | null;
  approval_status: ApprovalStatus;
  approved_price: string | null;
  approved_at: string | null;
  previous_approved_price: string | null;
  previous_approved_at: string | null;
  base_cost: string | null;
  base_cost_source: ListingSourceSlot | null;
  base_cost_at: string | null;
  pending_price: string | null;
  pending_since: string | null;
  pending_update_id: string | null;
  margin_percent: string | null;
  margin_fixed: string | null;
  margin_source: MarginSource | null;
  updated_at: string;
}

export interface DashboardSource {
  listing_id: string;
  source: ListingSourceSlot;
  cost: string | null;
  cost_at: string | null;
  previous_cost: string | null;
  previous_cost_at: string | null;
  quantity: number;
  last_source_ref: string | null;
  last_synced_at: string | null;
}

export interface DashboardImage {
  id: string;
  product_sku: string;
  url: string;
  storage_path: string | null;
  sort_order: number;
  is_primary: boolean;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

export interface DashboardPriceUpdate {
  id: string;
  listing_id: string | null;
  product_sku: string;
  product_name: string;
  size: string;
  source: EventSource;
  cost: string | null;
  status: "pending" | "applied" | "skipped" | "rejected" | "error";
  outcome: Outcome | null;
  engine: "v1" | "v2";
  threshold_up_percent: string | null;
  threshold_down_percent: string | null;
  observed_at: string | null;
  received_at: string;
}

export interface ListingStatePatch {
  approval_status: ApprovalStatus;
  approved_price: string | null;
  approved_at: string | null;
  current_price: string | null;
  pending_price: string | null;
  pending_since: string | null;
  pending_update_id: string | null;
  margin_source: MarginSource | null;
  margin_percent?: string | null;
  margin_fixed?: string | null;
  base_cost?: string | null;
  base_cost_source?: ListingSourceSlot | null;
  base_cost_at?: string | null;
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
  change_type:
    | "cost"
    | "margin_percent"
    | "margin_fixed"
    | "listing_price"
    | "quantity"
    | "listing_status"
    | "margin_source"
    | "manual_price";
  actor_label: string;
  actor_id: string | null;
}

export interface DashboardJob {
  id: string;
  kind: "settings_recompute" | "group_apply" | "group_rule_recompute";
  scope_key: string | null;
  payload: Record<string, unknown>;
  total: number;
  done: number;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "deferred";
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SettingsPatch {
  auto_approve_up_percent?: string;
  auto_approve_down_percent?: string;
  default_margin_enabled?: boolean;
  default_margin_percent?: string;
  default_margin_fixed?: string;
  rounding_enabled?: boolean;
}

export interface ProductContentPatch {
  product_name?: string;
  name_zh?: string;
  title?: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
}

/**
 * Persistence for dashboard reads and writes. postgres.js stays in the Postgres implementation;
 * unit tests use the in-memory one.
 */
export interface DashboardRepo {
  getSettings(): Promise<DashboardSettings>;
  updateSettings(patch: SettingsPatch, actor: SessionActor, now: string): Promise<DashboardSettings>;

  getGroup(id: string): Promise<DashboardGroup>;

  findProductBySku(sku: string): Promise<DashboardProduct | null>;
  updateProduct(id: string, patch: ProductContentPatch, now: string): Promise<void>;

  findListingById(id: string): Promise<DashboardListing | null>;
  lockListing(id: string): Promise<DashboardListing | null>;
  listListingsBySku(sku: string): Promise<DashboardListing[]>;
  listListingIdsBySku(sku: string): Promise<string[]>;
  listRecomputeListingIds(opts: {
    roundingOrBandChanged: boolean;
    defaultMarginChanged: boolean;
  }): Promise<string[]>;
  updateListingState(id: string, patch: ListingStatePatch): Promise<void>;

  listSources(listingId: string): Promise<DashboardSource[]>;
  upsertInHouseSource(input: {
    listing_id: string;
    cost: string | null;
    costAt: string | null;
    quantity: number;
    last_synced_at: string;
    writeCost: boolean;
  }): Promise<void>;

  insertHistory(input: InsertHistoryInput): Promise<{ id: string }>;
  insertAuditLog(entry: {
    user_id: string | null;
    actor_label: string;
    action: string;
    target_table: string;
    target_id: string | null;
    before: unknown;
    after: unknown;
  }): Promise<void>;
  enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<void>;
  enqueueLiveShopifySyncForProduct(productId: string, state: "queued" | "deferred"): Promise<number>;

  markUpdateOutcome(
    id: string,
    patch: { outcome: Outcome; status: DashboardPriceUpdate["status"] },
  ): Promise<void>;

  listApprovals(
    filters: ApprovalsFilters,
    nowMs: number,
  ): Promise<{ rows: ApprovalJoinRow[]; total: number }>;
  approvalStats(nowMs: number): Promise<{
    total_crawled: number;
    crawled_today: number;
    pending: number;
    confirmed: number;
    rejected: number;
    oldest_pending_since: string | null;
  }>;

  listImages(sku: string): Promise<DashboardImage[]>;
  countImages(sku: string): Promise<number>;
  insertImage(row: Omit<DashboardImage, "id" | "created_at"> & { id?: string }, now: string): Promise<DashboardImage>;
  findImage(sku: string, imageId: string): Promise<DashboardImage | null>;
  deleteImage(imageId: string): Promise<void>;
  applyImageOrder(sku: string, ids: readonly string[]): Promise<void>;
  setPrimaryImage(sku: string, imageId: string): Promise<void>;

  findActiveJob(kind: DashboardJob["kind"], scopeKey: string): Promise<DashboardJob | null>;
  insertJob(input: {
    kind: DashboardJob["kind"];
    scope_key: string;
    total: number;
    payload: Record<string, unknown>;
    triggered_by: string | null;
  }): Promise<DashboardJob>;
  insertJobItems(jobId: string, listingIds: readonly string[]): Promise<void>;
  claimQueuedJob(kind: DashboardJob["kind"], now: string): Promise<DashboardJob | null>;
  listQueuedJobListingIds(jobId: string): Promise<string[]>;
  markJobItemDone(jobId: string, listingId: string, status: "succeeded" | "failed", reason: string | null): Promise<void>;
  finishJob(jobId: string, status: "succeeded" | "failed", now: string, lastError: string | null): Promise<void>;
  incrementJobDone(jobId: string): Promise<void>;
}

export interface ApprovalJoinRow {
  update: DashboardPriceUpdate;
  listing: DashboardListing;
  sources: DashboardSource[];
}
