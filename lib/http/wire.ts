import type { ErrorCode } from "./errors";

/**
 * Client-safe wire types.
 *
 * lib/http/envelope.ts imports next/server, so it cannot be pulled into a client component. These
 * declarations are the shared vocabulary: envelope.ts builds them server-side, the frontend consumes
 * them, and there is exactly one definition of each.
 */

export type Meta = Record<string, unknown>;

export type Envelope<T, M extends Meta = Meta> = { data: T; meta?: M };

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    request_id?: string;
  };
}

/** Offset pagination. Cursor pagination was replaced so the design's page numbers and totals work. */
export interface Pagination {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** Rides on every list response so the UI can suppress publishing affordances without a round trip. */
export interface Publishing {
  enabled: boolean;
}

export function isErrorBody(x: unknown): x is ErrorBody {
  if (typeof x !== "object" || x === null || !("error" in x)) return false;
  const e = (x as { error: unknown }).error;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string" &&
    typeof (e as { message?: unknown }).message === "string"
  );
}
