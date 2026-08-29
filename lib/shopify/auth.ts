/**
 * Client credentials grant.
 *
 * Shopify no longer issues static Admin API tokens: Dev Dashboard apps exchange their own
 * `client_id` / `client_secret` for an access token, with no merchant interaction. The token is
 * valid for 24 hours (`expires_in` is 86399), so it is cached in memory and re-minted on expiry
 * rather than requested per call.
 *
 * https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
 */
import { ShopifyError } from "@/lib/shopify/errors";
import type { ShopifyCredentials } from "@/lib/shopify/env";

/** Re-mint this far before the stated expiry so an in-flight request cannot land on a dead token. */
const REFRESH_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scope: string;
}

const cache = new Map<string, CachedToken>();

/** The secret is never part of the key: two apps on one store differ by client id already. */
function cacheKey(credentials: ShopifyCredentials): string {
  return `${credentials.storeDomain}:${credentials.apiKey}`;
}

/** Test-only, and for a script that wants to prove the exchange rather than reuse a cached token. */
export function resetAccessTokenCache(): void {
  cache.clear();
}

/** The scopes Shopify granted on the last exchange, or undefined before the first one. */
export function grantedScopes(credentials: ShopifyCredentials): string | undefined {
  return cache.get(cacheKey(credentials))?.scope;
}

export async function getAccessToken(
  credentials: ShopifyCredentials,
  now: number = Date.now(),
): Promise<string> {
  const key = cacheKey(credentials);
  const cached = cache.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now) return cached.accessToken;

  const url = `https://${credentials.storeDomain}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credentials.apiKey,
      client_secret: credentials.apiSecret,
    }),
  });
  const text = await res.text();

  if (!res.ok) {
    // Two failures here are about the app's relationship to the store, not about the credentials,
    // and Shopify's own error text says nothing about how to fix either one.
    const hint = text.includes("shop_not_permitted")
      ? ` The app and ${credentials.storeDomain} must belong to the same Shopify organization in the Dev Dashboard.`
      : text.includes("app_not_installed")
        ? ` The credentials are valid but the app is not installed on ${credentials.storeDomain}. Release an app version in the Dev Dashboard and install it on that store; the grant mints tokens only for stores where the app is installed.`
        : res.status === 401 || res.status === 400
          ? " Check SHOPIFY_API_KEY and SHOPIFY_API_SECRET against the app's client credentials."
          : "";
    throw new ShopifyError(
      `Client credentials grant failed: HTTP ${res.status} ${res.statusText}.${hint}`,
      "auth",
      { status: res.status, body: text.slice(0, 500) },
    );
  }

  let body: Partial<TokenResponse>;
  try {
    body = JSON.parse(text) as Partial<TokenResponse>;
  } catch {
    throw new ShopifyError("Token endpoint returned non-JSON", "auth", {
      body: text.slice(0, 500),
    });
  }
  if (!body.access_token) {
    throw new ShopifyError("Token endpoint returned no access_token", "auth", body);
  }

  cache.set(key, {
    accessToken: body.access_token,
    expiresAt: now + (body.expires_in ?? 0) * 1000,
    scope: body.scope ?? "",
  });
  return body.access_token;
}
