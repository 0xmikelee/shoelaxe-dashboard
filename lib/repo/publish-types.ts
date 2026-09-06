import type { ApprovalStatus, ListingSourceSlot } from "@/lib/domain/types";
import type { PublishableImage } from "@/lib/publishing/desired-state";

export type ShopifyJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "deferred";

export interface ShopifySyncJobRow {
  id: string;
  listing_id: string;
  state: ShopifyJobState;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  done_at: string | null;
}

export interface PublishListingRow {
  id: string;
  product_id: string;
  size: string;
  approval_status: ApprovalStatus;
  approved_price: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
  shopify_synced_at: string | null;
  shopify_sync_error: string | null;
  sources: ReadonlyArray<{ slot: ListingSourceSlot; quantity: number }>;
}

export interface PublishProductSnapshot {
  productId: string;
  productSku: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  images: PublishableImage[];
  listings: PublishListingRow[];
}

export interface ClaimedWork {
  jobs: ShopifySyncJobRow[];
  snapshot: PublishProductSnapshot;
}

export interface ListingShopifyIds {
  listingId: string;
  shopify_product_id: string;
  shopify_variant_id: string;
  shopify_inventory_item_id: string;
}

export interface PublishRepo {
  promoteDeferred(now: string): Promise<number>;
  countDeferred(): Promise<number>;
  claimDueProduct(now: string, leaseUntil: string): Promise<ClaimedWork | null>;
  completeJobs(jobIds: readonly string[], ids: readonly ListingShopifyIds[], now: string): Promise<void>;
  retryJobs(
    jobIds: readonly string[],
    error: string,
    nextAttemptAt: string,
  ): Promise<void>;
  failJobs(jobIds: readonly string[], listingIds: readonly string[], error: string, now: string): Promise<void>;
  skipJobs(jobIds: readonly string[], now: string): Promise<void>;
  enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<boolean>;
  listingExists(listingId: string): Promise<boolean>;
  heartbeat(instance: string, now: string): Promise<void>;
}
