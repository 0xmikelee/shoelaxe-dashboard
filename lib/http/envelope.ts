import { NextResponse } from "next/server";
import { ApiError, ERROR_CODES, type ErrorCode } from "./errors";
import type { Meta } from "./wire";

/**
 * Success is `{data}` plus optional `{meta}`; failure is `{error}`. Never both.
 *
 * Re-exported, not redeclared: this module is server-only and wire.ts is the client-safe half of the
 * same envelope, so a second `Record<string, unknown>` here is a type the two sides could drift on.
 */
export type { Meta };

export function ok<T>(data: T, meta?: Meta, init?: ResponseInit): NextResponse {
  return NextResponse.json(meta ? { data, meta } : { data }, init);
}

export function fail(
  code: ErrorCode,
  message: string,
  opts: { details?: unknown; requestId?: string } = {},
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(opts.details !== undefined ? { details: opts.details } : {}),
        ...(opts.requestId ? { request_id: opts.requestId } : {}),
      },
    },
    { status: ERROR_CODES[code] },
  );
}

export function failFrom(e: ApiError, requestId?: string): NextResponse {
  return fail(e.code, e.message, { details: e.details, requestId });
}
