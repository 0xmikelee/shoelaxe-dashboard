import { describe, expect, it } from "vitest";
import type { PublishableListing } from "@/lib/publishing/desired-state";
import {
  PublishingError,
  shopifyInventoryQuantity,
  shopifyProductStatus,
  toProductSetInput,
  variantSku,
} from "@/lib/publishing/desired-state";
import { canaryListing } from "@/lib/shopify/canary";

const LOCATION = "gid://shopify/Location/1";

function listing(overrides: Partial<PublishableListing> = {}): PublishableListing {
  return {
    productSku: "555088-101",
    size: "US 9",
    title: "Air Jordan 1",
    descriptionHtml: null,
    vendor: "Nike",
    productType: "Sneakers",
    tags: [],
    hasImage: true,
    listingStatus: "approved",
    approvedPrice: "1299.00",
    sources: [
      { slot: "stockx", quantity: 1 },
      { slot: "in_house", quantity: 4 },
    ],
    ...overrides,
  };
}

describe("variantSku", () => {
  it("strips whitespace from the size, matching 555088-101-US9", () => {
    expect(variantSku("555088-101", "US 9")).toBe("555088-101-US9");
    expect(variantSku("555088-101", "  US   9 ")).toBe("555088-101-US9");
    expect(variantSku("DZ5485-106", "US 7.5")).toBe("DZ5485-106-US7.5");
  });
});

describe("shopifyInventoryQuantity", () => {
  it("uses in-house quantity only, never StockX's constant 1", () => {
    expect(
      shopifyInventoryQuantity([
        { slot: "stockx", quantity: 1 },
        { slot: "in_house", quantity: 4 },
      ]),
    ).toBe(4);
  });

  it("is 0 when there is no in-house source, even if StockX reports 1", () => {
    expect(shopifyInventoryQuantity([{ slot: "stockx", quantity: 1 }])).toBe(0);
  });

  it("allows sold-out zero", () => {
    expect(shopifyInventoryQuantity([{ slot: "in_house", quantity: 0 }])).toBe(0);
  });
});

describe("shopifyProductStatus", () => {
  it("is DRAFT when delisted, even with an image", () => {
    expect(shopifyProductStatus("inactive", true)).toBe("DRAFT");
  });

  it("is DRAFT when there is no image", () => {
    expect(shopifyProductStatus("approved", false)).toBe("DRAFT");
  });

  it("is ACTIVE only for a live listing with an image", () => {
    expect(shopifyProductStatus("approved", true)).toBe("ACTIVE");
    expect(shopifyProductStatus("pending_price", true)).toBe("ACTIVE");
  });

  it("is DRAFT for listings that have never been live", () => {
    expect(shopifyProductStatus("pending_new", true)).toBe("DRAFT");
    expect(shopifyProductStatus("needs_margins", true)).toBe("DRAFT");
    expect(shopifyProductStatus("rejected", true)).toBe("DRAFT");
  });
});

describe("toProductSetInput", () => {
  it("refuses to publish a null approved price", () => {
    expect(() => toProductSetInput(listing({ approvedPrice: null }), LOCATION)).toThrow(
      PublishingError,
    );
  });

  it("does not take a pending price; only approved_price is on the variant", () => {
    const input = toProductSetInput(listing({ approvedPrice: "1500.00" }), LOCATION);
    expect(input.variants[0]?.price).toBe("1500.00");
  });

  it("tracks inventory, denies overselling, and sets qty at the given location", () => {
    const input = toProductSetInput(listing(), LOCATION);
    const variant = input.variants[0];
    expect(variant?.inventoryPolicy).toBe("DENY");
    expect(variant?.inventoryItem).toEqual({ tracked: true, sku: "555088-101-US9" });
    expect(variant?.inventoryQuantities).toEqual([
      { locationId: LOCATION, name: "available", quantity: 4 },
    ]);
  });

  it("maps the canary to DRAFT (no image) with in-house qty 2, not StockX 1", () => {
    const input = toProductSetInput(canaryListing(), LOCATION);
    expect(input.status).toBe("DRAFT");
    expect(input.variants[0]?.sku).toBe("SHOELAXE-TEST-US9");
    expect(input.variants[0]?.price).toBe("1234.00");
    expect(input.variants[0]?.inventoryQuantities[0]?.quantity).toBe(2);
  });
});
