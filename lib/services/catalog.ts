import { log } from "@/lib/log";
import type { CatalogFromKicks } from "@/lib/kicksdb/map";
import type { CatalogRepo } from "@/lib/repo/catalog-types";

export interface CatalogEnrichDeps {
  repo: CatalogRepo;
  fetchProduct: (sku: string) => Promise<CatalogFromKicks | null>;
  now: string;
}

/**
 * After ingest item transactions commit: one KicksDB lookup per unseen SKU. Network happens here,
 * never inside `sql.begin()`. A miss stamps `kicks_looked_up_at` so hourly replays do not re-query.
 * A thrown fetch leaves the stamp unset so the next ingest retries.
 */
export async function enrichProductsFromKicks(
  skus: readonly string[],
  deps: CatalogEnrichDeps,
): Promise<{ looked_up: number; enriched: number; skipped: number; failed: number }> {
  const unique = [...new Set(skus.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0))];
  const summary = { looked_up: 0, enriched: 0, skipped: 0, failed: 0 };

  for (const sku of unique) {
    const row = await deps.repo.findBySku(sku);
    if (!row || row.kicks_looked_up_at != null) {
      summary.skipped += 1;
      continue;
    }

    let catalog: CatalogFromKicks | null;
    try {
      catalog = await deps.fetchProduct(sku);
    } catch (e) {
      summary.failed += 1;
      log.warn("kicksdb_lookup_failed", {
        sku,
        err: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    await deps.repo.applyLookup(row.id, row.product_sku, catalog, deps.now);
    summary.looked_up += 1;
    if (catalog != null) summary.enriched += 1;
  }

  return summary;
}
