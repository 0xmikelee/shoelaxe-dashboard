import type { ErrorCode } from "@/lib/http/errors";

/**
 * Error sets shared by the provisional contracts. Each route's `errors` list is **closed** — if a
 * code is not on it, the endpoint must not emit it — so these are floors to extend, never a default
 * to widen carelessly.
 *
 * Eleven codes never appear in any contract here, and the reasons are worth keeping written down
 * because each is a code someone will otherwise add back:
 *
 * - `invalid_cursor`, `cursor_sort_mismatch` — dead under offset pagination (Gap 3, locked).
 * - `group_not_empty` — Gap 14, resolved the way §6.2 states: deleting a group reassigns its
 *   products to 預設分組 and never refuses.
 * - `missing_key`, `invalid_key`, `run_mismatch`, `batch_too_large` — machine-only, on /api/ingest.
 * - `unknown_sku`, `invalid_currency`, `invalid_size`, `missing_cost` — never HTTP errors at all;
 *   they surface as `price_updates.outcome` and `job_items.reason` values inside a 200.
 */
export const SESSION_ERRORS = [
  "unauthenticated",
  "session_expired",
  "not_allowed",
  "internal_error",
  "service_unavailable",
] as const satisfies readonly ErrorCode[];

/** A read with query parameters: the query itself can fail validation. */
export const READ_ERRORS = [...SESSION_ERRORS, "validation_failed"] as const satisfies readonly ErrorCode[];

/** A write with a JSON body. `conflict` is added per route, not here — it means something specific. */
export const WRITE_ERRORS = [
  ...SESSION_ERRORS,
  "invalid_json",
  "validation_failed",
] as const satisfies readonly ErrorCode[];
