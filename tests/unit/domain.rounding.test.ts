import { describe, expect, it } from "vitest";
import { roundUpTo49Or99 } from "@/lib/domain/rounding";
import { DomainError } from "@/lib/domain/types";

/** Deterministic by construction. Math.random would make a failure unreproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("roundUpTo49Or99", () => {
  it.each([
    ["1901 -> 1949", 190100, 194900],
    ["1951 -> 1999", 195100, 199900],
    ["1949 stays 1949", 194900, 194900],
    ["1949.01 -> 1999", 194901, 199900],
    ["1950 -> 1999 (the 49/50 seam)", 195000, 199900],
    ["1900 -> 1949 (rem 0 raises)", 190000, 194900],
    ["1999 stays 1999", 199900, 199900],
    ["30 -> 49 (sub-HK$100 applies literally)", 3000, 4900],
    ["0.01 -> 49", 1, 4900],
    ["1344 -> 1349 (API-GAPS Gap 2)", 134400, 134900],
    ["1999.76 -> 1999.00 - the tail can drop cents", 199976, 199900],
  ])("%s", (_label, input, expected) => {
    expect(roundUpTo49Or99(input, true)).toBe(expected);
  });

  it("is a no-op when rounding is disabled", () => {
    expect(roundUpTo49Or99(134400, false)).toBe(134400);
  });

  it("guards zero and negative amounts", () => {
    expect(roundUpTo49Or99(0, true)).toBe(0);
    expect(roundUpTo49Or99(-500, true)).toBe(-500);
  });

  it("rejects fractional cents", () => {
    expect(() => roundUpTo49Or99(194900.5, true)).toThrow(DomainError);
    expect(() => roundUpTo49Or99(Number.NaN, false)).toThrow(DomainError);
  });

  // Ingest re-runs hourly and most runs change nothing. A rule that nudged an already-rounded price
  // would walk every price in the catalogue upward forever.
  it("is idempotent over 10k seeded values", () => {
    const random = mulberry32(0xc0ffee);
    for (let i = 0; i < 10_000; i += 1) {
      const cents = Math.floor(random() * 5_000_000);
      const once = roundUpTo49Or99(cents, true);
      expect(roundUpTo49Or99(once, true)).toBe(once);
      if (cents > 0) {
        expect(once % 10_000 === 4_900 || once % 10_000 === 9_900).toBe(true);
        // Not monotonic: within the last dollar of a block the tail rounds down to x99.00.
        expect(Math.abs(once - cents)).toBeLessThan(10_000);
      }
    }
  });
});
