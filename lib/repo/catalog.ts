import type postgres from "postgres";
import type { CatalogFromKicks } from "@/lib/kicksdb/map";
import type { CatalogProductRow, CatalogRepo } from "./catalog-types";

const iso = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
};

/**
 * Persistence for a KicksDB catalog write. Uses the pool client (has `begin`) so the lookup
 * transaction is never the ingest item transaction.
 */
export class PostgresCatalogRepo implements CatalogRepo {
  constructor(private readonly sql: postgres.Sql) {}

  async findBySku(sku: string): Promise<CatalogProductRow | null> {
    const [row] = await this.sql`
      select id, product_sku, product_name, brand, kicks_looked_up_at, kicks_enriched_at
      from public.products
      where product_sku = ${sku}
      limit 1
    `;
    if (!row) return null;
    return {
      id: String(row.id),
      product_sku: String(row.product_sku),
      product_name: String(row.product_name),
      brand: String(row.brand),
      kicks_looked_up_at: iso(row.kicks_looked_up_at as Date | string | null),
      kicks_enriched_at: iso(row.kicks_enriched_at as Date | string | null),
    };
  }

  async applyLookup(
    productId: string,
    sku: string,
    catalog: CatalogFromKicks | null,
    now: string,
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      if (catalog == null) {
        await tx`
          update public.products set kicks_looked_up_at = ${now}
          where id = ${productId}::uuid
        `;
        return;
      }

      await tx`
        update public.products set
          product_name = ${catalog.product_name},
          brand = ${catalog.brand},
          model = ${catalog.model},
          description = ${catalog.description},
          colorway = ${catalog.colorway},
          season = ${catalog.season},
          release_date = ${catalog.release_date},
          release_date_year = ${catalog.release_date_year},
          title = ${catalog.title},
          body_html = ${catalog.body_html},
          vendor = ${catalog.vendor},
          product_type = ${catalog.product_type},
          kicks_product_id = ${catalog.kicks_product_id},
          kicks_looked_up_at = ${now},
          kicks_enriched_at = ${now}
        where id = ${productId}::uuid
      `;

      const existing = await tx`
        select image_url from media.product_images
        where product_sku = ${sku} and image_url is not null
      `;
      const have = new Set(
        existing.map((r) => String(r.image_url)).filter((u) => u.length > 0),
      );
      const [countRow] = await tx`
        select count(*)::int as n from media.product_images
        where product_sku = ${sku} and is_primary
      `;
      let primaryTaken = Number(countRow?.n ?? 0) > 0;

      for (const [index, url] of catalog.image_urls.entries()) {
        if (have.has(url)) continue;
        const isPrimary = !primaryTaken;
        primaryTaken = primaryTaken || isPrimary;
        await tx`
          insert into media.product_images (
            product_sku, image_url, is_primary, source, sort_order, alt_text
          ) values (
            ${sku}, ${url}, ${isPrimary}, 'kicksdb', ${index}, ${catalog.product_name}
          )
        `;
      }

      await tx`
        insert into public.audit_log (actor_label, action, target_table, target_id, before, after)
        values (
          ${"爬取更新"}, ${"catalog_enrich"}, ${"products"}, ${productId}::uuid,
          ${tx.json({ kicks_enriched_at: null })},
          ${tx.json({
            kicks_product_id: catalog.kicks_product_id,
            model: catalog.model,
            colorway: catalog.colorway,
            image_count: catalog.image_urls.length,
          })}
        )
      `;
    });
  }
}
