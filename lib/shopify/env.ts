import { z } from "zod";

const STORE_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Dev Dashboard apps have no static Admin token. The client ID and secret are exchanged for a
 * 24-hour access token at runtime (lib/shopify/auth.ts), so these two values are the credential.
 */
export interface ShopifyCredentials {
  storeDomain: string;
  /** `client_id` — the app's API key. Public; identifies the app, grants nothing on its own. */
  apiKey: string;
  /** `client_secret` — the app's API secret key (`shpss_…`). Treat as a password. */
  apiSecret: string;
}

export interface ShopifyEnv extends ShopifyCredentials {
  locationId: string | undefined;
}

function normalizeStoreDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

const StoreDomain = z
  .string()
  .min(1)
  .transform(normalizeStoreDomain)
  .refine((d) => STORE_DOMAIN.test(d), {
    message:
      "SHOPIFY_STORE_DOMAIN must be {shop}.myshopify.com (not .my-shopify.com, and no path)",
  });

/** Access tokens are minted by the grant, never pasted. Catching one here names the real mistake. */
const ACCESS_TOKEN = /^(shpat_|shpca_|shppa_)/;

export function parseShopifyEnv(
  env: Record<string, string | undefined> = process.env,
  opts: { requireLocation?: boolean } = {},
): ShopifyEnv {
  const storeDomain = StoreDomain.safeParse(env.SHOPIFY_STORE_DOMAIN);
  if (!storeDomain.success) {
    throw new Error(
      storeDomain.error.issues[0]?.message ?? "SHOPIFY_STORE_DOMAIN is invalid",
    );
  }

  const apiKey = env.SHOPIFY_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "SHOPIFY_API_KEY is missing. Copy the API key from the app's client credentials in the Shopify Dev Dashboard.",
    );
  }
  if (apiKey.startsWith("shpss_")) {
    throw new Error(
      "SHOPIFY_API_KEY holds the API secret key (shpss_). The key is the shorter, non-prefixed value; the secret goes in SHOPIFY_API_SECRET.",
    );
  }

  const apiSecret = env.SHOPIFY_API_SECRET?.trim() ?? "";
  if (!apiSecret) {
    throw new Error(
      "SHOPIFY_API_SECRET is missing. Copy the API secret key from the app's client credentials into .env.local; do not commit it.",
    );
  }
  if (ACCESS_TOKEN.test(apiSecret)) {
    throw new Error(
      "SHOPIFY_API_SECRET holds an access token, not the API secret key. Shopify no longer issues static Admin tokens; the client credentials grant mints one from the key and secret.",
    );
  }

  const locationId = env.SHOPIFY_LOCATION_ID?.trim() || undefined;
  if (opts.requireLocation && !locationId) {
    throw new Error(
      "SHOPIFY_LOCATION_ID is missing. Run `pnpm shopify:probe` first — it writes the active location GID into .env.local.",
    );
  }

  return { storeDomain: storeDomain.data, apiKey, apiSecret, locationId };
}
