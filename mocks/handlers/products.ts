import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import { toCents } from "@/lib/domain/money";
import type { ProductsFilters, ProductPatch } from "@/lib/schemas/params/products";
import type { ProductMarginsBody, ProductsBulkBody, ProductImagePatchBody, ProductImagesReorderBody } from "@/lib/schemas/params/products";
import type { ProductHistoryFilters } from "@/lib/schemas/params/listings";
import type { ListingOutcome } from "@/lib/schemas/wire/listings";
import { iso } from "../clock";
import { db, paginate, selectHistory, selectProducts } from "../db";
import { recomputeListing, setListingStatus } from "../effects";
import {
  imagesOf,
  listingsOf,
  projectHistoryRow,
  projectImage,
  projectProductDetail,
  projectProductRow,
} from "../project";
import { uuidFrom } from "../random";
import { sortSizes } from "../sizes";
import { defineMock, listMeta, notFound } from "./common";
import type { ListingRow, ProductRow } from "../types";

type SkuPath = { sku: string };
type ImagePath = { sku: string; image_id: string };
type MarginsBody = z.infer<typeof ProductMarginsBody>;
type BulkBody = z.infer<typeof ProductsBulkBody>;
type ImagePatchBody = z.infer<typeof ProductImagePatchBody>;
type ReorderBody = z.infer<typeof ProductImagesReorderBody>;

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const mustFind = (sku: string): ProductRow =>
  db.products.find((p) => p.sku === sku) ?? (notFound(`product ${sku}`) as never);

const actorLabel = (): string => db.me.name;

const now = (): string => iso(Date.now());

/**
 * Gap 24. The save is transactional, so there is no partial-failure state — but the §5 decision
 * differs per listing, and 「3 個尺寸已更新，2 個尺寸的新售價需審核」 is not derivable from a 200.
 */
const writeResult = (sku: string, outcomes: readonly ListingOutcome[]) => ({
  sku,
  updated_count: outcomes.filter((o) => o.outcome === "auto_approved" || o.outcome === "no_change").length,
  held_count: outcomes.filter((o) => o.outcome === "held_for_approval").length,
  needs_margins_count: outcomes.filter((o) => o.outcome === "needs_margins").length,
  listings: [...outcomes],
});

