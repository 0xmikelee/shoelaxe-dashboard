import { compareSizes } from "@/lib/format/size";
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

const DEFAULT_GROUP_ID = "00000000-0000-4000-8000-000000000001";
const NOW0 = "2026-08-29T07:00:00.000Z";

const SETTINGS: DashboardSettings = {
  auto_approve_up_percent: "10.000",
  auto_approve_down_percent: "10.000",
  default_margin_enabled: true,
  default_margin_percent: "12.0000",
  default_margin_fixed: "0.00",
  rounding_enabled: true,
  updated_at: NOW0,
  updated_by: null,
  updated_by_name: null,
};

export class MemoryDashboardRepo implements DashboardRepo {
  settings: DashboardSettings = { ...SETTINGS };
  readonly groups = new Map<string, DashboardGroup>();
  readonly products = new Map<string, DashboardProduct>();
  readonly listings = new Map<string, DashboardListing>();
  readonly sources: DashboardSource[] = [];
  readonly images: DashboardImage[] = [];
  readonly priceUpdates: DashboardPriceUpdate[] = [];
  readonly history: Array<InsertHistoryInput & { id: string }> = [];
  readonly audit: Array<{ action: string; target_table: string; target_id: string | null }> = [];
  readonly shopifyJobs: Array<{ listing_id: string; state: "queued" | "deferred" }> = [];
  readonly jobs: DashboardJob[] = [];
  readonly jobItems: Array<{
    job_id: string;
    listing_id: string;
    status: "queued" | "succeeded" | "failed";
    reason: string | null;
  }> = [];

  constructor() {
    this.groups.set(DEFAULT_GROUP_ID, {
      id: DEFAULT_GROUP_ID,
      name: "預設分組",
      margin_percent: null,
      margin_fixed: null,
      is_default: true,
    });
  }

  seedProduct(over: Partial<DashboardProduct> & Pick<DashboardProduct, "id" | "product_sku">): DashboardProduct {
    const now = over.created_at ?? NOW0;
    const row: DashboardProduct = {
      product_name: over.product_name ?? "Seed",
      name_zh: over.name_zh ?? null,
      brand: over.brand ?? "Nike",
      title: over.title ?? over.product_name ?? "Seed",
      body_html: over.body_html ?? null,
      vendor: over.vendor ?? over.brand ?? "Nike",
      product_type: over.product_type ?? null,
      tags: over.tags ?? [],
      stockx_name: over.stockx_name ?? null,
      product_group_id: over.product_group_id ?? DEFAULT_GROUP_ID,
      last_imported_at: over.last_imported_at ?? now,
      created_at: now,
      updated_at: over.updated_at ?? now,
      ...over,
    };
    this.products.set(row.product_sku, row);
    return row;
  }

  seedListing(
    over: Partial<DashboardListing> & Pick<DashboardListing, "id" | "product_id" | "product_sku" | "size">,
  ): DashboardListing {
    const group = this.groups.get(DEFAULT_GROUP_ID)!;
    const product = [...this.products.values()].find((p) => p.id === over.product_id);
    const row: DashboardListing = {
      product_name: over.product_name ?? product?.product_name ?? "Seed",
      name_zh: over.name_zh ?? product?.name_zh ?? null,
      brand: over.brand ?? product?.brand ?? "Nike",
      currency: "HKD",
      group_id: over.group_id ?? DEFAULT_GROUP_ID,
      group_name: over.group_name ?? group.name,
      group_is_default: over.group_is_default ?? true,
      group_margin_percent: over.group_margin_percent ?? group.margin_percent,
      group_margin_fixed: over.group_margin_fixed ?? group.margin_fixed,
      approval_status: over.approval_status ?? "pending_new",
      approved_price: over.approved_price ?? null,
      approved_at: over.approved_at ?? null,
      previous_approved_price: over.previous_approved_price ?? null,
      previous_approved_at: over.previous_approved_at ?? null,
      base_cost: over.base_cost ?? null,
      base_cost_source: over.base_cost_source ?? null,
      base_cost_at: over.base_cost_at ?? null,
      pending_price: over.pending_price ?? null,
      pending_since: over.pending_since ?? null,
      pending_update_id: over.pending_update_id ?? null,
      margin_percent: over.margin_percent ?? null,
      margin_fixed: over.margin_fixed ?? null,
      margin_source: over.margin_source ?? "default",
      updated_at: over.updated_at ?? NOW0,
      ...over,
    };
    this.listings.set(row.id, row);
    return row;
  }

  seedSource(row: DashboardSource): void {
    this.sources.push(row);
  }

