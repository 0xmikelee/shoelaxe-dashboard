/**
 * Admin GraphQL fetch. Safe to import from Node scripts (`tsx`) — do not import from a
 * Client Component. Next.js server code should import `@/lib/shopify/client` instead, which
 * re-exports this behind `server-only`.
 */
import { getAccessToken } from "@/lib/shopify/auth";
import { ShopifyError } from "@/lib/shopify/errors";
import { API_VERSION } from "@/lib/shopify/operations";
import type { ShopifyCredentials, ShopifyEnv } from "@/lib/shopify/env";

/** The credentials themselves: the access token is minted per call and cached in lib/shopify/auth. */
export type ShopifyAdminConfig = ShopifyCredentials;

export function adminConfig(env: ShopifyEnv): ShopifyAdminConfig {
  return { storeDomain: env.storeDomain, apiKey: env.apiKey, apiSecret: env.apiSecret };
}

interface GraphqlBody<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string; path?: ReadonlyArray<string | number> }>;
}

export async function adminGraphql<T>(
  config: ShopifyAdminConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const accessToken = await getAccessToken(config);
  const url = `https://${config.storeDomain}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 403
        ? " The granted scopes are a readback of the app version approved on the store — release a version with the missing scope and approve it."
        : "";
    throw new ShopifyError(
      `Shopify HTTP ${res.status} ${res.statusText}.${hint}`,
      "http",
      { status: res.status, body: text.slice(0, 500) },
    );
  }
  let body: GraphqlBody<T>;
  try {
    body = JSON.parse(text) as GraphqlBody<T>;
  } catch {
    throw new ShopifyError("Shopify returned non-JSON", "http", { body: text.slice(0, 500) });
  }
  if (body.errors?.length) {
    throw new ShopifyError(
      body.errors.map((e) => e.message).join("; "),
      "graphql",
      body.errors,
    );
  }
  if (body.data === undefined) {
    throw new ShopifyError("Shopify returned no data", "graphql", body);
  }
  return body.data;
}
