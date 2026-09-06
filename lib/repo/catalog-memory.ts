import type { CatalogFromKicks } from "@/lib/kicksdb/map";
import type { ApprovalStatus } from "@/lib/domain/types";
import type { CatalogImageRow, CatalogProductRow, CatalogRepo } from "./catalog-types";

export class MemoryCatalogRepo implements CatalogRepo {
  readonly products = new Map<string, CatalogProductRow>();
  readonly images: CatalogImageRow[] = [];
  readonly lookups: Array<{ sku: string; catalog: CatalogFromKicks | null }> = [];
  readonly listings: Array<{ id: string; product_id: string; approval_status: ApprovalStatus }> = [];
  readonly shopifyJobs: Array<{ listing_id: string; state: "queued" | "deferred" }> = [];

  seed(row: CatalogProductRow): void {
    this.products.set(row.product_sku, row);
  }

  seedListing(row: { id: string; product_id: string; approval_status: ApprovalStatus }): void {
    this.listings.push(row);
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

  async enqueueLiveShopifySync(productId: string, state: "queued" | "deferred"): Promise<number> {
    let n = 0;
    for (const listing of this.listings) {
      if (listing.product_id !== productId) continue;
      if (listing.approval_status !== "approved" && listing.approval_status !== "pending_price") {
        continue;
      }
      if (this.shopifyJobs.some((j) => j.listing_id === listing.id)) continue;
      this.shopifyJobs.push({ listing_id: listing.id, state });
      n += 1;
    }
    return n;
  }
}
