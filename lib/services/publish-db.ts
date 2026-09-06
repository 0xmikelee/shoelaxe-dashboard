import { getEnv } from "@/lib/env-core";
import { getSql } from "@/lib/db/sql";
import { PostgresPublishRepo } from "@/lib/repo/publish";
import { drainBatch, enqueueListingSync } from "@/lib/services/publish";
import type { DrainResult, ShopifySyncResult } from "@/lib/schemas/wire/shopify";
import { adminConfig } from "@/lib/shopify/admin";
import { parseShopifyEnv } from "@/lib/shopify/env";
import { liveShopifyPublisher } from "@/lib/shopify/publisher";

export async function drainBatchFromDb(opts?: { maxProducts?: number }): Promise<DrainResult> {
  const env = getEnv();
  const repo = new PostgresPublishRepo(getSql());
  const now = () => new Date().toISOString();
  if (env.PUBLISH_TARGET === "none") {
    return drainBatch(
      { repo, publisher: null, locationId: null, publishTarget: "none", now },
      opts,
    );
  }
  const shopifyEnv = parseShopifyEnv(process.env, { requireLocation: true });
  return drainBatch(
    {
      repo,
      publisher: liveShopifyPublisher(adminConfig(shopifyEnv)),
      locationId: shopifyEnv.locationId ?? null,
      publishTarget: "shopify",
      now,
    },
    opts,
  );
}

export async function enqueueListingSyncFromDb(listingId: string): Promise<ShopifySyncResult | null> {
  const env = getEnv();
  const repo = new PostgresPublishRepo(getSql());
  return enqueueListingSync(repo, listingId, env.PUBLISH_TARGET);
}

export async function beatWorker(instance: string): Promise<void> {
  const repo = new PostgresPublishRepo(getSql());
  await repo.heartbeat(instance, new Date().toISOString());
}
