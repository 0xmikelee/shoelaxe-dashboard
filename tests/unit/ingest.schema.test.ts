import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IngestBody, IngestItem } from "@/lib/schemas/params/ingest";

const item = {
  product_name: "Air Jordan 1",
  product_sku: "555088-101",
  brand: "Jordan",
  size: "US 9",
  cost: "1200.00",
  quantity: 1,
  currency: "HKD",
  source: "google_sheet" as const,
  source_ref: "sheet:run:row:1",
  allow_create: true,
};

describe("IngestItem", () => {
  it("does not declare image_url or margin fields", () => {
    const json = z.toJSONSchema(IngestItem, { io: "input", target: "draft-2020-12" }) as {
      properties?: Record<string, unknown>;
    };
    const keys = Object.keys(json.properties ?? {});
    expect(keys).not.toContain("image_url");
    expect(keys).not.toContain("margin_percent");
    expect(keys).not.toContain("margin_fixed");
  });

  it("strips leftover image_url and margins from an old client", () => {
    const parsed = IngestItem.parse({
      ...item,
      image_url: "https://cdn.example/x.jpg",
      margin_percent: "15.0000",
      margin_fixed: "100.00",
    });
    expect(parsed).not.toHaveProperty("image_url");
    expect(parsed).not.toHaveProperty("margin_percent");
    expect(parsed).not.toHaveProperty("margin_fixed");
    expect(parsed.cost).toBe("1200.00");
  });

  it("defaults currency to HKD and allow_create to true", () => {
    const { currency, allow_create, ...rest } = item;
    void currency;
    void allow_create;
    const parsed = IngestItem.parse(rest);
    expect(parsed.currency).toBe("HKD");
    expect(parsed.allow_create).toBe(true);
  });
});

describe("IngestBody", () => {
  it("requires run.run_id", () => {
    expect(() =>
      IngestBody.parse({
        run: { source: "google_sheet", trigger: "manual", started_at: "2026-08-29T06:00:00+00:00" },
        updates: [item],
      }),
    ).toThrow();
  });

  it("accepts a valid batch", () => {
    const parsed = IngestBody.parse({
      run: {
        run_id: "11111111-1111-4111-8111-111111111111",
        source: "google_sheet",
        trigger: "manual",
        started_at: "2026-08-29T06:00:00+00:00",
      },
      updates: [item],
    });
    expect(parsed.updates).toHaveLength(1);
  });
});
