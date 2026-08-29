import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "@/lib/http/errors";

describe("error contract", () => {
  it("maps every code to exactly one status", () => {
    for (const [code, status] of Object.entries(ERROR_CODES)) {
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
  });

  it("declares no code the API cannot emit", () => {
    // Deliberate omissions — see the comment in lib/http/errors.ts.
    expect(ERROR_CODES).not.toHaveProperty("shopify_not_configured");
    expect(ERROR_CODES).not.toHaveProperty("rate_limited");
  });
});
