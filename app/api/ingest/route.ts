import { defineRoute } from "@/lib/http/handler";
import { IngestBody } from "@/lib/schemas/params/ingest";
import { IngestBatchWire } from "@/lib/schemas/wire/ingest";

export const POST = defineRoute(
  {
    operationId: "ingestBatch",
    method: "post",
    path: "/api/ingest",
    summary: "Synchronous per-item ingest from StockX email and Google Sheet",
    description:
      "Machine ingest. The payload is identity + cost/quantity only: the Google Sheet no longer " +
      "sends image URLs or margins. Margins are resolved server-side (listing override → group → " +
      "system default). Item failures surface as per-item outcomes inside a 200; the batch continues.\n\n" +
      "Each item runs in its own transaction. Shopify is enqueued, never called inline. After " +
      "those transactions commit, unique SKUs are looked up on KicksDB GOAT " +
      "(`GET /v3/goat/products?query=SKU`) and catalog fields plus `images[]` URLs are saved.",
    tags: ["machine"],
    auth: "machine",
    consumedBy: "machine: Apps Script (GmailStockX.gs, SheetUpdater.gs)",
    request: { body: IngestBody },
    response: IngestBatchWire,
    errors: [
      "missing_key",
      "invalid_key",
      "invalid_json",
      "validation_failed",
      "run_mismatch",
      "batch_too_large",
      "internal_error",
      "service_unavailable",
    ],
    idempotency:
      "Per item on (source, source_ref). Replay returns the stored result with idempotent: true.",
    sideEffects: [
      "price_updates",
      "price_history on real change",
      "audit_log",
      "shopify_sync_jobs (deferred while PUBLISH_TARGET=none)",
      "crawl_runs",
      "products catalog from KicksDB GOAT (after item txs; skipped when KICKSDB_API_KEY is unset)",
      "media.product_images from KicksDB images[] (source kicksdb)",
    ],
  },
  async (ctx) => {
    const { ingestBatchFromDb } = await import("@/lib/services/ingest-db");
    return { data: await ingestBatchFromDb(ctx.body) };
  },
);
