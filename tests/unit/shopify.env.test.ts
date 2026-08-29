import { describe, expect, it } from "vitest";
import { parseShopifyEnv } from "@/lib/shopify/env";

const KEY = "abcdef0123456789abcdef0123456789";
const SECRET = "shpss_test-secret";

describe("parseShopifyEnv", () => {
  it("normalises a URL to the myshopify host", () => {
    const env = parseShopifyEnv({
      SHOPIFY_STORE_DOMAIN: "https://Shoelaxe-Test.myshopify.com/admin",
      SHOPIFY_API_KEY: ` ${KEY} `,
      SHOPIFY_API_SECRET: ` ${SECRET} `,
    });
    expect(env.storeDomain).toBe("shoelaxe-test.myshopify.com");
    expect(env.apiKey).toBe(KEY);
    expect(env.apiSecret).toBe(SECRET);
  });

  it("rejects .my-shopify.com", () => {
    expect(() =>
      parseShopifyEnv({
        SHOPIFY_STORE_DOMAIN: "shoelaxe-test.my-shopify.com",
        SHOPIFY_API_KEY: KEY,
        SHOPIFY_API_SECRET: SECRET,
      }),
    ).toThrow(/myshopify\.com/);
  });

  it("rejects an access token pasted where the secret belongs", () => {
    expect(() =>
      parseShopifyEnv({
        SHOPIFY_STORE_DOMAIN: "shoelaxe-test.myshopify.com",
        SHOPIFY_API_KEY: KEY,
        SHOPIFY_API_SECRET: "shpat_a-minted-access-token",
      }),
    ).toThrow(/access token/);
  });

  it("rejects the secret pasted where the key belongs", () => {
    expect(() =>
      parseShopifyEnv({
        SHOPIFY_STORE_DOMAIN: "shoelaxe-test.myshopify.com",
        SHOPIFY_API_KEY: SECRET,
        SHOPIFY_API_SECRET: SECRET,
      }),
    ).toThrow(/SHOPIFY_API_SECRET/);
  });

  it("fails closed on a missing credential rather than skipping", () => {
    expect(() =>
      parseShopifyEnv({ SHOPIFY_STORE_DOMAIN: "shoelaxe-test.myshopify.com" }),
    ).toThrow(/SHOPIFY_API_KEY/);
    expect(() =>
      parseShopifyEnv({
        SHOPIFY_STORE_DOMAIN: "shoelaxe-test.myshopify.com",
        SHOPIFY_API_KEY: KEY,
      }),
    ).toThrow(/SHOPIFY_API_SECRET/);
  });

  it("requires a location only when asked", () => {
    expect(() =>
      parseShopifyEnv(
        {
          SHOPIFY_STORE_DOMAIN: "shoelaxe-test.myshopify.com",
          SHOPIFY_API_KEY: KEY,
          SHOPIFY_API_SECRET: SECRET,
        },
        { requireLocation: true },
      ),
    ).toThrow(/SHOPIFY_LOCATION_ID/);
  });
});
