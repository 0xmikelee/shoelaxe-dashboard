"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Pagination } from "@/components/data-table/pagination";
import { DisabledTooltip } from "@/components/disabled-tooltip";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Money, MoneyRange } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { Percent } from "@/components/format/percent";
import { SizeLabel } from "@/components/format/size-label";
import { ProductThumb } from "@/components/product-thumb";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveJob } from "@/hooks/use-jobs";
import { useGroup, useGroups } from "@/hooks/use-groups";
import { useProduct } from "@/hooks/use-product";
import { useProducts } from "@/hooks/use-products";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { ERROR_COPY } from "@/lib/i18n/errors";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { ListingWire } from "@/lib/schemas/wire/listings";
import { ProductWriteResultWire } from "@/lib/schemas/wire/products";
import { cn } from "@/lib/utils";

const t = zhHant.groups;

export function GroupsClient({ groupId }: { groupId?: string }) {
  const groups = useGroups();
  const router = useRouter();
  const activeId = groupId ?? groups.data?.find((g) => g.is_default)?.id ?? groups.data?.[0]?.id;

  if (groups.isError) return <ErrorState onRetry={() => void groups.refetch()} />;

  return (
    <div className="flex gap-5">
      <aside className="flex w-[280px] shrink-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-section font-bold text-foreground">{t.title}</h2>
          {groups.data ? (
            <span className="text-meta text-muted-foreground">{t.groupCount(groups.data.length)}</span>
          ) : null}
        </div>
        <Button asChild size="sm">
          <Link href="/groups/new">{t.newGroup}</Link>
        </Button>

        <div className="flex flex-col gap-1">
          {groups.isPending
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)
            : groups.data.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => router.push(`/groups/${group.id}`)}
                  aria-current={group.id === activeId}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                    group.id === activeId
                      ? "border-primary bg-card"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-cell font-medium text-foreground">{group.name}</span>
                    {group.is_default ? <StatusBadge label={t.defaultBadge} tone="info" /> : null}
                  </span>
                  <span className="text-meta text-muted-foreground">
                    <Num>{t.productCount(group.product_count)}</Num>
                    {group.margin_percent ? (
                      <>
                        {" · "}
                        <Percent value={group.margin_percent} />
                        {group.margin_fixed ? (
                          <>
                            {" + "}
                            <Money value={group.margin_fixed} />
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {" · "}
                        {t.defaultMarginBadge}
                      </>
                    )}
                  </span>
                </button>
              ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1">{activeId ? <GroupDetail groupId={activeId} /> : null}</div>
    </div>
  );
}

function GroupDetail({ groupId }: { groupId: string }) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const group = useGroup(groupId);
  const products = useProducts({ group_id: groupId, page, per_page: 20 });
  const applyJob = useActiveJob("group_apply", groupId);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-section font-bold text-foreground">{group.data?.name ?? ""}</h3>
            {group.data ? (
              <p className="text-meta text-muted-foreground">
                <Num>{t.header.summary(group.data.product_count, group.data.listing_count)}</Num>
                {" · "}
                {group.data.margin_percent
                  ? t.header.rule(`${group.data.margin_percent}% + ${group.data.margin_fixed ?? "0"}`)
                  : t.defaultMarginBadge}
              </p>
            ) : (
              <Skeleton className="h-4 w-64" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {applyJob.data ? (
              <DisabledTooltip reason={zhHant.groups.applyRunning}>
                <Button size="sm" disabled>
                  {t.header.batchUpdate}
                </Button>
              </DisabledTooltip>
            ) : (
              <Button asChild size="sm">
                <Link href={`/groups/${groupId}/apply`}>{t.header.batchUpdate}</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={`/groups/${groupId}/members`}>{t.header.addProducts}</Link>
            </Button>
            {group.data?.is_default ? (
              <DisabledTooltip reason={ERROR_COPY.default_group_immutable.message}>
                <Button size="sm" variant="outline" disabled>
                  {t.header.delete}
                </Button>
              </DisabledTooltip>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`/groups/${groupId}/delete`}>{t.header.delete}</Link>
              </Button>
            )}
          </div>
        </div>
        {applyJob.data ? (
          <div className="rounded-md bg-muted px-3 py-2 text-meta">
            {zhHant.groups.applyRunning}{" "}
            <Link href={`/groups/${groupId}/apply`} className="underline">
              {zhHant.jobs.viewProgress}
            </Link>
          </div>
        ) : null}
      </header>

      {products.isError ? (
        <ErrorState onRetry={() => void products.refetch()} />
      ) : products.isPending ? (
        <div className="flex flex-col gap-2 py-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : products.data.rows.length === 0 ? (
        <EmptyState title={zhHant.products.empty.emptyTabTitle} />
      ) : (
        <>
          <p className="text-meta text-muted-foreground">{t.expandHint}</p>
          <div className={products.isFetching ? "opacity-60 transition-opacity" : undefined}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[320px]">{t.columns.product}</TableHead>
                  <TableHead className="w-[160px] text-right">{t.columns.cost}</TableHead>
                  <TableHead className="w-[140px]">{t.columns.marginPercent}</TableHead>
                  <TableHead className="w-[140px]">{t.columns.marginFixed}</TableHead>
                  <TableHead className="w-[180px] text-right">{t.columns.price}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.data.rows.map((row) => (
                  <GroupProductRows
                    key={row.sku}
                    sku={row.sku}
                    name={row.name}
                    imageUrl={row.primary_image_url}
                    cost={row.aggregates.cost}
                    price={row.aggregates.price}
                    percent={row.aggregates.margin_percent}
                    fixed={row.aggregates.margin_fixed}
                    hasVariance={row.aggregates.has_size_variance}
                    overrideCount={row.aggregates.override_count}
                    expanded={expanded === row.sku}
                    onToggle={() => setExpanded((current) => (current === row.sku ? null : row.sku))}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination meta={products.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function GroupProductRows({
  sku,
  name,
  imageUrl,
  cost,
  price,
  percent,
  fixed,
  hasVariance,
  overrideCount,
  expanded,
  onToggle,
}: {
  sku: string;
  name: string;
  imageUrl: string | null;
  cost: { min: string; max: string } | null;
  price: { min: string; max: string } | null;
  percent: { min: string; max: string } | null;
  fixed: { min: string; max: string } | null;
  hasVariance: boolean;
  overrideCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            <button type="button" className="shrink-0" onClick={onToggle} aria-expanded={expanded}>
              {expanded ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
            </button>
            <ProductThumb src={imageUrl} alt="" />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <Link href={`/products/${encodeURIComponent(sku)}`} className="text-cell font-medium hover:underline">
                  {name}
                </Link>
                {hasVariance ? <StatusBadge label={t.variesBadge} tone="warning" /> : null}
                {overrideCount > 0 ? <StatusBadge label={t.overriddenBadge} tone="info" /> : null}
              </span>
              <Num className="text-meta text-muted-foreground">{sku}</Num>
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {cost ? (
            <MoneyRange min={cost.min} max={cost.max} className="text-cell" />
          ) : (
            <span className="text-cell text-muted-foreground">{zhHant.common.unknown}</span>
          )}
        </TableCell>
        <TableCell className="text-cell">
          {percent ? (
            percent.min === percent.max ? (
              <Percent value={percent.min} />
            ) : (
              <span className="inline-flex items-center gap-1">
                <Percent value={percent.min} />
                <span className="text-muted-foreground">–</span>
                <Percent value={percent.max} />
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{zhHant.common.unknown}</span>
          )}
        </TableCell>
        <TableCell className="text-cell">
          {fixed ? (
            <MoneyRange min={fixed.min} max={fixed.max} />
          ) : (
            <span className="text-muted-foreground">{zhHant.common.unknown}</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {price ? (
            <MoneyRange min={price.min} max={price.max} className="text-cell font-medium" />
          ) : (
            <span className="text-cell text-muted-foreground">{zhHant.common.unknown}</span>
          )}
        </TableCell>
      </TableRow>
      {expanded ? <ExpandedSizes sku={sku} /> : null}
    </>
  );
}

function ExpandedSizes({ sku }: { sku: string }) {
  const product = useProduct(sku);
  const queryClient = useQueryClient();

  const applyAll = useMutation({
    mutationFn: async (body: { margin_percent?: string; margin_fixed?: string }) => {
      const result = await api.POST("/api/v1/products/{sku}/margins", {
        params: { path: { sku } },
        body: { scope: "all", ...body },
      });
      return ProductWriteResultWire.parse(result.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.root });
      void queryClient.invalidateQueries({ queryKey: qk.groups.root });
      toastSuccess(zhHant.common.saveChanges);
    },
    onError: toastApiError,
  });

  if (product.isError) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <ErrorState onRetry={() => void product.refetch()} />
        </TableCell>
      </TableRow>
    );
  }
  if (!product.data) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <Skeleton className="h-24 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  const first = product.data.listings[0];

  return (
    <TableRow>
      <TableCell colSpan={5} className="bg-muted/40 p-4">
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.sizeColumns.size}</TableHead>
                <TableHead className="text-right">{t.sizeColumns.quantity}</TableHead>
                <TableHead>{t.sizeColumns.marginPercent}</TableHead>
                <TableHead>{t.sizeColumns.marginFixed}</TableHead>
                <TableHead className="text-right">{t.sizeColumns.price}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.data.listings.map((listing) => (
                <SizeEditRow key={listing.id} listingId={listing.id} sku={sku} />
              ))}
            </TableBody>
          </Table>
          {first ? (
            <Button
              size="sm"
              variant="outline"
              disabled={applyAll.isPending}
              onClick={() =>
                applyAll.mutate({
                  ...(first.margin_percent ? { margin_percent: first.margin_percent } : {}),
                  ...(first.margin_fixed ? { margin_fixed: first.margin_fixed } : {}),
                })
              }
            >
              {t.applyToAllSizes}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function SizeEditRow({ listingId, sku }: { listingId: string; sku: string }) {
  const product = useProduct(sku);
  const listing = product.data?.listings.find((row) => row.id === listingId);
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(listing?.margin_override_percent ?? listing?.margin_percent ?? "");
  const [fixed, setFixed] = useState(listing?.margin_override_fixed ?? listing?.margin_fixed ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const result = await api.PATCH("/api/v1/listings/{id}/margins", {
        params: { path: { id: listingId } },
        body: {
          margin_percent: percent || null,
          margin_fixed: fixed || null,
        },
      });
      return ListingWire.parse(result.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.root });
      void queryClient.invalidateQueries({ queryKey: qk.groups.root });
      toastSuccess(zhHant.common.saveChanges);
    },
    onError: toastApiError,
  });

  if (!listing) return null;
  const inHouse = listing.sources.find((source) => source.source === "in_house");

  return (
    <TableRow>
      <TableCell>
        <SizeLabel value={listing.size} />
      </TableCell>
      <TableCell className="text-right">
        <Num>{zhHant.common.pairs(inHouse?.quantity ?? 0)}</Num>
      </TableCell>
      <TableCell>
        <Input value={percent} onChange={(event) => setPercent(event.target.value)} className="w-24" />
      </TableCell>
      <TableCell>
        <Input value={fixed} onChange={(event) => setFixed(event.target.value)} className="w-24" />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Money value={listing.approved_price} />
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
            {zhHant.common.save}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
