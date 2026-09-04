import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http/errors";
import { getEnv } from "@/lib/env";

export const INGEST_KEY_HEADER = "x-shoelaxe-key";

/**
 * Compare the ingest key without leaking length via early-return. Length mismatch still runs a
 * dummy compare so a shorter guess is not a faster 401.
 */
export function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function assertIngestKey(req: Request): void {
  const provided = req.headers.get(INGEST_KEY_HEADER);
  if (provided == null || provided === "") {
    throw new ApiError("missing_key", "X-Shoelaxe-Key header is missing");
  }
  const expected = getEnv().INGEST_SECRET;
  if (!keysMatch(provided, expected)) {
    throw new ApiError("invalid_key", "X-Shoelaxe-Key header is invalid");
  }
}
