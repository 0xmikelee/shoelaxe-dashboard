import { describe, expect, it } from "vitest";
import { PUBLISHING_STRINGS, zhHant } from "@/lib/i18n/zh-Hant";
import { RELATIVE_TIME } from "@/lib/format/date";

type Leaf = string | ((...args: never[]) => string);

/** Walks the dictionary depth-first, yielding `["approvals.metrics.pending", "待審核"]` pairs. */
function leaves(node: unknown, path: string[] = []): Array<[string, Leaf]> {
  if (typeof node === "string" || typeof node === "function") {
    return [[path.join("."), node as Leaf]];
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]));
  }
  return [];
}

const ALL = leaves(zhHant);

describe("the dictionary", () => {
  it("is not empty and has no empty strings", () => {
    expect(ALL.length).toBeGreaterThan(200);
    for (const [path, value] of ALL) {
      if (typeof value === "string") expect(value.length, path).toBeGreaterThan(0);
    }
  });

  it("contains only strings and string builders", () => {
    for (const [path, value] of ALL) {
      expect(["string", "function"], path).toContain(typeof value);
    }
  });

  it("re-exports the formatter's relative-time words so copy review is one file", () => {
    expect(zhHant.time).toBe(RELATIVE_TIME);
  });
});

describe("the publishing namespace", () => {
  /**
   * A Playwright flow loads every screen with `meta.publishing.enabled === false` and asserts none
   * of these strings appears. That iteration only works if every value is a plain string, so this
   * is the unit-level guard on the end-to-end test's precondition.
   */
  it("holds plain strings only, never builders", () => {
    for (const [key, value] of Object.entries(zhHant.publishing)) {
      expect(typeof value, key).toBe("string");
    }
  });

  it("exports the flattened list the Playwright flow asserts against", () => {
    expect(PUBLISHING_STRINGS.length).toBe(Object.keys(zhHant.publishing).length);
    expect(PUBLISHING_STRINGS).toContain(zhHant.publishing.channels);
    expect(new Set(PUBLISHING_STRINGS).size).toBe(PUBLISHING_STRINGS.length);
  });

  /**
   * The two phrases that promise external propagation. If either escapes the namespace it renders
   * while publishing is disabled and the flow that would have caught it is looking elsewhere.
   */
  it.each(["約需 5 分鐘", "上架平台", "立即同步"])(
    "keeps %s out of every other namespace",
    (phrase) => {
      const strays = ALL.filter(
        ([path, value]) =>
          !path.startsWith("publishing.") && typeof value === "string" && value.includes(phrase),
      ).map(([path]) => path);
      expect(strays).toEqual([]);
    },
  );

  it("is disjoint from the copy shown because publishing is off", () => {
    const disabled = Object.values(zhHant.publishingDisabled);
    for (const value of disabled) expect(PUBLISHING_STRINGS).not.toContain(value);
  });

  /** Nothing is broken — the feature is not enabled — so the notice must not read as a failure. */
  it("keeps the disabled notice neutral", () => {
    for (const value of Object.values(zhHant.publishingDisabled)) {
      expect(value).not.toMatch(/失敗|錯誤|無法連線/);
    }
  });
});

describe("the deltas from the design are applied", () => {
  it("describes an allow-list rather than a domain restriction on Screen 0", () => {
    expect(zhHant.auth.allowList).toContain("允許名單");
    expect(JSON.stringify(zhHant)).not.toContain("@shoelaxe.com");
  });

  it("does not promise an invitation email on Screen 10", () => {
    expect(JSON.stringify(zhHant.users)).not.toContain("邀請信");
  });

  /** Gap 23: StockX quantity is a constant 1 per size, so a combined 總庫存 overstates stock. */
  it("names the stock total in-house-only", () => {
    expect(zhHant.productDetail.info.totalQuantity).toBe("自有總庫存");
    expect(zhHant.productDetail.sizes.summary(7, 26)).toContain("自有總庫存 26 雙");
  });

  it("fixes the broken sentence in Screen 4 state E", () => {
    expect(zhHant.groupApply.partialBody(84)).toBe("84 個尺寸已成功更新。以下尺寸未套用變更。");
  });

  /** Gap 2: every formula preview in the design stops before the rounding step. */
  it("renders both steps of the price preview", () => {
    expect(zhHant.settings.defaultMargin.example("HK$1,200", "HK$1,344", "HK$1,349")).toBe(
      "範例 成本 HK$1,200 → HK$1,344 → 尾數進位 HK$1,349",
    );
  });
});

describe("parameterised copy", () => {
  it.each([
    [zhHant.common.showingRange(1, 6, 128), "顯示 1–6 筆，共 128 筆"],
    [zhHant.common.perPage(20), "每頁 20 筆"],
    [zhHant.common.selectedCount(3), "已選擇 3 個"],
    [zhHant.approvals.pendingChip(8), "8 待處理"],
    [zhHant.approvals.metrics.crawledToday(156), "+156 今日"],
    [zhHant.approvals.metrics.passRate("88.7%"), "88.7% 通過率"],
    [zhHant.groups.header.summary(12, 96), "12 個產品 · 96 個尺寸"],
    [zhHant.groupApply.progress(42, 96), "42 / 96"],
    [zhHant.groupApply.submit(96), "套用至 96 個項目"],
    [zhHant.groupDelete.title("Jordan 1 系列"), "刪除「Jordan 1 系列」？"],
    [zhHant.productDetail.saveBar.unsaved(2), "有 2 項變更尚未儲存"],
    [zhHant.productDetail.images.count(5, 8), "5 / 8 張"],
    [zhHant.productDetail.images.count(0, 8), "0 / 8 張"],
    [zhHant.productDetail.price.appliesToShort(1), "套用於 1 個來源"],
    [zhHant.productDetail.price.appliesToShort(2), "套用於 2 個來源"],
    [zhHant.productDetail.history.sizePreview(5, 18), "最新 5 筆 / 共 18 筆"],
  ])("renders %s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});
