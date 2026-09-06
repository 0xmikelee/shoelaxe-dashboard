import type { ApprovalsFilters } from "@/lib/schemas/params/approvals";
import type { ApprovalRow, ApprovalStats } from "@/lib/schemas/wire/approvals";
import type { DashboardRepo } from "@/lib/repo/dashboard-types";
import { projectApprovalRow, rate1 } from "@/lib/services/wire-project";

export interface ApprovalReadDeps {
  repo: DashboardRepo;
  now: string;
  publishingEnabled: boolean;
}

export async function listApprovals(filters: ApprovalsFilters, deps: ApprovalReadDeps): Promise<{
  data: ApprovalRow[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    publishing: { enabled: boolean };
  };
}> {
  const nowMs = Date.parse(deps.now);
  const settings = await deps.repo.getSettings();
  const { rows, total } = await deps.repo.listApprovals(filters, nowMs);
  const data = rows.flatMap(({ update, listing, sources }) => {
    const row = projectApprovalRow(listing, sources, settings, update);
    return row ? [row] : [];
  });
  const total_pages = total === 0 ? 0 : Math.ceil(total / filters.per_page);
  return {
    data,
    meta: {
      total,
      page: filters.page,
      per_page: filters.per_page,
      total_pages,
      publishing: { enabled: deps.publishingEnabled },
    },
  };
}

export async function getApprovalStats(deps: ApprovalReadDeps): Promise<ApprovalStats> {
  const stats = await deps.repo.approvalStats(Date.parse(deps.now));
  const decided = stats.confirmed + stats.rejected;
  return {
    total_crawled: stats.total_crawled,
    crawled_today: stats.crawled_today,
    pending: stats.pending,
    confirmed: stats.confirmed,
    pass_rate: rate1(decided === 0 ? 0 : (stats.confirmed / decided) * 100),
    rejected: stats.rejected,
    rejection_rate: rate1(decided === 0 ? 0 : (stats.rejected / decided) * 100),
    oldest_pending_since: stats.oldest_pending_since,
  };
}
