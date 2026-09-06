import type postgres from "postgres";
import type { ApprovalsFilters } from "@/lib/schemas/params/approvals";
import type { SessionActor } from "@/lib/http/session-auth";
import type {
  ApprovalJoinRow,
  DashboardGroup,
  DashboardImage,
  DashboardJob,
  DashboardListing,
  DashboardPriceUpdate,
  DashboardProduct,
  DashboardRepo,
  DashboardSettings,
  DashboardSource,
  InsertHistoryInput,
  ListingStatePatch,
  ProductContentPatch,
  SettingsPatch,
} from "./dashboard-types";
import type { Outcome } from "@/lib/domain/types";

const iso = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
};

const isoReq = (v: Date | string): string => iso(v) ?? new Date(0).toISOString();

const uniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505";

function mapListing(row: Record<string, unknown>): DashboardListing {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    product_sku: String(row.product_sku),
    product_name: String(row.product_name),
    name_zh: row.name_zh == null ? null : String(row.name_zh),
    brand: String(row.brand ?? ""),
    size: String(row.size),
    currency: String(row.currency ?? "HKD"),
    group_id: String(row.group_id),
    group_name: String(row.group_name),
    group_is_default: Boolean(row.group_is_default),
    group_margin_percent: row.group_margin_percent == null ? null : String(row.group_margin_percent),
    group_margin_fixed: row.group_margin_fixed == null ? null : String(row.group_margin_fixed),
    approval_status: row.approval_status as DashboardListing["approval_status"],
    approved_price: row.approved_price == null ? null : String(row.approved_price),
    approved_at: iso(row.approved_at as Date | string | null),
    previous_approved_price: null,
    previous_approved_at: null,
    base_cost: row.base_cost == null ? null : String(row.base_cost),
    base_cost_source: (row.base_cost_source as DashboardListing["base_cost_source"]) ?? null,
    base_cost_at: iso(row.base_cost_at as Date | string | null),
    pending_price: row.pending_price == null ? null : String(row.pending_price),
    pending_since: iso(row.pending_since as Date | string | null),
    pending_update_id: row.pending_update_id == null ? null : String(row.pending_update_id),
    margin_percent: row.margin_percent == null ? null : String(row.margin_percent),
    margin_fixed: row.margin_fixed == null ? null : String(row.margin_fixed),
    margin_source: (row.margin_source as DashboardListing["margin_source"]) ?? null,
    updated_at: isoReq((row.listing_updated_at as Date | string | undefined) ?? (row.updated_at as Date | string)),
  };
}

function mapSource(row: Record<string, unknown>): DashboardSource {
  return {
    listing_id: String(row.listing_id),
    source: row.source as DashboardSource["source"],
    cost: row.cost == null ? null : String(row.cost),
    cost_at: iso(row.cost_at as Date | string | null),
    previous_cost: null,
    previous_cost_at: null,
    quantity: Number(row.quantity),
    last_source_ref: row.last_source_ref == null ? null : String(row.last_source_ref),
    last_synced_at: iso(row.last_synced_at as Date | string | null),
  };
}

function mapImage(row: Record<string, unknown>): DashboardImage {
  return {
    id: String(row.id),
    product_sku: String(row.product_sku),
    url: String(row.image_url ?? row.url ?? ""),
    storage_path: row.storage_path == null ? null : String(row.storage_path),
    sort_order: Number(row.sort_order ?? 0),
    is_primary: Boolean(row.is_primary),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    bytes: row.bytes == null ? null : Number(row.bytes),
    created_at: isoReq(row.created_at as Date | string),
  };
}

function mapJob(row: Record<string, unknown>): DashboardJob {
  return {
    id: String(row.id),
    kind: row.kind as DashboardJob["kind"],
    scope_key: row.scope_key == null ? null : String(row.scope_key),
    payload: (row.payload as Record<string, unknown>) ?? {},
    total: Number(row.total),
    done: Number(row.done),
    status: row.status as DashboardJob["status"],
    last_error: row.last_error == null ? null : String(row.last_error),
    created_at: isoReq(row.created_at as Date | string),
    started_at: iso(row.started_at as Date | string | null),
    finished_at: iso(row.finished_at as Date | string | null),
  };
}

