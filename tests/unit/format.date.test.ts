import { describe, expect, it } from "vitest";
import {
  TIME_ZONE,
  formatAbsolute,
  formatAbsoluteOrDash,
  formatDateOnly,
  formatRelative,
  formatRelativeOrDash,
  formatSemiAbsolute,
  formatSemiAbsoluteOrDash,
  formatTimeOnly,
} from "@/lib/format/date";
import { EM_DASH } from "@/lib/format/punct";
import { DomainError } from "@/lib/domain/types";

/** 2026-08-24 09:00 Hong Kong. Every fixture below is stated in UTC and read in HKT. */
const NOW = Date.parse("2026-08-24T01:00:00Z");

describe("the time zone is Hong Kong, not the host's", () => {
  it("is stated explicitly", () => {
    expect(TIME_ZONE).toBe("Asia/Hong_Kong");
  });

  /**
   * The server runs in Singapore, which is UTC+8 like Hong Kong — so a bare toLocaleString() looks
   * right in staging and is wrong for any host that is not. This asserts the offset is applied
   * rather than inherited.
   */
  it("renders a UTC instant at +08:00", () => {
    expect(formatAbsolute("2026-08-24T01:00:00Z")).toBe("2026-08-24 09:00");
    expect(formatAbsolute("2026-08-23T16:00:00Z")).toBe("2026-08-24 00:00");
    expect(formatAbsolute("2026-08-23T15:59:00Z")).toBe("2026-08-23 23:59");
  });

  it("renders midnight as 00:00 and never as 24:00", () => {
    expect(formatTimeOnly("2026-08-23T16:00:00Z")).toBe("00:00");
  });
});

describe("absolute forms", () => {
  it("is 24-hour and zero-padded", () => {
    expect(formatAbsolute("2026-01-05T01:05:00Z")).toBe("2026-01-05 09:05");
    expect(formatAbsolute("2026-08-24T13:00:00Z")).toBe("2026-08-24 21:00");
  });

  it("splits into a date and a time", () => {
    expect(formatDateOnly("2026-08-24T01:00:00Z")).toBe("2026-08-24");
    expect(formatTimeOnly("2026-08-24T01:00:00Z")).toBe("09:00");
  });

  it("accepts a Date and an epoch as well as an ISO string", () => {
    expect(formatAbsolute(new Date(NOW))).toBe("2026-08-24 09:00");
    expect(formatAbsolute(NOW)).toBe("2026-08-24 09:00");
  });

  it("throws on a timestamp it cannot parse rather than rendering Invalid Date", () => {
    expect(() => formatAbsolute("yesterday")).toThrow(DomainError);
  });
});

describe("formatSemiAbsolute", () => {
  it.each([
    ["2026-08-24T01:00:00Z", "今日 09:00"],
    ["2026-08-23T01:00:00Z", "昨日 09:00"],
    ["2026-08-12T01:00:00Z", "8月12日 09:00"],
    ["2025-08-12T01:00:00Z", "2025年8月12日 09:00"],
  ])("renders %s as %s", (value, expected) => {
    expect(formatSemiAbsolute(value, NOW)).toBe(expected);
  });

  /**
   * 今日 is a calendar answer in Hong Kong, not "within the last 24 hours": 23:30 last night is 昨日
   * even though it is 9.5 hours ago, and 00:30 this morning is 今日 even though it is a different
   * UTC day.
   */
  it("decides 今日 and 昨日 on the Hong Kong calendar", () => {
    expect(formatSemiAbsolute("2026-08-23T15:30:00Z", NOW)).toBe("昨日 23:30");
    expect(formatSemiAbsolute("2026-08-23T16:30:00Z", NOW)).toBe("今日 00:30");
  });

  it("does not zero-pad the Chinese month and day", () => {
    expect(formatSemiAbsolute("2026-01-05T01:00:00Z", NOW)).toBe("1月5日 09:00");
    expect(formatSemiAbsolute("2025-01-05T01:00:00Z", NOW)).toBe("2025年1月5日 09:00");
  });
});

describe("formatRelative", () => {
  it.each([
    [0, "剛剛"],
    [30_000, "剛剛"],
    [60_000, "1 分鐘前"],
    [12 * 60_000, "12 分鐘前"],
    [59 * 60_000, "59 分鐘前"],
    [60 * 60_000, "1 小時前"],
    [3 * 60 * 60_000, "3 小時前"],
    [23 * 60 * 60_000, "23 小時前"],
    [24 * 60 * 60_000, "1 天前"],
    [5 * 24 * 60 * 60_000, "5 天前"],
  ])("renders %i ms ago as %s", (ago, expected) => {
    expect(formatRelative(NOW - ago, NOW)).toBe(expected);
  });

  it("falls back to the semi-absolute form past a month", () => {
    expect(formatRelative(NOW - 40 * 24 * 60 * 60_000, NOW)).toBe("7月15日 09:00");
  });

  /** Clock skew between the crawler's host and the browser is real; "-1 分鐘前" is not a thing. */
  it("renders a future timestamp as 剛剛", () => {
    expect(formatRelative(NOW + 5 * 60_000, NOW)).toBe("剛剛");
  });

  it("takes an injectable now so a test is not a function of the wall clock", () => {
    expect(formatRelative(Date.now() - 12 * 60_000)).toBe("12 分鐘前");
  });
});

describe("nullable variants", () => {
  it("render the em dash for unknown", () => {
    expect(formatAbsoluteOrDash(null)).toBe(EM_DASH);
    expect(formatSemiAbsoluteOrDash(null, NOW)).toBe(EM_DASH);
    expect(formatRelativeOrDash(undefined, NOW)).toBe(EM_DASH);
  });

  it("pass the value through when it exists", () => {
    expect(formatAbsoluteOrDash("2026-08-24T01:00:00Z")).toBe("2026-08-24 09:00");
    expect(formatSemiAbsoluteOrDash("2026-08-24T01:00:00Z", NOW)).toBe("今日 09:00");
    expect(formatRelativeOrDash("2026-08-24T00:48:00Z", NOW)).toBe("12 分鐘前");
  });
});
