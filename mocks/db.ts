import type { ProductTabCounts } from "@/lib/schemas/wire/products";
import { DAY, SEED_NOW_MS } from "./clock";
import { buildSeed } from "./seed";
import { listingsOf, productTabOf, resolved } from "./project";
import { compareSizes } from "./sizes";
import type {
  DbState,
  HistoryRowStore,
  ListingRow,
  ProductRow,
  UpdateRow,
} from "./types";

/**
 * The in-memory database, plus the three query helpers the screens' behaviour actually depends on.
 *
 * Handlers returning fixed arrays cannot exercise offset pagination past page 1, tab counts that
 * ignore `status`, a sort change resetting to page 1, or a group apply that moves real prices — all
 * four are specified behaviours, and all four are invisible to a mock that answers every request with
 * the same six rows.
 */
export const db: DbState = buildSeed();

/** Called between tests, and by the dev-only reset endpoint, so one write cannot poison the next. */
export function resetDb(): void {
  Object.assign(db, buildSeed());
}

// ---------------------------------------------------------------------------
// filter / sort / paginate
// ---------------------------------------------------------------------------

export type Predicate<T> = ((row: T) => boolean) | undefined | null | false;

/** Applies only the predicates that are actually set, so an absent filter is not an empty result. */
export function filterRows<T>(rows: readonly T[], predicates: readonly Predicate<T>[]): T[] {
  const active = predicates.filter((p): p is (row: T) => boolean => typeof p === "function");
  return rows.filter((row) => active.every((p) => p(row)));
}

export type SortOrder = "asc" | "desc";

/**
 * Sorts with a stable tie-break on the key that makes each row unique. Array.prototype.sort is stable
 * in every engine that matters, but the *input* order here is a filter result, and two pages of an
 * unstable ordering can show the same row twice and never show another.
 */
export function sortRows<T>(
  rows: readonly T[],
  compare: (a: T, b: T) => number,
  order: SortOrder,
  tieBreak: (row: T) => string,
): T[] {
  const sign = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = compare(a, b);
    return primary !== 0 ? primary * sign : tieBreak(a).localeCompare(tieBreak(b));
  });
}

