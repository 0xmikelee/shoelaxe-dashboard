import { describe, expect, it } from "vitest";
import {
  assertNever,
  DomainError,
  LISTING_TAB_BY_STATUS,
  productTab,
  type ApprovalStatus,
} from "@/lib/domain/types";

const ALL: ApprovalStatus[] = [
  "approved",
  "pending_new",
  "pending_price",
  "needs_margins",
  "rejected",
  "inactive",
];

describe("the Gap 4 listing taxonomy", () => {
  it("places pending_price under 已上架, live at its old price", () => {
    expect(LISTING_TAB_BY_STATUS.pending_price).toBe("listed");
  });

  it("maps all six statuses", () => {
    expect(Object.keys(LISTING_TAB_BY_STATUS).sort()).toEqual([...ALL].sort());
  });
});

describe("productTab", () => {
  it.each([
    ["every size delisted", ["inactive", "inactive"], "delisted"],
    ["any size live", ["inactive", "rejected", "approved"], "listed"],
    ["a held price is still live", ["pending_new", "pending_price"], "listed"],
    ["nothing live and not all delisted", ["pending_new", "inactive", "rejected"], "unlisted"],
    ["a product with no listings", [], "unlisted"],
  ] as const)("%s", (_label, statuses, expected) => {
    expect(productTab(statuses)).toBe(expected);
  });

  it("partitions all six statuses into exactly three tabs", () => {
    expect(new Set(ALL.map((s) => productTab([s])))).toEqual(
      new Set(["listed", "unlisted", "delisted"]),
    );
  });
});

describe("assertNever", () => {
  it("names the context and the value it could not handle", () => {
    expect(() => assertNever("shopify" as never, "slotForEventSource")).toThrow(DomainError);
    expect(() => assertNever("shopify" as never, "slotForEventSource")).toThrow(
      /slotForEventSource: unexpected value "shopify"/,
    );
  });

  it("is a DomainError by name, so a handler can tell it from a bug", () => {
    expect(new DomainError("x").name).toBe("DomainError");
  });
});
