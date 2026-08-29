import { ApiError, type ErrorCode } from "@/lib/http/errors";

/**
 * How the frontend should *present* an error, decided once from the code rather than at each call
 * site. `lib/http/errors.ts` owns the code → HTTP status mapping; this owns code → affordance.
 */
export type ErrorHandling = "field" | "inline" | "toast" | "redirect" | "bug";

/**
 * The server's correlation id, which `ApiError` has no room for — on the server the handler knows
 * the id and the error does not. The envelope carries it precisely so a user can quote it, so the
 * client-side error has to hold on to it.
 */
export class ApiRequestError extends ApiError {
  readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { details?: unknown; requestId?: string } = {},
  ) {
    super(code, message, opts.details);
    this.name = "ApiRequestError";
    this.requestId = opts.requestId;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export const requestIdOf = (e: unknown): string | undefined =>
  e instanceof ApiRequestError ? e.requestId : undefined;

/** Gap 4 / Screen 4: a 409 `job_already_running` is adopt-the-job, not an error toast. */
export function jobIdFromError(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || error.code !== "job_already_running") return undefined;
  const details = error.details;
  if (!details || typeof details !== "object" || !("job_id" in details)) return undefined;
  const id = (details as { job_id: unknown }).job_id;
  return typeof id === "string" ? id : undefined;
}

/** Only these two. Everything else is a decision, not a failure, and retrying re-asks the question. */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["internal_error", "service_unavailable"]);

/**
 * Accepts a code or a thrown value. A non-`ApiError` throwable is a network or parse failure and is
 * retryable; an aborted request is not — the caller cancelled it on purpose, and retrying a cancelled
 * query is how a closed screen keeps fetching.
 */
export function isRetryable(x: ErrorCode | unknown): boolean {
  if (typeof x === "string") return RETRYABLE.has(x as ErrorCode);
  if (x instanceof ApiError) return RETRYABLE.has(x.code);
  if (x instanceof Error) return x.name !== "AbortError";
  return false;
}

/**
 * Exhaustive over `ErrorCode` — adding a code to lib/http/errors.ts fails this file to compile until
 * someone decides how it should read, which is the point.
 *
 * `bug` is not a cop-out bucket: it is reserved for codes that cannot legitimately reach a browser.
 * Four are machine-only (`/api/ingest`), four never travel as HTTP errors at all (they surface as
 * `job_items.reason` and `price_updates.outcome` inside a 200), two are dead under offset pagination,
 * one is dead because deleting a group reassigns rather than refuses, and `source_read_only` means
 * the read-only StockX card rendered an editable control.
 */
export const ERROR_HANDLING = {
  validation_failed: "field",

  unauthenticated: "redirect",
  session_expired: "redirect",
  not_allowed: "redirect",

  conflict: "inline",
  not_pending: "inline",
  job_already_running: "inline",
  job_not_retryable: "inline",
  default_group_immutable: "inline",
  listing_inactive: "inline",
  listing_not_in_product: "inline",
  needs_margins: "inline",
  not_found: "inline",
  payload_too_large: "inline",
  unsupported_media_type: "inline",
  image_too_large: "inline",
  image_limit_reached: "inline",

  internal_error: "toast",
  service_unavailable: "toast",

  invalid_json: "bug",
  method_not_allowed: "bug",
  source_read_only: "bug",
  invalid_cursor: "bug",
  cursor_sort_mismatch: "bug",
  group_not_empty: "bug",
  missing_key: "bug",
  invalid_key: "bug",
  run_mismatch: "bug",
  batch_too_large: "bug",
  unknown_sku: "bug",
  invalid_currency: "bug",
  invalid_size: "bug",
  missing_cost: "bug",
} as const satisfies Record<ErrorCode, ErrorHandling>;

export const handlingFor = (code: ErrorCode): ErrorHandling => ERROR_HANDLING[code];
