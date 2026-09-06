import { describe, expect, it, vi } from "vitest";
import { MemoryCatalogRepo } from "@/lib/repo/catalog-memory";
import { enrichProductsFromKicks } from "@/lib/services/catalog";
import { mapGoatProduct } from "@/lib/kicksdb/map";
import type { CatalogFromKicks } from "@/lib/kicksdb/map";

const NOW = "2026-09-04T12:00:00.000Z";
const SKU = "555088-101";

const catalog: CatalogFromKicks = mapGoatProduct({
  id: 92101,
  sku: "555088 101",
  name: "Air Jordan 1 Retro High OG 'Chicago'",
  brand: "Jordan",
  model: "Air Jordan 1",
  description: "The Chicago colorway.",
  colorway: "White/Black-Varsity Red",
  season: " 2015",
  product_type: "sneakers",
  images: ["https://image.goat.com/1.jpg", "https://image.goat.com/2.jpg"],
  release_date: "2015-05-30T23:59:59.999Z",
  release_date_year: "2015",
})!;

function seededRepo() {
  const repo = new MemoryCatalogRepo();
  repo.seed({
    id: "prod-1",
    product_sku: SKU,
    product_name: "Sheet name",
    brand: "Sheet brand",
    kicks_looked_up_at: null,
    kicks_enriched_at: null,
  });
  return repo;
}

describe("enrichProductsFromKicks", () => {
  it("writes catalog fields and image URLs after a successful lookup", async () => {
    const repo = seededRepo();
    const fetchProduct = vi.fn(async () => catalog);
    const summary = await enrichProductsFromKicks([SKU, SKU.toLowerCase()], {
      repo,
      fetchProduct,
      now: NOW,
    });
    expect(summary).toEqual({ looked_up: 1, enriched: 1, skipped: 0, failed: 0 });
    expect(fetchProduct).toHaveBeenCalledTimes(1);
    expect(repo.products.get(SKU)?.product_name).toBe("Air Jordan 1 Retro High OG 'Chicago'");
    expect(repo.lookups[0].catalog).toMatchObject({
      model: "Air Jordan 1",
      colorway: "White/Black-Varsity Red",
      season: "2015",
      release_date: "2015-05-30",
      release_date_year: "2015",
      description: "The Chicago colorway.",
    });
    expect(repo.images.map((i) => i.image_url)).toEqual(catalog.image_urls);
    expect(repo.images[0]?.is_primary).toBe(true);
    expect(repo.images[0]?.source).toBe("kicksdb");
    expect(repo.products.get(SKU)?.kicks_enriched_at).toBe(NOW);
  });

  it("skips a SKU that has already been looked up", async () => {
    const repo = seededRepo();
    repo.seed({
      id: "prod-1",
      product_sku: SKU,
      product_name: "Sheet name",
      brand: "Sheet brand",
      kicks_looked_up_at: NOW,
      kicks_enriched_at: NOW,
    });
    const fetchProduct = vi.fn(async () => catalog);
    const summary = await enrichProductsFromKicks([SKU], {
      repo,
      fetchProduct,
      now: "2026-09-05T00:00:00.000Z",
    });
    expect(summary.skipped).toBe(1);
    expect(fetchProduct).not.toHaveBeenCalled();
  });

  it("stamps a miss so hourly ingest does not re-query, without writing images", async () => {
    const repo = seededRepo();
    const summary = await enrichProductsFromKicks([SKU], {
      repo,
      fetchProduct: async () => null,
      now: NOW,
    });
    expect(summary.enriched).toBe(0);
    expect(repo.products.get(SKU)?.kicks_looked_up_at).toBe(NOW);
    expect(repo.products.get(SKU)?.kicks_enriched_at).toBeNull();
    expect(repo.images).toEqual([]);
  });

  it("does not stamp on a thrown fetch so the next ingest retries", async () => {
    const repo = seededRepo();
    const summary = await enrichProductsFromKicks([SKU], {
      repo,
      fetchProduct: async () => {
        throw new Error("timeout");
      },
      now: NOW,
    });
    expect(summary.failed).toBe(1);
    expect(repo.products.get(SKU)?.kicks_looked_up_at).toBeNull();
    expect(repo.lookups).toEqual([]);
  });

  it("skips SKUs that are not in products yet", async () => {
    const repo = new MemoryCatalogRepo();
    const fetchProduct = vi.fn(async () => catalog);
    const summary = await enrichProductsFromKicks(["NOPE"], { repo, fetchProduct, now: NOW });
    expect(summary.skipped).toBe(1);
    expect(fetchProduct).not.toHaveBeenCalled();
  });

  it("enqueues live listings after a catalog write, not pending_new", async () => {
    const repo = seededRepo();
    repo.seedListing({ id: "live", product_id: "prod-1", approval_status: "approved" });
    repo.seedListing({ id: "held", product_id: "prod-1", approval_status: "pending_price" });
    repo.seedListing({ id: "new", product_id: "prod-1", approval_status: "pending_new" });
    await enrichProductsFromKicks([SKU], { repo, fetchProduct: async () => catalog, now: NOW });
    expect(repo.shopifyJobs).toEqual([
      { listing_id: "live", state: "deferred" },
      { listing_id: "held", state: "deferred" },
    ]);
  });

  it("enqueues queued jobs when publishing is enabled", async () => {
    const repo = seededRepo();
    repo.seedListing({ id: "live", product_id: "prod-1", approval_status: "approved" });
    await enrichProductsFromKicks([SKU], {
      repo,
      fetchProduct: async () => catalog,
      now: NOW,
      publishTarget: "shopify",
    });
    expect(repo.shopifyJobs).toEqual([{ listing_id: "live", state: "queued" }]);
  });

  it("does not enqueue when the lookup misses", async () => {
    const repo = seededRepo();
    repo.seedListing({ id: "live", product_id: "prod-1", approval_status: "approved" });
    await enrichProductsFromKicks([SKU], { repo, fetchProduct: async () => null, now: NOW });
    expect(repo.shopifyJobs).toEqual([]);
  });
});
