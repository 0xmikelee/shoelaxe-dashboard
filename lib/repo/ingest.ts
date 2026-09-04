import type postgres from "postgres";
import type { EventSource } from "@/lib/domain/types";
import type {
  CrawlRunRow,
  FinalizePriceUpdateInput,
  GroupRow,
  IngestRepo,
  InsertCrawlRunInput,
  InsertHistoryInput,
  InsertListingInput,
  InsertPriceUpdateInput,
  InsertProductInput,
  ListingPatch,
  ListingRow,
  ListingSourceRow,
  PriceUpdateRow,
  PricingSettingsRow,
  ProductRow,
  UnapprovedUpdateRow,
  UpsertSourceInput,
} from "./ingest-types";

const iso = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
};

const isoReq = (v: Date | string): string => iso(v) ?? new Date(0).toISOString();

const mapPriceUpdate = (row: Record<string, unknown>): PriceUpdateRow => ({
  id: String(row.id),
  product_sku: String(row.product_sku),
  product_name: String(row.product_name),
  brand: String(row.brand),
  size: String(row.size),
  currency: String(row.currency),
  cost: row.cost == null ? null : String(row.cost),
  quantity: row.quantity == null ? null : Number(row.quantity),
  source: row.source as PriceUpdateRow["source"],
  source_ref: row.source_ref == null ? null : String(row.source_ref),
  stockx_internal_id: row.stockx_internal_id == null ? null : String(row.stockx_internal_id),
  listing_id: row.listing_id == null ? null : String(row.listing_id),
  history_id: row.history_id == null ? null : String(row.history_id),
  status: row.status as PriceUpdateRow["status"],
  outcome: (row.outcome as PriceUpdateRow["outcome"]) ?? null,
  error_message: row.error_message == null ? null : String(row.error_message),
  received_at: isoReq(row.received_at as Date | string),
  applied_at: iso(row.applied_at as Date | string | null),
  engine: (row.engine as "v1" | "v2") ?? "v2",
  observed_at: iso(row.observed_at as Date | string | null),
  threshold_up_percent: row.threshold_up_percent == null ? null : String(row.threshold_up_percent),
  threshold_down_percent:
    row.threshold_down_percent == null ? null : String(row.threshold_down_percent),
});

const mapListing = (row: Record<string, unknown>): ListingRow => ({
  id: String(row.id),
  product_id: String(row.product_id),
  size: String(row.size),
  currency: String(row.currency),
  source: row.source as ListingRow["source"],
  last_source_ref: row.last_source_ref == null ? null : String(row.last_source_ref),
  cost: row.cost == null ? null : String(row.cost),
  margin_percent: row.margin_percent == null ? null : String(row.margin_percent),
  margin_fixed: row.margin_fixed == null ? null : String(row.margin_fixed),
  current_price: row.current_price == null ? null : String(row.current_price),
  approval_status: row.approval_status as ListingRow["approval_status"],
  approved_price: row.approved_price == null ? null : String(row.approved_price),
  approved_at: iso(row.approved_at as Date | string | null),
  base_cost: row.base_cost == null ? null : String(row.base_cost),
  base_cost_source: (row.base_cost_source as ListingRow["base_cost_source"]) ?? null,
  base_cost_at: iso(row.base_cost_at as Date | string | null),
  pending_price: row.pending_price == null ? null : String(row.pending_price),
  pending_since: iso(row.pending_since as Date | string | null),
  pending_update_id: row.pending_update_id == null ? null : String(row.pending_update_id),
  margin_source: (row.margin_source as ListingRow["margin_source"]) ?? null,
});

const uniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505";

export class PostgresIngestRepo implements IngestRepo {
  /** `ISql` is the tagged-template surface shared by the pool client and a `sql.begin` transaction. */
  constructor(private readonly sql: postgres.ISql) {}

  async findPriceUpdateBySourceRef(
    source: EventSource,
    sourceRef: string,
  ): Promise<PriceUpdateRow | null> {
    const [row] = await this.sql`
      select * from public.price_updates
      where source = ${source} and source_ref = ${sourceRef}
      limit 1
    `;
    return row ? mapPriceUpdate(row as Record<string, unknown>) : null;
  }

