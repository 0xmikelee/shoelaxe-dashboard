"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { FilterSelect } from "@/components/filter-select";
import { MarginSummaryCell } from "@/components/products/margin-summary";
import { Pagination } from "@/components/data-table/pagination";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ProductThumb } from "@/components/product-thumb";
import { StatusBadge } from "@/components/status-badge";
import { MoneyRange } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGroups } from "@/hooks/use-groups";
import { useProducts, type ProductsUiFilters } from "@/hooks/use-products";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { PRODUCTS_SORT_LABEL } from "@/lib/i18n/enums";
import { ALL_TAB_LABEL, LISTING_TAB_LABEL, PRODUCT_STATUS_TABS } from "@/lib/i18n/status";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { ProductBulkResultWire } from "@/lib/schemas/wire/products";
import type { ProductStatusTab } from "@/lib/i18n/status";
import type { ProductsSort } from "@/lib/i18n/enums";

const t = zhHant.products;

const TAB_ALL = "all" as const;
type TabValue = typeof TAB_ALL | ProductStatusTab;
const TONE_BY_TAB = { listed: "success", unlisted: "warning", delisted: "neutral" } as const;

const SORT_OPTIONS = (Object.keys(PRODUCTS_SORT_LABEL) as ProductsSort[]).map((value) => ({
  value,
  label: PRODUCTS_SORT_LABEL[value],
}));

export function ProductsClient() {
  const groups = useGroups();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ProductsUiFilters>({ page: 1, per_page: 20 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const tab: TabValue = filters.status ?? TAB_ALL;

  const list = useProducts(filters);
  const counts = list.data?.meta.counts;
  const rows = list.data?.rows ?? [];
  const pageSkus = rows.map((row) => row.sku);
  const allOnPageSelected = pageSkus.length > 0 && pageSkus.every((sku) => selected.has(sku));

  const setTab = (value: TabValue) =>
    setFilters((prev) => ({
      ...prev,
      status: value === TAB_ALL ? undefined : value,
      page: 1,
    }));

  const applySearch = (q: string) => {
    setSearch(q);
    setFilters((prev) => ({ ...prev, q: q.trim() || undefined, page: 1 }));
  };

  const isFiltered = Boolean(filters.q || filters.group_id);

  const exportList = useMutation({
    mutationFn: () =>
      api.download("/api/v1/products/export", {
        q: filters.q,
        status: filters.status,
        group_id: filters.group_id,
        sort: filters.sort,
        order: filters.order,
      }),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: toastApiError,
  });

  const bulk = useMutation({
    mutationFn: async (body: { action: "assign_group" | "deactivate" | "reactivate"; group_id?: string }) => {
      const result = await api.POST("/api/v1/products/bulk", {
        body: { skus: [...selected], ...body },
      });
      return ProductBulkResultWire.parse(result.data);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.products.root });
      setSelected(new Set());
      toastSuccess(t.bulkResult(result.ok_count, result.failed_count));
    },
    onError: toastApiError,
  });

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <TabsList>
          <TabsTrigger value={TAB_ALL}>
            {ALL_TAB_LABEL}
            {counts ? <Num className="ml-1.5 text-meta text-muted-foreground">{counts.all}</Num> : null}
          </TabsTrigger>
          {PRODUCT_STATUS_TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {LISTING_TAB_LABEL[value]}
              {counts ? (
                <Num className="ml-1.5 text-meta text-muted-foreground">{counts[value]}</Num>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => applySearch(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="max-w-[360px]"
              aria-label={t.searchPlaceholder}
            />
            <FilterSelect
              aria-label={t.groupFilter}
              value={filters.group_id ?? "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  group_id: value === "all" ? undefined : value,
                  page: 1,
                }))
              }
              options={[
                { value: "all", label: `${t.groupFilter}：${zhHant.common.all}` },
                ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.name })),
              ]}
            />
            <FilterSelect
              aria-label={t.sortLabel}
              value={filters.sort ?? "last_imported_at"}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, sort: value as ProductsSort, page: 1 }))
              }
              options={SORT_OPTIONS.map((option) => ({
                value: option.value,
                label: `${t.sortLabel}：${option.label}`,
              }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exportList.isPending}
              onClick={() => exportList.mutate()}
            >
              {exportList.isPending ? t.exporting : t.export}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={selected.size === 0 || bulk.isPending}>
                  {t.bulkActions}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t.bulkAssignGroup}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(groups.data ?? []).map((group) => (
                      <DropdownMenuItem
                        key={group.id}
                        onClick={() => bulk.mutate({ action: "assign_group", group_id: group.id })}
                      >
                        {group.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => bulk.mutate({ action: "deactivate" })}>
                  {t.bulkDeactivate}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => bulk.mutate({ action: "reactivate" })}>
                  {t.bulkReactivate}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-meta text-muted-foreground">{t.tabCountsHint}</p>
        {selected.size > 0 ? (
          <p className="text-meta">
            {t.bulkSelected(selected.size)} · {t.bulkScopeHint}
          </p>
        ) : null}

        {list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <div className="flex flex-col gap-2 py-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : list.data.rows.length === 0 ? (
          <EmptyState
            title={
              isFiltered
                ? t.empty.noResultsTitle
                : filters.status
                  ? t.empty.emptyTabTitle
                  : t.empty.noProductsTitle
            }
            description={isFiltered ? t.empty.noResultsBody : t.empty.noProductsBody}
          />
        ) : (
          <>
            <div className={list.isFetching ? "opacity-60 transition-opacity" : undefined}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(value) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (value === true) pageSkus.forEach((sku) => next.add(sku));
                            else pageSkus.forEach((sku) => next.delete(sku));
                            return next;
                          });
                        }}
                        aria-label={zhHant.common.selectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[320px]">{t.columns.product}</TableHead>
                    <TableHead className="w-[160px]">{t.columns.group}</TableHead>
                    <TableHead className="w-[88px] text-right">{t.columns.sizeCount}</TableHead>
                    <TableHead className="w-[200px]">{t.columns.margin}</TableHead>
                    <TableHead className="w-[180px] text-right">{t.columns.price}</TableHead>
                    <TableHead className="w-[110px]">{t.columns.status}</TableHead>
                    <TableHead className="w-[110px]">{t.columns.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.sku}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.sku)}
                          onCheckedChange={(value) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (value === true) next.add(row.sku);
                              else next.delete(row.sku);
                              return next;
                            });
                          }}
                          aria-label={row.sku}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ProductThumb src={row.primary_image_url} alt="" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-cell font-medium text-foreground">{row.name}</span>
                            <Num className="text-meta text-muted-foreground">{row.sku}</Num>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-cell text-muted-foreground">{row.group.name}</TableCell>
                      <TableCell className="text-right">
                        <Num className="text-cell">{row.aggregates.size_count}</Num>
                      </TableCell>
                      <TableCell className="text-cell">
                        <MarginSummaryCell summary={row.margin_summary} />
                      </TableCell>
                      <TableCell className="text-right">
                        {row.aggregates.price ? (
                          <MoneyRange
                            min={row.aggregates.price.min}
                            max={row.aggregates.price.max}
                            className="text-cell font-medium"
                          />
                        ) : (
                          <span className="text-cell text-muted-foreground">{zhHant.common.unknown}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={LISTING_TAB_LABEL[row.status]}
                          tone={TONE_BY_TAB[row.status]}
                        />
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/products/${encodeURIComponent(row.sku)}`}>{t.viewDetail}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
