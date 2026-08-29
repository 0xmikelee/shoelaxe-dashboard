import { describe, expect, it } from "vitest";
import { Iso, NonNegativeRate, Rate } from "@/lib/schemas/wire/common";
import { SettingsWire } from "@/lib/schemas/wire/settings";
import { withinBand } from "@/lib/domain/pricing";

describe("Iso accepts what Postgres actually emits", () => {
  it.each([
    "2026-08-24T01:00:00Z",
    "2026-08-24T01:00:00+00:00",
    "2026-08-24T09:00:00+08:00",
    "2026-08-24T01:00:00.123Z",
  ])("accepts %s", (v) => {
    expect(Iso.safeParse(v).success).toBe(true);
  });

  it("still rejects a naive local timestamp", () => {
    // No offset at all is genuinely ambiguous, and the server runs in Singapore while the user
    // reads Hong Kong time — this is the case that must not silently pass.
    expect(Iso.safeParse("2026-08-24T01:00:00").success).toBe(false);
  });
});

describe("approval thresholds are magnitudes", () => {
  it("rejects a negative threshold", () => {
    expect(NonNegativeRate.safeParse("-10").success).toBe(false);
    expect(Rate.safeParse("-10").success).toBe(true); // Rate itself still permits signed values
  });

  it("rejects a negative threshold through the settings schema", () => {
    const base = {
      auto_approve_up_percent: "10",
      auto_approve_down_percent: "10",
      default_margin_enabled: true,
      default_margin_percent: "12",
      default_margin_fixed: "0",
      rounding_enabled: true,
      crawl_cadence_minutes: 60,
      updated_at: "2026-08-24T01:00:00+00:00",
      updated_by_name: null,
    };
    expect(SettingsWire.safeParse(base).success).toBe(true);
    expect(
      SettingsWire.safeParse({ ...base, auto_approve_down_percent: "-10" }).success,
    ).toBe(false);
  });

  it("is why the guard exists: a negative down threshold would disable the whole lower band", () => {
    // Documents the failure the schema now prevents. With downPercent -10 no decrease can ever be
    // inside the band, so every price drop is held forever and nothing reports an error.
    const approved = 100_000;
    const drop = 95_000; // -5%, comfortably inside a 10% band
    expect(withinBand(drop, approved, { upPercent: 10, downPercent: 10 })).toBe(true);
    expect(withinBand(drop, approved, { upPercent: 10, downPercent: -10 })).toBe(false);
  });
});
