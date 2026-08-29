"use client";

import type { Dispatch } from "react";
import { Check, ChevronDown, RefreshCw } from "lucide-react";

import { PricePanel } from "@/components/products/price-panel";
import { SizeHistory } from "@/components/products/size-history";
import { SourceCard } from "@/components/products/source-card";
import { SizeLabel } from "@/components/format/size-label";
import { Timestamp } from "@/components/format/timestamp";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { currentListingDraft, displayed, isCleared, type ProductDraftAction, type ProductDraftState } from "@/lib/draft";
import { toCents } from "@/lib/domain/money";
import { resolveMargins } from "@/lib/domain/margins";
import { MIDDLE_DOT } from "@/lib/format/punct";
import { zhHant } from "@/lib/i18n/zh-Hant";
import type { Listing } from "@/lib/schemas/wire/listings";

const t = zhHant.productDetail;

export function SizePanel({
  listing,
  listings,
  draft,
  rounding,
  groupPercent,
  groupFixed,
  defaultEnabled,
  defaultPercent,
  defaultFixed,
  dispatch,
  onSelectSize,
  onRefresh,
}: {
  listing: Listing;
  listings: readonly Listing[];
  draft: ProductDraftState;
  rounding: boolean;
  groupPercent: string | null | undefined;
  groupFixed: string | null | undefined;
  defaultEnabled: boolean;
  defaultPercent: string;
  defaultFixed: string;
  dispatch: Dispatch<ProductDraftAction>;
  onSelectSize: (listingId: string) => void;
  onRefresh: () => void;
}) {
  const local = currentListingDraft(draft, listing.id);
  const inHouse = listing.sources.find((source) => source.source === "in_house");
  const quantity = displayed(local.inHouseQuantity, inHouse?.quantity ?? 0);
  const cost = displayed(local.inHouseCost, inHouse?.cost ?? "");
  const margins = previewMargins({
    listing,
    local,
    groupPercent,
    groupFixed,
    defaultEnabled,
    defaultPercent,
    defaultFixed,
  });
  const lastSynced = latestSync(listing);
  const heading = `${listing.size} ${MIDDLE_DOT} ${t.panel.title}`;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-muted px-4 py-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={heading}
              className="flex items-center gap-1.5 text-left text-section font-bold"
            >
              <SizeLabel value={listing.size} />
              <span>
                {MIDDLE_DOT} {t.panel.title}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {listings.map((row) => (
              <DropdownMenuItem key={row.id} onSelect={() => onSelectSize(row.id)}>
                <SizeLabel value={row.size} className="text-cell" />
                {row.id === listing.id ? <Check className="ml-auto size-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-2">
          <p className="text-meta text-muted-foreground">
            {t.panel.lastSourceSync}{" "}
            <Timestamp value={lastSynced} variant="relative" />
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            {zhHant.common.refresh}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <PricePanel
          listing={listing}
          rounding={rounding}
          margins={margins}
          dispatch={dispatch}
          localPercent={
            local.marginOverride.kind === "set"
              ? (local.marginOverride.value.percent ?? "")
              : (listing.margin_override_percent ?? listing.margin_percent ?? "")
          }
          localFixed={
            local.marginOverride.kind === "set"
              ? (local.marginOverride.value.fixed ?? "")
              : (listing.margin_override_fixed ?? listing.margin_fixed ?? "")
          }
          inHouseCost={cost}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-cell font-medium">{t.sources.heading(listing.sources.length)}</p>
            <p className="text-meta text-muted-foreground">{t.sources.legend}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {listing.sources.map((source) => (
              <SourceCard
                key={source.source}
                listing={listing}
                source={source}
                quantity={quantity}
                cost={cost}
                onQuantity={
                  source.editable
                    ? (value) => dispatch({ type: "setInHouseQuantity", listingId: listing.id, value })
                    : undefined
                }
                onCost={
                  source.editable
                    ? (value) => dispatch({ type: "setInHouseCost", listingId: listing.id, value })
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        <SizeHistory listingId={listing.id} />

        <p className="rounded-md bg-info px-3 py-2 text-meta text-info-foreground">{t.sources.footnote}</p>
      </div>
    </div>
  );
}

function latestSync(listing: Listing): string | null {
  const times = listing.sources.map((source) => source.last_synced_at).filter((value): value is string => Boolean(value));
  if (times.length === 0) return null;
  return times.sort().at(-1) ?? null;
}

function previewMargins({
  listing,
  local,
  groupPercent,
  groupFixed,
  defaultEnabled,
  defaultPercent,
  defaultFixed,
}: {
  listing: Listing;
  local: ReturnType<typeof currentListingDraft>;
  groupPercent: string | null | undefined;
  groupFixed: string | null | undefined;
  defaultEnabled: boolean;
  defaultPercent: string;
  defaultFixed: string;
}) {
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
}
