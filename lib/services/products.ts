import { pickBaseCost } from "@/lib/domain/baseCost";
import { fromCents, toCentsOrNull } from "@/lib/domain/money";
import { ApiError, notFound } from "@/lib/http/errors";
import type { SessionActor } from "@/lib/http/session-auth";
import type { ProductPatch } from "@/lib/schemas/params/products";
import type { ProductDetail, ProductImage, ProductWriteResult } from "@/lib/schemas/wire/products";
import type { ListingOutcome } from "@/lib/schemas/wire/listings";
import type { DashboardRepo } from "@/lib/repo/dashboard-types";
import type { ListingWriteDeps } from "@/lib/services/listings";
import { recomputeListing } from "@/lib/services/listings";
import {
  productStatusOf,
  projectAggregates,
  projectImage,
  projectListing,
  projectMarginSummary,
  sortListings,
} from "@/lib/services/wire-project";

export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export interface ProductWriteDeps extends ListingWriteDeps {
  publicUrlFor?: (path: string) => string;
  uploadObject?: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  removeObject?: (path: string) => Promise<void>;
}

const syncState = (target: "none" | "shopify") => (target === "shopify" ? "queued" : "deferred");

async function sourcesMap(repo: DashboardRepo, listingIds: readonly string[]) {
  const map = new Map<string, Awaited<ReturnType<DashboardRepo["listSources"]>>>();
  for (const id of listingIds) {
    map.set(id, await repo.listSources(id));
  }
  return map;
}

export async function getProduct(sku: string, deps: { repo: DashboardRepo }): Promise<ProductDetail> {
  const product = await deps.repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  const listings = sortListings(await deps.repo.listListingsBySku(product.product_sku));
  const settings = await deps.repo.getSettings();
  const group = await deps.repo.getGroup(product.product_group_id);
  const images = await deps.repo.listImages(product.product_sku);
  const sourcesByListing = await sourcesMap(deps.repo, listings.map((l) => l.id));
  const wireListings = listings.map((l) => projectListing(l, sourcesByListing.get(l.id) ?? [], settings));

  return {
    sku: product.product_sku,
    name: product.product_name,
    name_zh: product.name_zh,
    title: product.title,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: product.tags,
    stockx_name: product.stockx_name,
    group: { id: group.id, name: group.name, is_default: group.is_default },
    status: productStatusOf(listings),
    images: images.map(projectImage),
    listings: wireListings,
    aggregates: projectAggregates(listings, sourcesByListing, settings),
    margin_summary: projectMarginSummary(listings, settings),
    last_imported_at: product.last_imported_at,
    updated_at: product.updated_at,
    created_at: product.created_at,
  };
}

