import type * as React from "react";

import { formatMoneyOrDash, formatMoneyRange } from "@/lib/format/money";
import { Num, type NumProps } from "@/components/format/num";

export interface MoneyProps extends Omit<NumProps, "children"> {
  /**
   * The wire form: a numeric string such as `"1530.00"`. `null` is unknown and renders `—`; zero is
   * a price and renders `HK$0`. On Screen 1 both are real and they mean different things.
   *
   * Cents are deliberately not accepted: a component taking `string | number` invites `1530` to be
   * read as dollars. A caller holding integer cents from lib/domain formats with `formatCents`.
   */
  value: string | null | undefined;
  /** `+HK$110`. Deltas carry a sign; absolute amounts do not. */
  signed?: boolean;
}

export function Money({ value, signed, ...props }: MoneyProps) {
  return <Num {...props}>{formatMoneyOrDash(value, { signed })}</Num>;
}

export interface MoneyRangeProps extends Omit<NumProps, "children"> {
  min: string;
  max: string;
}

/** `HK$1,420–1,640`, collapsing to one figure when the ends match. */
export function MoneyRange({ min, max, ...props }: MoneyRangeProps) {
  return <Num {...props}>{formatMoneyRange(min, max)}</Num>;
}
