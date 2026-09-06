/**
 * Pure mapping from a Shoelaxe listing to the Shopify product-set payload.
 *
 * No I/O. The worker and the ping script both call this so a canary write and a real
 * drain cannot drift on SKU format, which quantity feeds Shopify, or draft vs active.
 */
import type { ApprovalStatus, ListingSourceSlot } from "@/lib/domain/types";
import { compareSizes, formatSize } from "@/lib/format/size";

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

export interface PublishableImage {
  url: string;
  alt: string | null;
  sortOrder: number;
}

export interface PublishableSizeListing {
  size: string;
  listingStatus: ApprovalStatus;
  approvedPrice: string | null;
  sources: readonly PublishableSource[];
}

export interface PublishableProduct {
  productSku: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: readonly string[];
  images: readonly PublishableImage[];
  listings: readonly PublishableSizeListing[];
}

export interface ProductSetFileInput {
  originalSource: string;
  filename: string;
  contentType: "IMAGE";
  duplicateResolutionMode: "REPLACE";
  alt?: string;
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
  files?: ProductSetFileInput[];
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
 * Product-level status for a full-SKU drain. No image → draft. Every size inactive → draft.
 * Otherwise ACTIVE when any listing is live (`approved` / `pending_price`).
 */
export function shopifyProductStatusForProduct(
  listings: readonly PublishableSizeListing[],
  hasImage: boolean,
): ShopifyProductStatus {
  if (!hasImage) return "DRAFT";
  if (listings.length > 0 && listings.every((l) => l.listingStatus === "inactive")) return "DRAFT";
  if (listings.some((l) => l.listingStatus === "approved" || l.listingStatus === "pending_price")) {
    return "ACTIVE";
  }
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

/** Drain should mark the job succeeded without calling Shopify — nothing live to send. */
export class NothingToPublishError extends PublishingError {
  constructor(message: string) {
    super(message);
    this.name = "NothingToPublishError";
  }
}

export function isPublishableSize(listing: PublishableSizeListing): boolean {
  return listing.approvedPrice != null;
}

function variantInput(
  productSku: string,
  listing: PublishableSizeListing,
  locationId: string,
): ProductSetVariantInput {
  const size = formatSize(listing.size);
  const sku = variantSku(productSku, size);
  return {
    optionValues: [{ optionName: "Size", name: size }],
    sku,
    price: listing.approvedPrice!,
    inventoryPolicy: "DENY",
    inventoryItem: { tracked: true, sku },
    inventoryQuantities: [
      { locationId, name: "available", quantity: shopifyInventoryQuantity(listing.sources) },
    ],
  };
}

export function fileNameForImage(productSku: string, index: number, url: string): string {
  const fallback = `${productSku}-${index}.jpg`;
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").filter(Boolean).pop();
    if (!base) return fallback;
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safe) return fallback;
    return `${productSku}-${index}-${safe}`.slice(0, 200);
  } catch {
    return fallback;
  }
}

function filesForProduct(product: PublishableProduct): ProductSetFileInput[] {
  return [...product.images]
    .filter((img) => img.url.trim().length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img, index) => {
      const file: ProductSetFileInput = {
        originalSource: img.url,
        filename: fileNameForImage(product.productSku, index, img.url),
        contentType: "IMAGE",
        duplicateResolutionMode: "REPLACE",
      };
      const alt = img.alt?.trim();
      if (alt) file.alt = alt;
      return file;
    });
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

/**
 * Full-SKU `productSet` input. Omitting a size deletes that variant on Shopify, so every listing
 * with an `approved_price` must be present. Pending candidates are not variants.
 */
export function toProductSetInputForProduct(
  product: PublishableProduct,
  locationId: string,
): ProductSetInput {
  const publishable = [...product.listings]
    .filter(isPublishableSize)
    .sort((a, b) => compareSizes(a.size, b.size));
  if (publishable.length === 0) {
    throw new NothingToPublishError(
      `cannot publish ${product.productSku}: no listing has approved_price`,
    );
  }

  const files = filesForProduct(product);
  const hasImage = files.length > 0;
  const sizes = publishable.map((l) => formatSize(l.size));

  return {
    title: product.title,
    status: shopifyProductStatusForProduct(product.listings, hasImage),
    descriptionHtml: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    tags: [...product.tags],
    ...(files.length > 0 ? { files } : {}),
    productOptions: [{ name: "Size", values: sizes.map((name) => ({ name })) }],
    variants: publishable.map((listing) => variantInput(product.productSku, listing, locationId)),
  };
}
