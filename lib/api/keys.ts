import type { ZodType } from "zod";
import { ApprovalsQuery } from "@/lib/schemas/params/approvals";
import { HistoryQuery, ProductHistoryQuery } from "@/lib/schemas/params/listings";
import { ProductsQuery } from "@/lib/schemas/params/products";
import { JobDetailQuery, JobsQuery } from "@/lib/schemas/params/jobs";
import { CrawlRunsQuery } from "@/lib/schemas/params/settings";

/**
 * The query-key factory.
 *
 * Two rules it exists to make structural rather than remembered.
 *
 * **Filters are normalised inside the factory**, so `{q, page}` and `{page, q}` are one cache entry —
 * and, more importantly, so are `{}` and `{page: 1, per_page: 20}`. TanStack's own hash already sorts
 * keys; it does not apply defaults or drop empty values, which is where the duplicate entries
 * actually come from.
 *
 * **`qk.approvals.stats()` takes no argument.** Gap 8 says the metric cards must not follow the table
 * filters, or 通過率 changes as the user types. Encoded as a key that cannot accept a filter, that
 * requirement is impossible to violate rather than easy to forget.
 *
 * Never call `invalidateQueries()` with no key — that is the fastest way to turn a dense polling app
 * into a refetch storm. Each namespace exposes a `root` for targeted invalidation.
 */

export type Filters = Record<string, unknown>;
export type QueryKey = readonly unknown[];

/** The defaults the *server* would apply, read off the same schema, so client and cache agree. */
const defaultsOf = (schema: ZodType): Filters => schema.parse({}) as Filters;

const isPlainObject = (v: unknown): v is Filters =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Drop empties, sort array members, sort keys. Array members are sorted because every repeatable
 * filter here is a set — `change_type=cost,quantity` and `quantity,cost` select the same rows.
 */
function normalise(value: Filters): Filters {
  const out: Filters = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out[key] = [...v].map(String).sort();
    } else if (isPlainObject(v)) {
      const nested = normalise(v);
      if (Object.keys(nested).length) out[key] = nested;
    } else {
      out[key] = v;
    }
  }
  return out;
}

const withDefaults = (schema: ZodType) => {
  const defaults = defaultsOf(schema);
  return (filters?: Filters): Filters => normalise({ ...defaults, ...filters });
};

const approvalsFilters = withDefaults(ApprovalsQuery);
const productsFilters = withDefaults(ProductsQuery);
const historyFilters = withDefaults(HistoryQuery);
const productHistoryFilters = withDefaults(ProductHistoryQuery);
const jobsFilters = withDefaults(JobsQuery);
const jobDetailFilters = withDefaults(JobDetailQuery);
const crawlFilters = withDefaults(CrawlRunsQuery);

export const qk = {
  me: () => ["me"] as const,

  approvals: {
    root: ["approvals"] as const,
    list: (filters?: Filters) => ["approvals", "list", approvalsFilters(filters)] as const,
    /** No filter argument, deliberately (Gap 8). */
    stats: () => ["approvals", "stats"] as const,
  },

  products: {
    root: ["products"] as const,
    list: (filters?: Filters) => ["products", "list", productsFilters(filters)] as const,
    detail: (sku: string) => ["products", "detail", sku] as const,
    history: (sku: string, filters?: Filters) =>
      ["products", "detail", sku, "history", productHistoryFilters(filters)] as const,
  },

  listings: {
    root: ["listings"] as const,
    detail: (id: string) => ["listings", "detail", id] as const,
    history: (id: string, filters?: Filters) =>
      ["listings", "detail", id, "history", historyFilters(filters)] as const,
  },

  groups: {
    root: ["groups"] as const,
    list: () => ["groups", "list"] as const,
    detail: (id: string) => ["groups", "detail", id] as const,
    /** The preview is a read keyed on its body, so changing the scope radio refetches nothing else. */
    preview: (id: string, body: Filters) => ["groups", "detail", id, "preview", normalise(body)] as const,
  },

  jobs: {
    root: ["jobs"] as const,
    list: (filters?: Filters) => ["jobs", "list", jobsFilters(filters)] as const,
    detail: (id: string, filters?: Filters) => ["jobs", "detail", id, jobDetailFilters(filters)] as const,
  },

  settings: {
    root: ["settings"] as const,
    get: () => ["settings", "current"] as const,
    allowedUsers: () => ["settings", "allowed-users"] as const,
  },

  crawl: {
    root: ["crawl"] as const,
    status: (filters?: Filters) => ["crawl", "status", crawlFilters(filters)] as const,
  },

  system: {
    health: () => ["system", "health"] as const,
  },
} as const;

/** Exported for tests and for anywhere a filter object needs the same collapsing outside a key. */
export const normaliseFilters = normalise;
