"use client";

import { Pagination } from "@/components/data-table/pagination";
import { Money } from "@/components/format/money";
import { Percent } from "@/components/format/percent";
import { SizeLabel } from "@/components/format/size-label";
import { Timestamp } from "@/components/format/timestamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHANGE_TYPE_LABEL } from "@/lib/i18n/enums";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { TONE_TEXT } from "@/lib/format/tone";
import { cn } from "@/lib/utils";
import { arrow } from "@/lib/format/punct";
import { formatMoneyOrDash } from "@/lib/format/money";
import type { HistoryListMeta, HistoryRow } from "@/lib/schemas/wire/listings";

const t = zhHant.productDetail.history;

export function HistoryTable({
  rows,
  meta,
  onPageChange,
}: {
  rows: readonly HistoryRow[];
  meta?: HistoryListMeta;
  onPageChange?: (page: number) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-meta text-muted-foreground">{t.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">{t.columns.changedAt}</TableHead>
            <TableHead className="w-[88px]">{t.columns.size}</TableHead>
            <TableHead className="w-[110px]">{t.columns.changeType}</TableHead>
            <TableHead>{t.columns.change}</TableHead>
            <TableHead className="w-[180px]">{t.columns.priceChange}</TableHead>
            <TableHead className="w-[140px]">{t.columns.actor}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const up = row.delta !== null && Number(row.delta) > 0;
            const down = row.delta !== null && Number(row.delta) < 0;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Timestamp value={row.changed_at} variant="absolute" className="text-meta" />
                </TableCell>
                <TableCell>
                  <SizeLabel value={row.size} className="text-cell" />
                </TableCell>
                <TableCell className="text-cell">{CHANGE_TYPE_LABEL[row.change_type]}</TableCell>
                <TableCell className="text-meta text-muted-foreground">
                  {row.previous_value && row.new_value
                    ? arrow(row.previous_value, row.new_value)
                    : (row.new_value ?? zhHant.common.unknown)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "text-cell",
                      up && TONE_TEXT.success,
                      down && TONE_TEXT.error,
                    )}
                  >
                    {row.previous_price && row.price
                      ? arrow(formatMoneyOrDash(row.previous_price), formatMoneyOrDash(row.price))
                      : <Money value={row.price} />}
                  </span>
                  {row.delta_percent ? (
                    <Percent value={row.delta_percent} variant="delta" className="ml-1.5 text-meta" />
                  ) : null}
                </TableCell>
                <TableCell className="text-meta text-muted-foreground">{row.actor_label}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {meta && onPageChange ? <Pagination meta={meta} onPageChange={onPageChange} /> : null}
    </div>
  );
}
