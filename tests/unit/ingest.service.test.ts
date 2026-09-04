import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { MemoryIngestRepo } from "@/lib/repo/ingest-memory";
import { ACCEPTS_MAX_ITEMS, ingestBatch } from "@/lib/services/ingest";
import type { IngestBodyInput } from "@/lib/schemas/params/ingest";

const NOW = "2026-08-29T07:00:00.000Z";
const STARTED = "2026-08-29T06:00:00.000Z";

const run = (over: Partial<IngestBodyInput["run"]> = {}): IngestBodyInput["run"] => ({
  run_id: "run-1",
  source: "google_sheet",
  trigger: "manual",
  started_at: STARTED,
  ...over,
});

const item = (over: Partial<IngestBodyInput["updates"][number]> = {}): IngestBodyInput["updates"][number] => ({
  product_name: "Air Jordan 1",
  product_sku: "555088-101",
  brand: "Jordan",
  size: "US 9",
  cost: "1200.00",
  quantity: 1,
  currency: "HKD",
  source: "google_sheet",
  source_ref: "sheet:run-1:row:1",
  allow_create: true,
  ...over,
});

const deps = (repo: MemoryIngestRepo) => ({
  repo,
  publishTarget: "none" as const,
  now: NOW,
});

describe("ingestBatch", () => {
  it("creates a listing, prices from the system default (not the payload), and writes no image", async () => {
    const repo = new MemoryIngestRepo();
    const body = {
      run: run(),
      updates: [item({ margin_percent: "99" } as never)],
    };
    const result = await ingestBatch(body, deps(repo));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].ok).toBe(true);
    expect(result.items[0].outcome).toBe("new_listing");
    expect(result.items[0].idempotent).toBe(false);
    expect(result.items[0].listing_id).toBeTruthy();
    expect(repo.imagesWritten).toBe(0);
    const listing = [...repo.listings.values()][0];
    expect(listing.margin_percent).toBeNull();
    expect(listing.margin_source).toBe("default");
    const source = repo.sources.find((s) => s.listing_id === listing.id);
    expect(source?.source).toBe("in_house");
    expect(repo.audit).toHaveLength(1);
  });

  it("does not let a later sheet row overwrite a KicksDB name and brand", async () => {
    const repo = new MemoryIngestRepo();
    await ingestBatch({ run: run(), updates: [item()] }, deps(repo));
    const product = [...repo.products.values()][0];
    repo.products.set(product.product_sku, {
      ...product,
      product_name: "GOAT name",
      brand: "GOAT",
      kicks_enriched_at: NOW,
    });
    await ingestBatch(
      {
        run: run(),
        updates: [item({ source_ref: "sheet:run-1:row:2", product_name: "Sheet", brand: "Sheet" })],
      },
      deps(repo),
    );
    const after = repo.products.get(product.product_sku);
    expect(after?.product_name).toBe("GOAT name");
    expect(after?.brand).toBe("GOAT");
  });

  it("replays the stored result for the same source_ref", async () => {
    const repo = new MemoryIngestRepo();
    const body = { run: run(), updates: [item()] };
    const first = await ingestBatch(body, deps(repo));
    const second = await ingestBatch(body, deps(repo));
    expect(second.items[0].idempotent).toBe(true);
    expect(second.items[0].listing_id).toBe(first.items[0].listing_id);
    expect(second.items[0].outcome).toBe(first.items[0].outcome);
    expect(repo.priceUpdates).toHaveLength(1);
  });

  it("returns unknown_sku when allow_create is false and the SKU is missing", async () => {
    const repo = new MemoryIngestRepo();
    const result = await ingestBatch(
      { run: run(), updates: [item({ allow_create: false })] },
      deps(repo),
    );
    expect(result.items[0].ok).toBe(false);
    expect(result.items[0].status).toBe("rejected");
    expect(result.items[0].outcome).toBe("unknown_sku");
    expect(repo.listings.size).toBe(0);
  });

  it("returns invalid_currency for a non-HKD row inside a 200", async () => {
    const repo = new MemoryIngestRepo();
    const result = await ingestBatch(
      { run: run(), updates: [item({ currency: "USD" })] },
      deps(repo),
    );
    expect(result.items[0].ok).toBe(false);
    expect(result.items[0].outcome).toBe("invalid_currency");
  });

  it("returns missing_cost when creating a listing with no cost", async () => {
    const repo = new MemoryIngestRepo();
    const result = await ingestBatch(
      { run: run(), updates: [item({ cost: null })] },
      deps(repo),
    );
    expect(result.items[0].ok).toBe(false);
    expect(result.items[0].outcome).toBe("missing_cost");
  });

  it("applies a quantity-only update without rewriting cost", async () => {
    const repo = new MemoryIngestRepo();
    const product = repo.seedProduct({ id: "p1", product_sku: "555088-101" });
    const listing = repo.seedListing({
      id: "l1",
      product_id: product.id,
      size: "US 9",
      approval_status: "approved",
      approved_price: "1349.00",
      current_price: "1349.00",
      cost: "1200.00",
      base_cost: "1200.00",
      base_cost_source: "in_house",
      base_cost_at: "2026-08-01T00:00:00.000Z",
    });
    repo.seedSource({
      id: "s1",
      listing_id: listing.id,
      source: "in_house",
      cost: "1200.00",
      cost_at: "2026-08-01T00:00:00.000Z",
      quantity: 1,
      last_source_ref: "old",
      last_synced_at: "2026-08-01T00:00:00.000Z",
    });

    const result = await ingestBatch(
      { run: run(), updates: [item({ cost: null, quantity: 4 })] },
      deps(repo),
    );
    expect(result.items[0].ok).toBe(true);
    expect(result.items[0].outcome).toBe("quantity_change");
    const source = repo.sources.find((s) => s.listing_id === "l1");
    expect(source?.quantity).toBe(4);
    expect(source?.cost).toBe("1200.00");
    expect(repo.listings.get("l1")?.cost).toBe("1200.00");
    expect(repo.history.some((h) => h.change_type === "quantity")).toBe(true);
    expect(repo.history.some((h) => h.change_type === "cost")).toBe(false);
    expect(repo.shopifyJobs).toEqual([{ listing_id: "l1", state: "deferred" }]);
  });

  it("forces StockX quantity to 1", async () => {
    const repo = new MemoryIngestRepo();
    const result = await ingestBatch(
      {
        run: run({ source: "stockx", trigger: "cron" }),
        updates: [item({ source: "stockx", source_ref: "gmail:msg-1", quantity: 9 })],
      },
      deps(repo),
    );
    expect(result.items[0].ok).toBe(true);
    const listingId = result.items[0].listing_id!;
    const source = repo.sources.find((s) => s.listing_id === listingId);
    expect(source?.source).toBe("stockx");
    expect(source?.quantity).toBe(1);
  });

  it("holds an out-of-band move on a live listing", async () => {
    const repo = new MemoryIngestRepo();
    const product = repo.seedProduct({ id: "p1", product_sku: "555088-101" });
    const listing = repo.seedListing({
      id: "l1",
      product_id: product.id,
      size: "US 9",
      approval_status: "approved",
      approved_price: "1300.00",
      current_price: "1300.00",
      cost: "1000.00",
      base_cost: "1000.00",
      base_cost_source: "in_house",
      base_cost_at: "2026-08-01T00:00:00.000Z",
    });
    repo.seedSource({
      id: "s1",
      listing_id: listing.id,
      source: "in_house",
      cost: "1000.00",
      cost_at: "2026-08-01T00:00:00.000Z",
      quantity: 1,
      last_source_ref: "old",
      last_synced_at: "2026-08-01T00:00:00.000Z",
    });

    const result = await ingestBatch(
      { run: run(), updates: [item({ cost: "2000.00" })] },
      deps(repo),
    );
    expect(result.items[0].outcome).toBe("held_for_approval");
    expect(repo.listings.get("l1")?.approval_status).toBe("pending_price");
    expect(repo.shopifyJobs).toEqual([]);
  });

  it("auto-approves a within-band move and enqueues a deferred publish job", async () => {
    const repo = new MemoryIngestRepo();
    const product = repo.seedProduct({ id: "p1", product_sku: "555088-101" });
    const listing = repo.seedListing({
      id: "l1",
      product_id: product.id,
      size: "US 9",
      approval_status: "approved",
      approved_price: "1349.00",
      current_price: "1349.00",
      cost: "1200.00",
      base_cost: "1200.00",
      base_cost_source: "in_house",
      base_cost_at: "2026-08-01T00:00:00.000Z",
    });
    repo.seedSource({
      id: "s1",
      listing_id: listing.id,
      source: "in_house",
      cost: "1200.00",
      cost_at: "2026-08-01T00:00:00.000Z",
      quantity: 1,
      last_source_ref: "old",
      last_synced_at: "2026-08-01T00:00:00.000Z",
    });

    // 1210 * 12% = 1355.20 → rounds to 1399. Δ vs 1349 is ~3.7% — inside the 10% band.
    const result = await ingestBatch(
      { run: run(), updates: [item({ cost: "1210.00" })] },
      deps(repo),
    );
    expect(result.items[0].outcome).toBe("auto_approved");
    expect(repo.listings.get("l1")?.approval_status).toBe("approved");
    expect(repo.shopifyJobs).toEqual([{ listing_id: "l1", state: "deferred" }]);
  });

  it("lands in needs_margins when the default is off and no override/group rule exists", async () => {
    const repo = new MemoryIngestRepo();
    repo.disableDefaultMargin();
    const result = await ingestBatch({ run: run(), updates: [item()] }, deps(repo));
    expect(result.items[0].outcome).toBe("needs_margins");
    expect(result.items[0].ok).toBe(true);
    const listing = [...repo.listings.values()][0];
    expect(listing.approval_status).toBe("needs_margins");
    expect(listing.cost).toBe("1200.00");
  });

  it("rejects a batch larger than accepts_max_items", async () => {
    const repo = new MemoryIngestRepo();
    const updates = Array.from({ length: ACCEPTS_MAX_ITEMS + 1 }, (_, i) =>
      item({ source_ref: `sheet:run-1:row:${i}` }),
    );
    await expect(ingestBatch({ run: run(), updates }, deps(repo))).rejects.toMatchObject({
      code: "batch_too_large",
    });
    expect(ApiError).toBeDefined();
  });

  it("rejects a chunk whose run_id collides with a different source", async () => {
    const repo = new MemoryIngestRepo();
    await ingestBatch({ run: run(), updates: [item()] }, deps(repo));
    await expect(
      ingestBatch(
        { run: run({ source: "stockx" }), updates: [item({ source: "stockx", source_ref: "gmail:1" })] },
        deps(repo),
      ),
    ).rejects.toMatchObject({ code: "run_mismatch" });
  });
});
