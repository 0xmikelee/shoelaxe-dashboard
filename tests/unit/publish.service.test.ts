import { describe, expect, it } from "vitest";
import { MemoryPublishRepo } from "@/lib/repo/publish-memory";
import type { PublishListingRow, PublishProductSnapshot } from "@/lib/repo/publish-types";
import {
  backoffMs,
  drainBatch,
  drainOneProduct,
  enqueueListingSync,
  type DrainDeps,
} from "@/lib/services/publish";
import type { ProductSetInput } from "@/lib/publishing/desired-state";
import type { ShopifyPublisher } from "@/lib/shopify/publisher";
import { ShopifyError } from "@/lib/shopify/errors";
import type { ProductSetProduct, VariantBySkuNode } from "@/lib/shopify/types";

const LOCATION = "gid://shopify/Location/1";
const NOW = "2026-09-06T08:00:00.000Z";

class FakePublisher implements ShopifyPublisher {
  upserts: ProductSetInput[] = [];
  quantities: Array<{
    inventoryItemId: string;
    locationId: string;
    quantity: number;
    referenceDocumentUri: string;
  }> = [];
  catalog = new Map<string, VariantBySkuNode[]>();
  failWith: Error | null = null;
  productId = "gid://shopify/Product/9";

  async findVariantsBySku(sku: string): Promise<VariantBySkuNode[]> {
    return this.catalog.get(sku) ?? [];
  }

  async adoptVariantBySku(sku: string): Promise<VariantBySkuNode | null> {
    const matches = await this.findVariantsBySku(sku);
    if (matches.length > 1) {
      throw new ShopifyError(`ambiguous_sku: ${sku}`, "ambiguous_sku");
    }
    return matches[0] ?? null;
  }

  async upsertProductSet(input: ProductSetInput, productId?: string): Promise<ProductSetProduct> {
    if (this.failWith) throw this.failWith;
    this.upserts.push(input);
    return {
      id: productId ?? this.productId,
      title: input.title,
      status: input.status,
      variants: {
        nodes: input.variants.map((v, i) => ({
          id: `gid://shopify/ProductVariant/${i + 1}`,
          sku: v.sku,
          price: v.price,
          inventoryQuantity: v.inventoryQuantities[0]?.quantity ?? 0,
          inventoryItem: {
            id: `gid://shopify/InventoryItem/${i + 1}`,
            tracked: true,
            sku: v.sku,
          },
        })),
      },
    };
  }

  async setAvailableQuantity(args: {
    inventoryItemId: string;
    locationId: string;
    quantity: number;
    referenceDocumentUri: string;
  }): Promise<void> {
    this.quantities.push(args);
  }
}

function listing(
  over: Partial<PublishListingRow> & Pick<PublishListingRow, "id" | "size">,
): PublishListingRow {
  return {
    product_id: "p1",
    approval_status: "approved",
    approved_price: "1299.00",
    shopify_product_id: null,
    shopify_variant_id: null,
    shopify_inventory_item_id: null,
    shopify_synced_at: null,
    shopify_sync_error: null,
    sources: [{ slot: "in_house", quantity: 2 }],
    ...over,
  };
}

function snapshot(listings: PublishListingRow[]): PublishProductSnapshot {
  return {
    productId: "p1",
    productSku: "555088-101",
    title: "Air Jordan 1",
    descriptionHtml: null,
    vendor: "Nike",
    productType: "Sneakers",
    tags: [],
    images: [{ url: "https://cdn.example/1.jpg", alt: null, sortOrder: 0 }],
    listings,
  };
}

function deps(
  repo: MemoryPublishRepo,
  publisher: FakePublisher | null,
  over: Partial<DrainDeps> = {},
): DrainDeps {
  const clock = Date.parse(NOW);
  return {
    repo,
    publisher,
    locationId: publisher ? LOCATION : null,
    publishTarget: publisher ? "shopify" : "none",
    now: () => new Date(clock).toISOString(),
    ...over,
  };
}

