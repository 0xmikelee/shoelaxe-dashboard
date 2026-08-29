import { describe, expect, it } from "vitest";
import {
  isDashboardEditable,
  quantityForSlot,
  slotForEventSource,
  STOCKX_QUANTITY,
} from "@/lib/domain/sources";
import { DomainError, type EventSource } from "@/lib/domain/types";

describe("slotForEventSource", () => {
  it.each([
    ["stockx", "stockx"],
    ["google_sheet", "in_house"],
    ["dashboard", "in_house"],
  ] as const)("maps %s to %s", (source, slot) => {
    expect(slotForEventSource(source)).toBe(slot);
  });

  it("refuses a transport the domain does not know", () => {
    expect(() => slotForEventSource("shopify" as EventSource)).toThrow(DomainError);
  });
});

describe("quantityForSlot", () => {
  it("forces StockX to its constant 1 whatever the payload says", () => {
    expect(quantityForSlot("stockx", 7)).toBe(STOCKX_QUANTITY);
    expect(quantityForSlot("stockx", null)).toBe(1);
  });

  it("passes an in-house quantity through, including sold-out zero", () => {
    expect(quantityForSlot("in_house", 0)).toBe(0);
    expect(quantityForSlot("in_house", 4)).toBe(4);
  });

  it("returns null for a blank in-house quantity so a cost-only row keeps its stock", () => {
    expect(quantityForSlot("in_house", null)).toBeNull();
  });
});

describe("isDashboardEditable", () => {
  it("is true only for the in-house slot", () => {
    expect(isDashboardEditable("in_house")).toBe(true);
    expect(isDashboardEditable("stockx")).toBe(false);
  });
});
