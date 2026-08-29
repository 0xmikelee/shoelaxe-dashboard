import type { ApprovalsFilters } from "@/lib/schemas/params/approvals";
import { approvalStats, db, paginate, selectApprovals } from "../db";
import { projectApprovalRow, rate1 } from "../project";
import { defineMock, listMeta } from "./common";

export const approvalsHandlers = [
  defineMock<ApprovalsFilters>("listApprovals", ({ query }) => {
    const rows = selectApprovals(query);
    const page = paginate(rows, query.page, query.per_page);
    return {
      data: page.rows.flatMap((u) => {
        const row = projectApprovalRow(db, u);
        return row ? [row] : [];
      }),
      meta: listMeta(page),
    };
  }),

  /**
   * Gap 8: no filter argument at all. Lifetime totals with a 今日 delta, so 通過率 does not move while
   * the user types in the search box above it.
   */
  defineMock("getApprovalStats", () => {
    const stats = approvalStats();
    return {
      data: {
        total_crawled: stats.total_crawled,
        crawled_today: stats.crawled_today,
        pending: stats.pending,
        confirmed: stats.confirmed,
        pass_rate: rate1(stats.pass_rate),
        rejected: stats.rejected,
        rejection_rate: rate1(stats.rejection_rate),
        oldest_pending_since: stats.oldest_pending_since,
      },
    };
  }),
];
