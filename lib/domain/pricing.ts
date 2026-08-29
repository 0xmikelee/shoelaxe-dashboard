import { percentOf, roundCents, sumCents } from "@/lib/domain/money";
import { roundUpTo49Or99 } from "@/lib/domain/rounding";
import { DomainError, type ApprovalBand } from "@/lib/domain/types";
import type { MarginPair } from "@/lib/domain/margins";

export interface PriceComputation {
  /** cost + cost × margin% / 100 + margin_fixed, before the x49/x99 tail. Gap 2's `raw_price`. */
  rawCents: number;
  /** What the listing is actually priced at. */
  priceCents: number;
  /** False when rounding is off or the raw figure already ended in 49/99 — Gap 2 hides the arrow. */
  roundingApplied: boolean;
}

/**
 * §5's selling price. Both steps come back because the design's formula previews render both, and
 * this function is imported by those client components so the preview cannot drift from the decision
 * (API-GAPS Gap 2).
 */
export function computeSellingPrice(
  baseCostCents: number,
  margins: MarginPair,
  roundingEnabled: boolean,
): PriceComputation {
  if (!Number.isSafeInteger(baseCostCents)) {
    throw new DomainError(`base cost must be integer cents, got ${baseCostCents}`);
  }
  const rawCents = roundCents(
    sumCents(baseCostCents, percentOf(baseCostCents, margins.percent), margins.fixedCents),
  );
  const priceCents = roundUpTo49Or99(rawCents, roundingEnabled);
  return { rawCents, priceCents, roundingApplied: priceCents !== rawCents };
}

/**
 * Δ for display, in percent, signed. Never for the band decision — see withinBand.
 * The caller guards the denominator; the throw is a backstop, not a control path.
 */
export function deltaPercent(priceCents: number, approvedPriceCents: number): number {
  if (approvedPriceCents === 0) {
    throw new DomainError("delta is undefined against an approved price of zero");
  }
  return ((priceCents - approvedPriceCents) / approvedPriceCents) * 100;
}

/**
 * The band test, inclusive at both ends, computed by cross-multiplication rather than from
 * deltaPercent().
 *
 * A literal `delta <= up` reads the boundary wrong on real inputs: at an approved HK$2,084.80 with a
 * 13.75% band, the exactly-on-the-boundary price HK$2,371.46 divides out to 13.750000000000002 and is
 * held. `diff × 100 ≤ approved × up` stays integral for whole-percent bands and exact here.
 *
 * Precondition: approvedPriceCents > 0. decide() guards zero and null before reaching here.
 */
export function withinBand(
  priceCents: number,
  approvedPriceCents: number,
  band: ApprovalBand,
): boolean {
  const diff = priceCents - approvedPriceCents;
  return diff >= 0
    ? diff * 100 <= approvedPriceCents * band.upPercent
    : -diff * 100 <= approvedPriceCents * band.downPercent;
}
