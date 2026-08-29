import type * as React from "react";

import { describeDelta, type ApprovalRowStatus, type DeltaDirection } from "@/lib/format/delta";
import { TONE_TEXT } from "@/lib/format/tone";
import { DELTA_DIRECTION_LABEL } from "@/lib/i18n/enums";
import { cn } from "@/lib/utils";
import { Num, type NumProps } from "@/components/format/num";

export interface DeltaProps extends Omit<NumProps, "children"> {
  /** The server's stored decision. The colour comes from here, never from the number below it. */
  status: ApprovalRowStatus;
  /** `delta_percent` — the one-decimal display figure, not `delta_percent_exact`. */
  percent: string | number | null;
  /** `delta_direction` when the row carries one; otherwise derived from the displayed figure. */
  direction?: DeltaDirection | null;
}

/**
 * Colour by band membership, direction by glyph. A price moving up is not good news — both
 * directions are equally worth a human's attention, which is the whole premise of the queue — so
 * `↑` and `↓` share the out-of-band colour and differ only in the arrow.
 */
export function Delta({ status, percent, direction, className, ...props }: DeltaProps) {
  const view = describeDelta({ status, percent, direction });
  return (
    <Num
      data-band={view.band}
      data-direction={view.direction ?? undefined}
      className={cn(TONE_TEXT[view.tone], className)}
      {...props}
    >
      {view.glyph ? (
        <span aria-label={DELTA_DIRECTION_LABEL[view.direction ?? "flat"]}>{view.glyph}</span>
      ) : null}
      {view.text}
    </Num>
  );
}
