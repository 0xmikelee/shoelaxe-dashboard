import type {
  ClaimedWork,
  ListingShopifyIds,
  PublishListingRow,
  PublishProductSnapshot,
  PublishRepo,
  ShopifySyncJobRow,
} from "./publish-types";

export class MemoryPublishRepo implements PublishRepo {
  readonly jobs: ShopifySyncJobRow[] = [];
  readonly listings = new Map<string, PublishListingRow>();
  readonly products = new Map<string, PublishProductSnapshot>();
  heartbeatAt: { instance: string; now: string } | null = null;

  seedProduct(snapshot: PublishProductSnapshot): void {
    this.products.set(snapshot.productId, snapshot);
    for (const listing of snapshot.listings) {
      this.listings.set(listing.id, listing);
    }
  }

  seedJob(over: Partial<ShopifySyncJobRow> & Pick<ShopifySyncJobRow, "listing_id">): ShopifySyncJobRow {
    const row: ShopifySyncJobRow = {
      id: over.id ?? crypto.randomUUID(),
      listing_id: over.listing_id,
      state: over.state ?? "queued",
      attempts: over.attempts ?? 0,
      next_attempt_at: over.next_attempt_at ?? "2026-01-01T00:00:00.000Z",
      last_error: over.last_error ?? null,
      created_at: over.created_at ?? "2026-01-01T00:00:00.000Z",
      done_at: over.done_at ?? null,
    };
    this.jobs.push(row);
    return row;
  }

  async promoteDeferred(now: string): Promise<number> {
    let n = 0;
    for (const job of this.jobs) {
      if (job.state === "deferred" && job.done_at == null) {
        job.state = "queued";
        job.next_attempt_at = now;
        n += 1;
      }
    }
    return n;
  }

  async countDeferred(): Promise<number> {
    return this.jobs.filter((j) => j.done_at == null && j.state === "deferred").length;
  }

  async claimDueProduct(now: string, leaseUntil: string): Promise<ClaimedWork | null> {
    const due = this.jobs
      .filter((j) => j.done_at == null && j.state !== "deferred" && j.next_attempt_at <= now)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const seed = due[0];
    if (!seed) return null;
    seed.state = "running";
    seed.attempts += 1;
    seed.next_attempt_at = leaseUntil;

    const listing = this.listings.get(seed.listing_id);
    if (!listing) {
      seed.state = "failed";
      seed.done_at = now;
      seed.last_error = "listing missing";
      return null;
    }
    const snapshot = this.products.get(listing.product_id);
    if (!snapshot) {
      seed.state = "failed";
      seed.done_at = now;
      seed.last_error = "listing missing";
      return null;
    }

    const jobs = [seed];
    const siblingIds = new Set(snapshot.listings.map((l) => l.id));
    siblingIds.delete(seed.listing_id);
    for (const job of this.jobs) {
      if (!siblingIds.has(job.listing_id)) continue;
      if (job.done_at != null || job.state === "deferred") continue;
      if (job.next_attempt_at > now) continue;
      job.state = "running";
      job.attempts += 1;
      job.next_attempt_at = leaseUntil;
      jobs.push(job);
    }
    return { jobs, snapshot };
  }

  async completeJobs(
    jobIds: readonly string[],
    ids: readonly ListingShopifyIds[],
    now: string,
  ): Promise<void> {
    const wanted = new Set(jobIds);
    for (const job of this.jobs) {
      if (!wanted.has(job.id)) continue;
      job.state = "succeeded";
      job.done_at = now;
      job.last_error = null;
    }
    for (const row of ids) {
      const listing = this.listings.get(row.listingId);
      if (!listing) continue;
      listing.shopify_product_id = row.shopify_product_id;
      listing.shopify_variant_id = row.shopify_variant_id;
      listing.shopify_inventory_item_id = row.shopify_inventory_item_id;
      listing.shopify_synced_at = now;
      listing.shopify_sync_error = null;
    }
  }

  async retryJobs(jobIds: readonly string[], error: string, nextAttemptAt: string): Promise<void> {
    const wanted = new Set(jobIds);
    for (const job of this.jobs) {
      if (!wanted.has(job.id)) continue;
      job.state = "queued";
      job.last_error = error;
      job.next_attempt_at = nextAttemptAt;
    }
  }

  async failJobs(
    jobIds: readonly string[],
    listingIds: readonly string[],
    error: string,
    now: string,
  ): Promise<void> {
    const wanted = new Set(jobIds);
    for (const job of this.jobs) {
      if (!wanted.has(job.id)) continue;
      job.state = "failed";
      job.done_at = now;
      job.last_error = error;
    }
    for (const id of listingIds) {
      const listing = this.listings.get(id);
      if (listing) listing.shopify_sync_error = error;
    }
  }

  async skipJobs(jobIds: readonly string[], now: string): Promise<void> {
    const wanted = new Set(jobIds);
    for (const job of this.jobs) {
      if (!wanted.has(job.id)) continue;
      job.state = "succeeded";
      job.done_at = now;
      job.last_error = null;
    }
  }

  async enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<boolean> {
    if (this.jobs.some((j) => j.listing_id === listingId && j.done_at == null)) return false;
    this.seedJob({ listing_id: listingId, state });
    return true;
  }

  async listingExists(listingId: string): Promise<boolean> {
    return this.listings.has(listingId);
  }

  async heartbeat(instance: string, now: string): Promise<void> {
    this.heartbeatAt = { instance, now };
  }
}
