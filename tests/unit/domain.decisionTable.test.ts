import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decide, type Decision, type DecisionInput, type DecisionTrigger } from "@/lib/domain";
import { toCents } from "@/lib/domain";
import type { ApprovalStatus, MarginSource } from "@/lib/domain";

/**
 * docs/PROMPT.md §5, driven from tests/fixtures/decision-table.csv.
 *
 * The point of the fixture is that it is readable: 100% branch coverage proves decide() does what it
 * says, and only a reviewer holding the CSV beside §5 can tell whether what it says is the brief.
 * Expected values therefore live in the file, never inline here.
 */
const source = readFileSync(new URL("../fixtures/decision-table.csv", import.meta.url), "utf8");

const lines = source
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

const columns = lines[0].split(",");
const rows: Record<string, string>[] = lines.slice(1).map((line) => {
  const cells = line.split(",");
  expect(cells, `row ${cells[0]} has ${cells.length} cells, expected ${columns.length}`).toHaveLength(
    columns.length,
  );
  return Object.fromEntries(columns.map((column, i) => [column, cells[i]]));
});

const money = (cell: string): number | null => (cell === "-" ? null : toCents(cell));
const number = (cell: string): number | null => (cell === "-" ? null : Number(cell));
const flag = (cell: string): boolean => cell === "yes";

function inputFor(row: Record<string, string>): DecisionInput {
  return {
    listing:
      row.status === "new"
        ? null
        : {
            status: row.status as ApprovalStatus,
            approvedPriceCents: money(row.approved),
            pendingPriceCents: money(row.pending),
          },
    margins:
      row.margin_source === "none"
        ? null
        : {
            percent: Number(row.pct),
            fixedCents: toCents(row.fixed),
            source: row.margin_source as MarginSource,
          },
    baseCostCents: toCents(row.base_cost),
    quantityChanged: flag(row.qty_changed),
    roundingEnabled: flag(row.rounding),
    band: { upPercent: Number(row.band_up), downPercent: Number(row.band_down) },
    trigger: row.trigger as DecisionTrigger,
  };
}

describe("the §5 decision table", () => {
  it("is a complete fixture", () => {
    expect(rows.length).toBeGreaterThanOrEqual(27);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it.each(rows.map((row) => [row.id, row.situation, row] as const))("%s %s", (_id, _situation, row) => {
    const decision = decide(inputFor(row));

    expect(decision.status).toBe(row.exp_status);
    expect(decision.outcome).toBe(row.exp_outcome);
    expect(decision.reason).toBe(row.exp_reason);
    expect(decision.priceCents).toBe(money(row.exp_price));
    expect(decision.rawPriceCents).toBe(money(row.exp_raw));
    expect(decision.approvedPriceCents).toBe(money(row.exp_approved));
    expect(decision.pendingPriceCents).toBe(money(row.exp_pending));
    expect(decision.marginSource).toBe(row.exp_margin_source === "-" ? null : row.exp_margin_source);
    expect(decision.writesPriceHistory).toBe(flag(row.exp_history));
    expect(decision.enqueuePublish).toBe(flag(row.exp_enqueue));

    const delta = number(row.exp_delta);
    if (delta === null) expect(decision.deltaPercent).toBeNull();
    else expect(decision.deltaPercent).toBeCloseTo(delta, 6);

    // Gap 2: the preview hides the rounding arrow exactly when the two figures agree. Expected from
    // the CSV's own two columns, not from the decision — deriving it from the object under test
    // would pass on any internally consistent but wrong rounding answer.
    expect(decision.roundingApplied).toBe(money(row.exp_price) !== money(row.exp_raw));
  });
});

describe("invariants that hold across every row", () => {
  const decisions: Decision[] = rows.map((row) => decide(inputFor(row)));

  it("writes nothing when the price did not move", () => {
    for (const [i, decision] of decisions.entries()) {
      if (decision.outcome !== "no_change") continue;
      expect(decision.writesPriceHistory, rows[i].situation).toBe(false);
      expect(decision.enqueuePublish, rows[i].situation).toBe(false);
    }
  });

  it("only ever writes price history when it also approves a new price", () => {
    for (const [i, decision] of decisions.entries()) {
      if (!decision.writesPriceHistory) continue;
      expect(decision.outcome, rows[i].situation).toBe("auto_approved");
      expect(decision.status, rows[i].situation).toBe("approved");
      expect(decision.approvedPriceCents, rows[i].situation).toBe(decision.priceCents);
    }
  });

  it("never holds a price without recording it as the pending one", () => {
    for (const [i, decision] of decisions.entries()) {
      if (decision.outcome !== "held_for_approval") continue;
      expect(decision.pendingPriceCents, rows[i].situation).toBe(decision.priceCents);
      expect(["pending_new", "pending_price"], rows[i].situation).toContain(decision.status);
    }
  });

  it("never leaves a pending price on a status that cannot show one", () => {
    for (const [i, decision] of decisions.entries()) {
      if (decision.pendingPriceCents === null) continue;
      expect(["pending_new", "pending_price"], rows[i].situation).toContain(decision.status);
    }
  });
});
