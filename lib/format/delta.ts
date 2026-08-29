import type { z } from "zod";
import type {
  ApprovalRowStatus as ApprovalRowStatusSchema,
  DeltaDirection as DeltaDirectionSchema,
} from "@/lib/schemas/wire/common";
import { formatDeltaPercent } from "@/lib/format/percent";
import { UNKNOWN } from "@/lib/format/punct";
import type { Tone } from "@/lib/format/tone";

/**
 * Type-only imports of the zod enums: this module needs their unions and none of their runtime, and
 * lib/format is imported by every table cell on every screen.
 */
export type ApprovalRowStatus = z.infer<typeof ApprovalRowStatusSchema>;
export type DeltaDirection = z.infer<typeof DeltaDirectionSchema>;

/**
 * Δ is coloured by **band membership**, never by direction. A price moving up is not "good news" —
 * both directions are equally worth a human's attention, which is the entire premise of the approval
 * queue. Direction is carried by a glyph instead, where it informs without editorialising.
 */
export type DeltaBand = "out_of_band" | "in_band" | "not_applicable";

/**
 * The server's stored decision, mapped. Never re-derived from the Δ just rendered: the band test ran
 * at full precision on `delta_percent_exact`, so a row showing `+10.0%` can be held on 10.04%, and a
 * client that re-checks `10.0 <= 10` disagrees with the badge sitting next to it.
 */
export const DELTA_BAND_BY_ROW_STATUS: Readonly<Record<ApprovalRowStatus, DeltaBand>> = {
  above_threshold: "out_of_band",
  below_threshold: "out_of_band",
  within_band: "in_band",
  // Δ is undefined for these three, not zero: a new listing has no approved price to measure from,
  // an unpriced one has no price, and a rejected one was never compared.
  pending_new: "not_applicable",
  needs_margins: "not_applicable",
  rejected: "not_applicable",
  superseded: "not_applicable",
};

export const TONE_BY_DELTA_BAND: Readonly<Record<DeltaBand, Tone>> = {
  out_of_band: "warning",
  in_band: "success",
  not_applicable: "neutral",
};

/** Direction is a glyph. `flat` gets none — the value already reads `0.0%`. */
export const DELTA_GLYPH: Readonly<Record<DeltaDirection, string>> = {
  up: "↑",
  down: "↓",
  flat: "",
};

export interface DeltaView {
  /** `+8.0%`, or `—` when Δ is undefined. */
  text: string;
  /** `↑`, `↓`, or empty. Prepended by the caller so it can be styled separately. */
  glyph: string;
  direction: DeltaDirection | null;
  band: DeltaBand;
  tone: Tone;
}

export interface DeltaInput {
  /** `ApprovalRow.status` — the server's stored decision, which owns the colour. */
  status: ApprovalRowStatus;
  /** `delta_percent`, the one-decimal display figure. Null means Δ does not exist for this row. */
  percent: string | number | null;
  /** `delta_direction` when the server sent one; otherwise derived from the displayed figure. */
  direction?: DeltaDirection | null;
}

/**
 * Everything a Δ cell needs, decided once. Note the direction fallback rounds through
 * `formatDeltaPercent` first, so the glyph can never contradict the number beside it: a +0.04% move
 * displays `0.0%` and gets no arrow.
 */
export function describeDelta({ status, percent, direction }: DeltaInput): DeltaView {
  const band = DELTA_BAND_BY_ROW_STATUS[status];
  const tone = TONE_BY_DELTA_BAND[band];
  if (percent === null || percent === undefined) {
    return { text: UNKNOWN, glyph: "", direction: null, band, tone };
  }
  const text = formatDeltaPercent(percent);
  const resolved = direction ?? directionOf(text);
  return { text, glyph: DELTA_GLYPH[resolved], direction: resolved, band, tone };
}

function directionOf(formatted: string): DeltaDirection {
  if (formatted.startsWith("+")) return "up";
  if (formatted.startsWith("-")) return "down";
  return "flat";
}

/**
 * The band test for a price that has **not** been decided yet — a Screen 2/3/4/8 preview of what a
 * margin change would do. It is the only legitimate consumer of `delta_percent_exact`, and it must
 * never be pointed at a stored row: that row's badge already carries the answer, computed against
 * the thresholds as they stood at the time rather than as they stand now.
 */
export function previewBand(
  exactPercent: number,
  thresholds: { upPercent: number; downPercent: number },
): DeltaBand {
  if (exactPercent >= 0) return exactPercent <= thresholds.upPercent ? "in_band" : "out_of_band";
  return -exactPercent <= thresholds.downPercent ? "in_band" : "out_of_band";
}
