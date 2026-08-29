import { describe, expect, it } from "vitest";
import { ApiError, ERROR_CODES, type ErrorCode } from "@/lib/http/errors";
import {
  ApiRequestError,
  ERROR_HANDLING,
  handlingFor,
  isApiError,
  isRetryable,
  requestIdOf,
  jobIdFromError,
} from "@/lib/api/errors";

const ALL_CODES = Object.keys(ERROR_CODES) as ErrorCode[];

describe("isApiError", () => {
  it("recognises the base class and the client subclass", () => {
    expect(isApiError(new ApiError("not_found", "nope"))).toBe(true);
    expect(isApiError(new ApiRequestError("conflict", "raced"))).toBe(true);
  });

  it("does not claim plain errors or envelope-shaped objects", () => {
    expect(isApiError(new Error("boom"))).toBe(false);
    expect(isApiError({ code: "not_found", message: "nope" })).toBe(false);
  });
});

describe("ApiRequestError", () => {
  it("keeps the code's canonical status and carries the request id", () => {
    const e = new ApiRequestError("not_pending", "superseded", { requestId: "req-1", details: { a: 1 } });
    expect(e.status).toBe(409);
    expect(e.code).toBe("not_pending");
    expect(requestIdOf(e)).toBe("req-1");
    expect(e.details).toEqual({ a: 1 });
  });

  it("reports no request id for anything else", () => {
    expect(requestIdOf(new ApiError("conflict", "x"))).toBeUndefined();
    expect(requestIdOf("req-1")).toBeUndefined();
  });

  it("pulls job_id off job_already_running so Screen 4 can adopt the running job", () => {
    const e = new ApiRequestError("job_already_running", "live", {
      details: { job_id: "11111111-1111-4111-8111-111111111111" },
    });
    expect(jobIdFromError(e)).toBe("11111111-1111-4111-8111-111111111111");
    expect(jobIdFromError(new ApiError("conflict", "x"))).toBeUndefined();
    expect(jobIdFromError(new ApiError("job_already_running", "no details"))).toBeUndefined();
  });
});

describe("isRetryable", () => {
  it("retries only the two codes that mean 'the server, not the request'", () => {
    const retryable = ALL_CODES.filter((c) => isRetryable(c));
    expect(retryable.sort()).toEqual(["internal_error", "service_unavailable"]);
  });

  it("reads the code off a thrown ApiError", () => {
    expect(isRetryable(new ApiRequestError("service_unavailable", "down"))).toBe(true);
    // A 409 is a decision, not a failure; retrying it just re-asks the same question.
    expect(isRetryable(new ApiRequestError("conflict", "raced"))).toBe(false);
  });

  it("retries a network failure but never an abort", () => {
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(isRetryable(aborted)).toBe(false);
  });

  it("ignores values that are neither a code nor an error", () => {
    expect(isRetryable(undefined)).toBe(false);
    expect(isRetryable(503)).toBe(false);
  });
});

describe("handlingFor", () => {
  it("decides for every code in the union, and for no code outside it", () => {
    expect(Object.keys(ERROR_HANDLING).sort()).toEqual([...ALL_CODES].sort());
  });

  it("puts validation at the field and infrastructure in a toast", () => {
    expect(handlingFor("validation_failed")).toBe("field");
    expect(handlingFor("internal_error")).toBe("toast");
    expect(handlingFor("service_unavailable")).toBe("toast");
  });

  it("treats the world-moved codes as inline, next to the control", () => {
    for (const code of [
      "conflict",
      "not_pending",
      "job_already_running",
      "default_group_immutable",
      "listing_inactive",
    ] as const) {
      expect(handlingFor(code), code).toBe("inline");
    }
  });

  it("sends only the auth codes to a redirect", () => {
    const redirects = ALL_CODES.filter((c) => handlingFor(c) === "redirect");
    expect(redirects.sort()).toEqual(["not_allowed", "session_expired", "unauthenticated"]);
  });

  it("classes unreachable codes as bugs rather than user errors", () => {
    // source_read_only means the read-only StockX card rendered an editable control; the four
    // ingest outcomes and the two cursor codes cannot reach a browser at all.
    for (const code of [
      "source_read_only",
      "invalid_cursor",
      "cursor_sort_mismatch",
      "group_not_empty",
      "missing_key",
      "unknown_sku",
      "missing_cost",
    ] as const) {
      expect(handlingFor(code), code).toBe("bug");
    }
  });
});
