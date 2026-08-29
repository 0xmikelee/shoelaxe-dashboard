import type * as React from "react";

import { cn } from "@/lib/utils";

export type NumProps = React.ComponentProps<"span">;

/**
 * The mono rule, as a component. "Every number is Geist Mono" is the most characterful rule in the
 * design and the easiest to forget one cell at a time, so prices, sizes, quantities, percentages,
 * dates, times and SKUs all render through `.num` — which also brings `tabular-nums`, without which
 * the fixed-width table columns visibly wobble between rows.
 *
 * Deliberately size- and colour-neutral: a price cell, a size chip and a Δ value are all mono and
 * all differently sized, so the caller supplies both through `className`.
 */
export function Num({ className, ...props }: NumProps) {
  return <span data-slot="num" className={cn("num", className)} {...props} />;
}