  async insertPriceUpdate(input: InsertPriceUpdateInput): Promise<PriceUpdateRow> {
    try {
      const [row] = await this.sql`
        insert into public.price_updates (
          product_sku, product_name, brand, size, currency, cost, quantity,
          source, source_ref, stockx_internal_id, status, engine, observed_at
        ) values (
          ${input.product_sku}, ${input.product_name}, ${input.brand}, ${input.size},
          ${input.currency}, ${input.cost}, ${input.quantity},
          ${input.source}, ${input.source_ref}, ${input.stockx_internal_id},
          'pending', 'v2', ${input.observed_at}
        )
        returning *
      `;
      return mapPriceUpdate(row as Record<string, unknown>);
    } catch (e) {
      if (!uniqueViolation(e)) throw e;
      const existing = await this.findPriceUpdateBySourceRef(input.source, input.source_ref);
      if (!existing) throw e;
      return existing;
    }
  }

  async getDefaultGroup(): Promise<GroupRow> {
    const [row] = await this.sql`
      select id, name, margin_percent, margin_fixed, is_default
      from public.product_groups where is_default limit 1
    `;
    if (!row) throw new Error("default product group is missing");
    return {
      id: String(row.id),
      name: String(row.name),
      margin_percent: row.margin_percent == null ? null : String(row.margin_percent),
      margin_fixed: row.margin_fixed == null ? null : String(row.margin_fixed),
      is_default: true,
    };
  }

  async getGroup(id: string): Promise<GroupRow> {
    const [row] = await this.sql`
      select id, name, margin_percent, margin_fixed, is_default
      from public.product_groups where id = ${id}::uuid
    `;
    if (!row) throw new Error(`product group ${id} not found`);
    return {
      id: String(row.id),
      name: String(row.name),
      margin_percent: row.margin_percent == null ? null : String(row.margin_percent),
      margin_fixed: row.margin_fixed == null ? null : String(row.margin_fixed),
      is_default: Boolean(row.is_default),
    };
  }

  async getPricingSettings(): Promise<PricingSettingsRow> {
    const [row] = await this.sql`select * from public.pricing_settings where id = 1`;
    if (!row) throw new Error("pricing_settings row is missing");
    return {
      auto_approve_up_percent: String(row.auto_approve_up_percent),
      auto_approve_down_percent: String(row.auto_approve_down_percent),
      default_margin_enabled: Boolean(row.default_margin_enabled),
      default_margin_percent: String(row.default_margin_percent),
      default_margin_fixed: String(row.default_margin_fixed),
      rounding_enabled: Boolean(row.rounding_enabled),
    };
  }

  async findProductBySku(sku: string): Promise<ProductRow | null> {
    const [row] = await this.sql`
      select id, product_sku, product_name, brand, stockx_internal_id, product_group_id
      from public.products where product_sku = ${sku} limit 1
    `;
    if (!row) return null;
    return {
      id: String(row.id),
      product_sku: String(row.product_sku),
      product_name: String(row.product_name),
      brand: String(row.brand),
      stockx_internal_id: row.stockx_internal_id == null ? null : String(row.stockx_internal_id),
      product_group_id: String(row.product_group_id),
    };
  }

  async insertProduct(input: InsertProductInput): Promise<ProductRow> {
    const [row] = await this.sql`
      insert into public.products (product_sku, product_name, brand, stockx_internal_id, product_group_id)
      values (${input.product_sku}, ${input.product_name}, ${input.brand},
              ${input.stockx_internal_id}, ${input.product_group_id}::uuid)
      returning id, product_sku, product_name, brand, stockx_internal_id, product_group_id
    `;
    return {
      id: String(row.id),
      product_sku: String(row.product_sku),
      product_name: String(row.product_name),
      brand: String(row.brand),
      stockx_internal_id: row.stockx_internal_id == null ? null : String(row.stockx_internal_id),
      product_group_id: String(row.product_group_id),
    };
  }

  async touchProduct(
    id: string,
    fields: { product_name: string; brand: string; stockx_internal_id: string | null },
  ): Promise<void> {
    await this.sql`
      update public.products set
        product_name = case
          when kicks_enriched_at is not null then product_name
          else ${fields.product_name}
        end,
        brand = case
          when kicks_enriched_at is not null then brand
          else ${fields.brand}
        end,
        stockx_internal_id = coalesce(${fields.stockx_internal_id}, stockx_internal_id)
      where id = ${id}::uuid
    `;
  }

