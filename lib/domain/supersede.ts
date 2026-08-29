import { parseInstant } from "@/lib/domain/time";

export interface UnapprovedUpdate {
  /** price_updates.id */
  id: string;
  /**
   * `coalesce(observed_at, received_at)`. Arrival order is not observation order — a retried chunk
   * can deliver an hour-old crawl after a fresh one — so ordering is always on observation.
   */
  observedAt: string;
}

export interface SupersedeInput {
  incoming: UnapprovedUpdate;
  /**
   * Every still-unapproved price_updates row on this listing, in any order. The incoming row is
   * expected to be among them: ingest inserts it before deciding, and it is filtered out by id here.
   */
  unapproved: readonly UnapprovedUpdate[];
  /** `listings.base_cost_at`, or NULL for a listing that has never carried a cost. */
  baseCostAt: string | null;
}

export interface SupersedeResult {
  /**
   * False when the incoming observation predates base_cost_at: the row is recorded and superseded,
   * and base_cost does not move. Replaying an old crawl must not walk the price backwards.
   */
  applies: boolean;
  /** price_updates ids to stamp `outcome = 'superseded'`. */
  superseded: string[];
  /**
   * `listings.pending_since`. Kept from the OLDEST unapproved observation, never reset by the newer
   * one that replaced it — the queue answers "how long has this listing been waiting", not "how long
   * has this proposal been waiting". The caller clears it when the decision approves or no-changes.
   */
  pendingSince: string | null;
}

function oldest(updates: readonly UnapprovedUpdate[]): string | null {
  let best: string | null = null;
  let bestAt = Infinity;
  for (const update of updates) {
    const at = parseInstant(update.observedAt, `observed_at for ${update.id}`);
    if (at < bestAt) {
      best = update.observedAt;
      bestAt = at;
    }
  }
  return best;
}

/**
 * Latest wins: one pending price per listing (§5). The newest observation owns it and every other
 * unapproved row on the listing becomes `superseded`.
 *
 * A tie goes to the incoming row — a re-observation at the same instant is still the later word — and
 * so does an observation exactly at base_cost_at, since that is the update that set it.
 */
export function supersede(input: SupersedeInput): SupersedeResult {
  const { incoming, baseCostAt } = input;
  const others = input.unapproved.filter((u) => u.id !== incoming.id);
  const incomingAt = parseInstant(incoming.observedAt, `observed_at for ${incoming.id}`);

  if (baseCostAt !== null && incomingAt < parseInstant(baseCostAt, "base_cost_at")) {
    return { applies: false, superseded: [incoming.id], pendingSince: oldest(others) };
  }

  return {
    applies: true,
    superseded: others.map((u) => u.id),
    pendingSince: oldest([...others, incoming]),
  };
}