  seedUpdate(row: DashboardPriceUpdate): void {
    this.priceUpdates.push(row);
  }

  async getSettings(): Promise<DashboardSettings> {
    return { ...this.settings };
  }

  async updateSettings(patch: SettingsPatch, actor: SessionActor, now: string): Promise<DashboardSettings> {
    this.settings = {
      ...this.settings,
      ...patch,
      updated_at: now,
      updated_by: actor.id,
      updated_by_name: actor.label,
    };
    return { ...this.settings };
  }

  async getGroup(id: string): Promise<DashboardGroup> {
    const group = this.groups.get(id);
    if (!group) throw new Error(`group ${id} not found`);
    return group;
  }

  async findProductBySku(sku: string): Promise<DashboardProduct | null> {
    return this.products.get(sku.trim().toUpperCase()) ?? this.products.get(sku) ?? null;
  }

  async updateProduct(id: string, patch: ProductContentPatch, now: string): Promise<void> {
    for (const [sku, product] of this.products) {
      if (product.id !== id) continue;
      this.products.set(sku, { ...product, ...patch, updated_at: now });
      for (const [lid, listing] of this.listings) {
        if (listing.product_id !== id) continue;
        this.listings.set(lid, {
          ...listing,
          product_name: patch.product_name ?? listing.product_name,
          name_zh: patch.name_zh ?? listing.name_zh,
          updated_at: now,
        });
      }
    }
  }

  async findListingById(id: string): Promise<DashboardListing | null> {
    return this.listings.get(id) ?? null;
  }

  async lockListing(id: string): Promise<DashboardListing | null> {
    return this.listings.get(id) ?? null;
  }

  async listListingsBySku(sku: string): Promise<DashboardListing[]> {
    return [...this.listings.values()]
      .filter((l) => l.product_sku === sku)
      .sort((a, b) => compareSizes(a.size, b.size));
  }

  async listListingIdsBySku(sku: string): Promise<string[]> {
    return (await this.listListingsBySku(sku)).map((l) => l.id);
  }

  async listRecomputeListingIds(opts: {
    roundingOrBandChanged: boolean;
    defaultMarginChanged: boolean;
  }): Promise<string[]> {
    return [...this.listings.values()]
      .filter((l) => {
        if (l.approval_status === "inactive") return false;
        if (opts.roundingOrBandChanged) return true;
        if (!opts.defaultMarginChanged) return false;
        return l.margin_percent == null && l.margin_fixed == null && l.group_margin_percent == null && l.group_margin_fixed == null;
      })
      .map((l) => l.id);
  }

  async updateListingState(id: string, patch: ListingStatePatch): Promise<void> {
    const row = this.listings.get(id);
    if (!row) throw new Error(`listing ${id} not found`);
    this.listings.set(id, {
      ...row,
      approval_status: patch.approval_status,
      approved_price: patch.approved_price,
      approved_at: patch.approved_at,
      pending_price: patch.pending_price,
      pending_since: patch.pending_since,
      pending_update_id: patch.pending_update_id,
      margin_source: patch.margin_source,
      margin_percent: patch.margin_percent !== undefined ? patch.margin_percent : row.margin_percent,
      margin_fixed: patch.margin_fixed !== undefined ? patch.margin_fixed : row.margin_fixed,
      base_cost: patch.base_cost !== undefined ? patch.base_cost : row.base_cost,
      base_cost_source: patch.base_cost_source !== undefined ? patch.base_cost_source : row.base_cost_source,
      base_cost_at: patch.base_cost_at !== undefined ? patch.base_cost_at : row.base_cost_at,
      updated_at: new Date().toISOString(),
    });
  }

  async listSources(listingId: string): Promise<DashboardSource[]> {
    return this.sources.filter((s) => s.listing_id === listingId);
  }

  async upsertInHouseSource(input: {
    listing_id: string;
    cost: string | null;
    costAt: string | null;
    quantity: number;
    last_synced_at: string;
    writeCost: boolean;
  }): Promise<void> {
    const idx = this.sources.findIndex((s) => s.listing_id === input.listing_id && s.source === "in_house");
    const prev = idx >= 0 ? this.sources[idx] : null;
    const row: DashboardSource = {
      listing_id: input.listing_id,
      source: "in_house",
      cost: input.writeCost ? input.cost : (prev?.cost ?? null),
      cost_at: input.writeCost ? input.costAt : (prev?.cost_at ?? null),
      previous_cost: input.writeCost ? (prev?.cost ?? null) : (prev?.previous_cost ?? null),
      previous_cost_at: input.writeCost ? (prev?.cost_at ?? null) : (prev?.previous_cost_at ?? null),
      quantity: input.quantity,
      last_source_ref: "dashboard",
      last_synced_at: input.last_synced_at,
    };
    if (idx >= 0) this.sources[idx] = row;
    else this.sources.push(row);
  }