const LISTING_SELECT = `
  l.id, l.product_id, l.size, l.currency, l.approval_status, l.approved_price, l.approved_at,
  l.base_cost, l.base_cost_source, l.base_cost_at, l.pending_price, l.pending_since, l.pending_update_id,
  l.margin_percent, l.margin_fixed, l.margin_source, l.updated_at as listing_updated_at,
  p.product_sku, p.product_name, p.name_zh, p.brand,
  g.id as group_id, g.name as group_name, g.is_default as group_is_default,
  g.margin_percent as group_margin_percent, g.margin_fixed as group_margin_fixed
`;

export class PostgresDashboardRepo implements DashboardRepo {
  constructor(private readonly sql: postgres.ISql) {}

  async getSettings(): Promise<DashboardSettings> {
    const [row] = await this.sql`select * from public.pricing_settings where id = 1`;
    if (!row) throw new Error("pricing_settings row is missing");
    return {
      auto_approve_up_percent: String(row.auto_approve_up_percent),
      auto_approve_down_percent: String(row.auto_approve_down_percent),
      default_margin_enabled: Boolean(row.default_margin_enabled),
      default_margin_percent: String(row.default_margin_percent),
      default_margin_fixed: String(row.default_margin_fixed),
      rounding_enabled: Boolean(row.rounding_enabled),
      updated_at: isoReq(row.updated_at as Date | string),
      updated_by: row.updated_by == null ? null : String(row.updated_by),
      updated_by_name: null,
    };
  }

  async updateSettings(patch: SettingsPatch, actor: SessionActor, now: string): Promise<DashboardSettings> {
    await this.sql`
      update public.pricing_settings set
        auto_approve_up_percent = coalesce(${patch.auto_approve_up_percent ?? null}, auto_approve_up_percent),
        auto_approve_down_percent = coalesce(${patch.auto_approve_down_percent ?? null}, auto_approve_down_percent),
        default_margin_enabled = coalesce(${patch.default_margin_enabled ?? null}, default_margin_enabled),
        default_margin_percent = coalesce(${patch.default_margin_percent ?? null}, default_margin_percent),
        default_margin_fixed = coalesce(${patch.default_margin_fixed ?? null}, default_margin_fixed),
        rounding_enabled = coalesce(${patch.rounding_enabled ?? null}, rounding_enabled),
        updated_at = ${now},
        updated_by = ${actor.id}::uuid
      where id = 1
    `;
    return this.getSettings();
  }

  async getGroup(id: string): Promise<DashboardGroup> {
    const [row] = await this.sql`
      select id, name, margin_percent, margin_fixed, is_default
      from public.product_groups where id = ${id}::uuid
    `;
    if (!row) throw new Error(`group ${id} not found`);
    return {
      id: String(row.id),
      name: String(row.name),
      margin_percent: row.margin_percent == null ? null : String(row.margin_percent),
      margin_fixed: row.margin_fixed == null ? null : String(row.margin_fixed),
      is_default: Boolean(row.is_default),
    };
  }

  async findProductBySku(sku: string): Promise<DashboardProduct | null> {
    const [row] = await this.sql`
      select p.*, (
        select pu.product_name from public.price_updates pu
        where pu.product_sku = p.product_sku and pu.source = 'stockx'
        order by pu.received_at desc limit 1
      ) as stockx_name
      from public.products p
      where p.product_sku = ${sku.trim().toUpperCase()}
      limit 1
    `;
    if (!row) return null;
    return {
      id: String(row.id),
      product_sku: String(row.product_sku),
      product_name: String(row.product_name),
      name_zh: row.name_zh == null ? null : String(row.name_zh),
      brand: row.brand == null ? null : String(row.brand),
      title: row.title == null ? null : String(row.title),
      body_html: row.body_html == null ? null : String(row.body_html),
      vendor: row.vendor == null ? null : String(row.vendor),
      product_type: row.product_type == null ? null : String(row.product_type),
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      stockx_name: row.stockx_name == null ? null : String(row.stockx_name),
      product_group_id: String(row.product_group_id),
      last_imported_at: iso((row.last_imported_at as Date | string | null) ?? (row.created_at as Date | string | null)),
      created_at: isoReq(row.created_at as Date | string),
      updated_at: isoReq(row.updated_at as Date | string),
    };
  }

  async updateProduct(id: string, patch: ProductContentPatch, now: string): Promise<void> {
    await this.sql`
      update public.products set
        product_name = coalesce(${patch.product_name ?? null}, product_name),
        name_zh = coalesce(${patch.name_zh ?? null}, name_zh),
        title = coalesce(${patch.title ?? null}, title),
        body_html = coalesce(${patch.body_html ?? null}, body_html),
        vendor = coalesce(${patch.vendor ?? null}, vendor),
        product_type = coalesce(${patch.product_type ?? null}, product_type),
        tags = coalesce(${patch.tags ? this.sql.array(patch.tags) : null}, tags),
        updated_at = ${now}
      where id = ${id}::uuid
    `;
  }

