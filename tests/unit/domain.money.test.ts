import { describe, expect, it } from "vitest";
import {
  fromCents,
  fromCentsOrNull,
  MAX_CENTS,
  percentOf,
  roundCents,
  sumCents,
  toCents,
  toCentsOrNull,
} from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/types";

describe("toCents", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["1530", 153000],
    ["1530.5", 153050],
    ["1530.00", 153000],
    ["9999999999.99", MAX_CENTS],
    ["-1.10", -110],
    ["-0.01", -1],
  ])("parses %s", (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  // A negative amount must not be assembled as `Number("-1") * 100 + 10`, which is -90, not -110.
  it("keeps the sign off the fractional half", () => {
    expect(toCents("-1.10")).toBe(-110);
    expect(fromCents(toCents("-1.10"))).toBe("-1.10");
  });

  it.each(["", " 1", "1 ", "1.234", "1.", ".5", "+1", "1e5", "NaN", "Infinity", "abc", "--1", "1,530.00"])(
    "rejects %j",
    (input) => {
      expect(() => toCents(input)).toThrow(DomainError);
    },
  );

  it("rejects an amount past numeric(12,2)", () => {
    expect(() => toCents("10000000000.00")).toThrow(/out of range/);
  });

  it("rejects an amount past IEEE 754 integer safety", () => {
    expect(() => toCents("99999999999999999999")).toThrow(/out of range/);
  });
});

describe("fromCents", () => {
  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [153000, "1530.00"],
    [153050, "1530.50"],
    [-110, "-1.10"],
    [MAX_CENTS, "9999999999.99"],
  ])("renders %d", (input, expected) => {
    expect(fromCents(input)).toBe(expected);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e13, -1e13])("rejects %s", (input) => {
    expect(() => fromCents(input)).toThrow(DomainError);
  });

  it("round-trips every wire string it produces", () => {
    for (const cents of [0, 1, 49, 4900, 134900, 999999, -110, MAX_CENTS]) {
      expect(toCents(fromCents(cents))).toBe(cents);
    }
  });
});

describe("nullable money", () => {
  it("passes NULL through both ways", () => {
    expect(toCentsOrNull(null)).toBeNull();
    expect(fromCentsOrNull(null)).toBeNull();
  });

  it("converts a present value", () => {
    expect(toCentsOrNull("12.34")).toBe(1234);
    expect(fromCentsOrNull(1234)).toBe("12.34");
  });
});

describe("cent arithmetic", () => {
  it("sums exactly and does not round", () => {
    expect(sumCents()).toBe(0);
    expect(sumCents(120000, 14400.5, -400)).toBe(134000.5);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("refuses to sum %s", (value) => {
    expect(() => sumCents(1, value)).toThrow(DomainError);
  });

  it("multiplies by a percentage rate", () => {
    expect(percentOf(120000, 12)).toBe(14400);
    expect(percentOf(120000, 0)).toBe(0);
    expect(percentOf(100000, 10.001)).toBeCloseTo(10001, 6);
  });

  it.each([
    [Number.NaN, 12],
    [120000, Number.POSITIVE_INFINITY],
  ])("refuses percentOf(%s, %s)", (cents, percent) => {
    expect(() => percentOf(cents, percent)).toThrow(DomainError);
  });

  it("collapses fractional cents once", () => {
    expect(roundCents(134814.72)).toBe(134815);
    expect(roundCents(1.5)).toBe(2);
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY])("refuses to round %s", (value) => {
    expect(() => roundCents(value)).toThrow(DomainError);
  });

  it.each([1e13, 1e20])("refuses to round %s into range", (value) => {
    expect(() => roundCents(value)).toThrow(/out of range/);
  });
});