export async function updateProduct(
  sku: string,
  body: ProductPatch,
  deps: ProductWriteDeps,
): Promise<ProductWriteResult> {
  const product = await deps.repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  const listings = await deps.repo.listListingsBySku(product.product_sku);
  const byId = new Map(listings.map((l) => [l.id, l]));

  const contentPatch = {
    ...(body.name !== undefined ? { product_name: body.name } : {}),
    ...(body.name_zh !== undefined ? { name_zh: body.name_zh } : {}),
    ...(body.content?.title !== undefined ? { title: body.content.title } : {}),
    ...(body.content?.body_html !== undefined ? { body_html: body.content.body_html } : {}),
    ...(body.content?.vendor !== undefined ? { vendor: body.content.vendor } : {}),
    ...(body.content?.product_type !== undefined ? { product_type: body.content.product_type } : {}),
    ...(body.content?.tags !== undefined ? { tags: body.content.tags } : {}),
  };
  const contentChanged = Object.keys(contentPatch).length > 0;
  if (contentChanged) {
    await deps.repo.updateProduct(product.id, contentPatch, deps.now);
  }
  if (body.image_order) {
    await deps.repo.applyImageOrder(product.product_sku, body.image_order);
  }

  const outcomes: ListingOutcome[] = [];
  for (const patch of body.listings ?? []) {
    const listing = byId.get(patch.id);
    if (!listing) {
      throw new ApiError("listing_not_in_product", `listing ${patch.id} is not part of ${product.product_sku}`);
    }
    if (listing.approval_status === "inactive") {
      throw new ApiError("listing_inactive", `size ${listing.size} is delisted`);
    }
    if (patch.margin_override !== undefined) {
      if (patch.margin_override === null) {
        await deps.repo.updateListingState(listing.id, {
          approval_status: listing.approval_status,
          approved_price: listing.approved_price,
          approved_at: listing.approved_at,
          current_price: listing.approved_price,
          pending_price: listing.pending_price,
          pending_since: listing.pending_since,
          pending_update_id: listing.pending_update_id,
          margin_source: listing.margin_source,
          margin_percent: null,
          margin_fixed: null,
        });
      } else {
        await deps.repo.updateListingState(listing.id, {
          approval_status: listing.approval_status,
          approved_price: listing.approved_price,
          approved_at: listing.approved_at,
          current_price: listing.approved_price,
          pending_price: listing.pending_price,
          pending_since: listing.pending_since,
          pending_update_id: listing.pending_update_id,
          margin_source: listing.margin_source,
          margin_percent:
            patch.margin_override.margin_percent === undefined
              ? listing.margin_percent
              : patch.margin_override.margin_percent,
          margin_fixed:
            patch.margin_override.margin_fixed === undefined
              ? listing.margin_fixed
              : patch.margin_override.margin_fixed,
        });
      }
    }
    if (patch.in_house) {
      const sources = await deps.repo.listSources(listing.id);
      const existing = sources.find((s) => s.source === "in_house");
      const writeCost = patch.in_house.cost !== undefined;
      await deps.repo.upsertInHouseSource({
        listing_id: listing.id,
        cost: patch.in_house.cost ?? existing?.cost ?? null,
        costAt: writeCost ? deps.now : (existing?.cost_at ?? null),
        quantity: patch.in_house.quantity ?? existing?.quantity ?? 0,
        last_synced_at: deps.now,
        writeCost,
      });
      const nextSources = await deps.repo.listSources(listing.id);
      const base = pickBaseCost(
        nextSources.map((s) => ({
          slot: s.source,
          costCents: toCentsOrNull(s.cost),
          costAt: s.cost_at,
        })),
        writeCost ? "in_house" : null,
      );
      if (base) {
        await deps.repo.updateListingState(listing.id, {
          approval_status: listing.approval_status,
          approved_price: listing.approved_price,
          approved_at: listing.approved_at,
          current_price: listing.approved_price,
          pending_price: listing.pending_price,
          pending_since: listing.pending_since,
          pending_update_id: listing.pending_update_id,
          margin_source: listing.margin_source,
          base_cost: fromCents(base.costCents),
          base_cost_source: base.slot,
          base_cost_at: base.costAt,
        });
      }
    }
    outcomes.push(await recomputeListing(listing.id, deps, "ingest"));
  }

  if (body.status === "delisted") {
    for (const listing of listings) {
      if (listing.approval_status === "inactive") continue;
      await deps.repo.updateListingState(listing.id, {
        approval_status: "inactive",
        approved_price: listing.approved_price,
        approved_at: listing.approved_at,
        current_price: listing.approved_price,
        pending_price: listing.pending_price,
        pending_since: listing.pending_since,
        pending_update_id: listing.pending_update_id,
        margin_source: listing.margin_source,
      });
      await deps.repo.enqueueShopifySync(listing.id, syncState(deps.publishTarget));
    }
  }

  const contentOrImages = contentChanged || Boolean(body.image_order) || body.status !== undefined;
  if (contentOrImages || outcomes.some((o) => o.outcome === "auto_approved")) {
    await deps.repo.enqueueLiveShopifySyncForProduct(product.id, syncState(deps.publishTarget));
  }

  await deps.repo.insertAuditLog({
    user_id: deps.actor.id,
    actor_label: deps.actor.label,
    action: "update_product",
    target_table: "products",
    target_id: product.id,
    before: { sku: product.product_sku },
    after: body,
  });

  return {
    sku: product.product_sku,
    updated_count: outcomes.filter((o) => o.outcome === "auto_approved" || o.outcome === "no_change").length,
    held_count: outcomes.filter((o) => o.outcome === "held_for_approval").length,
    needs_margins_count: outcomes.filter((o) => o.outcome === "needs_margins").length,
    listings: outcomes,
  };
}

export async function listProductImages(sku: string, repo: DashboardRepo): Promise<ProductImage[]> {
  const product = await repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  return (await repo.listImages(product.product_sku)).map(projectImage);
}

