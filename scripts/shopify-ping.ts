/**
 * Live write test: create or adopt the SHOELAXE-TEST canary, set price + in-house qty, read back.
 * Does not touch any other product.
 */
import { toProductSetInput, variantSku } from "../lib/publishing/desired-state";
import { adminConfig, adminGraphql } from "../lib/shopify/admin";
import {
  CANARY_PRICE,
  CANARY_PRODUCT_SKU,
  CANARY_QTY,
  CANARY_SIZE,
  CANARY_TITLE,
  canaryListing,
} from "../lib/shopify/canary";
import { parseShopifyEnv } from "../lib/shopify/env";
import { ShopifyError } from "../lib/shopify/errors";
import { SHOP_ENABLEMENT_QUERY } from "../lib/shopify/operations";
import {
  adoptVariantBySku,
  setAvailableQuantity,
  upsertProductSet,
} from "../lib/shopify/sync";
import type { ShopEnablementData } from "../lib/shopify/types";
import { loadLocalEnv } from "./load-local-env";

function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new ShopifyError(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      "assertion",
      { label, expected, actual },
    );
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseShopifyEnv(process.env, { requireLocation: true });
  const locationId = env.locationId!;
  const config = adminConfig(env);

  const shop = await adminGraphql<ShopEnablementData>(config, SHOP_ENABLEMENT_QUERY);
  console.log(`shop: ${shop.shop.name}  currency: ${shop.shop.currencyCode}`);
  if (shop.shop.currencyCode !== "HKD") {
    throw new ShopifyError(
      `F2 failed: store currency is ${shop.shop.currencyCode}, expected HKD. Will not write prices.`,
      "currency",
      shop.shop.currencyCode,
    );
  }
  const sku = variantSku(CANARY_PRODUCT_SKU, CANARY_SIZE);
  const productSetInput = toProductSetInput(canaryListing(), locationId);

  const existing = await adoptVariantBySku(config, sku);
  if (existing) {
    console.log(`adopt ${sku} → ${existing.product.id}`);
  } else {
    console.log(`create ${sku}`);
  }

  const product = await upsertProductSet(
    config,
    productSetInput,
    existing?.product.id,
  );
  const variant =
    product.variants.nodes.find((v) => v.sku === sku) ?? product.variants.nodes[0];
  if (!variant) {
    throw new ShopifyError("productSet returned no variants", "not_found");
  }

  await setAvailableQuantity(config, {
    inventoryItemId: variant.inventoryItem.id,
    locationId,
    quantity: CANARY_QTY,
  });

  const readBack = await adoptVariantBySku(config, sku);
  if (!readBack) {
    throw new ShopifyError(`canary ${sku} missing after upsert`, "not_found");
  }

  assertEqual("sku", readBack.sku, sku);
  assertEqual("price", readBack.price, CANARY_PRICE);
  assertEqual("inventoryQuantity", readBack.inventoryQuantity, CANARY_QTY);
  assertEqual("tracked", readBack.inventoryItem.tracked, true);
  assertEqual("title", readBack.product.title, CANARY_TITLE);

  const numericId = product.id.split("/").pop();
  console.log("canary ok");
  console.log(`  product: ${product.id}`);
  console.log(`  variant: ${readBack.id}`);
  console.log(`  inventoryItem: ${readBack.inventoryItem.id}`);
  console.log(`  price: ${readBack.price}  qty: ${readBack.inventoryQuantity}  status: ${readBack.product.status}`);
  console.log(`  admin: https://admin.shopify.com/store/shoelaxe-test/products/${numericId}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (err instanceof ShopifyError && err.details) {
    console.error(err.details);
  }
  process.exitCode = 1;
});