  async findListing(
    productId: string,
    size: string,
    currency: string,
  ): Promise<ListingRow | null> {
    const [row] = await this.sql`
      select * from public.listings
      where product_id = ${productId}::uuid and size = ${size} and currency = ${currency}
      limit 1
    `;
    return row ? mapListing(row as Record<string, unknown>) : null;
  }

  async insertListing(input: InsertListingInput): Promise<ListingRow> {
    const [row] = await this.sql`
      insert into public.listings (
        product_id, size, currency, source, last_source_ref, cost, current_price
      ) values (
        ${input.product_id}::uuid, ${input.size}, ${input.currency}, ${input.source},
        ${input.last_source_ref}, ${input.cost}, null
      )
      returning *
    `;
    return mapListing(row as Record<string, unknown>);
  }

  async lockListing(id: string): Promise<ListingRow> {
    const [row] = await this.sql`
      select * from public.listings where id = ${id}::uuid for update
    `;
    if (!row) throw new Error(`listing ${id} not found`);
    return mapListing(row as Record<string, unknown>);
  }

  async updateListing(id: string, patch: ListingPatch): Promise<void> {
    await this.sql`
      update public.listings set
        last_source_ref = ${patch.last_source_ref},
        cost = ${patch.cost},
        current_price = ${patch.current_price},
        approval_status = ${patch.approval_status},
        approved_price = ${patch.approved_price},
        approved_at = ${patch.approved_at},
        base_cost = ${patch.base_cost},
        base_cost_source = ${patch.base_cost_source},
        base_cost_at = ${patch.base_cost_at},
        pending_price = ${patch.pending_price},
        pending_since = ${patch.pending_since},
        pending_update_id = ${patch.pending_update_id}::uuid,
        margin_source = ${patch.margin_source}
      where id = ${id}::uuid
    `;
  }

  async listListingSources(listingId: string): Promise<ListingSourceRow[]> {
    const rows = await this.sql`
      select id, listing_id, source, cost, cost_at, quantity, last_source_ref, last_synced_at
      from public.listing_sources where listing_id = ${listingId}::uuid
      order by source
    `;
    return rows.map((row) => ({
      id: String(row.id),
      listing_id: String(row.listing_id),
      source: row.source as ListingSourceRow["source"],
      cost: row.cost == null ? null : String(row.cost),
      cost_at: iso(row.cost_at as Date | string | null),
      quantity: Number(row.quantity),
      last_source_ref: row.last_source_ref == null ? null : String(row.last_source_ref),
      last_synced_at: iso(row.last_synced_at as Date | string | null),
    }));
  }

  async upsertListingSource(input: UpsertSourceInput): Promise<ListingSourceRow> {
    const [row] = input.writeCost
      ? await this.sql`
          insert into public.listing_sources (
            listing_id, source, cost, cost_at, quantity, last_source_ref, last_synced_at
          ) values (
            ${input.listing_id}::uuid, ${input.source}, ${input.cost}, ${input.costAt},
            ${input.quantity}, ${input.last_source_ref}, ${input.last_synced_at}
          )
          on conflict (listing_id, source) do update set
            cost = excluded.cost,
            cost_at = excluded.cost_at,
            quantity = excluded.quantity,
            last_source_ref = excluded.last_source_ref,
            last_synced_at = excluded.last_synced_at
          returning *
        `
      : await this.sql`
          insert into public.listing_sources (
            listing_id, source, cost, cost_at, quantity, last_source_ref, last_synced_at
          ) values (
            ${input.listing_id}::uuid, ${input.source}, null, null,
            ${input.quantity}, ${input.last_source_ref}, ${input.last_synced_at}
          )
          on conflict (listing_id, source) do update set
            quantity = excluded.quantity,
            last_source_ref = excluded.last_source_ref,
            last_synced_at = excluded.last_synced_at
          returning *
        `;
    return {
      id: String(row.id),
      listing_id: String(row.listing_id),
      source: row.source as ListingSourceRow["source"],
      cost: row.cost == null ? null : String(row.cost),
      cost_at: iso(row.cost_at as Date | string | null),
      quantity: Number(row.quantity),
      last_source_ref: row.last_source_ref == null ? null : String(row.last_source_ref),
      last_synced_at: iso(row.last_synced_at as Date | string | null),
    };
  }

