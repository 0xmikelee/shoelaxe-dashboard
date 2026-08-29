import type {
  ApprovalStatus,
  EventSource,
  ListingSourceSlot,
  Outcome,
  PriceHistoryChangeType,
} from "@/lib/domain/types";

export type { EventSource };

/**
 * The mock's *storage* shapes, which are not the wire shapes.
 *
 * Money is integer cents here and a numeric string on the wire, exactly as in the real system — the
 * projection in mocks/project.ts is the only place the two representations meet. A mock that stored
 * "1530.00" would be unable to reuse lib/domain's pricing at all, and would then have to
 * re-implement the x49/x99 rule in a second place and drift from it.
 */
export type Cents = number;

export type ApprovalRowStatusValue =
  | "above_threshold"
  | "below_threshold"
  | "within_band"
  | "pending_new"
  | "needs_margins"
  | "rejected"
  | "superseded";

export type JobStatusValue =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "deferred";

export type JobKindValue = "group_apply" | "settings_recompute" | "group_rule_recompute";

export type JobItemReasonValue =
  | "missing_cost"
  | "needs_margins"
  | "listing_inactive"
  | "shopify_error"
  | "internal_error";

export interface GroupRow {
  id: string;
  name: string;
  is_default: boolean;
  margin_percent: number | null;
  margin_fixed_cents: Cents | null;
  updated_at: string;
}

export interface ImageRow {
  id: string;
  product_sku: string;
  url: string;
  sort_order: number;
  is_primary: boolean;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

export interface ProductRow {
  sku: string;
  name: string;
  name_zh: string | null;
  brand: string | null;
  title: string | null;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  /** Gap 27: stamped from the last `product_name` seen on a stockx update. Read-only. */
  stockx_name: string | null;
  group_id: string;
  /** 排序：最新匯入 sorts on this. An edit moves `updated_at` and leaves this alone. */
  last_imported_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  source: ListingSourceSlot;
  cost_cents: Cents | null;
  /** Set only when a cost is written — never on a quantity-only sync (see lib/domain/baseCost.ts). */
  cost_at: string | null;
  previous_cost_cents: Cents | null;
  previous_cost_at: string | null;
  quantity: number;
  last_source_ref: string | null;
  last_synced_at: string | null;
}

export interface ListingRow {
  id: string;
  product_sku: string;
  size: string;
  approval_status: ApprovalStatus;
  margin_override_percent: number | null;
  margin_override_fixed_cents: Cents | null;
  /**
   * True for a listing decided while the margin chain was empty. The chain would resolve *today*
   * because the system default is enabled, and nothing recomputes a listing until the next ingest —
   * so without this the 未設定利潤 rows would render a margin and contradict their own status.
   * Cleared by any write that resolves margins for the listing.
   */
  margins_unresolved: boolean;
  approved_price_cents: Cents | null;
  approved_at: string | null;
  previous_approved_price_cents: Cents | null;
  previous_approved_at: string | null;
  pending_price_cents: Cents | null;
  pending_since: string | null;
  pending_update_id: string | null;
  sources: SourceRow[];
  updated_at: string;
}

/** One `price_updates` row — the approval queue is a projection of these, not of listings. */
export interface UpdateRow {
  id: string;
  listing_id: string;
  source: EventSource;
  cost_cents: Cents;
  previous_cost_cents: Cents | null;
  previous_cost_at: string | null;
  /** The live price as it stood when this decision was made, which is not necessarily today's. */
  approved_price_cents: Cents | null;
  new_price_cents: Cents | null;
  raw_price_cents: Cents | null;
  rounding_applied: boolean;
  /** Full precision. The one-decimal display figure is derived from it, never the other way round. */
  delta_percent_exact: number | null;
  status: ApprovalRowStatusValue;
  outcome: Outcome | null;
  engine: "v1" | "v2";
  threshold_up_percent: number;
  threshold_down_percent: number;
  pending_since: string | null;
  observed_at: string | null;
  created_at: string;
}

export interface HistoryRowStore {
  id: string;
  listing_id: string;
  product_sku: string;
  size: string;
  changed_at: string;
  change_type: PriceHistoryChangeType;
  source: EventSource;
  actor_label: string;
  actor_id: string | null;
  previous_value: string | null;
  new_value: string | null;
  previous_price_cents: Cents | null;
  price_cents: Cents | null;
  previous_quantity: number | null;
  quantity: number | null;
  delta_cents: Cents | null;
  delta_percent: number | null;
}

export interface JobItemRow {
  id: string;
  job_id: string;
  listing_id: string;
  product_sku: string;
  size: string;
  status: JobStatusValue;
  reason: JobItemReasonValue | null;
  attempts: number;
  updated_at: string;
}

export interface JobRow {
  id: string;
  kind: JobKindValue;
  /** The group id for a group apply — how Screen 3 finds the job blocking 批次更新利潤. */
  scope_key: string | null;
  status: JobStatusValue;
  total: number;
  done: number;
  ok_count: number;
  failed_count: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  result: {
    updated_count: number;
    overridden_cleared_count: number;
    held_count: number;
    average_price_before_cents: Cents | null;
    average_price_after_cents: Cents | null;
  } | null;
  /** Set by the runner when a partial failure is forced; drives which items fail. */
  fail_every: number | null;
}

export interface CrawlRunRow {
  id: string;
  run_id: string;
  source: "stockx" | "google_sheet";
  trigger: "cron" | "manual";
  started_at: string;
  finished_at: string | null;
  item_count: number;
  ok_count: number;
  error_count: number;
}

export interface AllowedUserRow {
  email: string;
  name: string;
  added_at: string;
  added_by_name: string | null;
  user_id: string;
}

export interface SettingsRow {
  auto_approve_up_percent: number;
  auto_approve_down_percent: number;
  default_margin_enabled: boolean;
  default_margin_percent: number;
  default_margin_fixed_cents: Cents;
  rounding_enabled: boolean;
  crawl_cadence_minutes: number | null;
  updated_at: string;
  updated_by_name: string | null;
}

export interface MeRow {
  user_id: string;
  email: string;
  name: string;
}

export interface DbState {
  me: MeRow;
  settings: SettingsRow;
  groups: GroupRow[];
  products: ProductRow[];
  images: ImageRow[];
  listings: ListingRow[];
  updates: UpdateRow[];
  history: HistoryRowStore[];
  jobs: JobRow[];
  jobItems: JobItemRow[];
  crawlRuns: CrawlRunRow[];
  allowedUsers: AllowedUserRow[];
}
