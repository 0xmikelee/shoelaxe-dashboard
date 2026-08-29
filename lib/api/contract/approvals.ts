import type { RouteDoc } from "@/lib/openapi/registry";
import { ApprovalStatsWire, ApprovalsListWire } from "@/lib/schemas/wire/approvals";
import { ApprovalsQuery } from "@/lib/schemas/params/approvals";
import { READ_ERRORS, SESSION_ERRORS } from "./common";

export const approvalsContract: RouteDoc[] = [
  {
    operationId: "listApprovals",
    method: "get",
    path: "/api/v1/approvals",
    summary: "The approval queue, one row per price update",
    description:
      "Includes auto-approved rows, which render 無需處理 and carry no action. Gap 6 shapes the row: " +
      "the design draws two *costs* and no current price, but Δ belongs to the price pair — new " +
      "price against the last human-approved price — so both pairs ship and the columns get relabelled.",
    tags: ["approvals"],
    auth: "session",
    consumedBy: "Screen 1 (價格監控與審批); deep-linked from Screen 8",
    request: { query: ApprovalsQuery },
    response: ApprovalsListWire,
    errors: [...READ_ERRORS],
    idempotency: "Safe. meta carries {total, page, per_page, total_pages, publishing}.",
  },
  {
    operationId: "getApprovalStats",
    method: "get",
    path: "/api/v1/approvals/stats",
    summary: "Screen 1's four metric cards, and the nav pending badge",
    description:
      "Takes **no filters** by design (Gap 8): lifetime totals with a 今日 delta, so 通過率 does not " +
      "change as the user types in the search box. The nav badge and the 待審核 card read the same " +
      "number from the same call — two sources for one count means they disagree the moment someone " +
      "approves something.",
    tags: ["approvals"],
    auth: "session",
    consumedBy: "Screen 1 metric cards; shell nav badge",
    response: ApprovalStatsWire,
    errors: [...SESSION_ERRORS],
    idempotency: "Safe. Revalidated after any approve/reject.",
  },
];