export interface Pagination {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface Paged<T> extends Pagination {
  rows: T[];
}

/**
 * Offset pagination, locked (Gap 3). An out-of-range page returns no rows and still echoes the page
 * asked for, exactly as `limit/offset` does — the pager needs to be able to render 第 9 頁，共 3 頁
 * and then correct itself rather than silently being served page 1's rows.
 */
export function paginate<T>(rows: readonly T[], page: number, perPage: number): Paged<T> {
  const total = rows.length;
  const start = (page - 1) * perPage;
  return {
    rows: rows.slice(start, start + perPage),
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  };
}

/**
 * Null sorts last in both directions: an unpriced row is not "cheapest", and a row with no
 * `pending_since` is not the most urgent thing in the approval queue.
 *
 * `order` is required because `sortRows` multiplies the whole comparator by -1 when descending,
 * which would otherwise flip the null ranking too and put the empty rows first. Pre-multiplying
 * here makes the two sign flips cancel. Getting this wrong is not cosmetic: the queue's default
 * sort is `pending_since desc`, so it buried all 56 rows that need a human behind the ones that
 * explicitly do not.
 */
const nullsLast = (a: number | null, b: number | null, order: SortOrder): number => {
  const sign = order === "asc" ? 1 : -1;
  if (a === null && b === null) return 0;
  if (a === null) return sign;
  if (b === null) return -sign;
  return a - b;
};

const text = (value: string | null | undefined): string => (value ?? "").toLowerCase();

const matchesText = (needle: string | undefined, ...haystack: (string | null | undefined)[]): boolean => {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  return q === "" || haystack.some((h) => text(h).includes(q));
};

/**
 * Date presets resolve against SEED_NOW rather than the wall clock. The dataset is stamped relative
 * to that instant, so 今日 has to mean the same rows next year or every preset test rots.
 */
export function rangeFor(
  preset: string | undefined,
  from: string | undefined,
  to: string | undefined,
): { fromMs: number; toMs: number } {
  // Explicit dates win over a preset — the design's picker replaces the selector, not the reverse.
  if (from || to) {
    return {
      fromMs: from ? Date.parse(from) : Number.NEGATIVE_INFINITY,
      toMs: to ? Date.parse(to) : Number.POSITIVE_INFINITY,
    };
  }
  const days: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
  if (!preset || preset === "all" || !(preset in days)) {
    return { fromMs: Number.NEGATIVE_INFINITY, toMs: Number.POSITIVE_INFINITY };
  }
  return { fromMs: SEED_NOW_MS - days[preset] * DAY, toMs: Number.POSITIVE_INFINITY };
}

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

export interface ProductFilters {
  q?: string;
  status: "all" | "listed" | "unlisted" | "delisted";
  group_id?: string;
  exclude_group_id?: string[];
  sort: "last_imported_at" | "name" | "sku" | "size_count" | "price" | "updated_at";
  order: SortOrder;
}

const priceOf = (product: ProductRow): number | null => {
  const prices = listingsOf(db, product.sku)
    .map((l) => l.approved_price_cents)
    .filter((p): p is number => p !== null);
  return prices.length ? Math.max(...prices) : null;
};

export function selectProducts(filters: ProductFilters): {
  rows: ProductRow[];
  counts: ProductTabCounts;
} {
  // `q` and `group_id` narrow the counted set; `status` deliberately does not, or the tabs move as
  // the user switches between them (Screen 7).
  const base = filterRows(db.products, [
    (p) => matchesText(filters.q, p.name, p.name_zh, p.sku, p.brand),
    filters.group_id ? (p) => p.group_id === filters.group_id : undefined,
    filters.exclude_group_id?.length
      ? (p) => !filters.exclude_group_id?.includes(p.group_id)
      : undefined,
  ]);

  const counts: ProductTabCounts = { all: base.length, listed: 0, unlisted: 0, delisted: 0 };
  for (const product of base) counts[productTabOf(db, product)] += 1;

  const filtered =
    filters.status === "all" ? base : base.filter((p) => productTabOf(db, p) === filters.status);

  const compare = (a: ProductRow, b: ProductRow): number => {
    switch (filters.sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "sku":
        return a.sku.localeCompare(b.sku);
      case "size_count":
        return listingsOf(db, a.sku).length - listingsOf(db, b.sku).length;
      case "price":
        return nullsLast(priceOf(a), priceOf(b), filters.order);
      case "updated_at":
        return a.updated_at.localeCompare(b.updated_at);
      case "last_imported_at":
      default:
        return (a.last_imported_at ?? "").localeCompare(b.last_imported_at ?? "");
    }
  };

  return { rows: sortRows(filtered, compare, filters.order, (p) => p.sku), counts };
}

export interface ApprovalFilters {
  q?: string;
  source?: "stockx" | "google_sheet" | "dashboard";
  status?: string[];
  preset?: string;
  from?: string;
  to?: string;
  listing_id?: string;
  sku?: string;
  sort: "pending_since" | "created_at" | "delta_percent" | "new_price" | "cost" | "product_name" | "size";
  order: SortOrder;
}

export function selectApprovals(filters: ApprovalFilters): UpdateRow[] {
  const listingById = new Map(db.listings.map((l) => [l.id, l]));
  const productBySku = new Map(db.products.map((p) => [p.sku, p]));
  const { fromMs, toMs } = rangeFor(filters.preset, filters.from, filters.to);

  const rows = filterRows(db.updates, [
    (u) => listingById.has(u.listing_id),
    (u) => {
      const listing = listingById.get(u.listing_id);
      const product = listing && productBySku.get(listing.product_sku);
      return matchesText(filters.q, product?.name, product?.name_zh, product?.sku);
    },
    filters.source ? (u) => u.source === filters.source : undefined,
    filters.status?.length ? (u) => filters.status?.includes(u.status) ?? false : undefined,
    filters.listing_id ? (u) => u.listing_id === filters.listing_id : undefined,
    filters.sku
      ? (u) => listingById.get(u.listing_id)?.product_sku === filters.sku
      : undefined,
    (u) => {
      const at = Date.parse(u.created_at);
      return at >= fromMs && at <= toMs;
    },
  ]);

  const nameOf = (u: UpdateRow): string => {
    const listing = listingById.get(u.listing_id);
    return listing ? (productBySku.get(listing.product_sku)?.name ?? "") : "";
  };

  const compare = (a: UpdateRow, b: UpdateRow): number => {
    switch (filters.sort) {
      case "created_at":
        return a.created_at.localeCompare(b.created_at);
      case "delta_percent":
        return nullsLast(a.delta_percent_exact, b.delta_percent_exact, filters.order);
      case "new_price":
        return nullsLast(a.new_price_cents, b.new_price_cents, filters.order);
      case "cost":
        return a.cost_cents - b.cost_cents;
      case "product_name":
        return nameOf(a).localeCompare(nameOf(b));
      case "size":
        return compareSizes(
          listingById.get(a.listing_id)?.size ?? "",
          listingById.get(b.listing_id)?.size ?? "",
        );
      case "pending_since":
      default:
        return nullsLast(
          a.pending_since ? Date.parse(a.pending_since) : null,
          b.pending_since ? Date.parse(b.pending_since) : null,
          filters.order,
        );
    }
  };

  return sortRows(rows, compare, filters.order, (u) => u.id);
}

export interface HistoryFilters {
  change_type?: string[];
  from?: string;
  to?: string;
  size?: string;
  order: SortOrder;
  limit?: number;
}

export function selectHistory(
  rows: readonly HistoryRowStore[],
  filters: HistoryFilters,
): HistoryRowStore[] {
  const { fromMs, toMs } = rangeFor(undefined, filters.from, filters.to);
  const filtered = filterRows(rows, [
    filters.change_type?.length
      ? (r) => filters.change_type?.includes(r.change_type) ?? false
      : undefined,
    filters.size ? (r) => r.size === filters.size : undefined,
    (r) => {
      const at = Date.parse(r.changed_at);
      return at >= fromMs && at <= toMs;
    },
  ]);
  const sorted = sortRows(
    filtered,
    (a, b) => a.changed_at.localeCompare(b.changed_at),
    filters.order,
    (r) => r.id,
  );
  // Gap 20: `limit` takes the newest N and bypasses paging — the 近 6 次變更 chart, not a page.
  return filters.limit ? sorted.slice(0, filters.limit) : sorted;
}

export const listingById = (id: string): ListingRow | undefined =>
  db.listings.find((l) => l.id === id);

export const groupById = (id: string) => db.groups.find((g) => g.id === id);

export const jobById = (id: string) => db.jobs.find((j) => j.id === id);

export const itemsForJob = (jobId: string) => db.jobItems.filter((i) => i.job_id === jobId);

export const listingsInGroup = (groupId: string): ListingRow[] => {
  const skus = new Set(db.products.filter((p) => p.group_id === groupId).map((p) => p.sku));
  return db.listings.filter((l) => skus.has(l.product_sku));
};

/** Gap 8: lifetime totals with a 今日 delta, and no filter argument anywhere in the chain. */
export function approvalStats() {
  const today = SEED_NOW_MS - DAY;
  const pending = db.listings.filter(
    (l) => l.approval_status === "pending_price" || l.approval_status === "pending_new",
  );
  const confirmed = db.updates.filter(
    (u) => u.status === "within_band" || u.outcome === "auto_approved",
  ).length;
  const rejected = db.updates.filter((u) => u.status === "rejected").length;
  const decided = confirmed + rejected;
  const oldest = pending
    .map((l) => l.pending_since)
    .filter((p): p is string => p !== null)
    .sort()[0];

  return {
    total_crawled: db.updates.length,
    crawled_today: db.updates.filter((u) => Date.parse(u.created_at) >= today).length,
    pending: pending.length,
    confirmed,
    pass_rate: decided === 0 ? 0 : (confirmed / decided) * 100,
    rejected,
    rejection_rate: decided === 0 ? 0 : (rejected / decided) * 100,
    oldest_pending_since: oldest ?? null,
  };
}

/** The margin chain for one listing, re-exported so handlers do not reach into mocks/seed.ts. */
export const resolveListing = (listing: ListingRow) => resolved(db, listing);
