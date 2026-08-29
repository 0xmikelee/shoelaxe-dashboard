import { describe, expect, it } from "vitest";
import { normaliseFilters, qk } from "@/lib/api/keys";
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "@/lib/schemas/params/common";

describe("filter normalisation", () => {
  it("collapses key order", () => {
    expect(qk.approvals.list({ q: "chicago", page: 2 })).toEqual(
      qk.approvals.list({ page: 2, q: "chicago" }),
    );
  });

  it("collapses an absent filter and the defaults it stands for", () => {
    // `{}` and `{page: 1, per_page: 20}` are the same request; two cache entries for them is two
    // fetches and a flash of stale rows on every mount.
    expect(qk.approvals.list()).toEqual(
      qk.approvals.list({ page: DEFAULT_PAGE, per_page: DEFAULT_PER_PAGE }),
    );
  });

  it("applies the same defaults the server would", () => {
    const [, , filters] = qk.approvals.list();
    expect(filters).toMatchObject({
      page: DEFAULT_PAGE,
      per_page: DEFAULT_PER_PAGE,
      sort: "pending_since",
      order: "desc",
    });
  });

  it("drops a cleared search box rather than keying on it", () => {
    expect(qk.products.list({ q: "" })).toEqual(qk.products.list());
    expect(qk.products.list({ group_id: undefined })).toEqual(qk.products.list());
    expect(qk.products.list({ exclude_group_id: [] })).toEqual(qk.products.list());
  });

  it("treats a repeated filter as a set", () => {
    expect(qk.products.history("555088-101", { change_type: ["cost", "margin_percent"] })).toEqual(
      qk.products.history("555088-101", { change_type: ["margin_percent", "cost"] }),
    );
  });

  it("keeps genuinely different filters apart", () => {
    expect(qk.approvals.list({ page: 2 })).not.toEqual(qk.approvals.list({ page: 3 }));
    expect(qk.products.detail("A")).not.toEqual(qk.products.detail("B"));
  });

  it("normalises nested objects and drops the ones left empty", () => {
    expect(normaliseFilters({ a: { z: 1, b: undefined }, c: {} })).toEqual({ a: { z: 1 } });
  });
});

describe("the metric cards cannot follow the table filters", () => {
  it("takes no filter argument at all (Gap 8)", () => {
    // Structural, not a rule someone remembers: there is no parameter to pass.
    expect(qk.approvals.stats).toHaveLength(0);
    expect(qk.approvals.stats()).toEqual(["approvals", "stats"]);
  });

  it("shares a root with the list, so an approval can invalidate both deliberately", () => {
    expect(qk.approvals.stats()[0]).toBe(qk.approvals.root[0]);
    expect(qk.approvals.list()[0]).toBe(qk.approvals.root[0]);
  });
});

describe("key shapes", () => {
  it("nests a resource's sub-queries under its detail key", () => {
    // So invalidating one product's detail also reaches its history, without a global invalidate.
    expect(qk.products.history("555088-101").slice(0, 3)).toEqual([
      "products",
      "detail",
      "555088-101",
    ]);
    expect(qk.listings.history("id-1").slice(0, 3)).toEqual(["listings", "detail", "id-1"]);
    expect(qk.groups.preview("g1", { scope: "all" }).slice(0, 3)).toEqual([
      "groups",
      "detail",
      "g1",
    ]);
  });

  it("gives every namespace a root to invalidate against", () => {
    expect([
      qk.approvals.root,
      qk.products.root,
      qk.listings.root,
      qk.groups.root,
      qk.jobs.root,
      qk.settings.root,
      qk.crawl.root,
    ]).toEqual([
      ["approvals"],
      ["products"],
      ["listings"],
      ["groups"],
      ["jobs"],
      ["settings"],
      ["crawl"],
    ]);
  });

  it("defaults the job detail poll to failed items only", () => {
    expect(qk.jobs.detail("j1")).toEqual(["jobs", "detail", "j1", { items: "failed" }]);
  });
});
