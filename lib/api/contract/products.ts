import type { RouteDoc } from "@/lib/openapi/registry";
import {
  ProductBulkResultWire,
  ProductDetailWire,
  ProductImagesWire,
  ProductWriteResultWire,
  ProductsListWire,
} from "@/lib/schemas/wire/products";
import { HistoryListWire } from "@/lib/schemas/wire/listings";
import {
  ProductImagePatchBody,
  ProductImagesReorderBody,
  ProductMarginsBody,
  ProductPatchBody,
  ProductsBulkBody,
  ProductsExportQuery,
  ProductsQuery,
} from "@/lib/schemas/params/products";
import { ProductHistoryQuery } from "@/lib/schemas/params/listings";
import { ProductImagePath, SkuPath } from "@/lib/schemas/params/paths";
import { READ_ERRORS, SESSION_ERRORS, WRITE_ERRORS } from "./common";

export const productsContract: RouteDoc[] = [
  {
    operationId: "listProducts",
    method: "get",
    path: "/api/v1/products",
    summary: "Product-level list with tab counts, group filter and per-product aggregates",
    description:
      "`meta.counts` respects `q` and `group_id` and **ignores** `status`, so switching tabs does not " +
      "move the numbers on the tabs. Product status is derived from the six listing statuses by the " +
      "Gap 4 rule; the aggregates object is Gap 13's, shared with Screens 3 and 5.",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 7 (產品列表); Screen 3 table; Screen 5 (新增產品)",
    request: { query: ProductsQuery },
    response: ProductsListWire,
    errors: [...READ_ERRORS],
    idempotency: "Safe. meta carries pagination, counts and publishing.",
  },
  {
    operationId: "exportProducts",
    method: "get",
    path: "/api/v1/products/export",
    summary: "CSV of the current filter",
    description:
      "Identical parameters to the list minus paging — the export is of the filter, not of the page " +
      "on screen. Streams `text/csv`, so it is fetched outside the envelope-typed client.",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 7 (匯出清單)",
    request: { query: ProductsExportQuery },
    errors: [...READ_ERRORS],
    idempotency: "Safe.",
  },
  {
    operationId: "getProduct",
    method: "get",
    path: "/api/v1/products/{sku}",
    summary: "Everything above the fold on Screen 8: content, images, every size, aggregates",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 8 (產品詳情); Screen 3 row expand; Screen 9 hydration",
    request: { params: SkuPath },
    response: ProductDetailWire,
    errors: [...SESSION_ERRORS, "not_found"],
    idempotency: "Safe.",
  },
  {
    operationId: "updateProduct",
    method: "patch",
    path: "/api/v1/products/{sku}",
    summary: "The Screen 8 draft, committed transactionally in one call",
    description:
      "Applies everything or nothing, so there is no partial-failure state for the save — but the §5 " +
      "decision differs per listing, and the response reports that mix so the UI can say 「3 個尺寸已" +
      "更新，2 個尺寸的新售價需審核」 (Gap 24).\n\n" +
      "Absent means untouched, `null` means clear, a value means set. SKU and sizes are immutable, " +
      "and only in-house source fields are writable — a write to a `stockx` row is `source_read_only`, " +
      "which should be unreachable because that card renders no editable control.",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 8 (儲存變更); Screen 9 stages into this draft",
    request: { params: SkuPath, body: ProductPatchBody },
    response: ProductWriteResultWire,
    errors: [
      ...WRITE_ERRORS,
      "not_found",
      "source_read_only",
      "listing_not_in_product",
      "listing_inactive",
      "needs_margins",
      "payload_too_large",
      "conflict",
    ],
    idempotency: "One transaction. A failure on any listing commits nothing.",
    sideEffects: ["price_history per changed field", "audit_log", "shopify_sync_jobs per repriced listing"],
  },
  {
    operationId: "updateProductMargins",
    method: "post",
    path: "/api/v1/products/{sku}/margins",
    summary: "套用至所有尺寸 — one margin rule across a product's sizes",
    description:
      "Gap 11. The nested PATCH can express this, but only by making the client enumerate every " +
      "listing id for a single user intent. Reuses the group-apply scope vocabulary so both drive the " +
      "same component; N is small enough to stay synchronous.",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 3 (套用至所有尺寸); Screen 8 (批次編輯)",
    request: { params: SkuPath, body: ProductMarginsBody },
    response: ProductWriteResultWire,
    errors: [...WRITE_ERRORS, "not_found", "listing_inactive", "needs_margins", "conflict"],
    idempotency: "One transaction across the product's listings.",
    sideEffects: ["price_history", "audit_log", "shopify_sync_jobs"],
  },
  {
    operationId: "getProductHistory",
    method: "get",
    path: "/api/v1/products/{sku}/history",
    summary: "Product-scoped price history, all sizes or one",
    description:
      "Gap 21. §6.2 offered only the per-size endpoint, yet described it as supporting 'filter by " +
      "size/all' — which is meaningless on an endpoint already scoped to one size, and is good " +
      "evidence the intent was product-scoped throughout. Screen 8's bottom table has a 尺寸 column.",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 8 (價格變更紀錄, 匯出); /products/[sku]/history",
    request: { params: SkuPath, query: ProductHistoryQuery },
    response: HistoryListWire,
    errors: [...READ_ERRORS, "not_found"],
    idempotency: "Safe.",
  },
  {
    operationId: "bulkUpdateProducts",
    method: "post",
    path: "/api/v1/products/bulk",
    summary: "Screen 7's 批次操作: 指派分組 / 下架 / 重新上架",
    description:
      "Gap 19. §6.2 admits the menu is undefined in the design; it is defined here, operating on the " +
      "**selection** and never on the whole filter. Inherently partial, so it answers 200 with a " +
      "per-SKU result — treating the status code as the answer would silently lose the failures.",
    tags: ["products"],
    auth: "session",
    consumedBy: "Screen 7 (批次操作)",
    request: { body: ProductsBulkBody },
    response: ProductBulkResultWire,
    errors: [...WRITE_ERRORS, "not_found", "conflict"],
    idempotency: "Re-running a completed action is a no-op per SKU.",
    sideEffects: ["price_history", "audit_log", "shopify_sync_jobs", "jobs (group_rule_recompute) on assign_group"],
  },
  {
    operationId: "uploadProductImage",
    method: "post",
    path: "/api/v1/products/{sku}/images",
    summary: "Upload one image (multipart)",
    description:
      "JPG/PNG, ≤2MB, max 8 per SKU. The body is `multipart/form-data`, which this generator cannot " +
      "express, so it is documented here rather than typed. Answers with the whole gallery so an " +
      "optimistic gallery has one thing to reconcile against.",
    tags: ["images"],
    auth: "session",
    consumedBy: "Screen 8 (上架圖片 dropzone)",
    request: { params: SkuPath },
    response: ProductImagesWire,
    errors: [
      ...SESSION_ERRORS,
      "not_found",
      "unsupported_media_type",
      "image_too_large",
      "image_limit_reached",
      "payload_too_large",
    ],
    idempotency: "Not idempotent: each call adds a row.",
    sideEffects: ["media.product_images", "Supabase Storage object", "shopify_sync_jobs"],
  },
  {
    operationId: "updateProductImage",
    method: "patch",
    path: "/api/v1/products/{sku}/images/{image_id}",
    summary: "Set an image primary, or move it in the order",
    tags: ["images"],
    auth: "session",
    consumedBy: "Screen 8 (主圖 badge)",
    request: { params: ProductImagePath, body: ProductImagePatchBody },
    response: ProductImagesWire,
    errors: [...WRITE_ERRORS, "not_found", "conflict"],
    idempotency: "Idempotent.",
    sideEffects: ["media.product_images", "shopify_sync_jobs"],
  },
  {
    operationId: "deleteProductImage",
    method: "delete",
    path: "/api/v1/products/{sku}/images/{image_id}",
    summary: "Delete an image",
    description:
      "Deleting the primary promotes the next by `sort_order`; a product with no image publishes as " +
      "`draft` rather than `active`.",
    tags: ["images"],
    auth: "session",
    consumedBy: "Screen 8 (刪除)",
    request: { params: ProductImagePath },
    response: ProductImagesWire,
    errors: [...SESSION_ERRORS, "not_found", "conflict"],
    idempotency: "Idempotent: a second delete is `not_found`.",
    sideEffects: ["media.product_images", "Supabase Storage object", "shopify_sync_jobs"],
  },
  {
    operationId: "reorderProductImages",
    method: "post",
    path: "/api/v1/products/{sku}/images/reorder",
    summary: "Commit a drag reorder",
    description:
      "The full id list in display order, primary first. Also expressible inside the Screen 8 draft " +
      "as `image_order`; this endpoint is the standalone path for a reorder committed on its own.",
    tags: ["images"],
    auth: "session",
    consumedBy: "Screen 8 (拖曳排序)",
    request: { params: SkuPath, body: ProductImagesReorderBody },
    response: ProductImagesWire,
    errors: [...WRITE_ERRORS, "not_found", "conflict"],
    idempotency: "Idempotent: the payload is the desired end state, not a delta.",
    sideEffects: ["media.product_images.sort_order", "shopify_sync_jobs"],
  },
];
