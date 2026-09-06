import {
  NothingToPublishError,
  toProductSetInputForProduct,
  variantSku,
  type PublishableProduct,
} from "@/lib/publishing/desired-state";
import type { ShopifyPublisher } from "@/lib/shopify/publisher";
import { ShopifyError } from "@/lib/shopify/errors";
import { log } from "@/lib/log";
import type { DrainResult } from "@/lib/schemas/wire/shopify";
import type {
  ClaimedWork,
  ListingShopifyIds,
  PublishListingRow,
  PublishRepo,
} from "@/lib/repo/publish-types";

export const DRAIN_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export const MAX_PUBLISH_ATTEMPTS = 5;
export const CLAIM_LEASE_MS = 2 * 60_000;

export function backoffMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), DRAIN_BACKOFF_MS.length) - 1;
  return DRAIN_BACKOFF_MS[index]!;
}

export interface DrainDeps {
  repo: PublishRepo;
  publisher: ShopifyPublisher | null;
  locationId: string | null;
  publishTarget: "none" | "shopify";
  now: () => string;
}

function toPublishable(snapshot: ClaimedWork["snapshot"]): PublishableProduct {
  return {
    productSku: snapshot.productSku,
    title: snapshot.title,
    descriptionHtml: snapshot.descriptionHtml,
    vendor: snapshot.vendor,
    productType: snapshot.productType,
    tags: snapshot.tags,
    images: snapshot.images,
    listings: snapshot.listings.map((l) => ({
      size: l.size,
      listingStatus: l.approval_status,
      approvedPrice: l.approved_price,
      sources: l.sources,
    })),
  };
}

async function resolveProductId(
  listings: readonly PublishListingRow[],
  productSku: string,
  publisher: ShopifyPublisher,
): Promise<string | undefined> {
  const stored = listings.find((l) => l.shopify_product_id)?.shopify_product_id;
  if (stored) return stored;

  for (const listing of listings) {
    if (listing.approved_price == null) continue;
    const sku = variantSku(productSku, listing.size);
    const matches = await publisher.findVariantsBySku(sku);
    if (matches.length > 1) {
      throw new ShopifyError(
        `ambiguous_sku: ${sku} matched ${matches.length} variants`,
        "ambiguous_sku",
        matches.map((m) => m.id),
      );
    }
    if (matches[0]) return matches[0].product.id;
  }
  return undefined;
}

function jobIdsOf(work: ClaimedWork): string[] {
  return work.jobs.map((j) => j.id);
}

function listingIdsOf(work: ClaimedWork): string[] {
  return work.snapshot.listings.map((l) => l.id);
}

function maxAttempts(work: ClaimedWork): number {
  return Math.max(...work.jobs.map((j) => j.attempts), 0);
}

export async function drainOneProduct(deps: DrainDeps): Promise<"published" | "failed" | "skipped" | "empty"> {
  const now = deps.now();
  const leaseUntil = new Date(Date.parse(now) + CLAIM_LEASE_MS).toISOString();
  const work = await deps.repo.claimDueProduct(now, leaseUntil);
  if (!work) return "empty";

  const ids = jobIdsOf(work);
  const listingIds = listingIdsOf(work);
  const attempts = maxAttempts(work);

  if (!deps.publisher || !deps.locationId) {
    await deps.repo.retryJobs(ids, "publisher not configured", now);
    return "failed";
  }

  try {
    const input = toProductSetInputForProduct(toPublishable(work.snapshot), deps.locationId);
    const productId = await resolveProductId(
      work.snapshot.listings,
      work.snapshot.productSku,
      deps.publisher,
    );
    const product = await deps.publisher.upsertProductSet(input, productId);

    const written: ListingShopifyIds[] = [];
    for (const listing of work.snapshot.listings) {
      if (listing.approved_price == null) continue;
      const sku = variantSku(work.snapshot.productSku, listing.size);
      const variant = product.variants.nodes.find((v) => v.sku === sku);
      if (!variant) {
        throw new ShopifyError(`productSet omitted variant ${sku}`, "not_found");
      }
      const quantity =
        input.variants.find((v) => v.sku === sku)?.inventoryQuantities[0]?.quantity ?? 0;
      await deps.publisher.setAvailableQuantity({
        inventoryItemId: variant.inventoryItem.id,
        locationId: deps.locationId,
        quantity,
        referenceDocumentUri: `gid://shoelaxe-dashboard/Sync/${ids[0]}`,
      });
      written.push({
        listingId: listing.id,
        shopify_product_id: product.id,
        shopify_variant_id: variant.id,
        shopify_inventory_item_id: variant.inventoryItem.id,
      });
    }

    await deps.repo.completeJobs(ids, written, deps.now());
    return "published";
  } catch (e) {
    if (e instanceof NothingToPublishError) {
      await deps.repo.skipJobs(ids, deps.now());
      return "skipped";
    }
    const message = e instanceof Error ? e.message : String(e);
    log.warn("shopify_drain_failed", {
      sku: work.snapshot.productSku,
      attempts,
      err: message,
    });
    if (attempts >= MAX_PUBLISH_ATTEMPTS) {
      await deps.repo.failJobs(ids, listingIds, message, deps.now());
    } else {
      const next = new Date(Date.parse(deps.now()) + backoffMs(attempts)).toISOString();
      await deps.repo.retryJobs(ids, message, next);
    }
    return "failed";
  }
}

export async function drainBatch(
  deps: DrainDeps,
  opts: { maxProducts?: number } = {},
): Promise<DrainResult> {
  const maxProducts = opts.maxProducts ?? 5;
  const result: DrainResult = {
    target: deps.publishTarget,
    claimed: 0,
    published: 0,
    deferred: 0,
    failed: 0,
    skipped: 0,
  };

  if (deps.publishTarget === "none") {
    result.deferred = await deps.repo.countDeferred();
    return result;
  }

  await deps.repo.promoteDeferred(deps.now());
  result.deferred = await deps.repo.countDeferred();

  for (let i = 0; i < maxProducts; i += 1) {
    const outcome = await drainOneProduct(deps);
    if (outcome === "empty") break;
    result.claimed += 1;
    if (outcome === "published") result.published += 1;
    else if (outcome === "skipped") result.skipped += 1;
    else result.failed += 1;
  }
  return result;
}

export async function enqueueListingSync(
  repo: PublishRepo,
  listingId: string,
  publishTarget: "none" | "shopify",
): Promise<{ listing_id: string; state: "queued" | "deferred"; created: boolean } | null> {
  if (!(await repo.listingExists(listingId))) return null;
  const state = publishTarget === "shopify" ? "queued" : "deferred";
  const created = await repo.enqueueShopifySync(listingId, state);
  return { listing_id: listingId, state, created };
}
