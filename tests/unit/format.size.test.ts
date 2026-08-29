import { describe, expect, it } from "vitest";
import { bySize, compareSizes, formatSize, parseSizeLabel, sortSizes } from "@/lib/format/size";

describe("formatSize", () => {
  it("renders verbatim, normalised to one space", () => {
    expect(formatSize("US 9")).toBe("US 9");
    expect(formatSize("  US   9 ")).toBe("US 9");
    expect(formatSize("US 7.5")).toBe("US 7.5");
    expect(formatSize("US 7Y")).toBe("US 7Y");
    expect(formatSize("EU 41")).toBe("EU 41");
  });

  /** The number is never reformatted, which is the only way `US 9.0` can never appear. */
  it("does not grow a decimal", () => {
    expect(formatSize("US 9")).not.toBe("US 9.0");
    expect(formatSize("US 10")).toBe("US 10");
  });
});

describe("the collator", () => {
  /** The whole reason this exists: lexicographically `US 10` sorts before `US 7`. */
  it("orders numerically, not lexicographically", () => {
    expect(sortSizes(["US 10", "US 7", "US 9", "US 11", "US 8"])).toEqual([
      "US 7",
      "US 8",
      "US 9",
      "US 10",
      "US 11",
    ]);
  });

  it("places half sizes between their neighbours", () => {
    expect(sortSizes(["US 10", "US 9.5", "US 9", "US 7.5"])).toEqual([
      "US 7.5",
      "US 9",
      "US 9.5",
      "US 10",
    ]);
  });

  it("puts the adult size before the youth one", () => {
    expect(sortSizes(["US 7Y", "US 7"])).toEqual(["US 7", "US 7Y"]);
    expect(compareSizes("US 7", "US 7Y")).toBeLessThan(0);
    expect(compareSizes("US 7Y", "US 7")).toBeGreaterThan(0);
  });

  it("orders two suffixed sizes against each other", () => {
    expect(sortSizes(["US 7Y", "US 7C"])).toEqual(["US 7C", "US 7Y"]);
  });

  it("ranks systems US · UK · EU · CM before comparing values", () => {
    expect(sortSizes(["CM 27", "EU 41", "UK 8", "US 9"])).toEqual([
      "US 9",
      "UK 8",
      "EU 41",
      "CM 27",
    ]);
  });

  it("is case- and space-insensitive about the input it orders", () => {
    expect(sortSizes(["us10", "US 7"])).toEqual(["US 7", "us10"]);
  });

  it("sorts an unrecognised system after every known one, and free text last", () => {
    expect(sortSizes(["均碼", "JP 27", "US 9"])).toEqual(["US 9", "JP 27", "均碼"]);
  });

  it("is a total order, so equal keys do not reorder between renders", () => {
    expect(compareSizes("US 9", "US 9")).toBe(0);
    expect(compareSizes("均碼", "均碼")).toBe(0);
  });

  it("sorts rows through an accessor", () => {
    const rows = [{ size: "US 10" }, { size: "US 7" }];
    expect([...rows].sort(bySize((r) => r.size))).toEqual([{ size: "US 7" }, { size: "US 10" }]);
  });

  it("does not mutate its input", () => {
    const input = ["US 10", "US 7"];
    sortSizes(input);
    expect(input).toEqual(["US 10", "US 7"]);
  });
});

describe("parseSizeLabel", () => {
  it("splits a label into system, value and suffix", () => {
    expect(parseSizeLabel("US 7.5")).toEqual({
      system: "US",
      value: 7.5,
      suffix: "",
      label: "US 7.5",
    });
    expect(parseSizeLabel("us 7y")).toEqual({
      system: "US",
      value: 7,
      suffix: "Y",
      label: "us 7y",
    });
  });

  it("returns a null system for free text and keeps the label renderable", () => {
    const parsed = parseSizeLabel("均碼");
    expect(parsed.system).toBeNull();
    expect(Number.isNaN(parsed.value)).toBe(true);
    expect(parsed.label).toBe("均碼");
  });

  it("returns a null system for an unrecognised one, but keeps its value", () => {
    expect(parseSizeLabel("JP 27")).toEqual({
      system: null,
      value: 27,
      suffix: "",
      label: "JP 27",
    });
  });
});
