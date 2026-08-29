/**
 * Pure mapping from a Shoelaxe listing to the Shopify product-set payload.
 *
 * No I/O. The worker (later) and the ping script both call this so a canary write and a real
 * drain cannot drift on SKU format, which quantity feeds Shopify, or draft vs active.
 */
import type { ApprovalStatus, ListingSourceSlot } from "@/lib/domain/types";
import { formatSize } from "@/lib/format/size";

export type ShopifyProductStatus = "ACTIVE" | "DRAFT";

export interface PublishableSource {
  slot: ListingSourceSlot;
  quantity: number;
}

export interface PublishableListing {
  productSku: string;
  size: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: readonly string[];
  hasImage: boolean;
  listingStatus: ApprovalStatus;
  /** Live price. Pending candidates never publish. */
  approvedPrice: string | null;
  sources: readonly PublishableSource[];
}

export interface ProductSetVariantInput {
  optionValues: ReadonlyArray<{ optionName: "Size"; name: string }>;
  sku: string;
  price: string;
  inventoryPolicy: "DENY";
  inventoryItem: { tracked: true; sku: string };
  inventoryQuantities: ReadonlyArray<{
    locationId: string;
    name: "available";
    quantity: number;
  }>;
}

export interface ProductSetInput {
  title: string;
  status: ShopifyProductStatus;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  productOptions: ReadonlyArray<{
    name: "Size";
    values: ReadonlyArray<{ name: string }>;
  }>;
  variants: ProductSetVariantInput[];
}

/**
 * Variant SKU is `{product_sku}-{size}` with whitespace stripped from the size, matching the brief
 * example `555088-101-US9`. The size label itself stays `US 9` on the Shopify option value.
 */
export function variantSku(productSku: string, size: string): string {
  return `${productSku}-${formatSize(size).replace(/\s+/g, "")}`;
}

/**
 * 已下架 → draft. No image → draft (create unpublished until there is something to show).
 * Otherwise only a live listing (`approved` / `pending_price`) is active.
 */
export function shopifyProductStatus(
  listingStatus: ApprovalStatus,
  hasImage: boolean,
): ShopifyProductStatus {
  if (listingStatus === "inactive") return "DRAFT";
  if (!hasImage) return "DRAFT";
  if (listingStatus === "approved" || listingStatus === "pending_price") return "ACTIVE";
  return "DRAFT";
}

/**
 * Shopify inventory is in-house quantity only. StockX's constant 1 must never be summed in —
 * that overstates stock by exactly the size count (Gap 23).
 */
export function shopifyInventoryQuantity(sources: readonly PublishableSource[]): number {
  const inHouse = sources.find((s) => s.slot === "in_house");
  return inHouse?.quantity ?? 0;
}

export class PublishingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishingError";
  }
}

/**
 * Builds the `productSet` input for one listing. `productSet` deletes variants omitted from
 * `variants`, so a full-SKU drain must pass every size; the canary is a dedicated one-size product.
 */
export function toProductSetInput(listing: PublishableListing, locationId: string): ProductSetInput {
  if (!listing.approvedPrice) {
    throw new PublishingError(
      `cannot publish ${listing.productSku} ${listing.size}: approved_price is null`,
    );
  }
  const size = formatSize(listing.size);
  const sku = variantSku(listing.productSku, size);
  const quantity = shopifyInventoryQuantity(listing.sources);
  return {
    title: listing.title,
    status: shopifyProductStatus(listing.listingStatus, listing.hasImage),
    descriptionHtml: listing.descriptionHtml,
    vendor: listing.vendor,
    productType: listing.productType,
    tags: [...listing.tags],
    productOptions: [{ name: "Size", values: [{ name: size }] }],
    variants: [
      {
        optionValues: [{ optionName: "Size", name: size }],
        sku,
        price: listing.approvedPrice,
        inventoryPolicy: "DENY",
        inventoryItem: { tracked: true, sku },
        inventoryQuantities: [
          { locationId, name: "available", quantity },
        ],
      },
    ],
  };
}
