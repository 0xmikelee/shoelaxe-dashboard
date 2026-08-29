import type { z } from "zod";
import type {
  ApplyScope as ApplyScopeSchema,
  CrawlSource as CrawlSourceSchema,
  CrawlTrigger as CrawlTriggerSchema,
  JobItemReason as JobItemReasonSchema,
  JobKind as JobKindSchema,
  JobStatus as JobStatusSchema,
  Liveness as LivenessSchema,
  MarginSummaryKind as MarginSummaryKindSchema,
} from "@/lib/schemas/wire/common";
import type { DateRangePreset as DateRangePresetSchema } from "@/lib/schemas/params/common";
import type { ProductsSort as ProductsSortSchema } from "@/lib/schemas/params/products";
import type { ApprovalsSort as ApprovalsSortSchema } from "@/lib/schemas/params/approvals";
import type {
  EventSource,
  ListingSourceSlot,
  MarginSource,
  PriceHistoryChangeType,
} from "@/lib/domain/types";
import type { DeltaDirection } from "@/lib/format/delta";
import type { Tone } from "@/lib/format/tone";

/**
 * Enum → Chinese, one map per wire enum, each `satisfies Record<Union, …>` so a value added to the
 * schema fails this file to compile rather than rendering its raw snake_case on a screen.
 *
 * Types come in as type-only imports of the zod enums: the labels need the unions and none of zod's
 * runtime.
 */

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobKind = z.infer<typeof JobKindSchema>;
export type JobItemReason = z.infer<typeof JobItemReasonSchema>;
export type ApplyScope = z.infer<typeof ApplyScopeSchema>;
export type Liveness = z.infer<typeof LivenessSchema>;
export type MarginSummaryKind = z.infer<typeof MarginSummaryKindSchema>;
export type CrawlSource = z.infer<typeof CrawlSourceSchema>;
export type CrawlTrigger = z.infer<typeof CrawlTriggerSchema>;
export type DateRangePreset = z.infer<typeof DateRangePresetSchema>;
export type ProductsSort = z.infer<typeof ProductsSortSchema>;
export type ApprovalsSort = z.infer<typeof ApprovalsSortSchema>;

/**
 * Gap 35. The design's 電子郵件 / 手動輸入 is a category error: the source is StockX and the
 * *transport* is email. Naming the transport alone leaves 「電子郵件」 sitting in a column beside a
 * price with nothing to say where the price came from.
 */
export const EVENT_SOURCE_LABEL = {
  stockx: "StockX（郵件）",
  google_sheet: "Google 試算表（手動）",
  dashboard: "後台編輯",
} as const satisfies Record<EventSource, string>;

/** The two fixed slots on a listing, as the Screen 8 source cards name them. */
export const SOURCE_SLOT_LABEL = {
  stockx: "StockX",
  in_house: "店內庫存",
} as const satisfies Record<ListingSourceSlot, string>;

export const SOURCE_SLOT_KIND_LABEL = {
  stockx: "外部市場（唯讀同步）",
  in_house: "自有庫存（可編輯）",
} as const satisfies Record<ListingSourceSlot, string>;

/** `price_history.change_type`, the 變更項目 column. */
export const CHANGE_TYPE_LABEL = {
  cost: "成本",
  margin_percent: "利潤率",
  margin_fixed: "固定加價",
  listing_price: "售價",
  quantity: "庫存",
  listing_status: "上架狀態",
  margin_source: "利潤來源",
  manual_price: "手動指定售價",
} as const satisfies Record<PriceHistoryChangeType, string>;

/**
 * `price_history.actor_label` is a free string — either one of these four or a person's name — and
 * is rendered verbatim. These are here so the history table can tell a system actor from a human
 * one (系統 versus a name) without matching Chinese literals at the call site.
 */
export const ACTOR_LABEL = {
  system: "系統自動",
  crawl: "爬取更新",
  groupBatch: "分組批次更新",
  manual: "手動編輯",
} as const;

export type ActorKind = keyof typeof ACTOR_LABEL;

const SYSTEM_ACTORS: ReadonlySet<string> = new Set([
  ACTOR_LABEL.system,
  ACTOR_LABEL.crawl,
  ACTOR_LABEL.groupBatch,
]);

/** 手動編輯 is not a system actor: it is a person, and the row carries their name beside it. */
export const isSystemActor = (actorLabel: string): boolean => SYSTEM_ACTORS.has(actorLabel);

