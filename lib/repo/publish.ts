import type postgres from "postgres";
import type { ApprovalStatus, ListingSourceSlot } from "@/lib/domain/types";
import type {
  ClaimedWork,
  ListingShopifyIds,
  PublishListingRow,
  PublishProductSnapshot,
  PublishRepo,
  ShopifyJobState,
  ShopifySyncJobRow,
} from "./publish-types";

const iso = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
};

const isoReq = (v: Date | string): string => iso(v) ?? new Date(0).toISOString();

const mapJob = (row: Record<string, unknown>): ShopifySyncJobRow => ({
  id: String(row.id),
  listing_id: String(row.listing_id),
  state: row.state as ShopifyJobState,
  attempts: Number(row.attempts),
  next_attempt_at: isoReq(row.next_attempt_at as Date | string),
  last_error: row.last_error == null ? null : String(row.last_error),
  created_at: isoReq(row.created_at as Date | string),
  done_at: iso(row.done_at as Date | string | null),
});

export class PostgresPublishRepo implements PublishRepo {
  constructor(private readonly sql: postgres.Sql) {}

  async promoteDeferred(now: string): Promise<number> {
    const rows = await this.sql`
      update public.shopify_sync_jobs
      set state = 'queued', next_attempt_at = ${now}
      where state = 'deferred' and done_at is null
      returning id
    `;
    return rows.length;
  }

  async countDeferred(): Promise<number> {
    const [row] = await this.sql`
      select count(*)::int as n
      from public.shopify_sync_jobs
      where done_at is null and state = 'deferred'
    `;
    return Number(row?.n ?? 0);
  }

  async claimDueProduct(now: string, leaseUntil: string): Promise<ClaimedWork | null> {
    return this.sql.begin(async (tx) => {
      const claimed = await tx`
        with due as (
          select id
          from public.shopify_sync_jobs
          where done_at is null
            and state <> 'deferred'
            and next_attempt_at <= ${now}::timestamptz
          order by created_at
          for update skip locked
          limit 1
        )
        update public.shopify_sync_jobs j
        set state = 'running',
            attempts = j.attempts + 1,
            next_attempt_at = ${leaseUntil}::timestamptz
        from due
        where j.id = due.id
        returning j.*
      `;
      if (claimed.length === 0) return null;
      const seed = mapJob(claimed[0] as Record<string, unknown>);

      const snapshot = await loadSnapshot(tx, seed.listing_id);
      if (!snapshot) {
        await tx`
          update public.shopify_sync_jobs
          set state = 'failed',
              done_at = ${now}::timestamptz,
              last_error = 'listing missing'
          where id = ${seed.id}::uuid
        `;
        return null;
      }

      const siblingIds = snapshot.listings.map((l) => l.id).filter((id) => id !== seed.listing_id);
      const extra =
        siblingIds.length === 0
          ? []
          : await tx`
              update public.shopify_sync_jobs
              set state = 'running',
                  attempts = attempts + 1,
                  next_attempt_at = ${leaseUntil}::timestamptz
              where done_at is null
                and state <> 'deferred'
                and next_attempt_at <= ${now}::timestamptz
                and listing_id = any(${siblingIds}::uuid[])
              returning *
            `;
      const jobs = [seed, ...extra.map((r) => mapJob(r as Record<string, unknown>))];
      return { jobs, snapshot };
    });
  }

  async completeJobs(
    jobIds: readonly string[],
    ids: readonly ListingShopifyIds[],
    now: string,
  ): Promise<void> {
    if (jobIds.length === 0) return;
    await this.sql.begin(async (tx) => {
      for (const row of ids) {
        await tx`
          update public.listings
          set shopify_product_id = ${row.shopify_product_id},
              shopify_variant_id = ${row.shopify_variant_id},
              shopify_inventory_item_id = ${row.shopify_inventory_item_id},
              shopify_synced_at = ${now}::timestamptz,
              shopify_sync_error = null
          where id = ${row.listingId}::uuid
        `;
      }
      await tx`
        update public.shopify_sync_jobs
        set state = 'succeeded', done_at = ${now}::timestamptz, last_error = null
        where id = any(${[...jobIds]}::uuid[])
      `;
    });
  }

  async retryJobs(jobIds: readonly string[], error: string, nextAttemptAt: string): Promise<void> {
    if (jobIds.length === 0) return;
    await this.sql`
      update public.shopify_sync_jobs
      set state = 'queued', last_error = ${error}, next_attempt_at = ${nextAttemptAt}::timestamptz
      where id = any(${[...jobIds]}::uuid[])
    `;
  }

