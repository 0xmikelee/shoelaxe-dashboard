"use client";

import { useEffect, useReducer, useState, type Dispatch } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { ErrorState } from "@/components/error-state";
import { HistoryTable } from "@/components/products/history-table";
import { ImageGallery } from "@/components/products/image-gallery";
import { MiniBarChart } from "@/components/products/mini-bar-chart";
import { ProductInfoCard } from "@/components/products/product-info-card";
import { changesetSummary, SaveBar } from "@/components/products/save-bar";
import { SizePanel } from "@/components/products/size-panel";
import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { Percent } from "@/components/format/percent";
import { SizeLabel } from "@/components/format/size-label";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGroup } from "@/hooks/use-groups";
import { useMe } from "@/hooks/use-me";
import { useProduct, useProductHistory } from "@/hooks/use-product";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import {
  changeCount,
  currentImageOrder,
  currentListingDraft,
  currentName,
  currentNameZh,
  currentStatus,
  describeChanges,
  displayed,
  initialProductDraft,
  isCleared,
  isProductDraftDirty,
  reduceProductDraft,
  toPatch,
  type ProductDraftAction,
  type ProductDraftState,
} from "@/lib/draft";
import { fromCents, toCents } from "@/lib/domain/money";
import { resolveMargins } from "@/lib/domain/margins";
import { MARGIN_SOURCE_LABEL } from "@/lib/i18n/enums";
import { APPROVAL_STATUS_DISPLAY } from "@/lib/i18n/status";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";
import type { Listing } from "@/lib/schemas/wire/listings";
import type { ProductDetail, ProductWriteResult } from "@/lib/schemas/wire/products";
import { ProductWriteResultWire } from "@/lib/schemas/wire/products";

const t = zhHant.productDetail;

export function ProductDetailClient({ sku }: { sku: string }) {
  const product = useProduct(sku);
  if (product.isError) return <ErrorState onRetry={() => void product.refetch()} />;
  if (product.isPending || !product.data) return <Skeleton className="h-96 w-full" />;
  return <ProductDetailLoaded sku={sku} initial={product.data} />;
}

