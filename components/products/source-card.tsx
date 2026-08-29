"use client";

import { useEffect, useState } from "react";
import { Lock, Minus, Pencil, Plus, TrendingDown, TrendingUp } from "lucide-react";

import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { Percent } from "@/components/format/percent";
import { Timestamp } from "@/components/format/timestamp";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCents } from "@/lib/domain/money";
import { TONE_TEXT } from "@/lib/format/tone";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";
import type { Listing, ListingSource } from "@/lib/schemas/wire/listings";

const t = zhHant.productDetail.sources;

export function SourceCard({
  listing,
  source,
  quantity,
  cost,
  onQuantity,
  onCost,
}: {
  listing: Listing;
  source: ListingSource;
  quantity: number;
  cost: string;
  onQuantity?: (value: number) => void;
  onCost?: (value: string) => void;
}) {
  if (!source.editable) {
    return <ReadOnlySourceCard source={source} />;
  }
  return (
    <EditableSourceCard
      listing={listing}
      source={source}
      quantity={quantity}
      cost={cost}
      onQuantity={onQuantity}
      onCost={onCost}
    />
  );
}

function ReadOnlySourceCard({ source }: { source: ListingSource }) {
  const delta = sourceDelta(source);
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Lock className="size-3.5 text-muted-foreground" />
          <p className="text-cell font-medium">{t.stockxHeading}</p>
        </div>
        <StatusBadge label={t.readOnly} tone="neutral" />
      </header>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-meta text-muted-foreground">{t.asksLabel}</dt>
          <dd className="flex items-center gap-1 text-cell">
            <Lock className="size-3 text-muted-foreground" />
            <Num>{t.asks(source.quantity)}</Num>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-meta text-muted-foreground">{t.cost}</dt>
          <dd className="flex items-center gap-1">
            <Lock className="size-3 text-muted-foreground" />
            <Money value={source.cost} className="text-cell font-medium" />
          </dd>
        </div>
      </dl>
      <p className={cn("text-meta", delta ? (delta.down ? TONE_TEXT.error : TONE_TEXT.success) : "text-muted-foreground")}>
        {delta ? (
          <>
            {delta.down ? (
              <TrendingDown className="mr-1 inline size-3.5 align-[-2px]" />
            ) : (
              <TrendingUp className="mr-1 inline size-3.5 align-[-2px]" />
            )}
            {t.marketLow} <Money value={source.cost} />
            {" · "}
            {t.vsPrevious} <Percent value={delta.percent} variant="delta" />
          </>
        ) : (
          <>
            {t.marketLow} <Money value={source.cost} />
          </>
        )}
      </p>
    </article>
  );
}

function EditableSourceCard({
  listing,
  source,
  quantity,
  cost,
  onQuantity,
  onCost,
}: {
  listing: Listing;
  source: ListingSource;
  quantity: number;
  cost: string;
  onQuantity?: (value: number) => void;
  onCost?: (value: string) => void;
}) {
  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState(cost);
  const markup = listing.in_house_markup;

  useEffect(() => {
    setCostDraft(cost);
  }, [cost]);

  const commitCost = () => {
    setEditingCost(false);
    if (costDraft && costDraft !== cost) onCost?.(costDraft);
  };

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Pencil className="size-3.5 text-muted-foreground" />
          <p className="text-cell font-medium">{t.inHouseHeading}</p>
        </div>
        <StatusBadge label={t.inHouseEditable} tone="info" />
      </header>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-meta text-muted-foreground">{t.inventory}</dt>
          <dd>
            <div className="inline-flex items-center rounded-md border border-border">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t.decreaseQty}
                disabled={!onQuantity || quantity <= 0}
                onClick={() => onQuantity?.(Math.max(0, quantity - 1))}
              >
                <Minus />
              </Button>
              <Num className="min-w-12 text-center text-cell font-medium">
                {zhHant.common.pairs(quantity)}
              </Num>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t.increaseQty}
                disabled={!onQuantity}
                onClick={() => onQuantity?.(quantity + 1)}
              >
                <Plus />
              </Button>
            </div>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-meta text-muted-foreground">{t.cost}</dt>
          <dd>
            {editingCost ? (
              <Input
                autoFocus
                value={costDraft}
                aria-label={t.cost}
                className="h-7 text-cell"
                onChange={(event) => setCostDraft(event.target.value)}
                onBlur={commitCost}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitCost();
                  if (event.key === "Escape") {
                    setCostDraft(cost);
                    setEditingCost(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-cell font-medium"
                onClick={() => setEditingCost(true)}
              >
                <Money value={cost || source.cost} />
                <Pencil className="size-3 text-muted-foreground" />
              </button>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-meta text-muted-foreground">
        {markup ? (
          <span className={TONE_TEXT.success}>
            {zhHant.productDetail.price.markupOnCost}{" "}
            <Money value={markup.amount} signed className="font-medium" />
            {" "}
            （<Percent value={markup.percent} variant="rate" />）
          </span>
        ) : (
          zhHant.productDetail.price.markupUnavailable
        )}
        {" · "}
        <Timestamp value={source.last_synced_at} variant="semi" />
      </p>
    </article>
  );
}

/**
 * Gap 29: StockX cost *is* the lowest ask, so the footer reuses `cost` and names the movement
 * 較上次 against `previous_cost` rather than inventing a yesterday series.
 */
function sourceDelta(source: ListingSource): { percent: number; down: boolean } | null {
  if (!source.cost || !source.previous_cost) return null;
  const current = toCents(source.cost);
  const previous = toCents(source.previous_cost);
  if (previous === 0) return null;
  return {
    percent: ((current - previous) / previous) * 100,
    down: current < previous,
  };
}