  async failJobs(
    jobIds: readonly string[],
    listingIds: readonly string[],
    error: string,
    now: string,
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      if (listingIds.length > 0) {
        await tx`
          update public.listings
          set shopify_sync_error = ${error}
          where id = any(${[...listingIds]}::uuid[])
        `;
      }
      if (jobIds.length > 0) {
        await tx`
          update public.shopify_sync_jobs
          set state = 'failed',
              done_at = ${now}::timestamptz,
              last_error = ${error}
          where id = any(${[...jobIds]}::uuid[])
        `;
      }
    });
  }

  async skipJobs(jobIds: readonly string[], now: string): Promise<void> {
    if (jobIds.length === 0) return;
    await this.sql`
      update public.shopify_sync_jobs
      set state = 'succeeded', done_at = ${now}::timestamptz, last_error = null
      where id = any(${[...jobIds]}::uuid[])
    `;
  }

  async enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<boolean> {
    const rows = await this.sql`
      insert into public.shopify_sync_jobs (listing_id, state)
      values (${listingId}::uuid, ${state})
      on conflict (listing_id) where done_at is null do nothing
      returning id
    `;
    return rows.length > 0;
  }

  async listingExists(listingId: string): Promise<boolean> {
    const [row] = await this.sql`
      select 1 as ok from public.listings where id = ${listingId}::uuid limit 1
    `;
    return row != null;
  }

  async heartbeat(instance: string, now: string): Promise<void> {
    await this.sql`
      update public.worker_heartbeat
      set instance = ${instance}, last_beat_at = ${now}::timestamptz
      where id = 1
    `;
  }
}

async function loadSnapshot(
  sql: postgres.ISql,
  listingId: string,
): Promise<PublishProductSnapshot | null> {
  const [listing] = await sql`
    select l.product_id, p.product_sku
    from public.listings l
    join public.products p on p.id = l.product_id
    where l.id = ${listingId}::uuid
    limit 1
  `;
  if (!listing) return null;
  const productId = String(listing.product_id);
  const productSku = String(listing.product_sku);

  const [product] = await sql`
    select
      product_sku,
      coalesce(title, product_name) as title,
      body_html,
      vendor,
      product_type,
      coalesce(tags, '{}'::text[]) as tags
    from public.products
    where id = ${productId}::uuid
  `;
  if (!product) return null;

  const listingRows = await sql`
    select
      id, product_id, size, approval_status, approved_price,
      shopify_product_id, shopify_variant_id, shopify_inventory_item_id,
      shopify_synced_at, shopify_sync_error
    from public.listings
    where product_id = ${productId}::uuid
  `;

  const listingIds = listingRows.map((r) => String(r.id));
  const sources =
    listingIds.length === 0
      ? []
      : await sql`
          select listing_id, source, quantity
          from public.listing_sources
          where listing_id = any(${listingIds}::uuid[])
        `;
  const sourcesByListing = new Map<string, PublishListingRow["sources"][number][]>();
  for (const s of sources) {
    const id = String(s.listing_id);
    const list = sourcesByListing.get(id) ?? [];
    list.push({ slot: s.source as ListingSourceSlot, quantity: Number(s.quantity) });
    sourcesByListing.set(id, list);
  }

  const imageRows = await sql`
    select image_url, alt_text, sort_order, is_primary
    from media.product_images
    where product_sku = ${productSku} and image_url is not null
    order by is_primary desc, sort_order asc
  `;

  const listings: PublishListingRow[] = listingRows.map((r) => ({
    id: String(r.id),
    product_id: String(r.product_id),
    size: String(r.size),
    approval_status: r.approval_status as ApprovalStatus,
    approved_price: r.approved_price == null ? null : String(r.approved_price),
    shopify_product_id: r.shopify_product_id == null ? null : String(r.shopify_product_id),
    shopify_variant_id: r.shopify_variant_id == null ? null : String(r.shopify_variant_id),
    shopify_inventory_item_id:
      r.shopify_inventory_item_id == null ? null : String(r.shopify_inventory_item_id),
    shopify_synced_at: iso(r.shopify_synced_at as Date | string | null),
    shopify_sync_error: r.shopify_sync_error == null ? null : String(r.shopify_sync_error),
    sources: sourcesByListing.get(String(r.id)) ?? [],
  }));

  return {
    productId,
    productSku,
    title: String(product.title),
    descriptionHtml: product.body_html == null ? null : String(product.body_html),
    vendor: product.vendor == null ? null : String(product.vendor),
    productType: product.product_type == null ? null : String(product.product_type),
    tags: Array.isArray(product.tags) ? product.tags.map(String) : [],
    images: imageRows.map((img, i) => ({
      url: String(img.image_url),
      alt: img.alt_text == null ? null : String(img.alt_text),
      sortOrder: Number(img.sort_order ?? i),
    })),
    listings,
  };
}
