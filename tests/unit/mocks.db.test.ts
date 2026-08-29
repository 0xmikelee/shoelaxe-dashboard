import { describe, expect, it } from "vitest";
import {
  approvalStats,
  db,
  filterRows,
  paginate,
  selectApprovals,
  selectHistory,
  selectProducts,
  sortRows,
} from "@/mocks/db";
import { SEED } from "@/mocks/seed";
import { compareSizes, sortSizes } from "@/mocks/sizes";

/**
 * The dataset and its query helpers, tested directly. Everything here is a behaviour a screen depends
 * on that a static fixture array cannot express.
 */

const productFilters = { status: "all" as const, sort: "last_imported_at" as const, order: "desc" as const };

describe("paginate", () => {
  const rows = Array.from({ length: 41 }, (_, i) => i);

  it("counts pages by ceiling, and an empty set is zero pages", () => {
    expect(paginate(rows, 1, 20).total_pages).toBe(3);
    expect(paginate(rows.slice(0, 40), 1, 20).total_pages).toBe(2);
    expect(paginate(rows.slice(0, 20), 1, 20).total_pages).toBe(1);
    expect(paginate([], 1, 20)).toMatchObject({ total: 0, total_pages: 0, rows: [] });
  });

  it("slices by offset and echoes the page that was asked for", () => {
    expect(paginate(rows, 2, 20).rows[0]).toBe(20);
    expect(paginate(rows, 3, 20).rows).toEqual([40]);
    // Out of range: no rows, and the page is not silently corrected to 1 — the pager has to see it.
    expect(paginate(rows, 9, 20)).toMatchObject({ rows: [], page: 9, total: 41, total_pages: 3 });
  });

  it("never shows a row on two pages", () => {
    const first = paginate(rows, 1, 20).rows;
    const second = paginate(rows, 2, 20).rows;
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });
});

