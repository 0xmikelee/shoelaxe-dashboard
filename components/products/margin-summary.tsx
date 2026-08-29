import { Money, MoneyRange } from "@/components/format/money";
import { Percent } from "@/components/format/percent";
import { zhHant } from "@/lib/i18n/zh-Hant";
import type { MarginSummary } from "@/lib/schemas/wire/products";

/**
 * 「18% + HK$100」 when every size agrees, 「10–20% + HK$100–200」 when they differ, 「—」 when the
 * product has no margins resolvable at all. The three cases are what Screen 7's 利潤 column shows,
 * and collapsing them into one would hide that a product is priced inconsistently across sizes.
 */
export function MarginSummaryCell({ summary }: { summary: MarginSummary }) {
  if (summary.kind === "none" || (!summary.percent && !summary.percent_range)) {
    return <span className="text-muted-foreground">{zhHant.common.unknown}</span>;
  }

  if (summary.kind === "uniform" && summary.percent !== null) {
    return (
      <span className="inline-flex items-center gap-1">
        <Percent value={summary.percent} />
        {summary.fixed ? (
          <>
            <span className="text-muted-foreground">+</span>
            <Money value={summary.fixed} />
          </>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {summary.percent_range ? (
        <>
          <Percent value={summary.percent_range.min} />
          <span className="text-muted-foreground">–</span>
          <Percent value={summary.percent_range.max} />
        </>
      ) : null}
      {summary.fixed_range ? (
        <>
          <span className="text-muted-foreground">+</span>
          <MoneyRange min={summary.fixed_range.min} max={summary.fixed_range.max} />
        </>
      ) : null}
    </span>
  );
}
