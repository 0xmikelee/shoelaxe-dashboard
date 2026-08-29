export interface ShopEnablementData {
  shop: {
    name: string;
    currencyCode: string;
    myshopifyDomain: string;
  };
  locations: {
    nodes: ReadonlyArray<{
      id: string;
      name: string;
      isActive: boolean;
      fulfillsOnlineOrders: boolean;
    }>;
  };
  productsCount: { count: number };
  products: {
    nodes: ReadonlyArray<{
      id: string;
      title: string;
      status: string;
      variants: {
        nodes: ReadonlyArray<{ id: string; sku: string | null; title: string }>;
      };
    }>;
  };
}

export interface VariantBySkuNode {
  id: string;
  sku: string | null;
  price: string;
  inventoryQuantity: number | null;
  product: { id: string; title: string; status: string };
  inventoryItem: { id: string; tracked: boolean; sku: string | null };
}

export interface VariantsBySkuData {
  productVariants: { nodes: VariantBySkuNode[] };
}

export interface ProductSetData {
  productSet: {
    product: {
      id: string;
      title: string;
      status: string;
      variants: {
        nodes: ReadonlyArray<{
          id: string;
          sku: string | null;
          price: string;
          inventoryQuantity: number | null;
          inventoryItem: { id: string; tracked: boolean; sku: string | null };
        }>;
      };
    } | null;
    userErrors: ReadonlyArray<{
      field: string[] | null;
      message: string;
      code: string;
    }>;
  };
}

export interface InventorySetData {
  inventorySetQuantities: {
    inventoryAdjustmentGroup: {
      reason: string;
      changes: ReadonlyArray<{ name: string; delta: number }>;
    } | null;
    userErrors: ReadonlyArray<{
      code: string;
      field: string[] | null;
      message: string;
    }>;
  };
}