/** `queued` renders 排隊中 and never `0 / 96`, which reads as a job that has stalled. */
export const JOB_STATUS_LABEL = {
  queued: "排隊中",
  running: "套用中",
  succeeded: "已完成",
  failed: "失敗",
  cancelled: "已取消",
  deferred: "已延後",
} as const satisfies Record<JobStatus, string>;

export const JOB_STATUS_TONE = {
  queued: "neutral",
  running: "info",
  succeeded: "success",
  failed: "error",
  cancelled: "neutral",
  deferred: "warning",
} as const satisfies Record<JobStatus, Tone>;

export const JOB_KIND_LABEL = {
  group_apply: "分組批次更新",
  settings_recompute: "系統設定重算",
  group_rule_recompute: "分組規則重算",
} as const satisfies Record<JobKind, string>;

/**
 * The delta shows no reason badges on Screen 4 state E, but the API returns one per failed item and
 * `missing_cost` is the single failure a user can act on, so these ride in a tooltip.
 */
export const JOB_ITEM_REASON_LABEL = {
  missing_cost: "沒有成本，無法計算售價",
  needs_margins: "尚未設定利潤",
  listing_inactive: "此尺寸已下架",
  shopify_error: "上架通路錯誤",
  internal_error: "系統錯誤",
} as const satisfies Record<JobItemReason, string>;

export const MARGIN_SOURCE_LABEL = {
  override: "已覆寫",
  group: "分組規則",
  default: "使用系統預設",
} as const satisfies Record<MarginSource, string>;

/** Screen 4's three scope radios, and Screen 8's 套用至所有尺寸, which reuses the vocabulary. */
export const APPLY_SCOPE_LABEL = {
  all: "全部尺寸",
  group_rule_only: "僅使用分組規則的尺寸",
  overridden_only: "僅已覆寫的尺寸",
} as const satisfies Record<ApplyScope, string>;

export const APPLY_SCOPE_HINT = {
  all: "覆寫所有個別設定",
  group_rule_only: "保留個別覆寫",
  overridden_only: "重設為新的分組規則",
} as const satisfies Record<ApplyScope, string>;

export const DELTA_DIRECTION_LABEL = {
  up: "上升",
  down: "下降",
  flat: "持平",
} as const satisfies Record<DeltaDirection, string>;

/**
 * Two separate liveness readings on Screen 2: the Apps Script trigger and the background worker.
 * They are different outages with different fixes, so they never share one indicator.
 */
export const LIVENESS_LABEL = {
  ok: "運行中",
  stale: "已停止更新",
  never: "尚未執行",
} as const satisfies Record<Liveness, string>;

export const LIVENESS_TONE = {
  ok: "success",
  stale: "warning",
  never: "neutral",
} as const satisfies Record<Liveness, Tone>;

export const CRAWL_SOURCE_LABEL = {
  stockx: "StockX（郵件）",
  google_sheet: "Google 試算表（手動）",
} as const satisfies Record<CrawlSource, string>;

export const CRAWL_TRIGGER_LABEL = {
  cron: "排程",
  manual: "手動",
} as const satisfies Record<CrawlTrigger, string>;

/** Screen 7's 利潤 column renders 「—」 for `none`; `mixed` earns the 尺寸差異 badge. */
export const MARGIN_SUMMARY_KIND_LABEL = {
  uniform: "全部尺寸相同",
  mixed: "尺寸差異",
  none: "未設定利潤",
} as const satisfies Record<MarginSummaryKind, string>;

export const DATE_RANGE_PRESET_LABEL = {
  today: "今日",
  "7d": "最近 7 天",
  "30d": "最近 30 天",
  "90d": "最近 90 天",
  all: "全部時間",
} as const satisfies Record<DateRangePreset, string>;

export const PRODUCTS_SORT_LABEL = {
  last_imported_at: "最新匯入",
  name: "產品名稱",
  sku: "SKU",
  size_count: "尺寸數",
  price: "售價",
  updated_at: "最後更新",
} as const satisfies Record<ProductsSort, string>;

export const APPROVALS_SORT_LABEL = {
  pending_since: "待審時間",
  created_at: "建立時間",
  delta_percent: "差異%",
  new_price: "更新上架價格",
  cost: "最新爬取價格",
  product_name: "產品名稱",
  size: "尺寸",
} as const satisfies Record<ApprovalsSort, string>;
