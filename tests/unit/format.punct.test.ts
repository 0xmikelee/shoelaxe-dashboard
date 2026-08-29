import { describe, expect, it } from "vitest";
import {
  ARROW,
  EM_DASH,
  EN_DASH,
  MIDDLE_DOT,
  UNKNOWN,
  arrow,
  joinDot,
  orDash,
  paren,
  quote,
  range,
} from "@/lib/format/punct";

describe("the separators are the ones the design uses", () => {
  it("uses U+00B7 for the interpunct, not the katakana middle dot", () => {
    expect(MIDDLE_DOT).toBe("·");
    expect(MIDDLE_DOT).not.toBe("・");
  });

  it("distinguishes the em dash, the en dash and the arrow", () => {
    expect(EM_DASH).toBe("—");
    expect(EN_DASH).toBe("–");
    expect(ARROW).toBe("→");
    expect(UNKNOWN).toBe(EM_DASH);
  });
});

describe("joinDot", () => {
  it("joins with a spaced interpunct", () => {
    expect(joinDot("12 個產品", "96 個尺寸")).toBe("12 個產品 · 96 個尺寸");
  });

  it("drops absent parts rather than leaving a dangling separator", () => {
    expect(joinDot("已上架", null)).toBe("已上架");
    expect(joinDot("已上架", undefined, "", false, "有待審價格")).toBe("已上架 · 有待審價格");
    expect(joinDot()).toBe("");
  });
});

describe("paren", () => {
  it("uses full-width parentheses around a Chinese run", () => {
    expect(paren("新產品")).toBe("（新產品）");
    expect(`StockX${paren("郵件")}`).toBe("StockX（郵件）");
  });

  it("uses half-width parentheses around pure Latin", () => {
    expect(paren("US 9")).toBe("(US 9)");
    expect(paren("EN")).toBe("(EN)");
  });
});

describe("quote", () => {
  it("wraps a proper noun in corner brackets", () => {
    expect(quote("Jordan 1 系列")).toBe("「Jordan 1 系列」");
  });
});

describe("range", () => {
  it("joins with an en dash and collapses equal ends", () => {
    expect(range("10%", "20%")).toBe("10%–20%");
    expect(range("18%", "18%")).toBe("18%");
  });
});

describe("arrow", () => {
  it("renders old → new", () => {
    expect(arrow("HK$1,420", "HK$1,530")).toBe("HK$1,420 → HK$1,530");
  });
});

describe("orDash", () => {
  it("is the one place a nullable becomes an em dash", () => {
    expect(orDash(null, String)).toBe(EM_DASH);
    expect(orDash(undefined, String)).toBe(EM_DASH);
  });

  it("does not swallow a zero or an empty string", () => {
    expect(orDash(0, (n) => `HK$${n}`)).toBe("HK$0");
    expect(orDash("", (s) => `[${s}]`)).toBe("[]");
  });
});
