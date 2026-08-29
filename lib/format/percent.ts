import { DomainError } from "@/lib/domain/types";
import { EN_DASH, UNKNOWN } from "@/lib/format/punct";

/**
 * Margin rates are stored `numeric(8,4)` and arrive as strings like `"15.0000"`. Four decimals must
 * never reach a screen: the column is wide for arithmetic headroom, not because anyone prices a
 * shoe to a ten-thousandth of a percent.
 *
 * Two display registers, deliberately different:
 *   - editable contexts show one decimal always — `15.0%` — so a field does not appear to change
 *     shape when the user types `.5`;
 *   - badges and dense cells trim it — `18%`, `12.5%` — because a column of `.0` is noise.
 */

/** Matches `Rate` in lib/schemas/wire/common.ts. Duplicated for the same reason money's regex is. */
const RATE = /^-?\d+(\.\d{1,4})?$/;

export function toRate(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new DomainError(`not a finite rate: ${value}`);
    return value;
  }
  if (!RATE.test(value)) throw new DomainError(`not a rate string: ${JSON.stringify(value)}`);
  return Number(value);
}

/**
 * Split into magnitude and sign before rendering so `-0.04%` cannot come out as `-0.0%`. A value
 * that rounds to zero has no direction, and a minus sign in front of a zero reads as a bug.
 */
function parts(value: string | number, decimals: 0 | 1): { magnitude: string; negative: boolean } {
  const rate = toRate(value);
  const magnitude = Math.abs(rate).toFixed(decimals);
  return { magnitude, negative: rate < 0 && Number(magnitude) !== 0 };
}

/** Editable contexts: `15.0%`, `-2.5%`. One decimal, always. */
export function formatRate(value: string | number): string {
  const { magnitude, negative } = parts(value, 1);
  return `${negative ? "-" : ""}${magnitude}%`;
}

/** Badges and dense cells: `18%`, `12.5%`. Still rounded to one decimal first — never four. */
export function formatRateCompact(value: string | number): string {
  const { magnitude, negative } = parts(value, 1);
  const trimmed = magnitude.endsWith(".0") ? magnitude.slice(0, -2) : magnitude;
  return `${negative ? "-" : ""}${trimmed}%`;
}

/**
 * Δ percentages: one decimal and an explicit sign, `+8.0%` / `-2.9%`.
 *
 * Feed this `delta_percent` from the server and nothing else. Re-deriving Δ from two rounded money
 * strings produces a number that disagrees with the band decision, which was made at full precision:
 * a row can legitimately read `+10.0%` and still be held because the true figure was 10.04%.
 */
export function formatDeltaPercent(value: string | number): string {
  const { magnitude, negative } = parts(value, 1);
  const sign = Number(magnitude) === 0 ? "" : negative ? "-" : "+";
  return `${sign}${magnitude}%`;
}

export function formatRateOrDash(value: string | number | null | undefined): string {
  return value === null || value === undefined ? UNKNOWN : formatRate(value);
}

export function formatRateCompactOrDash(value: string | number | null | undefined): string {
  return value === null || value === undefined ? UNKNOWN : formatRateCompact(value);
}

export function formatDeltaPercentOrDash(value: string | number | null | undefined): string {
  return value === null || value === undefined ? UNKNOWN : formatDeltaPercent(value);
}

/** `10–20%`, the 尺寸差異 badge's range. The sign appears once, on the low end. */
export function formatRateRange(min: string | number, max: string | number): string {
  const low = formatRateCompact(min);
  const high = formatRateCompact(max);
  if (low === high) return low;
  return `${low.slice(0, -1)}${EN_DASH}${high}`;
}