  private listingJoin(id: string, lock: boolean) {
    if (lock) {
      return this.sql`
        select ${this.sql.unsafe(LISTING_SELECT)}
        from public.listings l
        join public.products p on p.id = l.product_id
        join public.product_groups g on g.id = p.product_group_id
        where l.id = ${id}::uuid
        for update of l
      `;
    }
    return this.sql`
      select ${this.sql.unsafe(LISTING_SELECT)}
      from public.listings l
      join public.products p on p.id = l.product_id
      join public.product_groups g on g.id = p.product_group_id
      where l.id = ${id}::uuid
    `;
  }

  async findListingById(id: string): Promise<DashboardListing | null> {
    const [row] = await this.listingJoin(id, false);
    return row ? mapListing(row as Record<string, unknown>) : null;
  }

  async lockListing(id: string): Promise<DashboardListing | null> {
    const [row] = await this.listingJoin(id, true);
    return row ? mapListing(row as Record<string, unknown>) : null;
  }

  async listListingsBySku(sku: string): Promise<DashboardListing[]> {
    const rows = await this.sql`
      select ${this.sql.unsafe(LISTING_SELECT)}
      from public.listings l
      join public.products p on p.id = l.product_id
      join public.product_groups g on g.id = p.product_group_id
      where p.product_sku = ${sku}
    `;
    return rows.map((r) => mapListing(r as Record<string, unknown>));
  }

  async listListingIdsBySku(sku: string): Promise<string[]> {
    const rows = await this.sql`
      select l.id from public.listings l
      join public.products p on p.id = l.product_id
      where p.product_sku = ${sku}
    `;
    return rows.map((r) => String(r.id));
  }

  async listRecomputeListingIds(opts: {
    roundingOrBandChanged: boolean;
    defaultMarginChanged: boolean;
  }): Promise<string[]> {
    const rows = opts.roundingOrBandChanged
      ? await this.sql`
          select l.id from public.listings l
          where l.approval_status <> 'inactive'
        `
      : await this.sql`
          select l.id from public.listings l
          join public.products p on p.id = l.product_id
          join public.product_groups g on g.id = p.product_group_id
          where l.approval_status <> 'inactive'
            and l.margin_percent is null and l.margin_fixed is null
            and g.margin_percent is null and g.margin_fixed is null
        `;
    if (!opts.roundingOrBandChanged && !opts.defaultMarginChanged) return [];
    return rows.map((r) => String(r.id));
  }

  async updateListingState(id: string, patch: ListingStatePatch): Promise<void> {
    await this.sql`
      update public.listings set
        approval_status = ${patch.approval_status},
        approved_price = ${patch.approved_price},
        approved_at = ${patch.approved_at},
        current_price = ${patch.current_price},
        pending_price = ${patch.pending_price},
        pending_since = ${patch.pending_since},
        pending_update_id = ${patch.pending_update_id}::uuid,
        margin_source = ${patch.margin_source},
        margin_percent = case when ${patch.margin_percent !== undefined} then ${patch.margin_percent ?? null}::numeric else margin_percent end,
        margin_fixed = case when ${patch.margin_fixed !== undefined} then ${patch.margin_fixed ?? null}::numeric else margin_fixed end,
        base_cost = case when ${patch.base_cost !== undefined} then ${patch.base_cost ?? null}::numeric else base_cost end,
        base_cost_source = case when ${patch.base_cost_source !== undefined} then ${patch.base_cost_source ?? null} else base_cost_source end,
        base_cost_at = case when ${patch.base_cost_at !== undefined} then ${patch.base_cost_at ?? null}::timestamptz else base_cost_at end
      where id = ${id}::uuid
    `;
  }

  async listSources(listingId: string): Promise<DashboardSource[]> {
    const rows = await this.sql`
      select listing_id, source, cost, cost_at, quantity, last_source_ref, last_synced_at
      from public.listing_sources where listing_id = ${listingId}::uuid
      order by source
    `;
    return rows.map((r) => mapSource(r as Record<string, unknown>));
  }

