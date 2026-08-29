import { describe, expect, it } from "vitest";
import {
  CURRENCY_PREFIX,
  formatCents,
  formatCentsDelta,
  formatCentsOrDash,
  formatMoney,
  formatMoneyDelta,
  formatMoneyOrDash,
  formatMoneyRange,
  ICU_HKD_SYMBOL,
} from "@/lib/format/money";
import { EM_DASH } from "@/lib/format/punct";
import { DomainError } from "@/lib/domain/types";

describe("formatCents", () => {
  it.each([
    [0, "HK$0"],
    [100, "HK$1"],
    [153000, "HK$1,530"],
    [204900, "HK$2,049"],
    [99999900, "HK$999,999"],
    [999999999999, "HK$9,999,999,999.99"],
  ])("renders %i cents as %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("shows two decimals only when the cents are non-zero", () => {
    expect(formatCents(153050)).toBe("HK$1,530.50");
    expect(formatCents(153005)).toBe("HK$1,530.05");
    expect(formatCents(153000)).toBe("HK$1,530");
  });

  it("puts the minus ahead of the prefix, never inside it", () => {
    expect(formatCents(-11000)).toBe("-HK$110");
    expect(formatCents(-11050)).toBe("-HK$110.50");
  });

  it("signs a delta but never signs zero", () => {
    expect(formatCents(11000, { signed: true })).toBe("+HK$110");
    expect(formatCents(-11000, { signed: true })).toBe("-HK$110");
    expect(formatCents(0, { signed: true })).toBe("HK$0");
  });

  it("rejects a non-integer cent amount rather than rendering a rounded one", () => {
    expect(() => formatCents(1530.5)).toThrow(DomainError);
    expect(() => formatCents(Number.NaN)).toThrow(DomainError);
  });
});

describe("the HK$ prefix", () => {
  it("is a literal, so the output cannot depend on the runtime's ICU data", () => {
    expect(CURRENCY_PREFIX).toBe("HK$");
    expect(formatCents(153000).startsWith("HK$")).toBe(true);
  });

  /**
   * Pins what ICU actually answers. `currencyDisplay:"narrowSymbol"` on the same locale gives a bare
   * `$`, which is exactly the ambiguity the literal prefix exists to avoid — if this ever fails, the
   * formatter is still right and only the comment in money.ts needs revisiting.
   */
  it("matches ICU today, and would still be HK$ if it stopped", () => {
    expect(["HK$", "$"]).toContain(ICU_HKD_SYMBOL);
    expect(
      new Intl.NumberFormat("zh-Hant-HK", {
        style: "currency",
        currency: "HKD",
        currencyDisplay: "narrowSymbol",
      }).format(1),
    ).toContain("$");
  });
});

describe("formatMoney", () => {
  it("converts the wire string through integer cents", () => {
    expect(formatMoney("1530.00")).toBe("HK$1,530");
    expect(formatMoney("1530.5")).toBe("HK$1,530.50");
    expect(formatMoney("0")).toBe("HK$0");
  });

  it("throws on a value that is not a money string", () => {
    expect(() => formatMoney("1,530")).toThrow(DomainError);
  });

  it("signs deltas", () => {
    expect(formatMoneyDelta("110.00")).toBe("+HK$110");
    expect(formatCentsDelta(11000)).toBe("+HK$110");
  });
});

describe("HK$0 and the em dash are different facts", () => {
  it("renders a zero price as a price", () => {
    expect(formatMoneyOrDash("0.00")).toBe("HK$0");
    expect(formatCentsOrDash(0)).toBe("HK$0");
  });

  it("reserves the em dash for unknown", () => {
    expect(formatMoneyOrDash(null)).toBe(EM_DASH);
    expect(formatMoneyOrDash(undefined)).toBe(EM_DASH);
    expect(formatCentsOrDash(null)).toBe(EM_DASH);
    expect(formatCentsOrDash(undefined)).toBe(EM_DASH);
  });
});

describe("formatMoneyRange", () => {
  it("prints the prefix once", () => {
    expect(formatMoneyRange("1420.00", "1640.00")).toBe("HK$1,420–1,640");
  });

  it("collapses when both ends match", () => {
    expect(formatMoneyRange("1420.00", "1420.00")).toBe("HK$1,420");
  });

  it("keeps the whole figure when the high end is negative", () => {
    expect(formatMoneyRange("-200.00", "-100.00")).toBe("-HK$200–-HK$100");
  });
});
