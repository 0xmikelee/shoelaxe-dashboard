import { parseInstant } from "@/lib/domain/time";
import type { ListingSourceSlot } from "@/lib/domain/types";

export interface SourceCost {
  slot: ListingSourceSlot;
  costCents: number | null;
  /**
   * `listing_sources.cost_at` — set only when a cost is written.
   *
   * Deliberately not `last_synced_at`: that column also moves on a quantity-only sync, so a StockX
   * ping carrying nothing but its constant quantity 1 would steal base-cost ownership from a newer
   * in-house cost and reprice the listing off a stale figure.
   */
  costAt: string | null;
}

export interface BaseCost {
  slot: ListingSourceSlot;
  costCents: number;
  costAt: string;
}

/**
 * §2: base_cost is the cost from the most recently applied price update, from either source.
 * Not `max(cost)` — the newest cost wins even when it is the lower one.
 *
 * `justWritten` breaks a tie in favour of the source this transaction just wrote, which is the only
 * ordering information left when two sources share a timestamp. With no tie-break available the
 * first candidate in input order wins, so the caller must pass sources in a stable order.
 */
export function pickBaseCost(
  sources: readonly SourceCost[],
  justWritten: ListingSourceSlot | null,
): BaseCost | null {
  let best: BaseCost | null = null;
  let bestAt = -Infinity;
  for (const source of sources) {
    // A source that has never reported a cost cannot own base_cost, however recently it synced.
    if (source.costCents === null || source.costAt === null) continue;
    const at = parseInstant(source.costAt, `cost_at for ${source.slot}`);
    if (at > bestAt || (at === bestAt && source.slot === justWritten)) {
      best = { slot: source.slot, costCents: source.costCents, costAt: source.costAt };
      bestAt = at;
    }
  }
  return best;
}