describe("drainBatch", () => {
  it("reports deferred jobs and never calls Shopify when PUBLISH_TARGET=none", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(snapshot([listing({ id: "l1", size: "US 9" })]));
    repo.seedJob({ listing_id: "l1", state: "deferred" });
    const publisher = new FakePublisher();
    const result = await drainBatch(deps(repo, null, { publishTarget: "none" }));
    expect(result).toEqual({
      target: "none",
      claimed: 0,
      published: 0,
      deferred: 1,
      failed: 0,
      skipped: 0,
    });
    expect(publisher.upserts).toHaveLength(0);
  });

  it("promotes deferred jobs then publishes the full SKU", async () => {
    const repo = new MemoryPublishRepo();
    const l8 = listing({ id: "l8", size: "US 8", approved_price: "1200.00" });
    const l9 = listing({ id: "l9", size: "US 9", approved_price: "1300.00" });
    repo.seedProduct(snapshot([l8, l9]));
    repo.seedJob({ listing_id: "l8", state: "deferred", created_at: "2026-01-01T00:00:00.000Z" });
    repo.seedJob({ listing_id: "l9", state: "deferred", created_at: "2026-01-01T00:00:01.000Z" });
    const publisher = new FakePublisher();
    const result = await drainBatch(deps(repo, publisher));
    expect(result.published).toBe(1);
    expect(result.claimed).toBe(1);
    expect(publisher.upserts[0]?.variants.map((v) => v.sku)).toEqual([
      "555088-101-US8",
      "555088-101-US9",
    ]);
    expect(repo.listings.get("l8")?.shopify_product_id).toBe("gid://shopify/Product/9");
    expect(repo.listings.get("l9")?.shopify_variant_id).toBe("gid://shopify/ProductVariant/2");
    expect(repo.jobs.every((j) => j.state === "succeeded" && j.done_at != null)).toBe(true);
  });

  it("coalesces due sibling jobs into one productSet", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(
      snapshot([listing({ id: "l8", size: "US 8" }), listing({ id: "l9", size: "US 9" })]),
    );
    repo.seedJob({ listing_id: "l8", state: "queued" });
    repo.seedJob({ listing_id: "l9", state: "queued" });
    const publisher = new FakePublisher();
    await drainOneProduct(deps(repo, publisher));
    expect(publisher.upserts).toHaveLength(1);
    expect(repo.jobs.filter((j) => j.state === "succeeded")).toHaveLength(2);
  });

  it("skips a product with no approved_price and does not call Shopify", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(
      snapshot([
        listing({
          id: "l1",
          size: "US 9",
          approval_status: "pending_new",
          approved_price: null,
        }),
      ]),
    );
    repo.seedJob({ listing_id: "l1", state: "queued" });
    const publisher = new FakePublisher();
    const outcome = await drainOneProduct(deps(repo, publisher));
    expect(outcome).toBe("skipped");
    expect(publisher.upserts).toHaveLength(0);
    expect(repo.jobs[0]?.state).toBe("succeeded");
  });

  it("does not claim deferred jobs while publishing is enabled until they are promoted", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(snapshot([listing({ id: "l1", size: "US 9" })]));
    repo.seedJob({ listing_id: "l1", state: "deferred" });
    const publisher = new FakePublisher();
    const outcome = await drainOneProduct(deps(repo, publisher));
    expect(outcome).toBe("empty");
    expect(publisher.upserts).toHaveLength(0);
  });

  it("retries with backoff on a Shopify error", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(snapshot([listing({ id: "l1", size: "US 9" })]));
    repo.seedJob({ listing_id: "l1", state: "queued", attempts: 0 });
    const publisher = new FakePublisher();
    publisher.failWith = new ShopifyError("throttled", "http", { status: 429 });
    const outcome = await drainOneProduct(deps(repo, publisher));
    expect(outcome).toBe("failed");
    expect(repo.jobs[0]?.state).toBe("queued");
    expect(repo.jobs[0]?.attempts).toBe(1);
    expect(Date.parse(repo.jobs[0]!.next_attempt_at) - Date.parse(NOW)).toBe(backoffMs(1));
    expect(repo.listings.get("l1")?.shopify_sync_error).toBeNull();
  });

  it("writes shopify_sync_error after 5 attempts", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(snapshot([listing({ id: "l1", size: "US 9" })]));
    repo.seedJob({ listing_id: "l1", state: "queued", attempts: 4 });
    const publisher = new FakePublisher();
    publisher.failWith = new Error("boom");
    const outcome = await drainOneProduct(deps(repo, publisher));
    expect(outcome).toBe("failed");
    expect(repo.jobs[0]?.state).toBe("failed");
    expect(repo.jobs[0]?.done_at).toBe(NOW);
    expect(repo.listings.get("l1")?.shopify_sync_error).toBe("boom");
  });

  it("adopts an existing Shopify product by SKU when ids are absent", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(snapshot([listing({ id: "l1", size: "US 9" })]));
    repo.seedJob({ listing_id: "l1", state: "queued" });
    const publisher = new FakePublisher();
    publisher.catalog.set("555088-101-US9", [
      {
        id: "gid://shopify/ProductVariant/99",
        sku: "555088-101-US9",
        price: "1.00",
        inventoryQuantity: 0,
        product: { id: "gid://shopify/Product/77", title: "old", status: "ACTIVE" },
        inventoryItem: { id: "gid://shopify/InventoryItem/99", tracked: true, sku: "555088-101-US9" },
      },
    ]);
    await drainOneProduct(deps(repo, publisher));
    expect(repo.listings.get("l1")?.shopify_product_id).toBe("gid://shopify/Product/77");
  });
});

describe("enqueueListingSync", () => {
  it("returns null when the listing does not exist", async () => {
    const repo = new MemoryPublishRepo();
    expect(await enqueueListingSync(repo, "missing", "none")).toBeNull();
  });

  it("enqueues deferred while publishing is off and does not duplicate", async () => {
    const repo = new MemoryPublishRepo();
    repo.seedProduct(snapshot([listing({ id: "l1", size: "US 9" })]));
    const first = await enqueueListingSync(repo, "l1", "none");
    const second = await enqueueListingSync(repo, "l1", "none");
    expect(first).toEqual({ listing_id: "l1", state: "deferred", created: true });
    expect(second?.created).toBe(false);
  });
});
