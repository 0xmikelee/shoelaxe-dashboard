import type { CatalogFromKicks } from "@/lib/kicksdb/map";
import type { CatalogImageRow, CatalogProductRow, CatalogRepo } from "./catalog-types";

export class MemoryCatalogRepo implements CatalogRepo {
  readonly products = new Map<string, CatalogProductRow>();
  readonly images: CatalogImageRow[] = [];
  readonly lookups: Array<{ sku: string; catalog: CatalogFromKicks | null }> = [];

  seed(row: CatalogProductRow): void {
    this.products.set(row.product_sku, row);
  }

  async findBySku(sku: string): Promise<CatalogProductRow | null> {
    return this.products.get(sku) ?? null;
  }

  async applyLookup(
    productId: string,
    sku: string,
    catalog: CatalogFromKicks | null,
    now: string,
  ): Promise<void> {
    this.lookups.push({ sku, catalog });
    const row = [...this.products.values()].find((p) => p.id === productId);
    if (!row) return;
    if (catalog == null) {
      this.products.set(row.product_sku, { ...row, kicks_looked_up_at: now });
      return;
    }
    this.products.set(row.product_sku, {
      ...row,
      product_name: catalog.product_name,
      brand: catalog.brand,
      kicks_looked_up_at: now,
      kicks_enriched_at: now,
    });
    const have = new Set(this.images.filter((i) => i.product_sku === sku).map((i) => i.image_url));
    let primaryTaken = this.images.some((i) => i.product_sku === sku && i.is_primary);
    for (const [sort_order, image_url] of catalog.image_urls.entries()) {
      if (have.has(image_url)) continue;
      const is_primary = !primaryTaken;
      primaryTaken = primaryTaken || is_primary;
      this.images.push({ product_sku: sku, image_url, is_primary, source: "kicksdb", sort_order });
    }
  }
}
