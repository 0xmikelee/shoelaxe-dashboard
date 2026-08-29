import { describe, expect, it } from "vitest";
import { BATCH_BYPASSES_BAND, decide, type DecisionInput } from "@/lib/domain/approval";
import { DomainError, type ApprovalStatus } from "@/lib/domain/types";

const BASE: DecisionInput = {
  listing: { status: "approved", approvedPriceCents: 100000, pendingPriceCents: null },
  margins: { percent: 0, fixedCents: 0, source: "override" },
  baseCostCents: 100000,
  quantityChanged: false,
  roundingEnabled: false,
  band: { upPercent: 10, downPercent: 10 },
  trigger: "ingest",
};

const at = (over: Partial<DecisionInput>): DecisionInput => ({ ...BASE, ...over });

describe("API-GAPS Gap 1", () => {
  it("is one edit away from being reversed", () => {
    expect(BATCH_BYPASSES_BAND).toBe(true);
  });

  it("does not bypass the band for an ingest", () => {
    const decision = decide(at({ baseCostCents: 200000, trigger: "ingest" }));
    expect(decision.reason).toBe("outside_band");
  });
});

// The CSV table in tests/unit/domain.decisionTable.test.ts owns the §5 rows themselves. What is left
// here is what a table of expected values cannot express: the guards, and the states the schema is
// supposed to make impossible.
describe("guards", () => {
  it("refuses an approval_status the domain does not know", () => {
    const paused = { status: "paused" as ApprovalStatus, approvedPriceCents: 1, pendingPriceCents: null };
    expect(() => decide(at({ listing: paused }))).toThrow(/decide: approval_status/);
  });

  it("refuses a live listing with no approved price rather than dividing by NULL", () => {
    // 011's `check (approval_status <> 'approved' or approved_price is not null)` makes this
    // unreachable; if that constraint is ever dropped this must stop the write, not guess.
    expect(() =>
      decide(
        at({ listing: { status: "approved", approvedPriceCents: null, pendingPriceCents: null } }),
      ),
    ).toThrow(DomainError);
  });

  it("reports no delta when the bypass fires against an approved price of zero", () => {
    const decision = decide(
      at({
        listing: { status: "approved", approvedPriceCents: 0, pendingPriceCents: null },
        trigger: "manual",
      }),
    );
    expect(decision).toMatchObject({
      reason: "human_bypass",
      deltaPercent: null,
      approvedPriceCents: 100000,
    });
  });
});

describe("what a decision does not touch", () => {
  it("does not publish a quantity change on a rejected listing", () => {
    const decision = decide(
      at({
        listing: { status: "rejected", approvedPriceCents: null, pendingPriceCents: null },
        quantityChanged: true,
      }),
    );
    expect(decision).toMatchObject({ status: "rejected", enqueuePublish: false, priceCents: null });
  });

  it("does not publish a quantity change on a size that was never listed", () => {
    const decision = decide(
      at({
        listing: { status: "pending_new", approvedPriceCents: null, pendingPriceCents: null },
        quantityChanged: true,
      }),
    );
    expect(decision).toMatchObject({
      status: "pending_new",
      outcome: "held_for_approval",
      enqueuePublish: false,
    });
  });

  it("clears margin_source when a live listing loses its margin chain", () => {
    const decision = decide(at({ margins: null }));
    expect(decision).toMatchObject({
      status: "approved",
      outcome: "needs_margins",
      reason: "no_margins_live",
      marginSource: null,
      approvedPriceCents: 100000,
    });
  });

  it("keeps margin_source on a frozen listing so the badge stays true", () => {
    const decision = decide(
      at({ listing: { status: "inactive", approvedPriceCents: 100000, pendingPriceCents: null } }),
    );
    expect(decision.marginSource).toBe("override");
  });

  it("drops a stale pending price when the margin chain empties", () => {
    const decision = decide(
      at({
        listing: { status: "pending_new", approvedPriceCents: null, pendingPriceCents: 134900 },
        margins: null,
      }),
    );
    expect(decision).toMatchObject({ status: "needs_margins", pendingPriceCents: null });
  });
});
