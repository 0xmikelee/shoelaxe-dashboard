import { describe, expect, it } from "vitest";
import {
  NothingToPublishError,
  PublishingError,
  shopifyInventoryQuantity,
  shopifyProductStatus,
  shopifyProductStatusForProduct,
  toProductSetInput,
  toProductSetInputForProduct,
  variantSku,
  type PublishableListing,
  type PublishableProduct,
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

describe("shopifyProductStatusForProduct", () => {
  const size = (
    listingStatus: PublishableProduct["listings"][number]["listingStatus"],
  ): PublishableProduct["listings"][number] => ({
    size: "US 9",
    listingStatus,
    approvedPrice: "1299.00",
    sources: [{ slot: "in_house", quantity: 1 }],
  });

  it("is DRAFT when there are no images, even if a size is live", () => {
    expect(shopifyProductStatusForProduct([size("approved")], false)).toBe("DRAFT");
  });

  it("is DRAFT when every size is inactive", () => {
    expect(shopifyProductStatusForProduct([size("inactive"), size("inactive")], true)).toBe("DRAFT");
  });

  it("is ACTIVE when any size is live and there is an image", () => {
    expect(shopifyProductStatusForProduct([size("inactive"), size("approved")], true)).toBe("ACTIVE");
    expect(shopifyProductStatusForProduct([size("pending_price")], true)).toBe("ACTIVE");
  });

  it("is DRAFT when sizes exist but none have ever been live", () => {
    expect(shopifyProductStatusForProduct([size("pending_new")], true)).toBe("DRAFT");
  });
});

describe("toProductSetInputForProduct", () => {
  function product(over: Partial<PublishableProduct> = {}): PublishableProduct {
    return {
      productSku: "555088-101",
      title: "Air Jordan 1",
      descriptionHtml: "<p>Chicago</p>",
      vendor: "Nike",
      productType: "Sneakers",
      tags: ["jordan"],
      images: [{ url: "https://cdn.example/1.jpg", alt: "hero", sortOrder: 0 }],
      listings: [
        {
          size: "US 8",
          listingStatus: "approved",
          approvedPrice: "1299.00",
          sources: [
            { slot: "stockx", quantity: 1 },
            { slot: "in_house", quantity: 3 },
          ],
        },
        {
          size: "US 10",
          listingStatus: "approved",
          approvedPrice: "1399.00",
          sources: [{ slot: "in_house", quantity: 1 }],
        },
      ],
      ...over,
    };
  }

  it("includes every size with an approved price and omits pending candidates", () => {
    const input = toProductSetInputForProduct(
      product({
        listings: [
          ...product().listings,
          {
            size: "US 9",
            listingStatus: "pending_price",
            approvedPrice: "1200.00",
            sources: [{ slot: "in_house", quantity: 2 }],
          },
          {
            size: "US 11",
            listingStatus: "pending_new",
            approvedPrice: null,
            sources: [{ slot: "in_house", quantity: 0 }],
          },
        ],
      }),
      LOCATION,
    );
    expect(input.variants.map((v) => v.sku)).toEqual([
      "555088-101-US8",
      "555088-101-US9",
      "555088-101-US10",
    ]);
    expect(input.productOptions[0]?.values.map((v) => v.name)).toEqual(["US 8", "US 9", "US 10"]);
  });

  it("uses in-house qty per size, never StockX's 1", () => {
    const input = toProductSetInputForProduct(product(), LOCATION);
    expect(input.variants[0]?.inventoryQuantities[0]?.quantity).toBe(3);
    expect(input.variants[1]?.inventoryQuantities[0]?.quantity).toBe(1);
  });

  it("sends images in sort_order with REPLACE filenames", () => {
    const input = toProductSetInputForProduct(
      product({
        images: [
          { url: "https://cdn.example/b.jpg", alt: "second", sortOrder: 1 },
          { url: "https://cdn.example/a.jpg", alt: "first", sortOrder: 0 },
        ],
      }),
      LOCATION,
    );
    expect(input.files?.map((f) => f.originalSource)).toEqual([
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
    expect(input.files?.[0]?.duplicateResolutionMode).toBe("REPLACE");
    expect(input.files?.[0]?.contentType).toBe("IMAGE");
    expect(input.files?.[0]?.alt).toBe("first");
  });

  it("is DRAFT without images", () => {
    const input = toProductSetInputForProduct(product({ images: [] }), LOCATION);
    expect(input.status).toBe("DRAFT");
    expect(input.files).toBeUndefined();
  });

  it("throws NothingToPublishError when no listing has approved_price", () => {
    expect(() =>
      toProductSetInputForProduct(
        product({
          listings: [
            {
              size: "US 9",
              listingStatus: "pending_new",
              approvedPrice: null,
              sources: [],
            },
          ],
        }),
        LOCATION,
      ),
    ).toThrow(NothingToPublishError);
  });
});
