import type { ProductSetInput } from "@/lib/publishing/desired-state";
import {
  adoptVariantBySku,
  findVariantsBySku,
  setAvailableQuantity,
  upsertProductSet,
} from "@/lib/shopify/sync";
import type { ShopifyAdminConfig } from "@/lib/shopify/admin";
import type { ProductSetProduct, VariantBySkuNode } from "@/lib/shopify/types";

export interface ShopifyPublisher {
  findVariantsBySku(sku: string): Promise<VariantBySkuNode[]>;
  adoptVariantBySku(sku: string): Promise<VariantBySkuNode | null>;
  upsertProductSet(input: ProductSetInput, productId?: string): Promise<ProductSetProduct>;
  setAvailableQuantity(args: {
    inventoryItemId: string;
    locationId: string;
    quantity: number;
    referenceDocumentUri: string;
  }): Promise<void>;
}

export function liveShopifyPublisher(config: ShopifyAdminConfig): ShopifyPublisher {
  return {
    findVariantsBySku: (sku) => findVariantsBySku(config, sku),
    adoptVariantBySku: (sku) => adoptVariantBySku(config, sku),
    upsertProductSet: (input, productId) => upsertProductSet(config, input, productId),
    setAvailableQuantity: (args) => setAvailableQuantity(config, args),
  };
}
