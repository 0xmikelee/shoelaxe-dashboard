import { skusMatch } from "./sku";
import type { GoatProduct } from "./schema";

export interface CatalogFromKicks {
  kicks_product_id: string;
  product_name: string;
  brand: string;
  model: string | null;
  description: string | null;
  colorway: string | null;
  season: string | null;
  product_type: string | null;
  title: string;
  body_html: string | null;
  vendor: string;
  release_date: string | null;
  release_date_year: string | null;
  image_urls: string[];
}

const trimOrNull = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toBodyHtml(description: string | null): string | null {
  if (description == null) return null;
  return `<p>${escapeHtml(description)}</p>`;
}

/** Calendar date (UTC) from a KicksDB ISO timestamp, e.g. `2016-12-13T23:59:59.999Z`. */
export function releaseDateOnly(iso: string | null | undefined): string | null {
  const raw = trimOrNull(iso);
  if (raw == null) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function imageUrlsOf(product: GoatProduct): string[] {
  const fromArray = (product.images ?? []).map((u) => u.trim()).filter((u) => u.length > 0);
  if (fromArray.length > 0) return [...new Set(fromArray)];
  const fallback = trimOrNull(product.image_url);
  return fallback ? [fallback] : [];
}

/**
 * The list endpoint is relevance-ranked. Only an exact SKU match (after normalisation) is safe to
 * persist — taking `data[0]` would attach the wrong GOAT product to a sheet SKU.
 */
export function pickGoatProduct(sku: string, hits: readonly GoatProduct[]): GoatProduct | null {
  return hits.find((hit) => hit.sku != null && skusMatch(sku, hit.sku)) ?? null;
}

export function mapGoatProduct(product: GoatProduct): CatalogFromKicks | null {
  const productName = trimOrNull(product.name);
  const brand = trimOrNull(product.brand);
  if (productName == null || brand == null) return null;
  const description = trimOrNull(product.description);
  return {
    kicks_product_id: String(product.id),
    product_name: productName,
    brand,
    model: trimOrNull(product.model),
    description,
    colorway: trimOrNull(product.colorway),
    season: trimOrNull(product.season),
    product_type: trimOrNull(product.product_type),
    title: productName,
    body_html: toBodyHtml(description),
    vendor: brand,
    release_date: releaseDateOnly(product.release_date),
    release_date_year: trimOrNull(product.release_date_year),
    image_urls: imageUrlsOf(product),
  };
}
