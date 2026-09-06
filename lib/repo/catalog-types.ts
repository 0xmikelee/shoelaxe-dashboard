import type { CatalogFromKicks } from "@/lib/kicksdb/map";

export interface CatalogProductRow {
  id: string;
  product_sku: string;
  product_name: string;
  brand: string;
  kicks_looked_up_at: string | null;
  kicks_enriched_at: string | null;
}

export interface CatalogImageRow {
  product_sku: string;
  image_url: string;
  is_primary: boolean;
  source: string;
  sort_order: number;
}

export interface CatalogRepo {
  findBySku(sku: string): Promise<CatalogProductRow | null>;
  applyLookup(
    productId: string,
    sku: string,
    catalog: CatalogFromKicks | null,
    now: string,
  ): Promise<void>;
  /** Enqueue live (`approved` / `pending_price`) listings after a real catalog write. */
  enqueueLiveShopifySync(productId: string, state: "queued" | "deferred"): Promise<number>;
}
