import { randomUUID } from "node:crypto";
import type { ProductSetInput } from "@/lib/publishing/desired-state";
import { adminGraphql, type ShopifyAdminConfig } from "@/lib/shopify/admin";
import { ShopifyError } from "@/lib/shopify/errors";
import {
  INVENTORY_SET_MUTATION,
  PRODUCT_SET_MUTATION,
  VARIANTS_BY_SKU_QUERY,
} from "@/lib/shopify/operations";
import type {
  InventorySetData,
  ProductSetData,
  VariantBySkuNode,
  VariantsBySkuData,
} from "@/lib/shopify/types";

export function skuQuery(sku: string): string {
  return `sku:${sku}`;
}

export async function findVariantsBySku(
  config: ShopifyAdminConfig,
  sku: string,
): Promise<VariantBySkuNode[]> {
  const data = await adminGraphql<VariantsBySkuData>(config, VARIANTS_BY_SKU_QUERY, {
    query: skuQuery(sku),
  });
  return data.productVariants.nodes.filter((n) => n.sku === sku);
}

export async function adoptVariantBySku(
  config: ShopifyAdminConfig,
  sku: string,
): Promise<VariantBySkuNode | null> {
  const matches = await findVariantsBySku(config, sku);
  if (matches.length > 1) {
    throw new ShopifyError(
      `ambiguous_sku: ${sku} matched ${matches.length} variants`,
      "ambiguous_sku",
      matches.map((m) => m.id),
    );
  }
  return matches[0] ?? null;
}

/** JSON.stringify drops undefined; Shopify rejects explicit JSON nulls on optional strings. */
export function compactProductSetInput(input: ProductSetInput): Record<string, unknown> {
  return {
    title: input.title,
    status: input.status,
    ...(input.descriptionHtml ? { descriptionHtml: input.descriptionHtml } : {}),
    ...(input.vendor ? { vendor: input.vendor } : {}),
    ...(input.productType ? { productType: input.productType } : {}),
    tags: input.tags,
    productOptions: input.productOptions,
    variants: input.variants,
  };
}

export async function upsertProductSet(
  config: ShopifyAdminConfig,
  input: ProductSetInput,
  productId?: string,
): Promise<NonNullable<ProductSetData["productSet"]["product"]>> {
  const variables: Record<string, unknown> = {
    input: compactProductSetInput(input),
    ...(productId ? { identifier: { id: productId } } : {}),
  };
  const data = await adminGraphql<ProductSetData>(config, PRODUCT_SET_MUTATION, variables);
  const { product, userErrors } = data.productSet;
  if (userErrors.length) {
    throw new ShopifyError(
      userErrors.map((e) => e.message).join("; "),
      "user_errors",
      userErrors,
    );
  }
  if (!product) {
    throw new ShopifyError("productSet returned no product", "user_errors");
  }
  return product;
}

export async function setAvailableQuantity(
  config: ShopifyAdminConfig,
  args: { inventoryItemId: string; locationId: string; quantity: number },
): Promise<void> {
  const data = await adminGraphql<InventorySetData>(config, INVENTORY_SET_MUTATION, {
    idempotencyKey: randomUUID(),
    input: {
      name: "available",
      reason: "correction",
      referenceDocumentUri: "gid://shoelaxe-dashboard/Sync/canary",
      quantities: [
        {
          inventoryItemId: args.inventoryItemId,
          locationId: args.locationId,
          quantity: args.quantity,
          changeFromQuantity: null,
        },
      ],
    },
  });
  const errors = data.inventorySetQuantities.userErrors;
  if (errors.length) {
    throw new ShopifyError(
      errors.map((e) => e.message).join("; "),
      "user_errors",
      errors,
    );
  }
}
