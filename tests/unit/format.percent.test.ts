import { describe, expect, it } from "vitest";
import {
  formatDeltaPercent,
  formatDeltaPercentOrDash,
  formatRate,
  formatRateCompact,
  formatRateCompactOrDash,
  formatRateOrDash,
  formatRateRange,
  toRate,
} from "@/lib/format/percent";
import { EM_DASH } from "@/lib/format/punct";
import { DomainError } from "@/lib/domain/types";

describe("the four-decimal column never reaches a screen", () => {
  it.each(["15.0000", "18.0000", "12.5000", "22.0000"])("does not print %s verbatim", (rate) => {
    expect(formatRate(rate)).not.toContain("0000");
    expect(formatRateCompact(rate)).not.toContain("0000");
    expect(formatDeltaPercent(rate)).not.toContain("0000");
  });

  it("rounds a four-decimal rate to one decimal rather than truncating it", () => {
    expect(formatRate("18.7500")).toBe("18.8%");
    expect(formatRateCompact("18.7500")).toBe("18.8%");
  });
});

describe("formatRate — editable contexts", () => {
  it.each([
    ["15.0000", "15.0%"],
    ["18", "18.0%"],
    ["12.5", "12.5%"],
    ["0", "0.0%"],
    ["-2.5", "-2.5%"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatRate(input)).toBe(expected);
  });
});

describe("formatRateCompact — badges and dense cells", () => {
  it.each([
    ["18.0000", "18%"],
    ["12.5000", "12.5%"],
    ["0.0000", "0%"],
    ["-8.0000", "-8%"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatRateCompact(input)).toBe(expected);
  });
});

describe("formatDeltaPercent", () => {
  it("always shows one decimal and an explicit sign", () => {
    expect(formatDeltaPercent("8")).toBe("+8.0%");
    expect(formatDeltaPercent("-2.9")).toBe("-2.9%");
    expect(formatDeltaPercent(10.04)).toBe("+10.0%");
  });

  /**
   * The row that reads +10.0% and is still held: the band test ran on 10.04%. The formatter's job is
   * to render the display figure, not to agree with a threshold.
   */
  it("rounds to the display figure without re-deciding the band", () => {
    expect(formatDeltaPercent("10.0400")).toBe("+10.0%");
  });

  it("never emits a signed zero", () => {
    expect(formatDeltaPercent(0)).toBe("0.0%");
    expect(formatDeltaPercent(-0.04)).toBe("0.0%");
    expect(formatDeltaPercent(0.04)).toBe("0.0%");
  });

  it("keeps the sign on a value that survives rounding", () => {
    expect(formatDeltaPercent(-0.06)).toBe("-0.1%");
  });
});

describe("nullable variants", () => {
  it("renders the em dash and nothing else for unknown", () => {
    expect(formatRateOrDash(null)).toBe(EM_DASH);
    expect(formatRateCompactOrDash(undefined)).toBe(EM_DASH);
    expect(formatDeltaPercentOrDash(null)).toBe(EM_DASH);
  });

  it("still renders a zero rate as a rate", () => {
    expect(formatRateOrDash("0.0000")).toBe("0.0%");
    expect(formatRateCompactOrDash("0.0000")).toBe("0%");
    expect(formatDeltaPercentOrDash(0)).toBe("0.0%");
  });
});

describe("formatRateRange", () => {
  it("prints the sign once", () => {
    expect(formatRateRange("10.0000", "20.0000")).toBe("10–20%");
  });

  it("collapses when both ends match", () => {
    expect(formatRateRange("18.0000", "18.0000")).toBe("18%");
  });
});

describe("toRate", () => {
  it("accepts the wire string and a computed number", () => {
    expect(toRate("15.0000")).toBe(15);
    expect(toRate(15)).toBe(15);
  });

  it("rejects anything that is not a rate", () => {
    expect(() => toRate("15%")).toThrow(DomainError);
    expect(() => toRate("15.00000")).toThrow(DomainError);
    expect(() => toRate(Number.POSITIVE_INFINITY)).toThrow(DomainError);
  });
});
