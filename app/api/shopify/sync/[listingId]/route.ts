import { defineRoute } from "@/lib/http/handler";
import { ShopifyListingIdPath } from "@/lib/schemas/params/paths";
import { ShopifySyncWire } from "@/lib/schemas/wire/shopify";
import { notFound } from "@/lib/http/errors";

export const POST = defineRoute(
  {
    operationId: "syncShopifyListing",
    method: "post",
    path: "/api/shopify/sync/{listingId}",
    summary: "Enqueue one listing for Shopify sync",
    description:
      "Inserts a shopify_sync_jobs row (queued when PUBLISH_TARGET=shopify, deferred otherwise). " +
      "Does not call Shopify. A pending row for the listing is a no-op with created=false.",
    tags: ["shopify"],
    auth: "machine",
    consumedBy: "machine: Sync now / local poke",
    request: { params: ShopifyListingIdPath },
    response: ShopifySyncWire,
    errors: ["missing_key", "invalid_key", "not_found", "internal_error", "service_unavailable"],
    idempotency: "One pending job per listing (unique where done_at is null).",
    sideEffects: ["shopify_sync_jobs"],
  },
  async (ctx) => {
    const { enqueueListingSyncFromDb } = await import("@/lib/services/publish-db");
    const result = await enqueueListingSyncFromDb(ctx.params.listingId);
    if (!result) throw notFound("listing");
    return { data: result };
  },
);
