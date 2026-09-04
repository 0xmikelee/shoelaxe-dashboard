import { GoatProductBody, GoatProductListBody, type GoatProduct } from "./schema";
import { mapGoatProduct, pickGoatProduct, type CatalogFromKicks } from "./map";

export const KICKSDB_GOAT_PRODUCTS_URL = "https://api.kicks.dev/v3/goat/products";
const LOOKUP_TIMEOUT_MS = 10_000;

export class KicksdbError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "KicksdbError";
    this.status = status;
  }
}

export interface KicksdbFetchOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

async function kicksGet(url: string, opts: KicksdbFetchOptions): Promise<unknown> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? LOOKUP_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new KicksdbError(`KicksDB HTTP ${res.status}`, res.status);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new KicksdbError("KicksDB returned non-JSON");
  }
}

function needsDetail(product: GoatProduct): boolean {
  const images = product.images;
  return images == null || images.length === 0;
}

/**
 * Search GOAT by SKU, keep only an exact SKU match, then GET-by-id when the list row has no
 * `images` array (the documented list payload returns `images: null`).
 */
export async function fetchGoatCatalogBySku(
  sku: string,
  opts: KicksdbFetchOptions,
): Promise<CatalogFromKicks | null> {
  const query = new URL(KICKSDB_GOAT_PRODUCTS_URL);
  query.searchParams.set("query", sku);
  const listJson = await kicksGet(query.toString(), opts);
  const list = GoatProductListBody.parse(listJson);
  const hit = pickGoatProduct(sku, list.data ?? []);
  if (hit == null) return null;

  let product = hit;
  if (needsDetail(hit)) {
    try {
      const detailJson = await kicksGet(`${KICKSDB_GOAT_PRODUCTS_URL}/${hit.id}`, opts);
      const detail = GoatProductBody.parse(detailJson);
      if (detail.data) product = { ...hit, ...detail.data };
    } catch (e) {
      if (e instanceof KicksdbError && e.status === 404) {
        // Keep the list row; image_url still maps if present.
      } else {
        throw e;
      }
    }
  }

  return mapGoatProduct(product);
}
