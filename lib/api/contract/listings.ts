import type { RouteDoc } from "@/lib/openapi/registry";
import {
  BulkListingResultWire,
  HistoryListWire,
  ListingDetailWire,
  ListingWire,
} from "@/lib/schemas/wire/listings";
import {
  BulkApproveBody,
  HistoryQuery,
  ListingMarginsBody,
  ListingPriceBody,
  ListingRejectBody,
} from "@/lib/schemas/params/listings";
import { ListingIdPath } from "@/lib/schemas/params/paths";
import { READ_ERRORS, SESSION_ERRORS, WRITE_ERRORS } from "./common";

export const listingsContract: RouteDoc[] = [
  {
    operationId: "getListing",
    method: "get",
    path: "/api/v1/listings/{id}",
    summary: "One size, with its sources, resolved margins and last 20 history rows",
    description:
      "§6.2 also promised an inbound log; Gap 32 found it has no consumer, so it is not returned. " +
      "An unread field is a field that rots.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 8 (expanded size row)",
    request: { params: ListingIdPath },
    response: ListingDetailWire,
    errors: [...SESSION_ERRORS, "not_found"],
    idempotency: "Safe.",
  },
  {
    operationId: "getListingHistory",
    method: "get",
    path: "/api/v1/listings/{id}/history",
    summary: "Full price history for one size, filterable and exportable",
    description:
      "Serves two consumers with one endpoint (Gap 20): `limit` returns the newest N for the " +
      "近 6 次變更 chart, paging returns the table below it. `format=csv` streams a file rather than " +
      "an envelope.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 8 (per-size 價格變動紀錄 and the six-bar chart)",
    request: { params: ListingIdPath, query: HistoryQuery },
    response: HistoryListWire,
    errors: [...READ_ERRORS, "not_found"],
    idempotency: "Safe.",
  },
  {
    operationId: "updateListingMargins",
    method: "patch",
    path: "/api/v1/listings/{id}/margins",
    summary: "Set or clear one size's margin override",
    description:
      "**Null clears the override**, falling back to the group rule and then the system default; an " +
      "absent key leaves the field alone. Recomputes the price and re-runs the §5 decision.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 3 (inline per-size edit); Screen 8 (尺寸設定 popover)",
    request: { params: ListingIdPath, body: ListingMarginsBody },
    response: ListingWire,
    errors: [...WRITE_ERRORS, "not_found", "listing_inactive", "conflict"],
    idempotency: "Not idempotent: writes price_history when the price actually changes.",
    sideEffects: [
      "price_history (margin_percent / margin_fixed / listing_price)",
      "audit_log",
      "shopify_sync_jobs when the approved price moves",
    ],
  },
  {
    operationId: "setListingPrice",
    method: "post",
    path: "/api/v1/listings/{id}/price",
    summary: "Manual price adjustment, bypassing the approval band",
    description:
      "§5 grants this explicitly: a human setting the price deliberately *is* the approval. Gap 22 " +
      "notes no screen surfaced it — the 統一售價 panel now does, behind a confirmation that names " +
      "the bypass. Recorded as `manual_price` with the user as actor.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 8 (統一售價 → 手動指定售價)",
    request: { params: ListingIdPath, body: ListingPriceBody },
    response: ListingWire,
    errors: [...WRITE_ERRORS, "not_found", "listing_inactive", "conflict"],
    idempotency: "Not idempotent.",
    sideEffects: ["price_history (manual_price)", "audit_log", "shopify_sync_jobs"],
  },
  {
    operationId: "approveListing",
    method: "post",
    path: "/api/v1/listings/{id}/approve",
    summary: "Accept the held price for one size",
    description:
      "`not_pending` (409) is the **expected** race, not a failure: someone else approved it, or a " +
      "newer update superseded it. It must read as 「此筆已被更新的價格取代」 and trigger a row refetch.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 1 (確認); Screen 8 (per-size approve)",
    request: { params: ListingIdPath },
    response: ListingWire,
    errors: [...SESSION_ERRORS, "not_found", "not_pending", "needs_margins", "listing_inactive", "conflict"],
    idempotency: "Second call on the same listing returns `not_pending`, never a double approval.",
    sideEffects: ["price_history (listing_price)", "audit_log", "shopify_sync_jobs"],
  },
  {
    operationId: "rejectListing",
    method: "post",
    path: "/api/v1/listings/{id}/reject",
    summary: "Reject the held price, keeping the old one live",
    description:
      "On `pending_new` the listing becomes `rejected`; on `pending_price` it returns to `approved` " +
      "at the **old** price, which stays live and published.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 1 (拒絕); Screen 8",
    request: { params: ListingIdPath, body: ListingRejectBody },
    response: ListingWire,
    errors: [...WRITE_ERRORS, "not_found", "not_pending", "listing_inactive", "conflict"],
    idempotency: "Second call returns `not_pending`.",
    sideEffects: ["price_history (listing_status)", "audit_log"],
  },
  {
    operationId: "deactivateListing",
    method: "post",
    path: "/api/v1/listings/{id}/deactivate",
    summary: "下架 one size",
    description: "Cost and stock keep syncing; the listing is not re-queued until a human reactivates it.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 8 (per-size 上架狀態)",
    request: { params: ListingIdPath },
    response: ListingWire,
    errors: [...SESSION_ERRORS, "not_found", "conflict"],
    idempotency: "Idempotent: already-inactive returns the listing unchanged.",
    sideEffects: ["price_history (listing_status)", "audit_log", "shopify_sync_jobs (→ draft)"],
  },
  {
    operationId: "reactivateListing",
    method: "post",
    path: "/api/v1/listings/{id}/reactivate",
    summary: "重新上架 one size",
    description:
      "Re-runs the §5 decision against the current cost, so a listing that sat inactive through " +
      "several crawls can come back as `pending_price` rather than silently republishing a stale price.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 8 (per-size 上架狀態)",
    request: { params: ListingIdPath },
    response: ListingWire,
    errors: [...SESSION_ERRORS, "not_found", "needs_margins", "conflict"],
    idempotency: "Idempotent while the decision is unchanged.",
    sideEffects: ["price_history (listing_status)", "audit_log", "shopify_sync_jobs"],
  },
  {
    operationId: "bulkApproveListings",
    method: "post",
    path: "/api/v1/listings/bulk-approve",
    summary: "Approve a set of sizes, or every size of one product",
    description:
      "Partial by nature — one of the ids may have been superseded a second ago — so it answers 200 " +
      "with a per-id result rather than failing the batch.",
    tags: ["listings"],
    auth: "session",
    consumedBy: "Screen 8 (核准所有尺寸); Screen 1 selection",
    request: { body: BulkApproveBody },
    response: BulkListingResultWire,
    errors: [...WRITE_ERRORS, "not_found", "conflict"],
    idempotency: "Re-running reports `not_pending` per already-approved id rather than erroring.",
    sideEffects: ["price_history", "audit_log", "shopify_sync_jobs"],
  },
];
