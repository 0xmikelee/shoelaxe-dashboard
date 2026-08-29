/**
 * Emit INSERT SQL for the live 001–006 schema from the same catalogue the MSW mock uses.
 * Run: pnpm exec tsx scripts/emit-supabase-seed-sql.ts > /tmp/shoelaxe-seed.sql
 */
import { fromCents } from "../lib/domain/money";
import { uuidFrom } from "../mocks/random";
import { buildSeed, resolveForListing } from "../mocks/seed";
import type { ApprovalRowStatusValue, EventSource } from "../mocks/types";

const sqlStr = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const sqlTs = (value: string): string => `${sqlStr(value)}::timestamptz`;
const sqlNum = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "null" : sqlStr(fromCents(cents));
const sqlInt = (value: number | null | undefined): string =>
  value === null || value === undefined ? "null" : String(value);
const sqlRate = (value: number | null | undefined): string =>
  value === null || value === undefined ? "null" : sqlStr(value.toFixed(4));

const productId = (sku: string): string => uuidFrom(`product:${sku}`);

const UPDATE_STATUS: Record<ApprovalRowStatusValue, "pending" | "applied" | "skipped" | "rejected"> = {
  above_threshold: "pending",
  below_threshold: "pending",
  within_band: "applied",
  pending_new: "pending",
  needs_margins: "pending",
  rejected: "rejected",
  superseded: "skipped",
};

const UPDATE_OUTCOME: Record<string, string> = {
  held_for_approval: "listing_price_change",
  auto_approved: "listing_price_change",
  superseded: "no_change",
  needs_margins: "error",
  new_listing: "new_listing",
  cost_change: "cost_change",
  margin_change: "margin_change",
  listing_price_change: "listing_price_change",
  quantity_change: "quantity_change",
  no_change: "no_change",
  error: "error",
};

const eventSource = (source: EventSource): "stockx" | "google_sheet" =>
  source === "stockx" ? "stockx" : "google_sheet";

