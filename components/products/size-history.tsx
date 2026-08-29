"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { Percent } from "@/components/format/percent";
import { Timestamp } from "@/components/format/timestamp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListingHistory } from "@/hooks/use-product";
import { TONE_TEXT } from "@/lib/format/tone";
import { arrow, joinDot } from "@/lib/format/punct";
import { formatMoneyOrDash } from "@/lib/format/money";
import { ACTOR_LABEL, SOURCE_SLOT_LABEL, isSystemActor } from "@/lib/i18n/enums";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";
import type { HistoryRow } from "@/lib/schemas/wire/listings";

const t = zhHant.productDetail.history;
const PAGE_SIZE = 5;

export function SizeHistory({ listingId }: { listingId: string }) {
  const [windowIndex, setWindowIndex] = useState(0);
  const history = useListingHistory(listingId, { page: 1, per_page: 20, order: "desc" });

  if (history.isPending) return <Skeleton className="h-40 w-full" />;
  if (!history.data || history.data.rows.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <h3 className="text-cell font-medium">{t.sizeTitle}</h3>
        <p className="text-meta text-muted-foreground">{t.empty}</p>
      </section>
    );
  }

  const { rows, meta } = history.data;
  const windows = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(windowIndex, windows - 1);
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-cell font-medium">
          {t.sizeTitle}{" "}
          <span className="font-normal text-muted-foreground">{t.sizePreview(slice.length, meta.total)}</span>
        </h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={page <= 0}
            aria-label={zhHant.common.previousPage}
            onClick={() => setWindowIndex(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <Num className="text-meta text-muted-foreground">{t.compactPage(page + 1, windows)}</Num>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={page >= windows - 1}
            aria-label={zhHant.common.nextPage}
            onClick={() => setWindowIndex(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">{t.columns.changedAt}</TableHead>
            <TableHead>{t.sourceOp}</TableHead>
            <TableHead className="w-[180px]">{t.columns.priceChange}</TableHead>
            <TableHead className="w-[140px]">{t.magnitude}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((row) => {
            const up = row.delta !== null && Number(row.delta) > 0;
            const down = row.delta !== null && Number(row.delta) < 0;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Timestamp value={row.changed_at} variant="absolute" className="text-meta" />
                </TableCell>
                <TableCell className="text-cell">{sourceOp(row)}</TableCell>
                <TableCell>
                  <span className={cn("text-cell", up && TONE_TEXT.success, down && TONE_TEXT.error)}>
                    {row.previous_price && row.price
                      ? arrow(formatMoneyOrDash(row.previous_price), formatMoneyOrDash(row.price))
                      : <Money value={row.price} />}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={cn("text-cell", up && TONE_TEXT.success, down && TONE_TEXT.error)}>
                    <Money value={row.delta} signed />
                    {row.delta_percent ? (
                      <Percent value={row.delta_percent} variant="delta" className="ml-1.5 text-meta" />
                    ) : null}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

function sourceOp(row: HistoryRow): string {
  if (isSystemActor(row.actor_label) || row.actor_label === ACTOR_LABEL.system) {
    if (row.source === "stockx") return joinDot(t.systemSync, SOURCE_SLOT_LABEL.stockx);
    if (row.source === "google_sheet") return joinDot(t.systemSync, SOURCE_SLOT_LABEL.in_house);
    return row.actor_label;
  }
  return joinDot(t.manualAdjust, row.actor_label);
}
