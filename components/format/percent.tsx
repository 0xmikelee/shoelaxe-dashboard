import type * as React from "react";

import {
  formatDeltaPercentOrDash,
  formatRateCompactOrDash,
  formatRateOrDash,
} from "@/lib/format/percent";
import { Num, type NumProps } from "@/components/format/num";

/**
 * `rate` is the editable register — one decimal always, `15.0%`. `compact` is the badge and dense
 * cell register — `18%`, `12.5%`. `delta` always carries a sign. None of them can emit the four
 * decimals the `numeric(8,4)` column actually holds.
 */
export type PercentVariant = "rate" | "compact" | "delta";

export interface PercentProps extends Omit<NumProps, "children"> {
  value: string | number | null | undefined;
  variant?: PercentVariant;
}

const FORMAT: Record<PercentVariant, (value: string | number | null | undefined) => string> = {
  rate: formatRateOrDash,
  compact: formatRateCompactOrDash,
  delta: formatDeltaPercentOrDash,
};

export function Percent({ value, variant = "compact", ...props }: PercentProps) {
  return <Num {...props}>{FORMAT[variant](value)}</Num>;
}