  async listUnapprovedUpdates(listingId: string): Promise<UnapprovedUpdateRow[]> {
    const rows = await this.sql`
      select id, coalesce(observed_at, received_at) as observed_at
      from public.price_updates
      where listing_id = ${listingId}::uuid
        and status in ('pending', 'applied')
        and outcome in ('held_for_approval', 'new_listing', 'needs_margins')
    `;
    return rows.map((row) => ({
      id: String(row.id),
      observedAt: isoReq(row.observed_at as Date | string),
    }));
  }

  async markSuperseded(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.sql`
      update public.price_updates
      set outcome = 'superseded', status = 'applied'
      where id in ${this.sql(ids)}
    `;
  }

  async insertPriceHistory(input: InsertHistoryInput): Promise<{ id: string }> {
    const [row] = await this.sql`
      insert into public.price_history (
        listing_id, product_name, product_sku, brand, size, price, previous_price,
        currency, source, source_ref, quantity, previous_quantity, cost, previous_cost,
        change_type, actor_label
      ) values (
        ${input.listing_id}::uuid, ${input.product_name}, ${input.product_sku}, ${input.brand},
        ${input.size}, ${input.price}, ${input.previous_price}, ${input.currency}, ${input.source},
        ${input.source_ref}, ${input.quantity}, ${input.previous_quantity}, ${input.cost},
        ${input.previous_cost}, ${input.change_type}, ${input.actor_label}
      )
      returning id
    `;
    return { id: String(row.id) };
  }

  async finalizePriceUpdate(id: string, patch: FinalizePriceUpdateInput): Promise<PriceUpdateRow> {
    const [row] = await this.sql`
      update public.price_updates set
        status = ${patch.status},
        outcome = ${patch.outcome},
        error_message = ${patch.error_message},
        listing_id = ${patch.listing_id}::uuid,
        history_id = ${patch.history_id}::uuid,
        applied_at = ${patch.applied_at},
        threshold_up_percent = ${patch.threshold_up_percent},
        threshold_down_percent = ${patch.threshold_down_percent}
      where id = ${id}::uuid
      returning *
    `;
    return mapPriceUpdate(row as Record<string, unknown>);
  }

  async insertAuditLog(entry: {
    actor_label: string;
    action: string;
    target_table: string;
    target_id: string | null;
    before: unknown;
    after: unknown;
  }): Promise<void> {
    await this.sql`
      insert into public.audit_log (actor_label, action, target_table, target_id, before, after)
      values (
        ${entry.actor_label}, ${entry.action}, ${entry.target_table},
        ${entry.target_id}::uuid, ${this.sql.json(entry.before as postgres.JSONValue)},
        ${this.sql.json(entry.after as postgres.JSONValue)}
      )
    `;
  }

  async enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<void> {
    await this.sql`
      insert into public.shopify_sync_jobs (listing_id, state)
      values (${listingId}::uuid, ${state})
      on conflict (listing_id) where done_at is null do nothing
    `;
  }

  async findCrawlRun(runId: string): Promise<CrawlRunRow | null> {
    const [row] = await this.sql`select * from public.crawl_runs where run_id = ${runId}`;
    if (!row) return null;
    return {
      id: String(row.id),
      run_id: String(row.run_id),
      source: String(row.source),
      trigger: String(row.trigger),
      started_at: isoReq(row.started_at as Date | string),
      item_count: Number(row.item_count),
      ok_count: Number(row.ok_count),
      error_count: Number(row.error_count),
    };
  }

  async insertCrawlRun(input: InsertCrawlRunInput): Promise<CrawlRunRow> {
    const [row] = await this.sql`
      insert into public.crawl_runs (run_id, source, trigger, started_at)
      values (${input.run_id}, ${input.source}, ${input.trigger}, ${input.started_at})
      returning *
    `;
    return {
      id: String(row.id),
      run_id: String(row.run_id),
      source: String(row.source),
      trigger: String(row.trigger),
      started_at: isoReq(row.started_at as Date | string),
      item_count: Number(row.item_count),
      ok_count: Number(row.ok_count),
      error_count: Number(row.error_count),
    };
  }

  async incrementCrawlRun(
    runId: string,
    delta: { items: number; ok: number; error: number },
    finishedAt: string,
  ): Promise<void> {
    await this.sql`
      update public.crawl_runs set
        item_count = item_count + ${delta.items},
        ok_count = ok_count + ${delta.ok},
        error_count = error_count + ${delta.error},
        finished_at = ${finishedAt}
      where run_id = ${runId}
    `;
  }
}
