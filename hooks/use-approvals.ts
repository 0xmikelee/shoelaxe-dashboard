"use client";

import { useQuery } from "@tanstack/react-query";

import { api, parseMeta } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { ApprovalStatsWire, ApprovalsListWire } from "@/lib/schemas/wire/approvals";
import { ListMeta } from "@/lib/schemas/wire/common";
import type { ApprovalsFilters } from "@/lib/schemas/params/approvals";

/** Only the filters the queue actually sends; the rest of ApprovalsQuery has defaults. */
export type ApprovalsUiFilters = Partial<
  Pick<ApprovalsFilters, "q" | "source" | "status" | "preset" | "page" | "per_page" | "sort" | "order">
>;

function queryParams(filters: ApprovalsUiFilters) {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    // Comma-joined on the way out: lib/http/handler.ts parses the query as a flat string map, so a
    // repeated key would silently keep only the last value. `csv()` parses the inbound direction.
    ...(filters.status?.length ? { status: filters.status.join(",") } : {}),
    ...(filters.preset ? { preset: filters.preset } : {}),
    page: filters.page ?? 1,
    per_page: filters.per_page ?? 20,
    sort: filters.sort ?? "pending_since",
    order: filters.order ?? "desc",
  };
}

export function useApprovals(filters: ApprovalsUiFilters) {
  return useQuery({
    queryKey: qk.approvals.list(filters),
    queryFn: async () => {
      const result = await api.GET("/api/v1/approvals", { params: { query: queryParams(filters) } });
      return {
        rows: ApprovalsListWire.parse(result.data),
        meta: parseMeta(ListMeta, result),
      };
    },
    // Dim the table on a filter change instead of blanking it — the design's filters stay usable
    // while the rows refresh, and a flash of empty state reads as "no results".
    placeholderData: (previous) => previous,
  });
}

/**
 * Gap 8: no filter argument, deliberately. The cards are lifetime totals with a 今日 delta, so a
 * filter change structurally cannot invalidate them and 通過率 cannot drift while someone types.
 */
export function useApprovalStats() {
  return useQuery({
    queryKey: qk.approvals.stats(),
    queryFn: async () => {
      const result = await api.GET("/api/v1/approvals/stats", {});
      return ApprovalStatsWire.parse(result.data);
    },
  });
}