  async upsertInHouseSource(input: {
    listing_id: string;
    cost: string | null;
    costAt: string | null;
    quantity: number;
    last_synced_at: string;
    writeCost: boolean;
  }): Promise<void> {
    if (input.writeCost) {
      await this.sql`
        insert into public.listing_sources (
          listing_id, source, cost, cost_at, quantity, last_source_ref, last_synced_at
        ) values (
          ${input.listing_id}::uuid, 'in_house', ${input.cost}, ${input.costAt},
          ${input.quantity}, 'dashboard', ${input.last_synced_at}
        )
        on conflict (listing_id, source) do update set
          cost = excluded.cost,
          cost_at = excluded.cost_at,
          quantity = excluded.quantity,
          last_source_ref = excluded.last_source_ref,
          last_synced_at = excluded.last_synced_at
      `;
      return;
    }
    await this.sql`
      insert into public.listing_sources (
        listing_id, source, quantity, last_source_ref, last_synced_at
      ) values (
        ${input.listing_id}::uuid, 'in_house', ${input.quantity}, 'dashboard', ${input.last_synced_at}
      )
      on conflict (listing_id, source) do update set
        quantity = excluded.quantity,
        last_source_ref = excluded.last_source_ref,
        last_synced_at = excluded.last_synced_at
    `;
  }

  async insertHistory(input: InsertHistoryInput): Promise<{ id: string }> {
    const [row] = await this.sql`
      insert into public.price_history (
        listing_id, product_name, product_sku, brand, size, price, previous_price,
        currency, source, source_ref, quantity, previous_quantity, cost, previous_cost,
        change_type, actor_label, actor_id
      ) values (
        ${input.listing_id}::uuid, ${input.product_name}, ${input.product_sku}, ${input.brand},
        ${input.size}, ${input.price}, ${input.previous_price}, ${input.currency}, ${input.source},
        ${input.source_ref}, ${input.quantity}, ${input.previous_quantity}, ${input.cost},
        ${input.previous_cost}, ${input.change_type}, ${input.actor_label}, ${input.actor_id}::uuid
      )
      returning id
    `;
    return { id: String(row.id) };
  }

