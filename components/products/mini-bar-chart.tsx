"use client";

import { formatMoneyOrDash } from "@/lib/format/money";
import { TONE_SURFACE } from "@/lib/format/tone";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";
import type { HistoryRow } from "@/lib/schemas/wire/listings";

/**
 * Six bars, hand-rolled. A charting library for six points is not worth the bundle.
 * Colour follows price direction, matching the history table's 售價變化.
 */
export function MiniBarChart({ rows }: { rows: readonly HistoryRow[] }) {
  const t = zhHant.productDetail.trend;
  const points = [...rows].slice(0, 6).reverse();
  if (points.length === 0) {
    return <p className="text-meta text-muted-foreground">{t.empty}</p>;
  }

  const prices = points.map((row) => Number(row.price ?? row.previous_price ?? 0));
  const max = Math.max(...prices, 1);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-muted-foreground">{t.recentChanges}</p>
      <div className="flex h-24 items-end gap-2">
        {points.map((row) => {
          const value = Number(row.price ?? 0);
          const height = Math.max(8, Math.round((value / max) * 96));
          const up = row.delta !== null && Number(row.delta) > 0;
          const down = row.delta !== null && Number(row.delta) < 0;
          return (
            <div key={row.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                title={formatMoneyOrDash(row.price)}
                className={cn(
                  "w-full rounded-sm",
                  up && TONE_SURFACE.success,
                  down && TONE_SURFACE.error,
                  !up && !down && "bg-muted",
                )}
                style={{ height }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
