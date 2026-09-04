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

const DEFAULT_GROUP_ID = "00000000-0000-4000-8000-000000000001";
const SETTINGS: PricingSettingsRow = {
  auto_approve_up_percent: "10",
  auto_approve_down_percent: "10",
  default_margin_enabled: true,
  default_margin_percent: "12",
  default_margin_fixed: "0.00",
  rounding_enabled: true,
};

export class MemoryIngestRepo implements IngestRepo {
  readonly products = new Map<string, ProductRow>();
  readonly listings = new Map<string, ListingRow>();
  readonly sources: ListingSourceRow[] = [];
  readonly priceUpdates: PriceUpdateRow[] = [];
  readonly history: Array<InsertHistoryInput & { id: string }> = [];
  readonly audit: Array<{ action: string; target_table: string; target_id: string | null }> = [];
  readonly shopifyJobs: Array<{ listing_id: string; state: "queued" | "deferred" }> = [];
  readonly crawlRuns = new Map<string, CrawlRunRow>();
  readonly groups = new Map<string, GroupRow>();
  settings: PricingSettingsRow = { ...SETTINGS };
  imagesWritten = 0;

  constructor() {
    this.groups.set(DEFAULT_GROUP_ID, {
      id: DEFAULT_GROUP_ID,
      name: "預設分組",
      margin_percent: null,
      margin_fixed: null,
      is_default: true,
    });
  }

  /** Disable the system default so listings with no override/group land in needs_margins. */
  disableDefaultMargin(): void {
    this.settings = { ...this.settings, default_margin_enabled: false };
  }

  setGroupMargins(percent: string | null, fixed: string | null): void {
    const group = this.groups.get(DEFAULT_GROUP_ID)!;
    this.groups.set(DEFAULT_GROUP_ID, { ...group, margin_percent: percent, margin_fixed: fixed });
  }

  seedProduct(over: Partial<ProductRow> & Pick<ProductRow, "id" | "product_sku">): ProductRow {
    const row: ProductRow = {
      product_name: over.product_name ?? "Seed",
      brand: over.brand ?? "Nike",
      stockx_internal_id: over.stockx_internal_id ?? null,
      product_group_id: over.product_group_id ?? DEFAULT_GROUP_ID,
      ...over,
    };
    this.products.set(row.product_sku, row);
    return row;
  }

  seedListing(over: Partial<ListingRow> & Pick<ListingRow, "id" | "product_id" | "size">): ListingRow {
    const row: ListingRow = {
      currency: "HKD",
      source: "google_sheet",
      last_source_ref: null,
      cost: over.cost ?? null,
      margin_percent: over.margin_percent ?? null,
      margin_fixed: over.margin_fixed ?? null,
      current_price: over.current_price ?? over.approved_price ?? null,
      approval_status: over.approval_status ?? "pending_new",
      approved_price: over.approved_price ?? null,
      approved_at: over.approved_at ?? null,
      base_cost: over.base_cost ?? over.cost ?? null,
      base_cost_source: over.base_cost_source ?? null,
      base_cost_at: over.base_cost_at ?? null,
      pending_price: over.pending_price ?? null,
      pending_since: over.pending_since ?? null,
      pending_update_id: over.pending_update_id ?? null,
      margin_source: over.margin_source ?? null,
      ...over,
    };
    this.listings.set(row.id, row);
    return row;
  }

  seedSource(row: ListingSourceRow): void {
    this.sources.push(row);
  }

  async findPriceUpdateBySourceRef(
    source: EventSource,
    sourceRef: string,
  ): Promise<PriceUpdateRow | null> {
    return this.priceUpdates.find((u) => u.source === source && u.source_ref === sourceRef) ?? null;
  }

  async insertPriceUpdate(input: InsertPriceUpdateInput): Promise<PriceUpdateRow> {
    const existing = await this.findPriceUpdateBySourceRef(input.source, input.source_ref);
    if (existing) return existing;
    const now = new Date().toISOString();
    const row: PriceUpdateRow = {
      id: crypto.randomUUID(),
      product_sku: input.product_sku,
      product_name: input.product_name,
      brand: input.brand,
      size: input.size,
      currency: input.currency,
      cost: input.cost,
      quantity: input.quantity,
      source: input.source,
      source_ref: input.source_ref,
      stockx_internal_id: input.stockx_internal_id,
      listing_id: null,
      history_id: null,
      status: "pending",
      outcome: null,
      error_message: null,
      received_at: now,
      applied_at: null,
      engine: "v2",
      observed_at: input.observed_at,
      threshold_up_percent: null,
      threshold_down_percent: null,
    };
    this.priceUpdates.push(row);
    return row;
  }

  async getDefaultGroup(): Promise<GroupRow> {
    return [...this.groups.values()].find((g) => g.is_default)!;
  }

  async getGroup(id: string): Promise<GroupRow> {
    const group = this.groups.get(id);
    if (!group) throw new Error(`product group ${id} not found`);
    return group;
  }

  async getPricingSettings(): Promise<PricingSettingsRow> {
    return this.settings;
  }

  async findProductBySku(sku: string): Promise<ProductRow | null> {
    return this.products.get(sku) ?? null;
  }

  async insertProduct(input: InsertProductInput): Promise<ProductRow> {
    const row: ProductRow = { id: crypto.randomUUID(), ...input };
    this.products.set(row.product_sku, row);
    return row;
  }