  async insertAuditLog(entry: {
    user_id: string | null;
    actor_label: string;
    action: string;
    target_table: string;
    target_id: string | null;
    before: unknown;
    after: unknown;
  }): Promise<void> {
    await this.sql`
      insert into public.audit_log (user_id, actor_label, action, target_table, target_id, before, after)
      values (
        ${entry.user_id}::uuid, ${entry.actor_label}, ${entry.action}, ${entry.target_table},
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

  async enqueueLiveShopifySyncForProduct(productId: string, state: "queued" | "deferred"): Promise<number> {
    const rows = await this.sql`
      insert into public.shopify_sync_jobs (listing_id, state)
      select l.id, ${state}
      from public.listings l
      where l.product_id = ${productId}::uuid
        and l.approval_status in ('approved', 'pending_price')
      on conflict (listing_id) where done_at is null do nothing
      returning id
    `;
    return rows.length;
  }

  async markUpdateOutcome(
    id: string,
    patch: { outcome: Outcome; status: DashboardPriceUpdate["status"] },
  ): Promise<void> {
    await this.sql`
      update public.price_updates
      set outcome = ${patch.outcome}, status = ${patch.status}
      where id = ${id}::uuid
    `;
  }

  async listApprovals(
    filters: ApprovalsFilters,
    nowMs: number,
  ): Promise<{ rows: ApprovalJoinRow[]; total: number }> {
    const DAY = 86_400_000;
    const days: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
    let from: string | null = null;
    let to: string | null = null;
    if (filters.from || filters.to) {
      from = filters.from ?? null;
      to = filters.to ?? null;
    } else if (filters.preset && filters.preset !== "all" && filters.preset in days) {
      from = new Date(nowMs - days[filters.preset]! * DAY).toISOString();
    }

    const rows = await this.sql`
      select
        pu.id as update_id, pu.listing_id, pu.product_sku as update_sku, pu.product_name as update_name,
        pu.size as update_size, pu.source, pu.cost, pu.status as update_status, pu.outcome, pu.engine,
        pu.threshold_up_percent, pu.threshold_down_percent, pu.observed_at, pu.received_at,
        ${this.sql.unsafe(LISTING_SELECT)}
      from public.price_updates pu
      join public.listings l on l.id = pu.listing_id
      join public.products p on p.id = l.product_id
      join public.product_groups g on g.id = p.product_group_id
      where (${from}::timestamptz is null or pu.received_at >= ${from}::timestamptz)
        and (${to}::timestamptz is null or pu.received_at <= ${to}::timestamptz)
        and (${filters.source ?? null}::text is null or pu.source = ${filters.source ?? null})
        and (${filters.listing_id ?? null}::uuid is null or l.id = ${filters.listing_id ?? null}::uuid)
        and (${filters.sku ?? null}::text is null or p.product_sku = ${filters.sku ?? null})
        and (
          ${filters.q ?? null}::text is null
          or p.product_name ilike ${"%" + (filters.q ?? "") + "%"}
          or coalesce(p.name_zh, '') ilike ${"%" + (filters.q ?? "") + "%"}
          or p.product_sku ilike ${"%" + (filters.q ?? "") + "%"}
        )
      order by pu.received_at desc
    `;

    const listingIds = [...new Set(rows.map((r) => String(r.id)))];
    const sources =
      listingIds.length === 0
        ? []
        : await this.sql`
            select listing_id, source, cost, cost_at, quantity, last_source_ref, last_synced_at
            from public.listing_sources where listing_id = any(${listingIds}::uuid[])
          `;
    const byListing = new Map<string, DashboardSource[]>();
    for (const s of sources) {
      const id = String(s.listing_id);
      const list = byListing.get(id) ?? [];
      list.push(mapSource(s as Record<string, unknown>));
      byListing.set(id, list);
    }

    let joined: ApprovalJoinRow[] = rows.map((r) => {
      const rec = r as Record<string, unknown>;
      const listing = mapListing(rec);
      const update: DashboardPriceUpdate = {
        id: String(r.update_id),
        listing_id: listing.id,
        product_sku: String(r.update_sku),
        product_name: String(r.update_name),
        size: String(r.update_size),
        source: r.source as DashboardPriceUpdate["source"],
        cost: r.cost == null ? null : String(r.cost),
        status: r.update_status as DashboardPriceUpdate["status"],
        outcome: (r.outcome as Outcome | null) ?? null,
        engine: (r.engine as "v1" | "v2") ?? "v2",
        threshold_up_percent: r.threshold_up_percent == null ? null : String(r.threshold_up_percent),
        threshold_down_percent: r.threshold_down_percent == null ? null : String(r.threshold_down_percent),
        observed_at: iso(r.observed_at as Date | string | null),
        received_at: isoReq(r.received_at as Date | string),
      };
      return { update, listing, sources: byListing.get(listing.id) ?? [] };
    });

    if (filters.status?.length) {
      const { approvalRowStatus } = await import("@/lib/services/wire-project");
      joined = joined.filter(({ update, listing }) => {
        const delta = null;
        return filters.status!.includes(
          approvalRowStatus(update.outcome, update.status, delta, listing.approval_status),
        );
      });
    }

    const total = joined.length;
    const start = (filters.page - 1) * filters.per_page;
    return { rows: joined.slice(start, start + filters.per_page), total };
  }

  async approvalStats(nowMs: number): Promise<{
    total_crawled: number;
    crawled_today: number;
    pending: number;
    confirmed: number;
    rejected: number;
    oldest_pending_since: string | null;
  }> {
    const today = new Date(nowMs - 86_400_000).toISOString();
    const [totals] = await this.sql`
      select
        count(*)::int as total_crawled,
        count(*) filter (where received_at >= ${today}::timestamptz)::int as crawled_today,
        count(*) filter (where outcome = 'auto_approved')::int as confirmed,
        count(*) filter (where status = 'rejected')::int as rejected
      from public.price_updates
    `;
    const [pending] = await this.sql`
      select count(*)::int as n, min(pending_since) as oldest
      from public.listings
      where approval_status in ('pending_new', 'pending_price')
    `;
    return {
      total_crawled: Number(totals?.total_crawled ?? 0),
      crawled_today: Number(totals?.crawled_today ?? 0),
      pending: Number(pending?.n ?? 0),
      confirmed: Number(totals?.confirmed ?? 0),
      rejected: Number(totals?.rejected ?? 0),
      oldest_pending_since: iso(pending?.oldest as Date | string | null),
    };
  }

  async listImages(sku: string): Promise<DashboardImage[]> {
    const rows = await this.sql`
      select * from media.product_images
      where product_sku = ${sku}
      order by is_primary desc, sort_order asc
    `;
    return rows.map((r) => mapImage(r as Record<string, unknown>));
  }

  async countImages(sku: string): Promise<number> {
    const [row] = await this.sql`select count(*)::int as n from media.product_images where product_sku = ${sku}`;
    return Number(row?.n ?? 0);
  }

  async insertImage(
    row: Omit<DashboardImage, "id" | "created_at"> & { id?: string },
    now: string,
  ): Promise<DashboardImage> {
    const [inserted] = await this.sql`
      insert into media.product_images (
        product_sku, image_url, storage_path, is_primary, source, sort_order, alt_text
      ) values (
        ${row.product_sku}, ${row.url}, ${row.storage_path}, ${row.is_primary}, 'dashboard',
        ${row.sort_order}, ${row.product_sku}
      )
      returning *
    `;
    return mapImage({ ...(inserted as Record<string, unknown>), created_at: now });
  }

  async findImage(sku: string, imageId: string): Promise<DashboardImage | null> {
    const [row] = await this.sql`
      select * from media.product_images where id = ${imageId}::uuid and product_sku = ${sku}
    `;
    return row ? mapImage(row as Record<string, unknown>) : null;
  }

  async deleteImage(imageId: string): Promise<void> {
    await this.sql`delete from media.product_images where id = ${imageId}::uuid`;
  }

  async applyImageOrder(sku: string, ids: readonly string[]): Promise<void> {
    for (const [index, id] of ids.entries()) {
      await this.sql`
        update media.product_images
        set sort_order = ${index}, is_primary = ${index === 0}
        where id = ${id}::uuid and product_sku = ${sku}
      `;
    }
  }

  async setPrimaryImage(sku: string, imageId: string): Promise<void> {
    const images = await this.listImages(sku);
    const rest = images.filter((i) => i.id !== imageId).map((i) => i.id);
    await this.applyImageOrder(sku, [imageId, ...rest]);
  }

  async findActiveJob(kind: DashboardJob["kind"], scopeKey: string): Promise<DashboardJob | null> {
    const [row] = await this.sql`
      select * from public.jobs
      where kind = ${kind} and scope_key = ${scopeKey} and status in ('queued', 'running')
      limit 1
    `;
    return row ? mapJob(row as Record<string, unknown>) : null;
  }

  async insertJob(input: {
    kind: DashboardJob["kind"];
    scope_key: string;
    total: number;
    payload: Record<string, unknown>;
    triggered_by: string | null;
  }): Promise<DashboardJob> {
    try {
      const [row] = await this.sql`
        insert into public.jobs (kind, scope_key, payload, total, status, triggered_by_user_id)
        values (
          ${input.kind}, ${input.scope_key}, ${this.sql.json(input.payload as postgres.JSONValue)}, ${input.total},
          'queued', ${input.triggered_by}::uuid
        )
        returning *
      `;
      return mapJob(row as Record<string, unknown>);
    } catch (e) {
      if (uniqueViolation(e)) {
        const err = new Error("job_already_running") as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      throw e;
    }
  }

  async insertJobItems(jobId: string, listingIds: readonly string[]): Promise<void> {
    for (const listingId of listingIds) {
      await this.sql`
        insert into public.job_items (job_id, listing_id, status)
        values (${jobId}::uuid, ${listingId}::uuid, 'queued')
      `;
    }
  }

  async claimQueuedJob(kind: DashboardJob["kind"], now: string): Promise<DashboardJob | null> {
    const [row] = await this.sql`
      update public.jobs
      set status = 'running', started_at = ${now}
      where id = (
        select id from public.jobs
        where kind = ${kind} and status = 'queued'
        order by created_at
        for update skip locked
        limit 1
      )
      returning *
    `;
    return row ? mapJob(row as Record<string, unknown>) : null;
  }

  async listQueuedJobListingIds(jobId: string): Promise<string[]> {
    const rows = await this.sql`
      select listing_id from public.job_items where job_id = ${jobId}::uuid and status = 'queued'
    `;
    return rows.map((r) => String(r.listing_id));
  }

  async markJobItemDone(
    jobId: string,
    listingId: string,
    status: "succeeded" | "failed",
    reason: string | null,
  ): Promise<void> {
    await this.sql`
      update public.job_items
      set status = ${status}, reason = ${reason}
      where job_id = ${jobId}::uuid and listing_id = ${listingId}::uuid
    `;
  }

  async finishJob(
    jobId: string,
    status: "succeeded" | "failed",
    now: string,
    lastError: string | null,
  ): Promise<void> {
    await this.sql`
      update public.jobs
      set status = ${status}, finished_at = ${now}, last_error = ${lastError}, done = total
      where id = ${jobId}::uuid
    `;
  }

  async incrementJobDone(jobId: string): Promise<void> {
    await this.sql`update public.jobs set done = done + 1 where id = ${jobId}::uuid`;
  }
}
