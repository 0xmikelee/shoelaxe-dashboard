import { describe, expect, it } from "vitest";
import { ERROR_COPY, errorCopy, errorMessage } from "@/lib/i18n/errors";
import { ERROR_HANDLING } from "@/lib/api/errors";
import { ApiError, ERROR_CODES, type ErrorCode } from "@/lib/http/errors";

const CODES = Object.keys(ERROR_CODES) as ErrorCode[];

describe("the record is exhaustive over the real union", () => {
  /**
   * The compile-time `satisfies Record<ErrorCode, string>` is the actual guard; this asserts the
   * same thing at runtime so the failure is legible when the union changes. When the backend deletes
   * `invalid_cursor` and `cursor_sort_mismatch` under offset pagination, both fail together.
   */
  it("has one entry per code in ERROR_CODES", () => {
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...CODES].sort());
  });

  it("carries a non-empty Chinese message for every code", () => {
    for (const code of CODES) {
      const copy = ERROR_COPY[code];
      expect(copy.code, code).toBe(code);
      expect(copy.message.length, code).toBeGreaterThan(0);
      // Any Han character. A message left in English is the failure this catches.
      expect(copy.message, code).toMatch(/[一-鿿]/);
    }
  });

  it("takes its affordance from lib/api/errors.ts rather than restating it", () => {
    for (const code of CODES) {
      expect(ERROR_COPY[code].handling, code).toBe(ERROR_HANDLING[code]);
    }
  });

  it("covers exactly the codes the API declares, no more and no fewer", () => {
    // Includes invalid_cursor and cursor_sort_mismatch, which are dead under offset pagination but
    // still in ERROR_CODES. When the backend removes them this fails until the copy goes too —
    // which is the point: the mapping tracks the union in both directions.
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...CODES].sort());
  });
});

describe("the copy says what the code means", () => {
  /** The expected race on Screen 1. It is an outcome, not a failure, and must not read like one. */
  it("reads not_pending as a supersession", () => {
    expect(ERROR_COPY.not_pending.message).toBe("此筆已被更新的價格取代。");
  });

  it("tells a not_allowed user what to do next", () => {
    expect(ERROR_COPY.not_allowed.message).toContain("聯絡系統管理員");
    expect(ERROR_COPY.not_allowed.handling).toBe("redirect");
  });

  it("keeps validation_failed off the toast path", () => {
    expect(ERROR_COPY.validation_failed.handling).toBe("field");
  });

  it("treats source_read_only as a frontend bug rather than a user error", () => {
    expect(ERROR_COPY.source_read_only.handling).toBe("bug");
  });
});

describe("errorCopy", () => {
  it("accepts a code", () => {
    expect(errorCopy("needs_margins").message).toBe(ERROR_COPY.needs_margins.message);
  });

  it("accepts a thrown ApiError", () => {
    expect(errorCopy(new ApiError("conflict", "boom")).code).toBe("conflict");
  });

  /** A fetch that never reached the server is the server being unreachable, not a server bug. */
  it("falls back to service_unavailable for a network failure", () => {
    expect(errorCopy(new TypeError("Failed to fetch")).code).toBe("service_unavailable");
    expect(errorCopy("not_a_code").code).toBe("service_unavailable");
    expect(errorCopy(undefined).code).toBe("service_unavailable");
  });

  it("exposes the message directly", () => {
    expect(errorMessage("not_found")).toBe(ERROR_COPY.not_found.message);
  });
});
