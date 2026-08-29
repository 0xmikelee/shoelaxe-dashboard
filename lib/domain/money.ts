import { DomainError } from "@/lib/domain/types";

/**
 * The only place money changes representation. Money crosses the wire and arrives from Postgres as a
 * numeric STRING; inside the domain it is integer cents. Nothing else in the codebase may parseFloat
 * a price — one rounding of a binary float in the pricing path is a wrong price on a live product.
 *
 * The accepted shape is the same regex as `Money` in lib/schemas/wire/common.ts, duplicated rather
 * than imported because that module pulls in zod and lib/http, and lib/domain is client-importable
 * and dependency-free by rule.
 */
const MONEY = /^-?\d+(\.\d{1,2})?$/;

/** numeric(12,2) tops out at 9,999,999,999.99 — a full order of magnitude inside Number.MAX_SAFE_INTEGER. */
export const MAX_CENTS = 999_999_999_999;

export function toCents(value: string): number {
  if (!MONEY.test(value)) {
    throw new DomainError(`not a money string: ${JSON.stringify(value)}`);
  }
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = body.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    throw new DomainError(`money out of range: ${value}`);
  }
  return negative ? -cents : cents;
}

/**
 * Back to the wire. Always two decimals, so `toCents(fromCents(c)) === c` for every representable
 * value and a numeric(12,2) column round-trips unchanged.
 */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS) {
    throw new DomainError(`not an integer cent amount: ${cents}`);
  }
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const dollars = Math.trunc(absolute / 100);
  const remainder = absolute % 100;
  return `${negative ? "-" : ""}${dollars}.${String(remainder).padStart(2, "0")}`;
}

/** Nullable columns are the common case: a listing_sources row may never have carried a cost. */
export function toCentsOrNull(value: string | null): number | null {
  return value === null ? null : toCents(value);
}

export function fromCentsOrNull(cents: number | null): string | null {
  return cents === null ? null : fromCents(cents);
}

/**
 * Exact sum, deliberately NOT rounded: the §5 formula rounds once at the end, matching what Postgres
 * numeric does when the result lands in a numeric(12,2) column. Rounding each term instead would put
 * the TS engine and `compute_listing_price` a cent apart on some inputs.
 */
export function sumCents(...values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new DomainError(`not a finite cent amount: ${value}`);
    }
    total += value;
  }
  return total;
}

/** The multiplication half: cents × a percentage rate, exact and possibly fractional. */
export function percentOf(cents: number, percent: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(percent)) {
    throw new DomainError(`percentOf(${cents}, ${percent}) is not finite`);
  }
  return (cents * percent) / 100;
}

/** Collapse a fractional cent amount to a whole cent, once, at the end of a calculation. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DomainError(`cannot round ${value} to cents`);
  }
  const cents = Math.round(value);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS) {
    throw new DomainError(`money out of range: ${value}`);
  }
  return cents;
}