function ProductDetailLoaded({ sku, initial }: { sku: string; initial: ProductDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const product = useProduct(sku);
  const me = useMe();
  const group = useGroup(initial.group.id);
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const history = useProductHistory(sku, {
    size: sizeFilter === "all" ? undefined : sizeFilter,
    page: historyPage,
    per_page: 20,
  });
  const chart = useProductHistory(sku, {
    size: sizeFilter === "all" ? undefined : sizeFilter,
    change_type: ["listing_price"],
    limit: 6,
  });

  const [draftState, dispatch] = useReducer(reduceProductDraft, initialProductDraft(initial));

  useEffect(() => {
    const raw = sessionStorage.getItem(`shoelaxe:name:${sku}`);
    if (!raw) return;
    sessionStorage.removeItem(`shoelaxe:name:${sku}`);
    try {
      const staged = JSON.parse(raw) as { name?: string; nameZh?: string };
      if (staged.name) dispatch({ type: "setName", value: staged.name });
      if (staged.nameZh !== undefined) dispatch({ type: "setNameZh", value: staged.nameZh });
    } catch {
      /* ignore a corrupt staging blob */
    }
  }, [sku]);

  useEffect(() => {
    if (product.data) dispatch({ type: "hydrateIfClean", snapshot: product.data });
  }, [product.data]);

  const save = useMutation({
    mutationFn: async () => {
      const result = await api.PATCH("/api/v1/products/{sku}", {
        params: { path: { sku } },
        body: toPatch(draftState.draft),
      });
      return ProductWriteResultWire.parse(result.data);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.products.root });
      toastSuccess(outcomeCopy(result));
    },
    onError: toastApiError,
  });

  useEffect(() => {
    if (!isProductDraftDirty(draftState.draft)) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [draftState]);

  const detail = draftState.snapshot;
  const publishing = me.data?.meta.publishing.enabled === true;
  const rounding = me.data?.meta.settings.rounding_enabled ?? true;
  const dirty = isProductDraftDirty(draftState.draft);
  const changes = describeChanges(draftState);
  const images = currentImageOrder(draftState)
    .map((id) => detail.images.find((image) => image.id === id))
    .filter((image): image is NonNullable<typeof image> => Boolean(image));
  const sizes = detail.listings.map((row) => row.size);

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-meta text-muted-foreground">
        <Link href="/products" className="hover:underline">
          {t.breadcrumbRoot}
        </Link>
        {" / "}
        <Link href={`/groups/${detail.group.id}`} className="hover:underline">
          {detail.group.name}
        </Link>
        {" / "}
        <span className="text-foreground">{currentName(draftState)}</span>
      </nav>

      {dirty ? (
        <SaveBar
          count={changeCount(draftState.draft)}
          summary={changesetSummary(changes)}
          changes={changes}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onDiscard={() => dispatch({ type: "discard" })}
        />
      ) : null}

      <div className="flex gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
            <header className="flex items-baseline justify-between">
              <div>
                <h2 className="text-section font-bold">{t.trend.title}</h2>
                <p className="text-meta text-muted-foreground">{t.trend.hint}</p>
              </div>
              <Tabs
                value={sizeFilter}
                onValueChange={(value) => {
                  setSizeFilter(value);
                  setHistoryPage(1);
                }}
              >
                <TabsList variant="line">
                  <TabsTrigger value="all">{t.trend.allSizes}</TabsTrigger>
                  {sizes.map((size) => (
                    <TabsTrigger key={size} value={size}>
                      {size}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </header>
            {chart.data ? <MiniBarChart rows={chart.data.rows} /> : <Skeleton className="h-24 w-full" />}
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
            <header>
              <h2 className="text-section font-bold">{t.sizes.title}</h2>
              <p className="text-meta text-muted-foreground">
                {t.sizes.summary(
                  detail.aggregates.in_stock_size_count,
                  detail.aggregates.total_in_house_quantity,
                )}
              </p>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">{t.sizes.columns.size}</TableHead>
                  <TableHead className="w-[88px] text-right">{t.sizes.columns.quantity}</TableHead>
                  <TableHead className="w-[120px] text-right">{t.sizes.columns.cost}</TableHead>
                  <TableHead>{t.sizes.columns.margin}</TableHead>
                  <TableHead className="w-[120px] text-right">{t.sizes.columns.price}</TableHead>
                  <TableHead className="w-[140px]">{t.sizes.columns.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.listings.map((row) => (
                  <SizeAccordion
                    key={row.id}
                    listing={row}
                    listings={detail.listings}
                    expanded={expandedId === row.id}
                    onToggle={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                    onSelectSize={setExpandedId}
                    onRefresh={() => {
                      void queryClient.invalidateQueries({ queryKey: qk.products.detail(sku) });
                      void queryClient.invalidateQueries({ queryKey: qk.listings.root });
                    }}
                    draft={draftState}
                    rounding={rounding}
                    groupPercent={group.data?.margin_percent}
                    groupFixed={group.data?.margin_fixed}
                    defaultEnabled={me.data?.meta.settings.default_margin_enabled ?? true}
                    defaultPercent={me.data?.meta.settings.default_margin_percent ?? "0"}
                    defaultFixed={me.data?.meta.settings.default_margin_fixed ?? "0.00"}
                    dispatch={dispatch}
                  />
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
            <header className="flex items-baseline justify-between">
              <h2 className="text-section font-bold">{t.history.title}</h2>
              <Link href={`/products/${sku}/history`} className="text-meta hover:underline">
                {t.history.viewAll}
              </Link>
            </header>
            {history.isError ? (
              <ErrorState onRetry={() => void history.refetch()} />
            ) : history.data ? (
              <HistoryTable
                rows={history.data.rows}
                meta={history.data.meta}
                onPageChange={setHistoryPage}
              />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </section>
        </div>

        <aside className="flex w-[400px] shrink-0 flex-col gap-6">
          <ImageGallery
            sku={sku}
            images={images}
            dirty={draftState.draft.imageOrder.kind === "set"}
            onReorder={(ids) => dispatch({ type: "setImageOrder", value: ids })}
          />
          <ProductInfoCard
            product={{ ...detail, name: currentName(draftState), name_zh: currentNameZh(draftState) }}
            status={currentStatus(draftState)}
            publishingEnabled={publishing}
            onStatus={(value) => dispatch({ type: "setStatus", value })}
            onEditName={() => router.push(`/products/${sku}/name`)}
          />
        </aside>
      </div>
    </div>
  );
}

function outcomeCopy(result: ProductWriteResult): string {
  if (result.held_count > 0) return t.outcome.mixed(result.updated_count, result.held_count);
  if (result.needs_margins_count > 0) return t.outcome.needsMargins(result.needs_margins_count);
  return t.outcome.allUpdated(result.updated_count);
}

function SizeAccordion({
  listing,
  listings,
  expanded,
  onToggle,
  onSelectSize,
  onRefresh,
  draft,
  rounding,
  groupPercent,
  groupFixed,
  defaultEnabled,
  defaultPercent,
  defaultFixed,
  dispatch,
}: {
  listing: Listing;
  listings: readonly Listing[];
  expanded: boolean;
  onToggle: () => void;
  onSelectSize: (listingId: string) => void;
  onRefresh: () => void;
  draft: ProductDraftState;
  rounding: boolean;
  groupPercent: string | null | undefined;
  groupFixed: string | null | undefined;
  defaultEnabled: boolean;
  defaultPercent: string;
  defaultFixed: string;
  dispatch: Dispatch<ProductDraftAction>;
}) {
  const local = currentListingDraft(draft, listing.id);
  const inHouse = listing.sources.find((source) => source.source === "in_house");
  const quantity = displayed(local.inHouseQuantity, inHouse?.quantity ?? 0);
  const cost = displayed(local.inHouseCost, inHouse?.cost ?? "");
  const status = APPROVAL_STATUS_DISPLAY[listing.approval_status];

  const margins = (() => {
    if (isCleared(local.marginOverride)) {
      return resolveMargins(
        null,
        groupPercent || groupFixed
          ? { percent: groupPercent ? Number(groupPercent) : null, fixedCents: groupFixed ? toCents(groupFixed) : null }
          : null,
        { enabled: defaultEnabled, percent: Number(defaultPercent), fixedCents: toCents(defaultFixed) },
      );
    }
    if (local.marginOverride.kind === "set") {
      return resolveMargins(
        {
          percent: local.marginOverride.value.percent ? Number(local.marginOverride.value.percent) : null,
          fixedCents: local.marginOverride.value.fixed ? toCents(local.marginOverride.value.fixed) : null,
        },
        null,
        { enabled: false, percent: 0, fixedCents: 0 },
      );
    }
    return listing.margin_percent
      ? {
          percent: Number(listing.margin_percent),
          fixedCents: listing.margin_fixed ? toCents(listing.margin_fixed) : 0,
          source: listing.margin_source ?? "group",
        }
      : null;
  })();

  return (
    <>
      <TableRow>
        <TableCell>
          <button type="button" className="flex items-center gap-1" onClick={onToggle}>
            {expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
            <SizeLabel value={listing.size} className="text-cell font-medium" />
          </button>
        </TableCell>
        <TableCell className="text-right">
          <Num className="text-cell">{zhHant.common.pairs(quantity)}</Num>
        </TableCell>
        <TableCell className="text-right">
          <Money value={cost || listing.base_cost} className="text-cell" />
        </TableCell>
        <TableCell className="text-cell">
          {margins ? (
            <span className="inline-flex items-center gap-1">
              <Percent value={margins.percent} />
              <span className="text-muted-foreground">+</span>
              <Money value={fromCents(margins.fixedCents)} />
              {listing.margin_source ? (
                <StatusBadge label={MARGIN_SOURCE_LABEL[listing.margin_source]} tone="info" />
              ) : null}
            </span>
          ) : (
            zhHant.common.unknown
          )}
        </TableCell>
        <TableCell className="text-right">
          <Money value={listing.approved_price} className="text-cell font-medium" />
        </TableCell>
        <TableCell>
          <StatusBadge label={status.rowLabel} tone={status.tone} />
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/40 p-3">
            <SizePanel
              listing={listing}
              listings={listings}
              draft={draft}
              rounding={rounding}
              groupPercent={groupPercent}
              groupFixed={groupFixed}
              defaultEnabled={defaultEnabled}
              defaultPercent={defaultPercent}
              defaultFixed={defaultFixed}
              dispatch={dispatch}
              onSelectSize={onSelectSize}
              onRefresh={onRefresh}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

