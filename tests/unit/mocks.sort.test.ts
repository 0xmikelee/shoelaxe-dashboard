import { describe, expect, it } from "vitest";
import { selectApprovals } from "@/mocks/db";

/**
 * The approval queue's default sort is `pending_since desc`. Rows that need no human action carry a
 * null `pending_since`, and if nulls sort first the queue opens on the rows nobody has to look at —
 * which is what happened: 56 held rows sat behind 130 that were already resolved.
 */
describe("pending_since ordering", () => {
  const filters = { sort: "pending_since", order: "desc" } as const;

  it("puts rows awaiting a human first, in both directions", () => {
    for (const order of ["desc", "asc"] as const) {
      const rows = selectApprovals({ ...filters, order });
      const firstNull = rows.findIndex((r) => r.pending_since === null);
      const lastDated = rows.map((r) => r.pending_since !== null).lastIndexOf(true);
      if (firstNull !== -1 && lastDated !== -1) {
        expect(firstNull, `nulls must not precede dated rows when order=${order}`).toBeGreaterThan(
          lastDated,
        );
      }
    }
  });

  it("orders the dated rows newest-first when descending", () => {
    const dated = selectApprovals(filters)
      .map((r) => r.pending_since)
      .filter((v): v is string => v !== null);
    const sorted = [...dated].sort().reverse();
    expect(dated).toEqual(sorted);
  });
});
