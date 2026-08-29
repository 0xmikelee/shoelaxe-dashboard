import { describe, expect, it } from "vitest";
import { pickBaseCost, type SourceCost } from "@/lib/domain/baseCost";
import { DomainError } from "@/lib/domain/types";

const stockx = (cost: number | null, at: string | null): SourceCost => ({
  slot: "stockx",
  costCents: cost,
  costAt: at,
});
const inHouse = (cost: number | null, at: string | null): SourceCost => ({
  slot: "in_house",
  costCents: cost,
  costAt: at,
});

describe("pickBaseCost", () => {
  it("takes the most recent cost, not the highest", () => {
    const picked = pickBaseCost(
      [stockx(150000, "2026-08-24T01:00:00Z"), inHouse(120000, "2026-08-24T02:00:00Z")],
      "in_house",
    );
    expect(picked).toEqual({ slot: "in_house", costCents: 120000, costAt: "2026-08-24T02:00:00Z" });
  });

  it("compares instants, not strings", () => {
    const picked = pickBaseCost(
      [stockx(150000, "2026-08-24T03:00:00+08:00"), inHouse(120000, "2026-08-23T20:00:00Z")],
      null,
    );
    // 03:00 +08:00 is 19:00Z the day before — lexicographically later, chronologically earlier.
    expect(picked?.slot).toBe("in_house");
  });

  it("ignores a source that has never reported a cost", () => {
    const picked = pickBaseCost(
      [stockx(null, "2026-08-24T09:00:00Z"), inHouse(120000, "2026-08-24T02:00:00Z")],
      "stockx",
    );
    expect(picked?.slot).toBe("in_house");
  });

  it("ignores a cost with no cost_at to order it by", () => {
    const picked = pickBaseCost([stockx(150000, null), inHouse(120000, "2026-08-24T02:00:00Z")], null);
    expect(picked?.slot).toBe("in_house");
  });

  // last_synced_at moves on a quantity-only ping; cost_at does not. Reading the wrong column here
  // lets a StockX quantity sync steal base-cost ownership from a newer in-house cost.
  it("does not move on a quantity-only sync", () => {
    const sources = [
      // StockX synced its constant quantity 1 an hour ago; its cost is from yesterday.
      stockx(150000, "2026-08-23T02:00:00Z"),
      inHouse(120000, "2026-08-24T02:00:00Z"),
    ];
    expect(pickBaseCost(sources, "stockx")?.slot).toBe("in_house");
  });

  it("breaks a tie in favour of the source just written", () => {
    const at = "2026-08-24T02:00:00Z";
    expect(pickBaseCost([stockx(150000, at), inHouse(120000, at)], "in_house")?.slot).toBe("in_house");
    expect(pickBaseCost([stockx(150000, at), inHouse(120000, at)], "stockx")?.slot).toBe("stockx");
  });

  it("keeps input order when a tie has no tie-break", () => {
    const at = "2026-08-24T02:00:00Z";
    expect(pickBaseCost([stockx(150000, at), inHouse(120000, at)], null)?.slot).toBe("stockx");
    expect(pickBaseCost([inHouse(120000, at), stockx(150000, at)], null)?.slot).toBe("in_house");
  });

  it("returns null for a listing with no costed source", () => {
    expect(pickBaseCost([], null)).toBeNull();
    expect(pickBaseCost([stockx(null, null)], null)).toBeNull();
  });

  it("refuses a timestamp it cannot order", () => {
    expect(() => pickBaseCost([stockx(150000, "yesterday")], null)).toThrow(DomainError);
  });
});
