"use client";

import { useState } from "react";

import { ApprovalsTable } from "@/components/approvals/approvals-table";
import { Pagination } from "@/components/data-table/pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FilterSelect } from "@/components/filter-select";
import { MetricCard } from "@/components/metric-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApprovals, useApprovalStats, type ApprovalsUiFilters } from "@/hooks/use-approvals";
import { formatRate } from "@/lib/format/percent";
import { DATE_RANGE_PRESET_LABEL, EVENT_SOURCE_LABEL } from "@/lib/i18n/enums";
import { APPROVAL_ROW_STATUS_DISPLAY } from "@/lib/i18n/status";
import { zhHant } from "@/lib/i18n/zh-Hant";
import type { DateRangePreset } from "@/lib/i18n/enums";
import type { ApprovalRowStatus } from "@/lib/format/delta";

const t = zhHant.approvals;

export function ApprovalsClient() {
  const [filters, setFilters] = useState<ApprovalsUiFilters>({ page: 1, per_page: 20 });
  const [search, setSearch] = useState("");

  const list = useApprovals(filters);
  const stats = useApprovalStats();

  // A search or filter change must go back to page 1; leaving the offset behind lands the user on
  // an empty page of a shorter result set, which reads as "no results".
  const applySearch = (q: string) => {
    setSearch(q);
    setFilters((prev) => ({ ...prev, q: q.trim() || undefined, page: 1 }));
  };

  const isFiltered = Boolean(filters.q || filters.source || filters.status?.length || filters.preset);

  return (
    <div className="flex flex-col gap-5">
      {/* Gap 8: lifetime totals with a 今日 delta. They do not follow the filters below, which is
          enforced by qk.approvals.stats() taking no argument rather than by remembering to. */}
      <section aria-label={t.title} className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t.metrics.totalCrawled}
            value={stats.data?.total_crawled}
            hint={stats.data ? t.metrics.crawledToday(stats.data.crawled_today) : undefined}
            loading={stats.isPending}
          />
          <MetricCard
            label={t.metrics.pending}
            value={stats.data?.pending}
            hint={t.metrics.pendingHint}
            loading={stats.isPending}
          />
          <MetricCard
            label={t.metrics.confirmed}
            value={stats.data?.confirmed}
            hint={stats.data ? t.metrics.passRate(formatRate(stats.data.pass_rate)) : undefined}
            loading={stats.isPending}
          />
          <MetricCard
            label={t.metrics.rejected}
            value={stats.data?.rejected}
            hint={
              stats.data ? t.metrics.rejectionRate(formatRate(stats.data.rejection_rate)) : undefined
            }
            loading={stats.isPending}
          />
        </div>
        <p className="text-meta text-muted-foreground">{t.metrics.scopeNote}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => applySearch(event.target.value)}
            placeholder={t.filters.searchPlaceholder}
            className="max-w-[360px]"
            aria-label={t.filters.searchPlaceholder}
          />
          <FilterSelect
            aria-label={t.filters.allSources}
            value={filters.source ?? "all"}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                source: value === "all" ? undefined : (value as "stockx" | "google_sheet" | "dashboard"),
                page: 1,
              }))
            }
            options={[
              { value: "all", label: t.filters.allSources },
              ...(["stockx", "google_sheet", "dashboard"] as const).map((value) => ({
                value,
                label: EVENT_SOURCE_LABEL[value],
              })),
            ]}
          />
          <FilterSelect
            aria-label={t.filters.allStatuses}
            value={filters.status?.[0] ?? "all"}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                status: value === "all" ? undefined : [value as ApprovalRowStatus],
                page: 1,
              }))
            }
            options={[
              { value: "all", label: t.filters.allStatuses },
              ...(Object.keys(APPROVAL_ROW_STATUS_DISPLAY) as ApprovalRowStatus[]).map((value) => ({
                value,
                label: APPROVAL_ROW_STATUS_DISPLAY[value].label,
              })),
            ]}
          />
          <FilterSelect
            aria-label={t.filters.dateRange}
            value={filters.preset ?? "all"}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                preset: value === "all" ? undefined : (value as DateRangePreset),
                page: 1,
              }))
            }
            options={(Object.keys(DATE_RANGE_PRESET_LABEL) as DateRangePreset[]).map((value) => ({
              value,
              label: DATE_RANGE_PRESET_LABEL[value],
            }))}
          />
        </div>

        {list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.rows.length === 0 ? (
          <EmptyState
            title={isFiltered ? t.empty.noResultsTitle : t.empty.nothingPendingTitle}
            description={isFiltered ? t.empty.noResultsBody : t.empty.nothingPendingBody}
          />
        ) : (
          <>
            {/* Dim rather than blank while a filter change is in flight: placeholderData keeps the
                previous page mounted, so the table must show it is stale without disappearing. */}
            <div className={list.isFetching ? "opacity-60 transition-opacity" : undefined}>
              <ApprovalsTable rows={list.data.rows} />
            </div>
            <Pagination
              meta={list.data.meta}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              onPerPageChange={(per_page) => setFilters((prev) => ({ ...prev, per_page, page: 1 }))}
            />
          </>
        )}
      </section>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