  async insertHistory(input: InsertHistoryInput): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    this.history.push({ ...input, id });
    return { id };
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

  async enqueueLiveShopifySyncForProduct(productId: string, state: "queued" | "deferred"): Promise<number> {
    let n = 0;
    for (const listing of this.listings.values()) {
      if (listing.product_id !== productId) continue;
      if (listing.approval_status !== "approved" && listing.approval_status !== "pending_price") continue;
      const before = this.shopifyJobs.length;
      await this.enqueueShopifySync(listing.id, state);
      if (this.shopifyJobs.length > before) n += 1;
    }
    return n;
  }

  async markUpdateOutcome(
    id: string,
    patch: { outcome: DashboardPriceUpdate["outcome"]; status: DashboardPriceUpdate["status"] },
  ): Promise<void> {
    const row = this.priceUpdates.find((u) => u.id === id);
    if (!row) return;
    row.outcome = patch.outcome;
    row.status = patch.status;
  }

  async listApprovals(
    filters: ApprovalsFilters,
    nowMs: number,
  ): Promise<{ rows: ApprovalJoinRow[]; total: number }> {
    const DAY = 86_400_000;
    const days: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
    let fromMs = Number.NEGATIVE_INFINITY;
    let toMs = Number.POSITIVE_INFINITY;
    if (filters.from || filters.to) {
      fromMs = filters.from ? Date.parse(filters.from) : fromMs;
      toMs = filters.to ? Date.parse(filters.to) : toMs;
    } else if (filters.preset && filters.preset !== "all" && filters.preset in days) {
      fromMs = nowMs - days[filters.preset]! * DAY;
    }

    const q = filters.q?.toLowerCase();
    let joined: ApprovalJoinRow[] = [];
    for (const update of this.priceUpdates) {
      if (!update.listing_id) continue;
      const listing = this.listings.get(update.listing_id);
      if (!listing) continue;
      const at = Date.parse(update.received_at);
      if (at < fromMs || at > toMs) continue;
      if (filters.source && update.source !== filters.source) continue;
      if (filters.listing_id && listing.id !== filters.listing_id) continue;
      if (filters.sku && listing.product_sku !== filters.sku) continue;
      if (q && ![listing.product_name, listing.name_zh ?? "", listing.product_sku].some((s) => s.toLowerCase().includes(q))) {
        continue;
      }
      joined.push({ update, listing, sources: this.sources.filter((s) => s.listing_id === listing.id) });
    }

    const statuses = filters.status;
    if (statuses?.length) {
      const { approvalRowStatus, resolvedFor } = await import("@/lib/services/wire-project");
      joined = joined.filter(({ update, listing }) => {
        const approved = listing.approved_price;
        const pending = listing.pending_price;
        const delta =
          approved && approved !== "0.00" && pending
            ? (Number(pending) - Number(approved)) / Number(approved) * 100
            : null;
        const status = approvalRowStatus(update.outcome, update.status, delta, listing.approval_status);
        return statuses.includes(status);
      });
      void resolvedFor;
    }

    joined.sort((a, b) => {
      const dir = filters.order === "asc" ? 1 : -1;
      const av = a.update.received_at;
      const bv = b.update.received_at;
      switch (filters.sort) {
        case "created_at":
          return dir * av.localeCompare(bv);
        case "product_name":
          return dir * a.listing.product_name.localeCompare(b.listing.product_name);
        case "size":
          return dir * compareSizes(a.listing.size, b.listing.size);
        case "cost":
          return dir * ((Number(a.update.cost) || 0) - (Number(b.update.cost) || 0));
        case "new_price":
          return dir * ((Number(a.listing.pending_price ?? a.listing.approved_price) || 0) - (Number(b.listing.pending_price ?? b.listing.approved_price) || 0));
        case "pending_since":
        default: {
          const ap = a.listing.pending_since ?? "";
          const bp = b.listing.pending_since ?? "";
          return dir * ap.localeCompare(bp);
        }
      }
    });

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
    const today = nowMs - 86_400_000;
    const pending = [...this.listings.values()].filter(
      (l) => l.approval_status === "pending_price" || l.approval_status === "pending_new",
    );
    const confirmed = this.priceUpdates.filter((u) => u.outcome === "auto_approved").length;
    const rejected = this.priceUpdates.filter((u) => u.status === "rejected").length;
    const oldest = pending
      .map((l) => l.pending_since)
      .filter((p): p is string => p !== null)
      .sort()[0];
    return {
      total_crawled: this.priceUpdates.length,
      crawled_today: this.priceUpdates.filter((u) => Date.parse(u.received_at) >= today).length,
      pending: pending.length,
      confirmed,
      rejected,
      oldest_pending_since: oldest ?? null,
    };
  }

