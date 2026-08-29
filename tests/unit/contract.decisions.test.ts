import { describe, expect, it } from "vitest";
import {
  ApprovalStatus,
  BATCH_BYPASSES_BAND,
  LISTING_STATUS_TAB,
  ProductStatusTab,
} from "@/lib/schemas/wire/common";

/**
 * The two undecided gaps, pinned. Each is a single constant precisely so reversing it is one edit
 * rather than archaeology across five screens — and these assertions are what make a reversal show
 * up as a failing test naming the decision, instead of as five screens quietly disagreeing.
 */

describe("Gap 4 — where pending_price lives in the taxonomy", () => {
  it("maps all six listing statuses to a tab, and nothing else", () => {
    expect(Object.keys(LISTING_STATUS_TAB).sort()).toEqual([...ApprovalStatus.options].sort());
    for (const tab of Object.values(LISTING_STATUS_TAB)) {
      expect(ProductStatusTab.options).toContain(tab);
    }
  });

  it("puts pending_price under 已上架, because the listing is live at its old price", () => {
    expect(LISTING_STATUS_TAB.pending_price).toBe("listed");
    expect(LISTING_STATUS_TAB.approved).toBe("listed");
  });

  it("keeps the three not-yet-listed states out of 已上架", () => {
    expect(LISTING_STATUS_TAB.pending_new).toBe("unlisted");
    expect(LISTING_STATUS_TAB.needs_margins).toBe("unlisted");
    expect(LISTING_STATUS_TAB.rejected).toBe("unlisted");
    expect(LISTING_STATUS_TAB.inactive).toBe("delisted");
  });
});

describe("Gap 1 — whether a human-initiated batch bypasses the approval band", () => {
  it("bypasses it, exactly as §5 already grants manual price entry", () => {
    // Flip this and Screen 4 state D and Screen 5 both need a 「N 個尺寸待審核」 line, and the
    // preview's would_hold_for_approval stops being informational.
    expect(BATCH_BYPASSES_BAND).toBe(true);
  });
});
