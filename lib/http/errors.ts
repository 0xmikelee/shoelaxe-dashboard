/**
 * The closed error contract. Every code maps to exactly one HTTP status — no code may be returned
 * with two different statuses, because the per-endpoint error lists in docs/API.md are a tested
 * contract and ambiguity there is untestable.
 *
 * Codes are added only when something actually emits them. `shopify_not_configured` and
 * `rate_limited` are deliberately absent: with publishing disabled the sync endpoints still enqueue
 * normally, and there is exactly one machine client behind one key. A declared code that nothing
 * emits corrupts the contract it is meant to document.
 */
export const ERROR_CODES = {
  // transport & envelope
  invalid_json: 400,
  validation_failed: 400,
  invalid_cursor: 400,
  cursor_sort_mismatch: 400,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  internal_error: 500,
  service_unavailable: 503,

  // auth
  missing_key: 401,
  invalid_key: 401,
  unauthenticated: 401,
  session_expired: 401,
  not_allowed: 403,

  // ingest (per item unless noted)
  run_mismatch: 409,
  batch_too_large: 413,
  unknown_sku: 422,
  invalid_currency: 422,
  invalid_size: 422,
  missing_cost: 422,

  // pricing & approval
  needs_margins: 409,
  not_pending: 409,
  listing_inactive: 409,
  source_read_only: 400,
  listing_not_in_product: 400,

  // groups & jobs
  default_group_immutable: 409,
  group_not_empty: 409,
  job_already_running: 409,
  job_not_retryable: 409,

  // images
  unsupported_media_type: 415,
  image_limit_reached: 409,
  image_too_large: 413,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = details;
  }
}

export const notFound = (what: string) => new ApiError("not_found", `${what} not found`);
