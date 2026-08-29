/**
 * Enablement probe against shoelaxe-test.myshopify.com.
 *
 * Fails closed: missing credentials, non-HKD currency, or an ambiguous location set.
 * Writes SHOPIFY_LOCATION_ID to .env.local when there is exactly one active location.
 */
import { adminConfig, adminGraphql } from "../lib/shopify/admin";
import { grantedScopes } from "../lib/shopify/auth";
import { parseShopifyEnv } from "../lib/shopify/env";
import { ShopifyError } from "../lib/shopify/errors";
import { SHOP_ENABLEMENT_QUERY } from "../lib/shopify/operations";
import type { ShopEnablementData } from "../lib/shopify/types";
import { variantSku } from "../lib/publishing/desired-state";
import { loadLocalEnv } from "./load-local-env";
import { upsertEnvLocal } from "./upsert-env-local";

function looksLikeVariantSku(sku: string): boolean {
  return /^.+-US\d/.test(sku) || /^.+-(UK|EU|CM)/.test(sku);
}

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseShopifyEnv();
  const config = adminConfig(env);
  const data = await adminGraphql<ShopEnablementData>(config, SHOP_ENABLEMENT_QUERY);

  const { shop, locations, productsCount, products } = data;
  console.log(`shop: ${shop.name} (${shop.myshopifyDomain})`);
  // Readback of the scopes approved on the store, not of what the token request asked for.
  console.log(`granted scopes: ${grantedScopes(config) || "(none reported)"}`);
  console.log(`currency: ${shop.currencyCode}`);

  const active = locations.nodes.filter((l) => l.isActive);
  console.log(`locations (active ${active.length} / ${locations.nodes.length}):`);
  for (const loc of locations.nodes) {
    const flags = [
      loc.isActive ? "active" : "inactive",
      loc.fulfillsOnlineOrders ? "online" : "offline",
    ].join(", ");
    console.log(`  ${loc.id}  ${loc.name}  (${flags})`);
  }

  if (active.length === 0) {
    throw new ShopifyError("F1 failed: no active inventory location", "location");
  }
  if (active.length > 1) {
    throw new ShopifyError(
      `F1 failed: ${active.length} active locations — will not guess. Set SHOPIFY_LOCATION_ID to one GID from the list above.`,
      "location",
      active.map((l) => l.id),
    );
  }

  const locationId = active[0]!.id;
  upsertEnvLocal("SHOPIFY_LOCATION_ID", locationId);
  console.log(`F1: wrote SHOPIFY_LOCATION_ID=${locationId} to .env.local`);

  console.log(`products: ${productsCount.count}`);
  const sampleSkus: string[] = [];
  for (const product of products.nodes) {
    for (const variant of product.variants.nodes) {
      if (variant.sku) sampleSkus.push(variant.sku);
    }
  }
  if (sampleSkus.length === 0) {
    console.log("catalogue sample: (no SKUs on the first page)");
  } else {
    const matching = sampleSkus.filter(looksLikeVariantSku);
    console.log(`catalogue sample SKUs (${sampleSkus.length} on first page):`);
    for (const sku of sampleSkus.slice(0, 15)) {
      console.log(`  ${sku}`);
    }
    console.log(
      `SKU shape {product}-{size} e.g. ${variantSku("555088-101", "US 9")}: ${matching.length} of ${sampleSkus.length} look like a match`,
    );
  }

  if (shop.currencyCode !== "HKD") {
    throw new ShopifyError(
      `F2 failed: store currency is ${shop.currencyCode}, expected HKD. Change the test store to HKD in Shopify Admin → Settings → General before publishing any prices.`,
      "currency",
      shop.currencyCode,
    );
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (err instanceof ShopifyError && err.details) {
    console.error(err.details);
  }
  process.exitCode = 1;
});
