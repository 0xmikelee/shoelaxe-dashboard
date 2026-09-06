import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { ANON_ACTOR } from "@/lib/http/session-auth";
import { MemoryDashboardRepo } from "@/lib/repo/dashboard-memory";
import {
  deleteProductImage,
  getProduct,
  MAX_IMAGES,
  reorderProductImages,
  updateProduct,
  uploadProductImage,
  type ProductWriteDeps,
} from "@/lib/services/products";

const NOW = "2026-09-06T09:00:00.000Z";
const SKU = "555088-101";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000010";
const L1 = "00000000-0000-4000-8000-000000000011";
const IMG1 = "00000000-0000-4000-8000-000000000021";
const IMG2 = "00000000-0000-4000-8000-000000000022";
const ACTOR = { ...ANON_ACTOR, id: "00000000-0000-4000-8000-000000000001", label: "Mike" };

const deps = (repo: MemoryDashboardRepo): ProductWriteDeps => ({
  repo,
  publishTarget: "shopify",
  now: NOW,
  actor: ACTOR,
  publicUrlFor: (path: string) => `https://cdn.shoelaxe.test/products/${path}`,
  uploadObject: async () => {},
});

function seedListed(repo: MemoryDashboardRepo) {
  repo.seedProduct({
    id: PRODUCT_ID,
    product_sku: SKU,
    product_name: "Air Jordan 1",
    title: "AJ1",
    body_html: "<p>old</p>",
  });
  repo.seedListing({
    id: L1,
    product_id: PRODUCT_ID,
    product_sku: SKU,
    size: "US 9",
    approval_status: "approved",
    approved_price: "1349.00",
    approved_at: NOW,
    base_cost: "1200.00",
    base_cost_source: "in_house",
    base_cost_at: NOW,
    margin_source: "default",
  });
  repo.seedSource({
    listing_id: L1,
    source: "in_house",
    cost: "1200.00",
    cost_at: NOW,
    previous_cost: null,
    previous_cost_at: null,
    quantity: 2,
    last_source_ref: "sheet:1",
    last_synced_at: NOW,
  });
}

describe("getProduct / updateProduct", () => {
  it("returns catalog, listings and aggregates for a SKU", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    const product = await getProduct(SKU, { repo });
    expect(product.sku).toBe(SKU);
    expect(product.listings).toHaveLength(1);
    expect(product.aggregates.size_count).toBe(1);
  });

  it("enqueues a product-level Shopify job when content changes", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    const result = await updateProduct(
      SKU,
      { content: { title: "Air Jordan 1 Retro", body_html: "<p>new</p>" } },
      deps(repo),
    );
    expect(result.sku).toBe(SKU);
    expect(repo.products.get(SKU)?.title).toBe("Air Jordan 1 Retro");
    expect(repo.shopifyJobs).toEqual([{ listing_id: L1, state: "queued" }]);
    expect(repo.audit.some((a) => a.action === "update_product")).toBe(true);
  });

  it("re-runs decide on nested listing patches", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    const result = await updateProduct(
      SKU,
      {
        listings: [
          {
            id: L1,
            in_house: { quantity: 4 },
          },
        ],
      },
      deps(repo),
    );
    expect(result.listings).toHaveLength(1);
    expect(repo.sources.find((s) => s.source === "in_house")?.quantity).toBe(4);
  });

  it("rejects a listing id that is not on the product", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    await expect(
      updateProduct(
        SKU,
        { listings: [{ id: "00000000-0000-4000-8000-000000000099", in_house: { quantity: 1 } }] },
        deps(repo),
      ),
    ).rejects.toMatchObject({ code: "listing_not_in_product" });
  });
});

describe("product images", () => {
  it("uploads a JPEG, enqueues Shopify, and refuses a ninth image", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    const write = deps(repo);
    const jpeg = { bytes: new Uint8Array(64), contentType: "image/jpeg", filename: "a.jpg" };
    const first = await uploadProductImage(SKU, jpeg, write);
    expect(first).toHaveLength(1);
    expect(first[0]?.is_primary).toBe(true);
    expect(repo.shopifyJobs).toHaveLength(1);

    for (let i = 1; i < MAX_IMAGES; i += 1) {
      await uploadProductImage(SKU, jpeg, write);
    }
    await expect(uploadProductImage(SKU, jpeg, write)).rejects.toMatchObject({
      code: "image_limit_reached",
    });
  });

  it("rejects a non-image content type", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    await expect(
      uploadProductImage(
        SKU,
        { bytes: new Uint8Array(8), contentType: "application/pdf", filename: "x.pdf" },
        deps(repo),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("reorders and deletes, promoting the next primary", async () => {
    const repo = new MemoryDashboardRepo();
    seedListed(repo);
    await repo.insertImage(
      {
        id: IMG1,
        product_sku: SKU,
        url: "https://cdn.shoelaxe.test/a.jpg",
        storage_path: "a.jpg",
        sort_order: 0,
        is_primary: true,
        width: null,
        height: null,
        bytes: 10,
      },
      NOW,
    );
    await repo.insertImage(
      {
        id: IMG2,
        product_sku: SKU,
        url: "https://cdn.shoelaxe.test/b.jpg",
        storage_path: "b.jpg",
        sort_order: 1,
        is_primary: false,
        width: null,
        height: null,
        bytes: 10,
      },
      NOW,
    );

    const reordered = await reorderProductImages(SKU, [IMG2, IMG1], deps(repo));
    expect(reordered[0]?.id).toBe(IMG2);
    expect(reordered[0]?.is_primary).toBe(true);

    const afterDelete = await deleteProductImage(SKU, IMG2, deps(repo));
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.id).toBe(IMG1);
    expect(afterDelete[0]?.is_primary).toBe(true);
  });
});
