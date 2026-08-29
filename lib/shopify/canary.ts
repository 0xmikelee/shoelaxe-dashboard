import type { PublishableListing } from "@/lib/publishing/desired-state";

/** Dedicated test product. The ping must never touch any other SKU. */
export const CANARY_PRODUCT_SKU = "SHOELAXE-TEST";
export const CANARY_SIZE = "US 9";
export const CANARY_PRICE = "1234.00";
export const CANARY_QTY = 2;
export const CANARY_TITLE = "Shoelaxe canary — do not sell";

export function canaryListing(): PublishableListing {
  return {
    productSku: CANARY_PRODUCT_SKU,
    size: CANARY_SIZE,
    title: CANARY_TITLE,
    descriptionHtml: "<p>Shoelaxe enablement canary. Do not sell.</p>",
    vendor: "Shoelaxe",
    productType: "Sneakers",
    tags: ["shoelaxe-canary"],
    hasImage: false,
    listingStatus: "approved",
    approvedPrice: CANARY_PRICE,
    sources: [
      { slot: "stockx", quantity: 1 },
      { slot: "in_house", quantity: CANARY_QTY },
    ],
  };
}
