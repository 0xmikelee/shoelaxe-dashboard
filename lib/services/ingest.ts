import { decide, type DecisionListing } from "@/lib/domain/approval";
import { pickBaseCost } from "@/lib/domain/baseCost";
import { resolveMargins } from "@/lib/domain/margins";
import { fromCents, toCents } from "@/lib/domain/money";
import { quantityForSlot, slotForEventSource } from "@/lib/domain/sources";
import { supersede } from "@/lib/domain/supersede";
import { parseInstant } from "@/lib/domain/time";
import type { EventSource, Outcome } from "@/lib/domain/types";
import { ApiError } from "@/lib/http/errors";
import type { IngestBodyInput, IngestItemInput, IngestRunInput } from "@/lib/schemas/params/ingest";
import type { IngestBatch, IngestItemResult } from "@/lib/schemas/wire/ingest";
import type { IngestRepo, PriceUpdateRow, PricingSettingsRow } from "@/lib/repo/ingest-types";

export const ACCEPTS_MAX_ITEMS = 25;
export const INGEST_ACTOR_LABEL = "爬取更新";

const HKD = "HKD";

export interface IngestDeps {
  repo: IngestRepo;
  publishTarget: "none" | "shopify";
  now: string;
}

const resultOf = (
  update: PriceUpdateRow,
  extra: { idempotent?: boolean } = {},
): IngestItemResult => ({
  source_ref: update.source_ref ?? "",
  ok: update.status === "applied" || update.status === "skipped",
  status: update.status,
  outcome: update.outcome,
  error: update.error_message,
  listing_id: update.listing_id,
  idempotent: extra.idempotent ?? false,
});

const reject = async (
  repo: IngestRepo,
  update: PriceUpdateRow,
  outcome: Extract<Outcome, "unknown_sku" | "invalid_currency" | "missing_cost" | "invalid_size">,
  message: string,
  listingId: string | null = update.listing_id,
): Promise<IngestItemResult> => {
  const row = await repo.finalizePriceUpdate(update.id, {
    status: "rejected",
    outcome,
    error_message: message,
    listing_id: listingId,
    history_id: null,
    applied_at: null,
    threshold_up_percent: null,
    threshold_down_percent: null,
  });
  return resultOf(row);
};

function moneyOrNull(cents: number | null | undefined): string | null {
  return cents == null ? null : fromCents(cents);
}

