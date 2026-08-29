import { toCents } from "@/lib/domain/money";
import { DomainError } from "@/lib/domain/types";
import { EN_DASH, UNKNOWN } from "@/lib/format/punct";

/**
 * HKD display. Money arrives from the API as a numeric string and is integer cents inside the
 * domain; this module is the only place either becomes text, and it never converts text back.
 *
 * DomainError rather than a format-specific error type: a malformed money string already throws it
 * out of `toCents`, and two error classes meaning "this is not a price" would be one too many.
 */

/**
 * Hard-coded rather than taken from ICU.
 *
 * `Intl.NumberFormat("zh-Hant-HK", {style:"currency", currency:"HKD"})` does emit `HK$` on the
 * runtime this was written against — but the same call with `currencyDisplay:"narrowSymbol"` emits a
 * bare `$`, and a trimmed-ICU build resolves HKD differently again. On a page that is entirely about
 * money an ambiguous `$` is worse than a prefix that cannot drift with an ICU upgrade, so the symbol
 * is a literal and `ICU_HKD_SYMBOL` exists only to keep the assumption asserted.
 */
export const CURRENCY_PREFIX = "HK$";

/**
 * What ICU actually does on this runtime, exported so the paragraph above is asserted in
 * tests/unit/format.money.test.ts rather than believed. Nothing renders through it.
 */
export const ICU_HKD_SYMBOL: string =
  new Intl.NumberFormat("zh-Hant-HK", { style: "currency", currency: "HKD" })
    .formatToParts(1)
    .find((part) => part.type === "currency")?.value ?? "";

/**
 * en-US for grouping, not zh-Hant-HK: both group by three with a comma today, and pinning the
 * locale means a CLDR change to Chinese digit grouping (myriads) cannot silently reformat prices.
 */
const GROUPED = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface MoneyFormatOptions {
  /**
   * `+HK$110` / `-HK$110`. Deltas carry a sign; absolute amounts do not. A signed zero renders
   * `HK$0` — `+HK$0` claims a direction the number does not have.
   */
  signed?: boolean;
}

/**
 * `HK$1,530`, `HK$1,530.50`, `-HK$110`. Two decimals only when the cents are non-zero, which is
 * nearly never: §5's x49/x99 rounding lands every computed price on a whole dollar, and the
 * fractional case is a cost typed into the Google Sheet.
 *
 * The sign is placed ahead of the prefix by hand. Left to ICU this is `HK$-110`, which reads as a
 * currency called HK$- for the first half-second.
 */
export function formatCents(cents: number, options: MoneyFormatOptions = {}): string {
  if (!Number.isSafeInteger(cents)) {
    throw new DomainError(`formatCents expects integer cents, got ${cents}`);
  }
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const remainder = absolute % 100;
  // Assembled from the integer parts rather than by dividing: 999,999,999,999 cents / 100 is not
  // exactly representable, and a price is the last place to spend a float.
  const digits = remainder === 0
    ? GROUPED.format(whole)
    : `${GROUPED.format(whole)}.${String(remainder).padStart(2, "0")}`;
  const sign = cents < 0 ? "-" : cents > 0 && options.signed ? "+" : "";
  return `${sign}${CURRENCY_PREFIX}${digits}`;
}

/** The wire form: a numeric string such as `"1530.00"`, converted at the display boundary only. */
export function formatMoney(value: string, options?: MoneyFormatOptions): string {
  return formatCents(toCents(value), options);
}

/** Null is unknown and renders `—`. Zero is a price and renders `HK$0`. */
export function formatMoneyOrDash(value: string | null | undefined, options?: MoneyFormatOptions): string {
  return value === null || value === undefined ? UNKNOWN : formatMoney(value, options);
}

export function formatCentsOrDash(cents: number | null | undefined, options?: MoneyFormatOptions): string {
  return cents === null || cents === undefined ? UNKNOWN : formatCents(cents, options);
}

/** A signed money delta: `+HK$110`. */
export const formatMoneyDelta = (value: string): string => formatMoney(value, { signed: true });

export const formatCentsDelta = (cents: number): string => formatCents(cents, { signed: true });

/**
 * `HK$1,420–1,640`, the design's range form: the prefix appears once, on the low end. Collapses to a
 * single figure when both ends are equal, which is the common case for a one-size product.
 */
export function formatMoneyRange(min: string, max: string): string {
  const low = formatMoney(min);
  const high = formatMoney(max);
  if (low === high) return low;
  return `${low}${EN_DASH}${high.startsWith(CURRENCY_PREFIX) ? high.slice(CURRENCY_PREFIX.length) : high}`;
}