function main(): void {
  const db = buildSeed();
  const ctx = { groups: db.groups, settings: db.settings };

  const lines: string[] = [
    "begin;",
    "truncate table public.price_updates, public.price_history, public.stock_levels, public.listings, public.products, media.product_images restart identity cascade;",
    "",
    "insert into public.products (id, product_sku, product_name, brand, stockx_internal_id, created_at, updated_at) values",
  ];

  lines.push(
    db.products
      .map((product) => {
        const id = productId(product.sku);
        return `(${sqlStr(id)}, ${sqlStr(product.sku)}, ${sqlStr(product.name)}, ${sqlStr(product.brand ?? "Unknown")}, ${product.stockx_name ? sqlStr(`stockx:${product.sku}`) : "null"}, ${sqlTs(product.created_at)}, ${sqlTs(product.updated_at)})`;
      })
      .join(",\n") + ";",
  );

  const listingRows: string[] = [];
  const stockKeys = new Set<string>();
  const stockRows: string[] = [];

  for (const listing of db.listings) {
    const product = db.products.find((row) => row.sku === listing.product_sku);
    if (!product) continue;
    const { margins, base, price } = resolveForListing(ctx, listing, product.group_id);
    const current =
      listing.approved_price_cents ?? listing.pending_price_cents ?? price?.priceCents ?? null;
    const source = base?.slot === "in_house" ? "google_sheet" : "stockx";
    listingRows.push(
      `(${sqlStr(listing.id)}, ${sqlStr(productId(listing.product_sku))}, ${sqlStr(listing.size)}, ${sqlNum(current)}, 'HKD', ${sqlStr(source)}, ${sqlStr(listing.sources[0]?.last_source_ref ?? `seed:${listing.product_sku}:${listing.size}`)}, ${sqlTs(listing.updated_at)}, ${sqlTs(listing.updated_at)}, ${sqlNum(base?.costCents ?? listing.sources[0]?.cost_cents ?? null)}, ${sqlRate(margins?.percent ?? null)}, ${sqlNum(margins?.fixedCents ?? null)})`,
    );

    const inHouse = listing.sources.find((row) => row.source === "in_house");
    const qty = inHouse?.quantity ?? 0;
    if (qty > 0) {
      const key = `${listing.product_sku}:${listing.size}`;
      if (!stockKeys.has(key)) {
        stockKeys.add(key);
        stockRows.push(
          `(${sqlStr(productId(listing.product_sku))}, ${sqlStr(listing.size)}, ${qty}, ${sqlTs(listing.updated_at)}, ${sqlTs(listing.updated_at)})`,
        );
      }
    }
  }

  lines.push(
    "",
    "insert into public.listings (id, product_id, size, current_price, currency, source, last_source_ref, created_at, updated_at, cost, margin_percent, margin_fixed) values",
    listingRows.join(",\n") + ";",
  );

  if (stockRows.length > 0) {
    lines.push(
      "",
      "insert into public.stock_levels (product_id, size, quantity, created_at, updated_at) values",
      stockRows.join(",\n") + ";",
    );
  }

  const historyRows: string[] = [];
  for (const row of db.history) {
    const product = db.products.find((p) => p.sku === row.product_sku);
    if (!product) continue;
    const qty = row.quantity !== null && row.quantity > 0 ? row.quantity : null;
    const prevQty = row.previous_quantity !== null && row.previous_quantity > 0 ? row.previous_quantity : null;
    const listing = db.listings.find((l) => l.id === row.listing_id);
    const resolved = listing
      ? resolveForListing(ctx, listing, product.group_id)
      : { margins: null, base: null };
    historyRows.push(
      `(${sqlStr(row.id)}, ${sqlStr(row.listing_id)}, ${sqlStr(product.name)}, ${sqlStr(row.product_sku)}, ${sqlStr(product.brand ?? "Unknown")}, ${sqlStr(row.size)}, ${sqlNum(row.price_cents)}, ${sqlNum(row.previous_price_cents)}, 'HKD', ${sqlStr(eventSource(row.source))}, ${sqlStr(`seed:${row.id}`)}, ${sqlTs(row.changed_at)}, ${sqlInt(qty)}, ${sqlInt(prevQty)}, ${sqlNum(resolved.base?.costCents ?? null)}, null, ${sqlRate(resolved.margins?.percent ?? null)}, ${sqlNum(resolved.margins?.fixedCents ?? null)})`,
    );
  }

  if (historyRows.length > 0) {
    lines.push(
      "",
      "insert into public.price_history (id, listing_id, product_name, product_sku, brand, size, price, previous_price, currency, source, source_ref, recorded_at, quantity, previous_quantity, cost, previous_cost, margin_percent, margin_fixed) values",
      historyRows.join(",\n") + ";",
    );
  }

  const updateRows: string[] = [];
  for (const row of db.updates) {
    const listing = db.listings.find((l) => l.id === row.listing_id);
    const product = listing ? db.products.find((p) => p.sku === listing.product_sku) : undefined;
    if (!listing || !product) continue;
    const { margins } = resolveForListing(ctx, listing, product.group_id);
    const status = UPDATE_STATUS[row.status];
    const outcome = UPDATE_OUTCOME[row.outcome ?? "listing_price_change"] ?? "listing_price_change";
    const qty = listing.sources.find((s) => s.source === "in_house")?.quantity;
    updateRows.push(
      `(${sqlStr(row.id)}, ${sqlStr(listing.product_sku)}, ${sqlStr(product.name)}, ${sqlStr(product.brand ?? "Unknown")}, ${sqlStr(listing.size)}, 'HKD', ${sqlNum(row.cost_cents)}, ${qty && qty > 0 ? qty : "null"}, ${sqlStr(eventSource(row.source))}, ${sqlStr(row.id)}, null, ${sqlStr(listing.id)}, null, ${sqlStr(status)}, ${sqlStr(outcome)}, ${sqlNum(row.approved_price_cents)}, null, ${sqlTs(row.created_at)}, ${status === "applied" ? sqlTs(row.created_at) : "null"}, ${sqlRate(margins?.percent ?? null)}, ${sqlNum(margins?.fixedCents ?? null)}, ${sqlNum(row.new_price_cents)})`,
    );
  }

  if (updateRows.length > 0) {
    lines.push(
      "",
      "insert into public.price_updates (id, product_sku, product_name, brand, size, currency, cost, quantity, source, source_ref, stockx_internal_id, listing_id, history_id, status, outcome, previous_price, previous_quantity, received_at, applied_at, margin_percent, margin_fixed, listing_price) values",
      updateRows.join(",\n") + ";",
    );
  }

  const imageRows = db.images.map((image) => {
    const url = `https://picsum.photos/seed/${encodeURIComponent(image.product_sku)}-${image.sort_order}/1200/1200`;
    return `(${sqlStr(image.id)}, ${sqlStr(image.product_sku)}, ${sqlStr(url)}, null, ${image.is_primary}, 'manual', ${sqlStr(image.product_sku)}, ${sqlTs(image.created_at)}, ${sqlTs(image.created_at)})`;
  });

  if (imageRows.length > 0) {
    lines.push(
      "",
      "insert into media.product_images (id, product_sku, image_url, storage_path, is_primary, source, alt_text, created_at, updated_at) values",
      imageRows.join(",\n") + ";",
    );
  }

  lines.push("commit;");
  process.stdout.write(`${lines.join("\n")}\n`);
}

main();
