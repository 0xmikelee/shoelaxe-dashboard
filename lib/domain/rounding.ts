import { DomainError } from "@/lib/domain/types";

/** One hundred dollars: the block the x49/x99 tail is measured inside. */
const BLOCK_CENTS = 10_000;
const LOW_TAIL_CENTS = 4_900;
const HIGH_TAIL_CENTS = 9_900;

/**
 * §5's tail rounding: last two digits ≤ 49 → x49, 50–99 → x99 (1,901 → 1,949; 1,951 → 1,999).
 *
 * Stated in the brief over dollars — `base = floor(d/100)*100; rem = d - base; out = rem <= 49 ?
 * base+49 : base+99` — and evaluated here over integer cents, because HK$1,949.01 is not a value a
 * float dollar amount can hold and it is exactly the input that must land on 1,999 rather than 1,949.
 *
 * Two properties this must keep:
 *  - **Idempotent.** round(round(x)) === round(x). Ingest re-runs hourly and most runs change
 *    nothing; a rule that nudged an already-rounded price would walk every price up forever.
 *  - **rem = 0 raises.** 1,900 → 1,949, not 1,900. The rounded price is always strictly above the
 *    block floor, which is what makes the fixed point exactly {x49, x99}.
 *
 * Despite the name it is not monotonic in the last dollar of a block: 1,999.76 lands on 1,999.00,
 * because the brief's rule sends any remainder above 49 to x99 and 1,999.76's remainder is 99.76.
 * That is the brief's arithmetic, and it only bites on a raw price carrying cents.
 */
export function roundUpTo49Or99(cents: number, enabled: boolean): number {
  if (!Number.isSafeInteger(cents)) {
    throw new DomainError(`roundUpTo49Or99 expects integer cents, got ${cents}`);
  }
  if (!enabled) return cents;
  // A free or negative price has no tail to round, and raising it to x49 would invent a charge.
  if (cents <= 0) return cents;
  const base = Math.floor(cents / BLOCK_CENTS) * BLOCK_CENTS;
  const remainder = cents - base;
  return base + (remainder <= LOW_TAIL_CENTS ? LOW_TAIL_CENTS : HIGH_TAIL_CENTS);
}
