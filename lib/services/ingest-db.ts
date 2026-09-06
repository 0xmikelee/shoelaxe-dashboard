import "server-only";
import { getEnv } from "@/lib/env";
import { getSql } from "@/lib/db/sql";
import { PostgresIngestRepo } from "@/lib/repo/ingest";
import { PostgresCatalogRepo } from "@/lib/repo/catalog";
import type { IngestBodyInput } from "@/lib/schemas/params/ingest";
import type { IngestBatch } from "@/lib/schemas/wire/ingest";
import { ingestItem } from "@/lib/services/ingest";
import { ACCEPTS_MAX_ITEMS } from "@/lib/services/ingest";
import { enrichProductsFromKicks } from "@/lib/services/catalog";
import { parseInstant } from "@/lib/domain/time";
import { ApiError } from "@/lib/http/errors";
import { log } from "@/lib/log";

/**
 * Request-path entry: one short transaction per item. Crawl-run bookkeeping sits outside the
 * per-item transaction so a failed item still increments error_count.
 */
export async function ingestBatchFromDb(body: IngestBodyInput): Promise<IngestBatch> {
  if (body.updates.length > ACCEPTS_MAX_ITEMS) {
    throw new ApiError("batch_too_large", `batch exceeds accepts_max_items (${ACCEPTS_MAX_ITEMS})`);
  }
  for (const item of body.updates) {
    if (item.source !== body.run.source) {
      throw new ApiError("run_mismatch", "item source does not match run.source");
    }
  }

  const env = getEnv();
  const sql = getSql();
  const now = new Date().toISOString();
  const outer = new PostgresIngestRepo(sql);

  const existing = await outer.findCrawlRun(body.run.run_id);
  if (existing) {
    if (
      existing.source !== body.run.source ||
      existing.trigger !== body.run.trigger ||
      parseInstant(existing.started_at, "crawl_runs.started_at") !==
        parseInstant(body.run.started_at, "run.started_at")
    ) {
      throw new ApiError("run_mismatch", "chunk run_id does not match open run");
    }
  } else {
    await outer.insertCrawlRun({
      run_id: body.run.run_id,
      source: body.run.source,
      trigger: body.run.trigger,
      started_at: body.run.started_at,
    });
  }

  const settings = await outer.getPricingSettings();
  const items = [];
  for (const item of body.updates) {
    const result = await sql.begin(async (tx) => {
      const repo = new PostgresIngestRepo(tx);
      return ingestItem(repo, body.run, item, settings, {
        publishTarget: env.PUBLISH_TARGET,
        now,
      });
    });
    items.push(result);
    await outer.incrementCrawlRun(
      body.run.run_id,
      { items: 1, ok: result.ok ? 1 : 0, error: result.ok ? 0 : 1 },
      now,
    );
  }

  await enrichCatalogAfterIngest(
    body.updates.map((u) => u.product_sku),
    env.KICKSDB_API_KEY,
    env.PUBLISH_TARGET,
    now,
  );

  return { run_id: body.run.run_id, items };
}

/**
 * KicksDB is a network hop: run it after every item transaction has committed. A failure here
 * must not fail the batch — the next ingest retries SKUs that still have a null `kicks_looked_up_at`.
 */
async function enrichCatalogAfterIngest(
  skus: readonly string[],
  apiKey: string | undefined,
  publishTarget: "none" | "shopify",
  now: string,
): Promise<void> {
  if (!apiKey) return;
  const { fetchGoatCatalogBySku } = await import("@/lib/kicksdb/client");
  try {
    const summary = await enrichProductsFromKicks(skus, {
      repo: new PostgresCatalogRepo(getSql()),
      fetchProduct: (sku) => fetchGoatCatalogBySku(sku, { apiKey }),
      now,
      publishTarget,
    });
    if (summary.looked_up > 0 || summary.failed > 0) {
      log.info("kicksdb_catalog", summary);
    }
  } catch (e) {
    log.warn("kicksdb_catalog_failed", { err: e instanceof Error ? e.message : String(e) });
  }
}