describe("filterRows and sortRows", () => {
  it("ignores predicates that are not set, so an absent filter is not an empty result", () => {
    const rows = [1, 2, 3];
    expect(filterRows(rows, [undefined, false, null])).toEqual(rows);
    expect(filterRows(rows, [(n) => n > 1, undefined])).toEqual([2, 3]);
  });

  it("sorts in both directions and breaks ties deterministically", () => {
    const rows = [
      { k: 1, id: "b" },
      { k: 1, id: "a" },
      { k: 0, id: "c" },
    ];
    const asc = sortRows(rows, (a, b) => a.k - b.k, "asc", (r) => r.id);
    expect(asc.map((r) => r.id)).toEqual(["c", "a", "b"]);
    const desc = sortRows(rows, (a, b) => a.k - b.k, "desc", (r) => r.id);
    expect(desc.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("the seeded dataset", () => {
  it("is big enough to page and varied enough to render every state", () => {
    expect(db.products).toHaveLength(40);
    expect(db.groups).toHaveLength(4);
    expect(db.listings.length).toBeGreaterThan(250);
    const statuses = new Set(db.listings.map((l) => l.approval_status));
    expect([...statuses].sort()).toEqual([
      "approved",
      "inactive",
      "needs_margins",
      "pending_new",
      "pending_price",
      "rejected",
    ]);
  });

  it("ships every product without listing images", () => {
    expect(db.images).toHaveLength(0);
  });

  it("includes the awkward products by name, not by luck", () => {
    const singleSource = db.listings.filter((l) => l.product_sku === SEED.singleSourceSku);
    expect(singleSource.every((l) => l.sources.length === 1)).toBe(true);
    expect(db.history.filter((h) => h.product_sku === SEED.historyEmptySku)).toHaveLength(0);
    expect(db.history.filter((h) => h.product_sku === SEED.historyFiveSku)).toHaveLength(5);
    expect(
      db.listings
        .filter((l) => l.product_sku === SEED.needsMarginsSku)
        .every((l) => l.approval_status === "needs_margins"),
    ).toBe(true);
  });

  it("is deterministic: ids are derived from natural keys, never rolled", () => {
    const before = db.listings.map((l) => l.id).join();
    const { rows } = selectProducts(productFilters);
    expect(rows).toHaveLength(40);
    expect(db.listings.map((l) => l.id).join()).toBe(before);
  });
});

describe("product tab counts", () => {
  it("ignore `status` so the tabs do not move when one is selected", () => {
    const all = selectProducts(productFilters);
    const listed = selectProducts({ ...productFilters, status: "listed" });
    expect(listed.counts).toEqual(all.counts);
    expect(listed.rows.length).toBe(all.counts.listed);
    expect(listed.rows.length).toBeLessThan(all.rows.length);
  });

  it("partition the catalogue: the three tabs sum to 全部", () => {
    const { counts } = selectProducts(productFilters);
    expect(counts.listed + counts.unlisted + counts.delisted).toBe(counts.all);
    expect(counts.delisted).toBeGreaterThan(0);
    expect(counts.unlisted).toBeGreaterThan(0);
  });

  it("do respect `q` and `group_id`", () => {
    const searched = selectProducts({ ...productFilters, q: "Dunk" });
    expect(searched.counts.all).toBeLessThan(40);
    expect(searched.counts.all).toBe(searched.rows.length);

    const grouped = selectProducts({ ...productFilters, group_id: SEED.groupIds.yeezy });
    expect(grouped.counts.all).toBe(grouped.rows.length);
    expect(grouped.rows.every((p) => p.group_id === SEED.groupIds.yeezy)).toBe(true);
  });

  it("reorders on a sort change without changing the set", () => {
    const byImport = selectProducts(productFilters).rows.map((p) => p.sku);
    const byName = selectProducts({ ...productFilters, sort: "name", order: "asc" }).rows.map((p) => p.sku);
    expect(byName).not.toEqual(byImport);
    expect([...byName].sort()).toEqual([...byImport].sort());
  });
});

describe("approval selectors", () => {
  const filters = { sort: "pending_since" as const, order: "desc" as const };

  it("filters by row status, which is the server's decision and not the rendered Δ", () => {
    const held = selectApprovals({ ...filters, status: ["above_threshold"] });
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((u) => u.status === "above_threshold")).toBe(true);
  });

  it("filters by product and by listing for the Screen 8 deep links", () => {
    const bySku = selectApprovals({ ...filters, sku: SEED.edgeSku });
    expect(bySku.length).toBeGreaterThan(3);
    const one = selectApprovals({ ...filters, listing_id: bySku[0].listing_id });
    expect(one.every((u) => u.listing_id === bySku[0].listing_id)).toBe(true);
  });

  it("resolves date presets against the seeded instant, not the wall clock", () => {
    const today = selectApprovals({ ...filters, preset: "today" });
    const everything = selectApprovals({ ...filters, preset: "all" });
    expect(today.length).toBeGreaterThan(0);
    expect(today.length).toBeLessThan(everything.length);
  });

  it("reports lifetime stats that no filter can move", () => {
    const stats = approvalStats();
    expect(stats.total_crawled).toBe(db.updates.length);
    expect(stats.pending).toBeGreaterThan(0);
    expect(stats.confirmed + stats.rejected).toBeGreaterThan(0);
    expect(stats.oldest_pending_since).not.toBeNull();
  });
});

describe("history selectors", () => {
  it("takes the newest N and bypasses paging when `limit` is set", () => {
    const rows = db.history.filter((h) => h.product_sku === SEED.historyFiveSku);
    const limited = selectHistory(rows, { order: "desc", limit: 3 });
    expect(limited).toHaveLength(3);
    expect(limited[0].changed_at >= limited[1].changed_at).toBe(true);
  });

  it("narrows by change type", () => {
    const rows = db.history;
    const prices = selectHistory(rows, { order: "desc", change_type: ["listing_price"] });
    expect(prices.every((r) => r.change_type === "listing_price")).toBe(true);
    expect(prices.length).toBeLessThan(rows.length);
  });
});

describe("size ordering", () => {
  it("sorts numerically, and a youth size after its adult twin", () => {
    expect(sortSizes(["US 10", "US 9", "US 7.5"])).toEqual(["US 7.5", "US 9", "US 10"]);
    expect(sortSizes(["US 7Y", "US 7"])).toEqual(["US 7", "US 7Y"]);
    expect(compareSizes("US 9", "EU 41")).toBeLessThan(0);
  });
});