  async touchProduct(
    id: string,
    fields: { product_name: string; brand: string; stockx_internal_id: string | null },
  ): Promise<void> {
    for (const [sku, p] of this.products) {
      if (p.id !== id) continue;
      this.products.set(sku, {
        ...p,
        product_name: p.kicks_enriched_at ? p.product_name : fields.product_name,
        brand: p.kicks_enriched_at ? p.brand : fields.brand,
        stockx_internal_id: fields.stockx_internal_id ?? p.stockx_internal_id,
      });
    }
  }

  async findListing(
    productId: string,
    size: string,
    currency: string,
  ): Promise<ListingRow | null> {
    return (
      [...this.listings.values()].find(
        (l) => l.product_id === productId && l.size === size && l.currency === currency,
      ) ?? null
    );
  }

  async insertListing(input: InsertListingInput): Promise<ListingRow> {
    const row: ListingRow = {
      id: crypto.randomUUID(),
      product_id: input.product_id,
      size: input.size,
      currency: input.currency,
      source: input.source,
      last_source_ref: input.last_source_ref,
      cost: input.cost,
      margin_percent: null,
      margin_fixed: null,
      current_price: null,
      approval_status: "pending_new",
      approved_price: null,
      approved_at: null,
      base_cost: input.cost,
      base_cost_source: null,
      base_cost_at: null,
      pending_price: null,
      pending_since: null,
      pending_update_id: null,
      margin_source: null,
    };
    this.listings.set(row.id, row);
    return row;
  }

  async lockListing(id: string): Promise<ListingRow> {
    const row = this.listings.get(id);
    if (!row) throw new Error(`listing ${id} not found`);
    return row;
  }

  async updateListing(id: string, patch: ListingPatch): Promise<void> {
    const row = this.listings.get(id);
    if (!row) throw new Error(`listing ${id} not found`);
    this.listings.set(id, { ...row, ...patch });
  }

  async listListingSources(listingId: string): Promise<ListingSourceRow[]> {
    return this.sources.filter((s) => s.listing_id === listingId);
  }

  async upsertListingSource(input: UpsertSourceInput): Promise<ListingSourceRow> {
    const idx = this.sources.findIndex(
      (s) => s.listing_id === input.listing_id && s.source === input.source,
    );
    const previous = idx >= 0 ? this.sources[idx] : null;
    const row: ListingSourceRow = {
      id: previous?.id ?? crypto.randomUUID(),
      listing_id: input.listing_id,
      source: input.source,
      cost: input.writeCost ? input.cost : (previous?.cost ?? null),
      cost_at: input.writeCost ? input.costAt : (previous?.cost_at ?? null),
      quantity: input.quantity,
      last_source_ref: input.last_source_ref,
      last_synced_at: input.last_synced_at,
    };
    if (idx >= 0) this.sources[idx] = row;
    else this.sources.push(row);
    return row;
  }

  async listUnapprovedUpdates(listingId: string): Promise<UnapprovedUpdateRow[]> {
    return this.priceUpdates
      .filter(
        (u) =>
          u.listing_id === listingId &&
          (u.status === "pending" || u.status === "applied") &&
          (u.outcome === "held_for_approval" ||
            u.outcome === "new_listing" ||
            u.outcome === "needs_margins"),
      )
      .map((u) => ({ id: u.id, observedAt: u.observed_at ?? u.received_at }));
  }

  async markSuperseded(ids: readonly string[]): Promise<void> {
    const set = new Set(ids);
    for (const u of this.priceUpdates) {
      if (!set.has(u.id)) continue;
      u.outcome = "superseded";
      u.status = "applied";
    }
  }

  async insertPriceHistory(input: InsertHistoryInput): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    this.history.push({ ...input, id });
    return { id };
  }

  async finalizePriceUpdate(id: string, patch: FinalizePriceUpdateInput): Promise<PriceUpdateRow> {
    const row = this.priceUpdates.find((u) => u.id === id);
    if (!row) throw new Error(`price_update ${id} not found`);
    Object.assign(row, patch);
    return row;
  }

  async insertAuditLog(entry: {
    actor_label: string;
    action: string;
    target_table: string;
    target_id: string | null;
    before: unknown;
    after: unknown;
  }): Promise<void> {
    this.audit.push({
      action: entry.action,
      target_table: entry.target_table,
      target_id: entry.target_id,
    });
  }

  async enqueueShopifySync(listingId: string, state: "queued" | "deferred"): Promise<void> {
    if (this.shopifyJobs.some((j) => j.listing_id === listingId)) return;
    this.shopifyJobs.push({ listing_id: listingId, state });
  }

  async findCrawlRun(runId: string): Promise<CrawlRunRow | null> {
    return this.crawlRuns.get(runId) ?? null;
  }

  async insertCrawlRun(input: InsertCrawlRunInput): Promise<CrawlRunRow> {
    const row: CrawlRunRow = {
      id: crypto.randomUUID(),
      run_id: input.run_id,
      source: input.source,
      trigger: input.trigger,
      started_at: input.started_at,
      item_count: 0,
      ok_count: 0,
      error_count: 0,
    };
    this.crawlRuns.set(row.run_id, row);
    return row;
  }

  async incrementCrawlRun(
    runId: string,
    delta: { items: number; ok: number; error: number },
    _finishedAt: string,
  ): Promise<void> {
    const row = this.crawlRuns.get(runId);
    if (!row) return;
    row.item_count += delta.items;
    row.ok_count += delta.ok;
    row.error_count += delta.error;
  }
}
