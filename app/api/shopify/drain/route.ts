import { defineRoute } from "@/lib/http/handler";
import { ShopifyDrainWire } from "@/lib/schemas/wire/shopify";

export const POST = defineRoute(
  {
    operationId: "drainShopify",
    method: "post",
    path: "/api/shopify/drain",
    summary: "Claim due shopify_sync_jobs and publish a small batch",
    description:
      "Worker-driven. With PUBLISH_TARGET=none this reports the deferred backlog and never calls " +
      "Shopify. Apps Script must not call this route.",
    tags: ["shopify"],
    auth: "machine",
    consumedBy: "machine: worker drain / local poke",
    response: ShopifyDrainWire,
    errors: ["missing_key", "invalid_key", "internal_error", "service_unavailable"],
    idempotency: "Each call claims a different due batch. Safe to retry.",
    sideEffects: [
      "shopify_sync_jobs",
      "listings.shopify_* ids on success",
      "listings.shopify_sync_error after 5 failures",
    ],
  },
  async () => {
    const { drainBatchFromDb } = await import("@/lib/services/publish-db");
    return { data: await drainBatchFromDb() };
  },
);
