import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, grantedScopes, resetAccessTokenCache } from "@/lib/shopify/auth";
import type { ShopifyCredentials } from "@/lib/shopify/env";
import { ShopifyError } from "@/lib/shopify/errors";

const credentials: ShopifyCredentials = {
  storeDomain: "shoelaxe-test.myshopify.com",
  apiKey: "abcdef0123456789abcdef0123456789",
  apiSecret: "shpss_test-secret",
};

const DAY_SECONDS = 86_399;

function tokenResponse(accessToken: string, scope = "read_products,write_products") {
  return new Response(
    JSON.stringify({ access_token: accessToken, scope, expires_in: DAY_SECONDS }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAccessTokenCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAccessToken", () => {
  it("posts the client credentials grant to the store token endpoint", async () => {
    fetchMock.mockResolvedValue(tokenResponse("shpat_minted"));

    const token = await getAccessToken(credentials);

    expect(token).toBe("shpat_minted");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://shoelaxe-test.myshopify.com/admin/oauth/access_token");
    expect(init.method).toBe("POST");
    const body = Object.fromEntries(new URLSearchParams(init.body as string));
    expect(body).toEqual({
      grant_type: "client_credentials",
      client_id: credentials.apiKey,
      client_secret: credentials.apiSecret,
    });
  });

  it("reuses the cached token for the 24 hours it is valid", async () => {
    fetchMock.mockResolvedValue(tokenResponse("shpat_minted"));
    const start = Date.UTC(2026, 7, 29);

    await getAccessToken(credentials, start);
    await getAccessToken(credentials, start + 12 * 3600 * 1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(grantedScopes(credentials)).toBe("read_products,write_products");
  });

  it("re-mints before expiry so no request lands on a dead token", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("shpat_first"))
      .mockResolvedValueOnce(tokenResponse("shpat_second"));
    const start = Date.UTC(2026, 7, 29);

    await getAccessToken(credentials, start);
    const refreshed = await getAccessToken(credentials, start + (DAY_SECONDS - 30) * 1000);

    expect(refreshed).toBe("shpat_second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names the organization mismatch behind shop_not_permitted", async () => {
    fetchMock.mockImplementation(
      async () => new Response('{"error":"shop_not_permitted"}', { status: 401 }),
    );

    await expect(getAccessToken(credentials)).rejects.toThrow(/same Shopify organization/);
    await expect(getAccessToken(credentials)).rejects.toBeInstanceOf(ShopifyError);
  });

  it("does not cache a failed exchange", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("shpat_minted"));

    await expect(getAccessToken(credentials)).rejects.toThrow(/Client credentials grant failed/);
    await expect(getAccessToken(credentials)).resolves.toBe("shpat_minted");
  });
});
