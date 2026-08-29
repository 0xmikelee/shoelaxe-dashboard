import { DomainError } from "@/lib/domain/types";

/**
 * Instants are compared as epoch milliseconds, never as strings: Postgres renders timestamptz as
 * `2026-08-24T01:00:00+00:00` and the ingest payload carries `2026-08-24T01:00:00Z`, which order
 * differently under a lexicographic compare and identically here.
 *
 * A malformed timestamp throws rather than sorting last. Base-cost ownership and supersede order both
 * hang off these comparisons, so a value that cannot be ordered must stop the write, not quietly lose.
 */
export function parseInstant(iso: string, field: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new DomainError(`${field}: not an ISO timestamp: ${JSON.stringify(iso)}`);
  }
  return ms;
}