export async function ingestItem(
  repo: IngestRepo,
  run: IngestRunInput,
  item: IngestItemInput,
  settings: PricingSettingsRow,
  deps: Pick<IngestDeps, "publishTarget" | "now">,
): Promise<IngestItemResult> {
  const sku = item.product_sku.trim().toUpperCase();
  const size = item.size.trim();
  const currency = item.currency.trim().toUpperCase();
  const cost = item.cost ?? null;
  const source = item.source as EventSource;
  const slot = slotForEventSource(source);
  const observedAt = run.started_at;

  const inserted = await repo.insertPriceUpdate({
    product_sku: sku,
    product_name: item.product_name.trim(),
    brand: item.brand.trim(),
    size,
    currency,
    cost,
    quantity: item.quantity ?? null,
    source,
    source_ref: item.source_ref,
    stockx_internal_id: item.stockx_internal_id ?? null,
    observed_at: observedAt,
  });

  if (inserted.status !== "pending" || inserted.outcome !== null) {
    return resultOf(inserted, { idempotent: true });
  }

  if (currency !== HKD) {
    return reject(repo, inserted, "invalid_currency", "目前僅支援 HKD");
  }
  if (size.length === 0 || size.length > 16) {
    return reject(repo, inserted, "invalid_size", "尺寸格式無法辨識");
  }

  try {
    return await applyItem(repo, inserted, {
      sku,
      size,
      currency,
      cost,
      item,
      slot,
      source,
      observedAt,
      settings,
      now: deps.now,
      publishTarget: deps.publishTarget,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const row = await repo.finalizePriceUpdate(inserted.id, {
      status: "error",
      outcome: "error",
      error_message: message,
      listing_id: inserted.listing_id,
      history_id: null,
      applied_at: null,
      threshold_up_percent: null,
      threshold_down_percent: null,
    });
    return resultOf(row);
  }
}

async function applyItem(
  repo: IngestRepo,
  update: PriceUpdateRow,
  ctx: {
    sku: string;
    size: string;
    currency: string;
    cost: string | null;
    item: IngestItemInput;
    slot: ReturnType<typeof slotForEventSource>;
    source: EventSource;
    observedAt: string;
    settings: PricingSettingsRow;
    now: string;
    publishTarget: "none" | "shopify";
  },
): Promise<IngestItemResult> {
  const { sku, size, currency, cost, item, slot, source, observedAt, settings, now } = ctx;
  const allowCreate = item.allow_create !== false;

  let product = await repo.findProductBySku(sku);
  if (!product) {
    if (!allowCreate) {
      return reject(repo, update, "unknown_sku", "系統中沒有這個 SKU");
    }
    const group = await repo.getDefaultGroup();
    product = await repo.insertProduct({
      product_sku: sku,
      product_name: item.product_name.trim(),
      brand: item.brand.trim(),
      stockx_internal_id: item.stockx_internal_id ?? null,
      product_group_id: group.id,
    });
  } else {
    await repo.touchProduct(product.id, {
      product_name: item.product_name.trim(),
      brand: item.brand.trim(),
      stockx_internal_id: item.stockx_internal_id ?? null,
    });
  }

  let listing = await repo.findListing(product.id, size, currency);
  const created = listing === null;
  if (!listing) {
    if (!allowCreate) {
      return reject(repo, update, "unknown_sku", "此尺碼／貨幣組合不存在於產品資料庫");
    }
    if (cost === null) {
      return reject(repo, update, "missing_cost", "新增產品需要成本");
    }
    listing = await repo.insertListing({
      product_id: product.id,
      size,
      currency,
      source: source === "stockx" ? "stockx" : "google_sheet",
      last_source_ref: item.source_ref,
      cost,
    });
  } else {
    listing = await repo.lockListing(listing.id);
  }

  const group = await repo.getGroup(product.product_group_id);
  const incomingObserved = {
    id: update.id,
    observedAt: update.observed_at ?? update.received_at,
  };

  if (!created) {
    const unapproved = [
      incomingObserved,
      ...(await repo.listUnapprovedUpdates(listing.id)),
    ];
    const verdict = supersede({
      incoming: incomingObserved,
      unapproved,
      baseCostAt: listing.base_cost_at,
    });
    if (!verdict.applies) {
      await repo.markSuperseded([update.id]);
      const row = await repo.finalizePriceUpdate(update.id, {
        status: "skipped",
        outcome: "superseded",
        error_message: null,
        listing_id: listing.id,
        history_id: null,
        applied_at: now,
        threshold_up_percent: settings.auto_approve_up_percent,
        threshold_down_percent: settings.auto_approve_down_percent,
      });
      return resultOf(row);
    }
    await repo.markSuperseded(verdict.superseded);
  }

  const sourcesBefore = await repo.listListingSources(listing.id);
  const previousSource = sourcesBefore.find((s) => s.source === slot);
  const previousQty = previousSource?.quantity ?? (created ? 0 : 0);
  const previousCost = previousSource?.cost ?? null;

  const reportedQty = quantityForSlot(slot, item.quantity ?? (created ? 1 : null));
  const nextQty = reportedQty ?? previousSource?.quantity ?? (created ? 1 : 0);
  const writeCost = cost !== null;
  const nextCost = writeCost ? cost : (previousSource?.cost ?? null);
  const costAt = writeCost ? observedAt : (previousSource?.cost_at ?? null);

  await repo.upsertListingSource({
    listing_id: listing.id,
    source: slot,
    cost: nextCost,
    costAt,
    quantity: nextQty,
    last_source_ref: item.source_ref,
    last_synced_at: now,
    writeCost,
  });

  const sourcesAfter = await repo.listListingSources(listing.id);
  const base = pickBaseCost(
    sourcesAfter.map((s) => ({
      slot: s.source,
      costCents: s.cost == null ? null : toCents(s.cost),
      costAt: s.cost_at,
    })),
    writeCost ? slot : null,
  );
  if (base === null) {
    return reject(repo, update, "missing_cost", "這筆資料沒有成本，無法計算售價", listing.id);
  }

  const override =
    listing.margin_percent != null || listing.margin_fixed != null
      ? {
          percent: listing.margin_percent != null ? Number(listing.margin_percent) : null,
          fixedCents: listing.margin_fixed != null ? toCents(listing.margin_fixed) : null,
        }
      : null;
  const groupRule =
    group.margin_percent != null || group.margin_fixed != null
      ? {
          percent: group.margin_percent != null ? Number(group.margin_percent) : null,
          fixedCents: group.margin_fixed != null ? toCents(group.margin_fixed) : null,
        }
      : null;
  const margins = resolveMargins(override, groupRule, {
    enabled: settings.default_margin_enabled,
    percent: Number(settings.default_margin_percent),
    fixedCents: toCents(settings.default_margin_fixed),
  });

  const quantityChanged = nextQty !== previousQty;
  const costChanged = writeCost && cost !== previousCost;

  const decisionListing: DecisionListing | null = created
    ? null
    : {
        status: listing.approval_status,
        approvedPriceCents: listing.approved_price == null ? null : toCents(listing.approved_price),
        pendingPriceCents: listing.pending_price == null ? null : toCents(listing.pending_price),
      };

  const decision = decide({
    listing: decisionListing,
    margins,
    baseCostCents: base.costCents,
    quantityChanged,
    roundingEnabled: settings.rounding_enabled,
    band: {
      upPercent: Number(settings.auto_approve_up_percent),
      downPercent: Number(settings.auto_approve_down_percent),
    },
    trigger: "ingest",
  });

  const pendingSince =
    decision.pendingPriceCents == null
      ? null
      : created
        ? observedAt
        : (listing.pending_since ?? observedAt);

  await repo.updateListing(listing.id, {
    last_source_ref: item.source_ref,
    cost: fromCents(base.costCents),
    current_price: moneyOrNull(decision.approvedPriceCents),
    approval_status: decision.status,
    approved_price: moneyOrNull(decision.approvedPriceCents),
    approved_at:
      decision.approvedPriceCents != null && decision.status === "approved"
        ? (decisionListing === null ||
          decision.approvedPriceCents !== decisionListing.approvedPriceCents
            ? now
            : listing.approved_at)
        : listing.approved_at,
    base_cost: fromCents(base.costCents),
    base_cost_source: base.slot,
    base_cost_at: base.costAt,
    pending_price: moneyOrNull(decision.pendingPriceCents),
    pending_since: pendingSince,
    pending_update_id: decision.pendingPriceCents == null ? null : update.id,
    margin_source: decision.marginSource,
  });

  let historyId: string | null = null;
  const historyBase = {
    listing_id: listing.id,
    product_name: item.product_name.trim(),
    product_sku: sku,
    brand: item.brand.trim(),
    size,
    price: moneyOrNull(decision.priceCents),
    previous_price: listing.approved_price ?? listing.current_price,
    currency,
    source,
    source_ref: item.source_ref,
    quantity: nextQty,
    previous_quantity: created ? null : previousQty,
    cost: fromCents(base.costCents),
    previous_cost: listing.cost,
    actor_label: INGEST_ACTOR_LABEL,
  } as const;

  if (costChanged) {
    const { id } = await repo.insertPriceHistory({ ...historyBase, change_type: "cost" });
    historyId = id;
  }
  if (quantityChanged) {
    const { id } = await repo.insertPriceHistory({ ...historyBase, change_type: "quantity" });
    historyId = id;
  }
  if (decision.writesPriceHistory) {
    const { id } = await repo.insertPriceHistory({ ...historyBase, change_type: "listing_price" });
    historyId = id;
  }

  const status =
    decision.outcome === "no_change" && !quantityChanged ? "skipped" : "applied";

  const finalized = await repo.finalizePriceUpdate(update.id, {
    status,
    outcome: decision.outcome,
    error_message: null,
    listing_id: listing.id,
    history_id: historyId,
    applied_at: now,
    threshold_up_percent: settings.auto_approve_up_percent,
    threshold_down_percent: settings.auto_approve_down_percent,
  });

  await repo.insertAuditLog({
    actor_label: INGEST_ACTOR_LABEL,
    action: "ingest",
    target_table: "listings",
    target_id: listing.id,
    before: { approval_status: listing.approval_status, base_cost: listing.base_cost },
    after: { approval_status: decision.status, outcome: decision.outcome },
  });

  if (decision.enqueuePublish) {
    await repo.enqueueShopifySync(
      listing.id,
      ctx.publishTarget === "shopify" ? "queued" : "deferred",
    );
  }

  return resultOf(finalized);
}

export async function ingestBatch(body: IngestBodyInput, deps: IngestDeps): Promise<IngestBatch> {
  if (body.updates.length > ACCEPTS_MAX_ITEMS) {
    throw new ApiError("batch_too_large", `batch exceeds accepts_max_items (${ACCEPTS_MAX_ITEMS})`);
  }
  for (const item of body.updates) {
    if (item.source !== body.run.source) {
      throw new ApiError("run_mismatch", "item source does not match run.source");
    }
  }

  const existing = await deps.repo.findCrawlRun(body.run.run_id);
  if (existing) {
    const sameSource = existing.source === body.run.source;
    const sameTrigger = existing.trigger === body.run.trigger;
    const sameStart = parseInstant(existing.started_at, "crawl_runs.started_at") ===
      parseInstant(body.run.started_at, "run.started_at");
    if (!sameSource || !sameTrigger || !sameStart) {
      throw new ApiError("run_mismatch", "chunk run_id does not match open run");
    }
  } else {
    await deps.repo.insertCrawlRun({
      run_id: body.run.run_id,
      source: body.run.source,
      trigger: body.run.trigger,
      started_at: body.run.started_at,
    });
  }

  const settings = await deps.repo.getPricingSettings();
  const items: IngestItemResult[] = [];
  for (const item of body.updates) {
    const result = await ingestItem(deps.repo, body.run, item, settings, deps);
    items.push(result);
    await deps.repo.incrementCrawlRun(
      body.run.run_id,
      { items: 1, ok: result.ok ? 1 : 0, error: result.ok ? 0 : 1 },
      deps.now,
    );
  }

  return { run_id: body.run.run_id, items };
}