const csvCell = (value: string | number | null): string => {
  const raw = value === null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export const productsHandlers = [
  defineMock<ProductsFilters>("listProducts", ({ query }) => {
    const { rows, counts } = selectProducts(query);
    const page = paginate(rows, query.page, query.per_page);
    return {
      data: page.rows.map((p) => projectProductRow(db, p)),
      // `counts` respects q and group_id and ignores `status`, so the tabs do not move when one is
      // selected. Recomputing them from the filtered rows is the classic way to get this wrong.
      meta: { ...listMeta(page), counts },
    };
  }),

  /** Registered before `/products/{sku}`: MSW matches in order, and `export` is not a SKU. */
  defineMock<Omit<ProductsFilters, "page" | "per_page">>("exportProducts", ({ query }) => {
    const { rows } = selectProducts({ ...query, sort: query.sort, order: query.order });
    const header = ["sku", "name", "name_zh", "brand", "group", "status", "size_count", "in_house_quantity", "price_min", "price_max"];
    const lines = [header.join(",")];
    for (const product of rows) {
      const view = projectProductRow(db, product);
      lines.push(
        [
          view.sku,
          view.name,
          view.name_zh,
          view.brand,
          view.group.name,
          view.status,
          view.aggregates.size_count,
          view.aggregates.total_in_house_quantity,
          view.aggregates.price?.min ?? null,
          view.aggregates.price?.max ?? null,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return new Response(`﻿${lines.join("\n")}\n`, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="products-${now().slice(0, 10)}.csv"`,
      },
    });
  }),

  defineMock<undefined, undefined, SkuPath>("getProduct", ({ params }) => ({
    data: projectProductDetail(db, mustFind(params.sku)),
  })),

  defineMock<undefined, ProductPatch, SkuPath>("updateProduct", ({ params, body }) => {
    const product = mustFind(params.sku);
    const listings = listingsOf(db, product.sku);
    const byId = new Map(listings.map((l) => [l.id, l]));

    if (body.name !== undefined) product.name = body.name;
    if (body.name_zh !== undefined) product.name_zh = body.name_zh;
    if (body.content) {
      if (body.content.title !== undefined) product.title = body.content.title;
      if (body.content.body_html !== undefined) product.body_html = body.content.body_html;
      if (body.content.vendor !== undefined) product.vendor = body.content.vendor;
      if (body.content.product_type !== undefined) product.product_type = body.content.product_type;
      if (body.content.tags !== undefined) product.tags = body.content.tags;
    }

    if (body.image_order) applyImageOrder(product.sku, body.image_order);

    const outcomes: ListingOutcome[] = [];
    for (const patch of body.listings ?? []) {
      const listing = byId.get(patch.id);
      // A stale id in a long-open draft: the listing exists but belongs to another product.
      if (!listing) {
        throw new ApiError("listing_not_in_product", `listing ${patch.id} is not part of ${product.sku}`);
      }
      if (listing.approval_status === "inactive") {
        throw new ApiError("listing_inactive", `size ${listing.size} is delisted`);
      }
      if (patch.margin_override !== undefined) {
        if (patch.margin_override === null) {
          listing.margin_override_percent = null;
          listing.margin_override_fixed_cents = null;
        } else {
          if (Object.hasOwn(patch.margin_override, "margin_percent")) {
            listing.margin_override_percent =
              patch.margin_override.margin_percent == null
                ? null
                : Number(patch.margin_override.margin_percent);
          }
          if (Object.hasOwn(patch.margin_override, "margin_fixed")) {
            listing.margin_override_fixed_cents =
              patch.margin_override.margin_fixed == null
                ? null
                : toCents(patch.margin_override.margin_fixed);
          }
        }
        listing.margins_unresolved = false;
      }
      if (patch.in_house) {
        const source = listing.sources.find((s) => s.source === "in_house");
        const target =
          source ??
          ({
            source: "in_house" as const,
            cost_cents: null,
            cost_at: null,
            previous_cost_cents: null,
            previous_cost_at: null,
            quantity: 0,
            last_source_ref: "dashboard",
            last_synced_at: now(),
          });
        if (!source) listing.sources.push(target);
        if (patch.in_house.cost !== undefined) {
          target.previous_cost_cents = target.cost_cents;
          target.previous_cost_at = target.cost_at;
          target.cost_cents = toCents(patch.in_house.cost);
          // cost_at moves only when a cost is written; last_synced_at moves on any touch.
          target.cost_at = now();
        }
        if (patch.in_house.quantity !== undefined) target.quantity = patch.in_house.quantity;
        target.last_synced_at = now();
      }
      outcomes.push(recomputeListing(listing, { trigger: "ingest", actorLabel: actorLabel() }));
    }

    if (body.status) {
      for (const listing of listings) {
        if (body.status === "delisted" && listing.approval_status !== "inactive") {
          setListingStatus(listing, "inactive", actorLabel());
        }
        if (body.status === "listed" && listing.approval_status === "inactive") {
          setListingStatus(
            listing,
            listing.approved_price_cents === null ? "pending_new" : "approved",
            actorLabel(),
          );
        }
      }
    }

    product.updated_at = now();
    return { data: writeResult(product.sku, outcomes) };
  }),

  /**
   * Gap 11, and a deliberate contrast with the nested PATCH above: 套用至所有尺寸 reuses the
   * group-apply scope vocabulary, so it is one of Gap 1's human-initiated batches and bypasses the
   * ±band. Flip BATCH_BYPASSES_BAND and `held_count` here starts reporting sizes instead of zero.
   */
  defineMock<undefined, MarginsBody, SkuPath>("updateProductMargins", ({ params, body }) => {
    const product = mustFind(params.sku);
    const eligible = listingsOf(db, product.sku).filter(
      (l) => l.approval_status !== "inactive" && l.approval_status !== "rejected",
    );
    const hasOverride = (l: ListingRow) =>
      l.margin_override_percent !== null || l.margin_override_fixed_cents !== null;
    const selected =
      body.scope === "all"
        ? eligible
        : body.scope === "group_rule_only"
          ? eligible.filter((l) => !hasOverride(l))
          : eligible.filter(hasOverride);

    const outcomes = selected.map((listing) => {
      if (body.margin_percent !== undefined) listing.margin_override_percent = Number(body.margin_percent);
      if (body.margin_fixed !== undefined) listing.margin_override_fixed_cents = toCents(body.margin_fixed);
      listing.margins_unresolved = false;
      return recomputeListing(listing, { trigger: "batch", actorLabel: "分組批次更新" });
    });

    return { data: writeResult(product.sku, outcomes) };
  }),

  defineMock<ProductHistoryFilters, undefined, SkuPath>("getProductHistory", ({ params, query }) => {
    const product = mustFind(params.sku);
    const all = db.history.filter((h) => h.product_sku === product.sku);
    const rows = selectHistory(all, query);
    const page = query.limit
      ? { rows, total: rows.length, page: 1, per_page: query.per_page, total_pages: 1 }
      : paginate(rows, query.page, query.per_page);
    return {
      data: page.rows.map(projectHistoryRow),
      meta: {
        ...listMeta(page),
        // The sizes present in the *unfiltered* set — the 全部尺寸 selector must not lose its options
        // the moment one of them is picked.
        sizes: sortSizes([...new Set(all.map((h) => h.size))]),
      },
    };
  }),

  defineMock<undefined, BulkBody>("bulkUpdateProducts", ({ body }) => {
    if (body.action === "assign_group" && !body.group_id) {
      throw new ApiError("validation_failed", "assign_group requires group_id");
    }
    const results = body.skus.map((sku) => {
      const product = db.products.find((p) => p.sku === sku);
      if (!product) return { sku, ok: false, error_code: "not_found" as const };
      const listings = listingsOf(db, sku);
      if (body.action === "assign_group") {
        product.group_id = body.group_id as string;
        product.updated_at = now();
        // Membership change is human-initiated, so the reprice bypasses the band (Gap 1).
        for (const listing of listings) {
          recomputeListing(listing, { trigger: "batch", actorLabel: "分組批次更新" });
        }
      } else if (body.action === "deactivate") {
        for (const listing of listings) {
          if (listing.approval_status !== "inactive") setListingStatus(listing, "inactive", actorLabel());
        }
      } else {
        for (const listing of listings) {
          if (listing.approval_status === "inactive") {
            setListingStatus(
              listing,
              listing.approved_price_cents === null ? "pending_new" : "approved",
              actorLabel(),
            );
          }
        }
      }
      return { sku, ok: true, error_code: null };
    });

    return {
      data: {
        ok_count: results.filter((r) => r.ok).length,
        failed_count: results.filter((r) => !r.ok).length,
        results,
      },
    };
  }),

  defineMock<undefined, undefined, SkuPath>("uploadProductImage", async ({ params, request }) => {
    const product = mustFind(params.sku);
    const existing = imagesOf(db, product.sku);
    if (existing.length >= MAX_IMAGES) {
      throw new ApiError("image_limit_reached", `a product may have at most ${MAX_IMAGES} images`);
    }

    let filename = "upload.jpg";
    let type = "image/jpeg";
    let bytes = 240_000;
    try {
      const form = await request.formData();
      const file = form.get("file");
      // Duck-typed rather than `instanceof File`: undici hands back a File-like object, and the
      // instanceof check silently fails there, which would make every upload look like a default JPG.
      if (file && typeof file === "object" && "size" in file) {
        const blob = file as { name?: string; type?: string; size: number };
        filename = blob.name ?? filename;
        type = blob.type || type;
        bytes = blob.size;
      }
    } catch {
      // A test posting no multipart body still gets a plausible upload rather than a 500.
    }
    if (!["image/jpeg", "image/png"].includes(type)) {
      throw new ApiError("unsupported_media_type", "only JPG and PNG are accepted");
    }
    if (bytes > MAX_IMAGE_BYTES) {
      throw new ApiError("image_too_large", "images must be 2MB or smaller");
    }

    db.images.push({
      id: uuidFrom(`image:new:${product.sku}:${db.images.length}`),
      product_sku: product.sku,
      url: `https://cdn.shoelaxe.test/products/${product.sku}/${encodeURIComponent(filename)}`,
      sort_order: existing.length,
      is_primary: existing.length === 0,
      width: 1200,
      height: 1200,
      bytes,
      created_at: now(),
    });
    return { data: imagesOf(db, product.sku).map(projectImage) };
  }),

  defineMock<undefined, ImagePatchBody, ImagePath>("updateProductImage", ({ params, body }) => {
    const product = mustFind(params.sku);
    const images = imagesOf(db, product.sku);
    const image = images.find((i) => i.id === params.image_id) ?? (notFound("image") as never);
    if (body.is_primary) {
      for (const other of images) other.is_primary = other.id === image.id;
      applyImageOrder(product.sku, [image.id, ...images.filter((i) => i.id !== image.id).map((i) => i.id)]);
    }
    if (body.sort_order !== undefined) {
      const rest = images.filter((i) => i.id !== image.id).map((i) => i.id);
      rest.splice(Math.min(body.sort_order, rest.length), 0, image.id);
      applyImageOrder(product.sku, rest);
    }
    return { data: imagesOf(db, product.sku).map(projectImage) };
  }),

  defineMock<undefined, undefined, ImagePath>("deleteProductImage", ({ params }) => {
    const product = mustFind(params.sku);
    const index = db.images.findIndex((i) => i.product_sku === product.sku && i.id === params.image_id);
    if (index === -1) notFound("image");
    db.images.splice(index, 1);
    // Deleting the primary promotes the next by sort_order; a product with no image is a real state.
    const remaining = imagesOf(db, product.sku);
    applyImageOrder(
      product.sku,
      remaining.map((i) => i.id),
    );
    return { data: imagesOf(db, product.sku).map(projectImage) };
  }),

  defineMock<undefined, ReorderBody, SkuPath>("reorderProductImages", ({ params, body }) => {
    const product = mustFind(params.sku);
    const owned = new Set(imagesOf(db, product.sku).map((i) => i.id));
    if (body.image_ids.some((id) => !owned.has(id))) {
      throw new ApiError("conflict", "the reorder names an image this product does not have");
    }
    applyImageOrder(product.sku, body.image_ids);
    return { data: imagesOf(db, product.sku).map(projectImage) };
  }),
];

/** The payload is the desired end state, not a delta: ids not named keep their relative order. */
function applyImageOrder(sku: string, order: readonly string[]): void {
  const images = imagesOf(db, sku);
  const ranked = [...order, ...images.filter((i) => !order.includes(i.id)).map((i) => i.id)];
  images.forEach((image) => {
    image.sort_order = ranked.indexOf(image.id);
    image.is_primary = false;
  });
  const first = images.slice().sort((a, b) => a.sort_order - b.sort_order)[0];
  if (first) first.is_primary = true;
}
