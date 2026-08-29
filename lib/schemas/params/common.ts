import { z } from "zod";

/**
 * The request side of the contract: path params, query params and request bodies. `lib/schemas/wire`
 * is the response side.
 *
 * Two constraints shape everything here.
 *
 * 1. `lib/http/handler.ts` parses the query as a **flat string map** — `Object.fromEntries(
 *    url.searchParams)` — so repeated keys collapse to the last one. A multi-value filter must
 *    therefore be a comma-joined string, which is what `csv()` below builds and what the API client
 *    configures `openapi-fetch` to serialise (`array: { style: "form", explode: false }`).
 * 2. scripts/build-openapi.ts converts these with `io: "input"` and `unrepresentable: "throw"`, so a
 *    transform is legal only when its *input* side is JSON-native. Field-level transforms are fine;
 *    wrapping a whole object in one is not — the generator reads `properties` off the object schema
 *    and would emit no parameters at all.
 */

/** Offset pagination, locked. Cursor paging cannot render 顯示 1–6 筆，共 128 筆 or a numbered pager. */
export const PER_PAGE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PER_PAGE = 20;
export const DEFAULT_PAGE = 1;

export const Page = z.coerce
  .number()
  .int()
  .min(1)
  .default(DEFAULT_PAGE)
  .describe("1-based page number.");

export const PerPage = z.coerce
  .number()
  .int()
  .pipe(z.literal(PER_PAGE_OPTIONS))
  .default(DEFAULT_PER_PAGE)
  .describe("Rows per page; one of 20, 50, 100. 20 matches the design's 每頁 20 筆 selector.");

export const PageQuery = z.object({ page: Page, per_page: PerPage });

export const SortOrder = z.enum(["asc", "desc"]);

/** A free-text search box. Trimmed here so " chicago" and "chicago" are one cache key and one query. */
export const Search = z
  .string()
  .trim()
  .max(120)
  .optional()
  .describe("Search text; matched against product name and SKU.");

/** Date filters accept a plain date from a picker or a full instant. Stored and compared in UTC. */
export const IsoDateOrDateTime = z.union([z.iso.date(), z.iso.datetime()]);

/** Screen 1's 最近 7 天 selector. `preset` and `from`/`to` are mutually exclusive; explicit wins. */
export const DateRangePreset = z.enum(["today", "7d", "30d", "90d", "all"]);

/**
 * A repeated filter, comma-joined. Empty segments are dropped so a trailing comma is not a
 * validation error the user cannot see the cause of.
 */
export const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(item));

/** The write side of `csv()`. Callers hold arrays; the wire carries one comma-joined string. */
export const joinCsv = (values: readonly string[] | undefined): string | undefined =>
  values && values.length ? values.join(",") : undefined;

/** History and product exports both offer 匯出; `csv` streams a file rather than an envelope. */
export const ExportFormat = z.enum(["json", "csv"]).default("json");