  async listImages(sku: string): Promise<DashboardImage[]> {
    return this.images
      .filter((i) => i.product_sku === sku)
      .sort((a, b) => a.sort_order - b.sort_order || Number(b.is_primary) - Number(a.is_primary));
  }

  async countImages(sku: string): Promise<number> {
    return this.images.filter((i) => i.product_sku === sku).length;
  }

  async insertImage(
    row: Omit<DashboardImage, "id" | "created_at"> & { id?: string },
    now: string,
  ): Promise<DashboardImage> {
    const image: DashboardImage = {
      id: row.id ?? crypto.randomUUID(),
      product_sku: row.product_sku,
      url: row.url,
      storage_path: row.storage_path,
      sort_order: row.sort_order,
      is_primary: row.is_primary,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      created_at: now,
    };
    this.images.push(image);
    return image;
  }

  async findImage(sku: string, imageId: string): Promise<DashboardImage | null> {
    return this.images.find((i) => i.product_sku === sku && i.id === imageId) ?? null;
  }

  async deleteImage(imageId: string): Promise<void> {
    const idx = this.images.findIndex((i) => i.id === imageId);
    if (idx >= 0) this.images.splice(idx, 1);
  }

  async applyImageOrder(sku: string, ids: readonly string[]): Promise<void> {
    const owned = this.images.filter((i) => i.product_sku === sku);
    const ranked = [...ids, ...owned.filter((i) => !ids.includes(i.id)).map((i) => i.id)];
    ranked.forEach((id, index) => {
      const img = this.images.find((i) => i.id === id);
      if (!img) return;
      img.sort_order = index;
      img.is_primary = index === 0;
    });
  }

  async setPrimaryImage(sku: string, imageId: string): Promise<void> {
    const owned = this.images.filter((i) => i.product_sku === sku);
    const rest = owned.filter((i) => i.id !== imageId).map((i) => i.id);
    await this.applyImageOrder(sku, [imageId, ...rest]);
  }

  async findActiveJob(kind: DashboardJob["kind"], scopeKey: string): Promise<DashboardJob | null> {
    return (
      this.jobs.find(
        (j) => j.kind === kind && j.scope_key === scopeKey && (j.status === "queued" || j.status === "running"),
      ) ?? null
    );
  }

  async insertJob(input: {
    kind: DashboardJob["kind"];
    scope_key: string;
    total: number;
    payload: Record<string, unknown>;
    triggered_by: string | null;
  }): Promise<DashboardJob> {
    const existing = await this.findActiveJob(input.kind, input.scope_key);
    if (existing) {
      const err = new Error("job_already_running") as Error & { code: string };
      err.code = "23505";
      throw err;
    }
    const job: DashboardJob = {
      id: crypto.randomUUID(),
      kind: input.kind,
      scope_key: input.scope_key,
      payload: input.payload,
      total: input.total,
      done: 0,
      status: "queued",
      last_error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    };
    this.jobs.push(job);
    return job;
  }

  async insertJobItems(jobId: string, listingIds: readonly string[]): Promise<void> {
    for (const listing_id of listingIds) {
      this.jobItems.push({ job_id: jobId, listing_id, status: "queued", reason: null });
    }
  }

  async claimQueuedJob(kind: DashboardJob["kind"], now: string): Promise<DashboardJob | null> {
    const job = this.jobs.find((j) => j.kind === kind && j.status === "queued");
    if (!job) return null;
    job.status = "running";
    job.started_at = now;
    return job;
  }

  async listQueuedJobListingIds(jobId: string): Promise<string[]> {
    return this.jobItems.filter((i) => i.job_id === jobId && i.status === "queued").map((i) => i.listing_id);
  }

  async markJobItemDone(
    jobId: string,
    listingId: string,
    status: "succeeded" | "failed",
    reason: string | null,
  ): Promise<void> {
    const item = this.jobItems.find((i) => i.job_id === jobId && i.listing_id === listingId);
    if (item) {
      item.status = status;
      item.reason = reason;
    }
  }

  async finishJob(
    jobId: string,
    status: "succeeded" | "failed",
    now: string,
    lastError: string | null,
  ): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = status;
    job.finished_at = now;
    job.last_error = lastError;
    job.done = job.total;
  }

  async incrementJobDone(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) job.done += 1;
  }
}
