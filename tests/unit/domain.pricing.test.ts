import { describe, expect, it } from "vitest";
import { computeSellingPrice, deltaPercent, withinBand } from "@/lib/domain/pricing";
import { DomainError } from "@/lib/domain/types";

const BAND = { upPercent: 10, downPercent: 10 };

describe("computeSellingPrice", () => {
  it("renders both steps of API-GAPS Gap 2's worked example", () => {
    expect(computeSellingPrice(120000, { percent: 12, fixedCents: 0 }, true)).toEqual({
      rawCents: 134400,
      priceCents: 134900,
      roundingApplied: true,
    });
  });

  it("adds the fixed margin after the percentage (Screen 3's preview)", () => {
    expect(computeSellingPrice(120000, { percent: 15, fixedCents: 15000 }, true)).toEqual({
      rawCents: 153000,
      priceCents: 154900,
      roundingApplied: true,
    });
  });

  it("reports no rounding step when rounding is disabled", () => {
    expect(computeSellingPrice(120000, { percent: 12, fixedCents: 0 }, false)).toEqual({
      rawCents: 134400,
      priceCents: 134400,
      roundingApplied: false,
    });
  });

  it("reports no rounding step when the raw price already ends in 99", () => {
    expect(computeSellingPrice(199900, { percent: 0, fixedCents: 0 }, true)).toEqual({
      rawCents: 199900,
      priceCents: 199900,
      roundingApplied: false,
    });
  });

  it("rounds a fractional rate once, at the end", () => {
    expect(computeSellingPrice(120000, { percent: 12.3456, fixedCents: 0 }, false).rawCents).toBe(134815);
  });

  it("accepts a negative fixed margin", () => {
    expect(computeSellingPrice(120000, { percent: 0, fixedCents: -20000 }, false).rawCents).toBe(100000);
  });

  it.each([1200.5, Number.NaN])("rejects a base cost of %s", (baseCost) => {
    expect(() => computeSellingPrice(baseCost, { percent: 12, fixedCents: 0 }, true)).toThrow(DomainError);
  });

  it("rejects a non-finite margin", () => {
    expect(() =>
      computeSellingPrice(120000, { percent: Number.POSITIVE_INFINITY, fixedCents: 0 }, true),
    ).toThrow(DomainError);
  });
});

describe("deltaPercent", () => {
  it("is signed against the approved price", () => {
    expect(deltaPercent(110000, 100000)).toBeCloseTo(10, 9);
    expect(deltaPercent(90000, 100000)).toBeCloseTo(-10, 9);
    expect(deltaPercent(100000, 100000)).toBe(0);
  });

  it("refuses a zero denominator", () => {
    expect(() => deltaPercent(134900, 0)).toThrow(DomainError);
  });
});

describe("withinBand", () => {
  it("is inclusive at exactly +10.000%", () => {
    expect(withinBand(110000, 100000, BAND)).toBe(true);
  });

  // The reason this is not written as `deltaPercent(...) <= up`: on this input the division reads
  // 13.750000000000002 and holds a price that is exactly on the boundary.
  it("is exact on a boundary the division gets wrong", () => {
    expect(deltaPercent(237146, 208480)).toBeGreaterThan(13.75);
    expect(withinBand(237146, 208480, { upPercent: 13.75, downPercent: 13.75 })).toBe(true);
    expect(withinBand(237147, 208480, { upPercent: 13.75, downPercent: 13.75 })).toBe(false);
  });

  it("holds at +10.001%", () => {
    expect(withinBand(110001, 100000, BAND)).toBe(false);
  });

  it("is inclusive at exactly -10.000%", () => {
    expect(withinBand(90000, 100000, BAND)).toBe(true);
  });

  it("holds at -10.001%", () => {
    expect(withinBand(89999, 100000, BAND)).toBe(false);
  });

  it("reads the two halves of an asymmetric band independently", () => {
    const asymmetric = { upPercent: 10, downPercent: 8 };
    expect(withinBand(91000, 100000, asymmetric)).toBe(false);
    expect(withinBand(92000, 100000, asymmetric)).toBe(true);
    expect(withinBand(110000, 100000, asymmetric)).toBe(true);
  });

  it("treats an unchanged price as inside any band", () => {
    expect(withinBand(100000, 100000, { upPercent: 0, downPercent: 0 })).toBe(true);
  });
});
