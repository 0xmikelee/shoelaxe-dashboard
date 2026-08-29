"use client";

import { useEffect, useState, type Dispatch, type ReactNode } from "react";
import { Info, Link2, Lock, Pencil } from "lucide-react";

import { Money } from "@/components/format/money";
import { Percent } from "@/components/format/percent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeSellingPrice } from "@/lib/domain/pricing";
import { fromCents, percentOf, roundCents, toCents } from "@/lib/domain/money";
import { formatDateOnly } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { SOURCE_SLOT_LABEL } from "@/lib/i18n/enums";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";
import type { ProductDraftAction } from "@/lib/draft";
import type { Listing } from "@/lib/schemas/wire/listings";
import type { resolveMargins } from "@/lib/domain/margins";

const t = zhHant.productDetail;

export function PricePanel({
  listing,
  rounding,
  margins,
  dispatch,
  localPercent,
  localFixed,
  inHouseCost,
}: {
  listing: Listing;
  rounding: boolean;
  margins: ReturnType<typeof resolveMargins>;
  dispatch: Dispatch<ProductDraftAction>;
  localPercent: string;
  localFixed: string;
  inHouseCost: string;
}) {
  const [percent, setPercent] = useState(localPercent);
  const [fixed, setFixed] = useState(localFixed);
  const [editingPercent, setEditingPercent] = useState(false);
  const [editingFixed, setEditingFixed] = useState(false);

  useEffect(() => {
    setPercent(localPercent);
  }, [localPercent]);
  useEffect(() => {
    setFixed(localFixed);
  }, [localFixed]);

  const live = livePrice(listing.base_cost, percent, fixed, rounding);
  const percentAmount = liveAmount(listing.base_cost, percent);
  const selling = live ? fromCents(live.priceCents) : listing.approved_price;
  const markup = liveMarkup(live?.priceCents ?? null, inHouseCost);
  const baseHint = listing.base_cost_at
    ? `${t.price.latestChange} ${monthDay(listing.base_cost_at)}`
    : listing.base_cost_source
      ? t.price.baseCostFrom(SOURCE_SLOT_LABEL[listing.base_cost_source])
      : undefined;

  const commitMargins = () => {
    dispatch({
      type: "setMargin",
      listingId: listing.id,
      percent: percent || null,
      fixed: fixed || null,
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-cell font-medium">{t.price.title}</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label={t.price.title}>
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t.sources.footnote}</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-title font-bold">
            <Money value={selling} />
            <span className="ml-1 text-cell font-normal text-muted-foreground">{t.panel.perPair}</span>
          </p>
          {markup ? (
            <p className="text-meta text-muted-foreground">
              {t.price.markupOnCost}{" "}
              <Money value={markup.amount} signed className="font-medium text-success-foreground" />
              {" "}
              （<Percent value={markup.percent} variant="rate" />）
            </p>
          ) : (
            <p className="text-meta text-muted-foreground">{t.price.markupUnavailable}</p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-info px-2 py-0.5 text-badge font-semibold text-info-foreground">
          <Link2 className="size-3" />
          {t.panel.sharedPrice}
        </span>
      </header>

      <div className="flex flex-wrap items-stretch gap-2">
        <FormulaBox label={t.price.base} hint={baseHint} locked>
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3 text-muted-foreground" />
            <Money value={listing.base_cost} className="text-num font-bold" />
          </span>
        </FormulaBox>
        <Operator>×</Operator>
        <FormulaBox
          label={t.price.marginPercent}
          hint={percentAmount ? t.price.marginPercentValue(formatMoney(percentAmount, { signed: true })) : undefined}
        >
          {editingPercent ? (
            <Input
              autoFocus
              value={percent}
              aria-label={t.price.marginPercent}
              className="h-7 w-20 text-num font-bold"
              onChange={(event) => setPercent(event.target.value)}
              onBlur={() => {
                setEditingPercent(false);
                commitMargins();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setEditingPercent(false);
                  commitMargins();
                }
                if (event.key === "Escape") {
                  setPercent(localPercent);
                  setEditingPercent(false);
                }
              }}
            />
          ) : (
            <button type="button" className="inline-flex items-center gap-1" onClick={() => setEditingPercent(true)}>
              <Percent value={percent || margins?.percent} variant="rate" className="text-num font-bold" />
              <Pencil className="size-3 text-muted-foreground" />
            </button>
          )}
        </FormulaBox>
        <Operator>+</Operator>
        <FormulaBox label={t.price.marginFixed} hint={t.price.fixedHint}>
          {editingFixed ? (
            <Input
              autoFocus
              value={fixed}
              aria-label={t.price.marginFixed}
              className="h-7 w-24 text-num font-bold"
              onChange={(event) => setFixed(event.target.value)}
              onBlur={() => {
                setEditingFixed(false);
                commitMargins();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setEditingFixed(false);
                  commitMargins();
                }
                if (event.key === "Escape") {
                  setFixed(localFixed);
                  setEditingFixed(false);
                }
              }}
            />
          ) : (
            <button type="button" className="inline-flex items-center gap-1" onClick={() => setEditingFixed(true)}>
              <Money value={fixed || (margins ? fromCents(margins.fixedCents) : null)} className="text-num font-bold" />
              <Pencil className="size-3 text-muted-foreground" />
            </button>
          )}
        </FormulaBox>
        <Operator>=</Operator>
        <FormulaBox label={t.price.price} hint={t.price.appliesToShort(listing.sources.length)} accent>
          <Money value={selling} className="text-num font-bold" />
        </FormulaBox>
      </div>

      {margins?.source === "override" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => dispatch({ type: "clearMargin", listingId: listing.id })}
        >
          {t.marginPopover.clear}
        </Button>
      ) : null}
    </section>
  );
}

function FormulaBox({
  label,
  hint,
  locked,
  accent,
  children,
}: {
  label: string;
  hint?: string;
  locked?: boolean;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[108px] flex-1 flex-col gap-1 rounded-md border px-3 py-2",
        accent
          ? "border-primary bg-primary/15"
          : locked
            ? "border-border bg-muted"
            : "border-border bg-card",
      )}
    >
      <p className="text-meta text-muted-foreground">{label}</p>
      {children}
      {hint ? <p className="text-meta text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Operator({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center self-center text-section font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function livePrice(
  baseCost: string | null,
  percent: string,
  fixed: string,
  rounding: boolean,
): ReturnType<typeof computeSellingPrice> | null {
  if (!baseCost) return null;
  try {
    return computeSellingPrice(
      toCents(baseCost),
      { percent: percent ? Number(percent) : 0, fixedCents: fixed ? toCents(fixed) : 0 },
      rounding,
    );
  } catch {
    return null;
  }
}

function liveAmount(baseCost: string | null, percent: string): string | null {
  if (!baseCost || !percent) return null;
  try {
    return fromCents(roundCents(percentOf(toCents(baseCost), Number(percent))));
  } catch {
    return null;
  }
}

function liveMarkup(
  priceCents: number | null,
  cost: string | null,
): { amount: string; percent: number } | null {
  if (priceCents === null || !cost) return null;
  try {
    const costCents = toCents(cost);
    if (costCents === 0) return null;
    const amountCents = priceCents - costCents;
    return { amount: fromCents(amountCents), percent: (amountCents / costCents) * 100 };
  } catch {
    return null;
  }
}

function monthDay(iso: string): string {
  const parts = formatDateOnly(iso).split("-");
  return `${parts[1]}/${parts[2]}`;
}