export async function uploadProductImage(
  sku: string,
  file: { bytes: Uint8Array; contentType: string; filename: string },
  deps: ProductWriteDeps,
): Promise<ProductImage[]> {
  const product = await deps.repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  if (!ALLOWED_IMAGE_TYPES.has(file.contentType)) {
    throw new ApiError("unsupported_media_type", "only JPG and PNG are accepted");
  }
  if (file.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ApiError("image_too_large", "images must be 2MB or smaller");
  }
  const count = await deps.repo.countImages(product.product_sku);
  if (count >= MAX_IMAGES) {
    throw new ApiError("image_limit_reached", "at most 8 images per SKU");
  }

  const ext = file.contentType === "image/png" ? "png" : "jpg";
  const path = `${product.product_sku}/${crypto.randomUUID()}.${ext}`;
  if (deps.uploadObject) {
    await deps.uploadObject(path, file.bytes, file.contentType);
  }
  const url = deps.publicUrlFor
    ? deps.publicUrlFor(path)
    : `https://cdn.shoelaxe.test/products/${path}`;

  await deps.repo.insertImage(
    {
      product_sku: product.product_sku,
      url,
      storage_path: path,
      sort_order: count,
      is_primary: count === 0,
      width: null,
      height: null,
      bytes: file.bytes.byteLength,
    },
    deps.now,
  );
  await deps.repo.enqueueLiveShopifySyncForProduct(product.id, syncState(deps.publishTarget));
  await deps.repo.insertAuditLog({
    user_id: deps.actor.id,
    actor_label: deps.actor.label,
    action: "upload_image",
    target_table: "product_images",
    target_id: product.id,
    before: null,
    after: { path },
  });
  return listProductImages(product.product_sku, deps.repo);
}

export async function patchProductImage(
  sku: string,
  imageId: string,
  body: { is_primary?: true; sort_order?: number },
  deps: ProductWriteDeps,
): Promise<ProductImage[]> {
  const product = await deps.repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  const image = await deps.repo.findImage(product.product_sku, imageId);
  if (!image) throw notFound("image");
  if (body.is_primary) {
    await deps.repo.setPrimaryImage(product.product_sku, imageId);
  }
  if (body.sort_order !== undefined) {
    const images = await deps.repo.listImages(product.product_sku);
    const rest = images.filter((i) => i.id !== imageId).map((i) => i.id);
    rest.splice(Math.min(body.sort_order, rest.length), 0, imageId);
    await deps.repo.applyImageOrder(product.product_sku, rest);
  }
  await deps.repo.enqueueLiveShopifySyncForProduct(product.id, syncState(deps.publishTarget));
  return listProductImages(product.product_sku, deps.repo);
}

export async function deleteProductImage(
  sku: string,
  imageId: string,
  deps: ProductWriteDeps,
): Promise<ProductImage[]> {
  const product = await deps.repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  const image = await deps.repo.findImage(product.product_sku, imageId);
  if (!image) throw notFound("image");
  await deps.repo.deleteImage(imageId);
  if (image.storage_path && deps.removeObject) {
    await deps.removeObject(image.storage_path);
  }
  const remaining = await deps.repo.listImages(product.product_sku);
  await deps.repo.applyImageOrder(
    product.product_sku,
    remaining.map((i) => i.id),
  );
  await deps.repo.enqueueLiveShopifySyncForProduct(product.id, syncState(deps.publishTarget));
  return listProductImages(product.product_sku, deps.repo);
}

export async function reorderProductImages(
  sku: string,
  imageIds: readonly string[],
  deps: ProductWriteDeps,
): Promise<ProductImage[]> {
  const product = await deps.repo.findProductBySku(sku);
  if (!product) throw notFound("product");
  const owned = new Set((await deps.repo.listImages(product.product_sku)).map((i) => i.id));
  if (imageIds.some((id) => !owned.has(id))) {
    throw new ApiError("conflict", "the reorder names an image this product does not have");
  }
  await deps.repo.applyImageOrder(product.product_sku, imageIds);
  await deps.repo.enqueueLiveShopifySyncForProduct(product.id, syncState(deps.publishTarget));
  return listProductImages(product.product_sku, deps.repo);
}
