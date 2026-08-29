import { describe, expect, it } from "vitest";
import {
  ALL_TAB_LABEL,
  APPROVAL_ROW_STATUS_DISPLAY,
  APPROVAL_STATUS_DISPLAY,
  LISTING_TAB_LABEL,
  PRODUCT_STATUS_TABS,
  approvalStatusLabel,
  productStatusLabel,
  productStatusTab,
} from "@/lib/i18n/status";
import { LISTING_TAB_BY_STATUS, type ApprovalStatus } from "@/lib/domain/types";
import {
  ApprovalRowStatus as ApprovalRowStatusSchema,
  ApprovalStatus as ApprovalStatusSchema,
  ProductStatusTab as ProductStatusTabSchema,
} from "@/lib/schemas/wire/common";

const STATUSES = ApprovalStatusSchema.options;

describe("the status table from docs/FRONTEND-PROMPT.md", () => {
  it.each([
    ["approved", "已上架", "已上架"],
    ["pending_new", "未上架", "待審核（新產品）"],
    ["pending_price", "已上架", "已上架 · 有待審價格"],
    ["needs_margins", "未上架", "未設定利潤"],
    ["rejected", "未上架", "已拒絕"],
    ["inactive", "已下架", "已下架"],
  ] as const)("maps %s to tab %s and row label %s", (status, tabLabel, rowLabel) => {
    const display = APPROVAL_STATUS_DISPLAY[status];
    expect(display.tabLabel).toBe(tabLabel);
    expect(display.rowLabel).toBe(rowLabel);
    expect(approvalStatusLabel(status)).toBe(rowLabel);
  });

  it("covers every status the wire can send", () => {
    expect(Object.keys(APPROVAL_STATUS_DISPLAY).sort()).toEqual([...STATUSES].sort());
  });
});

describe("pending_price is the one that gets got backwards", () => {
  /**
   * The listing IS live at its old approved price while a new one waits in the queue. Filing it
   * under 未上架 mislabels the most important rows in the product.
   */
  it("counts as listed, not as unlisted", () => {
    expect(APPROVAL_STATUS_DISPLAY.pending_price.tab).toBe("listed");
    expect(APPROVAL_STATUS_DISPLAY.pending_price.label).toBe("已上架");
  });

  it("carries a secondary indicator rather than a different primary word", () => {
    expect(APPROVAL_STATUS_DISPLAY.pending_price.secondary).toBe("有待審價格");
    expect(APPROVAL_STATUS_DISPLAY.approved.secondary).toBeNull();
  });

  it("derives its tab from Gap 4's single edit point in lib/domain", () => {
    for (const status of STATUSES) {
      expect(APPROVAL_STATUS_DISPLAY[status].tab, status).toBe(LISTING_TAB_BY_STATUS[status]);
    }
  });
});

describe("the product-level derivation (Gap 4)", () => {
  it("is 已下架 only when every size is inactive", () => {
    expect(productStatusLabel(["inactive", "inactive"])).toBe("已下架");
    expect(productStatusLabel(["inactive", "approved"])).toBe("已上架");
  });

  it("is 已上架 when any size is approved or pending_price", () => {
    expect(productStatusLabel(["pending_new", "pending_price"])).toBe("已上架");
    expect(productStatusLabel(["rejected", "approved"])).toBe("已上架");
  });

  it("is 未上架 otherwise", () => {
    expect(productStatusLabel(["pending_new", "needs_margins", "rejected"])).toBe("未上架");
    expect(productStatusLabel([])).toBe("未上架");
  });

  /** Screen 7's three counts must partition all six statuses, so they sum to 全部. */
  it("assigns every single status to exactly one tab", () => {
    const tabs = STATUSES.map((s) => productStatusTab([s as ApprovalStatus]));
    expect(new Set(tabs).size).toBeGreaterThan(0);
    for (const tab of tabs) expect(PRODUCT_STATUS_TABS).toContain(tab);
  });
});

describe("tab labels", () => {
  it("covers the wire's three tab values", () => {
    expect(Object.keys(LISTING_TAB_LABEL).sort()).toEqual([...ProductStatusTabSchema.options].sort());
  });

  it("orders Screen 7's tabs 未上架 · 已上架 · 已下架 after 全部", () => {
    expect(ALL_TAB_LABEL).toBe("全部");
    expect(PRODUCT_STATUS_TABS.map((t) => LISTING_TAB_LABEL[t])).toEqual([
      "未上架",
      "已上架",
      "已下架",
    ]);
  });
});

describe("Screen 1's row status vocabulary (Gap 9)", () => {
  it("covers every value, including the four the design cannot express", () => {
    expect(Object.keys(APPROVAL_ROW_STATUS_DISPLAY).sort()).toEqual(
      [...ApprovalRowStatusSchema.options].sort(),
    );
  });

  it("keeps the three drawn labels verbatim", () => {
    expect(APPROVAL_ROW_STATUS_DISPLAY.above_threshold.label).toBe("超出閾值");
    expect(APPROVAL_ROW_STATUS_DISPLAY.below_threshold.label).toBe("低於閾值");
    expect(APPROVAL_ROW_STATUS_DISPLAY.within_band.label).toBe("正常範圍");
  });

  it("gives both out-of-band directions the same tone", () => {
    expect(APPROVAL_ROW_STATUS_DISPLAY.above_threshold.tone).toBe(
      APPROVAL_ROW_STATUS_DISPLAY.below_threshold.tone,
    );
  });
});
