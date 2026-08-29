import { describe, expect, it } from "vitest";
import { ApprovalsQuery } from "@/lib/schemas/params/approvals";
import { ProductHistoryQuery } from "@/lib/schemas/params/listings";
import { ProductsQuery } from "@/lib/schemas/params/products";
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS, joinCsv } from "@/lib/schemas/params/common";

/**
 * lib/http/handler.ts parses the query as `Object.fromEntries(url.searchParams)` — a flat map of
 * strings, where a repeated key keeps only the last value. Every schema here has to survive that,
 * which is the whole reason coercion and comma-joining exist rather than plain `z.number()`.
 */
describe("query schemas parse what a URL actually delivers", () => {
  it("coerces numbers out of strings", () => {
    const parsed = ApprovalsQuery.parse({ page: "3", per_page: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.per_page).toBe(50);
  });

  it("applies the locked defaults when the URL is bare", () => {
    const parsed = ApprovalsQuery.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.per_page).toBe(DEFAULT_PER_PAGE);
    expect(parsed.sort).toBe("pending_since");
    expect(parsed.order).toBe("desc");
  });

  it("holds per_page to the three sizes the selector offers", () => {
    for (const size of PER_PAGE_OPTIONS) {
      expect(ApprovalsQuery.parse({ per_page: String(size) }).per_page).toBe(size);
    }
    expect(() => ApprovalsQuery.parse({ per_page: "30" })).toThrow();
    expect(() => ApprovalsQuery.parse({ page: "0" })).toThrow();
  });

  it("splits a comma-joined repeated filter and validates each member", () => {
    const parsed = ProductHistoryQuery.parse({ change_type: "cost, margin_percent ," });
    expect(parsed.change_type).toEqual(["cost", "margin_percent"]);
    expect(() => ProductHistoryQuery.parse({ change_type: "cost,nonsense" })).toThrow();
  });

  it("round-trips through joinCsv, which is the write side of the same rule", () => {
    const joined = joinCsv(["cost", "quantity"]);
    expect(joined).toBe("cost,quantity");
    expect(ProductHistoryQuery.parse({ change_type: joined }).change_type).toEqual([
      "cost",
      "quantity",
    ]);
    expect(joinCsv([])).toBeUndefined();
    expect(joinCsv(undefined)).toBeUndefined();
  });

  it("rejects a sort field that is not on the screen's whitelist", () => {
    expect(() => ProductsQuery.parse({ sort: "cost; drop table listings" })).toThrow();
    expect(ProductsQuery.parse({}).sort).toBe("last_imported_at");
  });

  it("defaults the product status filter to the 全部 tab", () => {
    expect(ProductsQuery.parse({}).status).toBe("all");
    expect(ProductsQuery.parse({ status: "listed" }).status).toBe("listed");
    expect(() => ProductsQuery.parse({ status: "pending_price" })).toThrow();
  });

  it("trims the search box so ' chicago' and 'chicago' are one query", () => {
    expect(ProductsQuery.parse({ q: "  chicago " }).q).toBe("chicago");
  });
});
