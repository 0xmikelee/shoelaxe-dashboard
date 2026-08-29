import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import type { HistoryFilters } from "@/lib/schemas/params/listings";
import type {
  BulkApproveBody,
  ListingMarginsBody,
  ListingPriceBody,
  ListingRejectBody,
} from "@/lib/schemas/params/listings";
import { toCents } from "@/lib/domain/money";
import { db, listingById, paginate, selectHistory } from "../db";
import {
  approvePending,
  recomputeListing,
  recordMarginChange,
  rejectPending,
  setListingStatus,
  setManualPrice,
} from "../effects";
import { projectHistoryRow, projectListing, resolved } from "../project";
import { defineMock, listMeta, notFound } from "./common";
import type { ListingRow } from "../types";

type IdPath = { id: string };
type MarginsBody = z.infer<typeof ListingMarginsBody>;
type PriceBody = z.infer<typeof ListingPriceBody>;
type RejectBody = z.infer<typeof ListingRejectBody>;
type BulkBody = z.infer<typeof BulkApproveBody>;

const HISTORY_PREVIEW = 20;

const mustFind = (id: string): ListingRow => listingById(id) ?? (notFound(`listing ${id}`) as never);

const actorLabel = (): string => db.me.name;

const guardActive = (listing: ListingRow): void => {
  if (listing.approval_status === "inactive") {
    throw new ApiError("listing_inactive", "this size is delisted");
  }
};

/**
 * A margin edit is *not* one of Gap 1's human-initiated batches, so it goes through the ±band like an
 * ingest would: some sizes auto-approve and some land as `pending_price`, which is the mix Screen 8
 * has to report (Gap 24). Only `POST /listings/{id}/price` and a group-scoped apply bypass it.
 */
const EDIT_TRIGGER = "ingest" as const;

export const listingsHandlers = [
  defineMock<undefined, undefined, IdPath>("getListing", ({ params }) => {
    const listing = mustFind(params.id);
    const product = db.products.find((p) => p.sku === listing.product_sku);
    const group = db.groups.find((g) => g.id === product?.group_id) ?? db.groups[0];
    return {
      data: {
        ...projectListing(db, listing),
        group_id: group.id,
        group_name: group.name,
        history: db.history
          .filter((h) => h.listing_id === listing.id)
          .slice(0, HISTORY_PREVIEW)
          .map(projectHistoryRow),
      },
    };
  }),

  defineMock<HistoryFilters, undefined, IdPath>("getListingHistory", ({ params, query }) => {
    const listing = mustFind(params.id);
    const all = db.history.filter((h) => h.listing_id === listing.id);
    const rows = selectHistory(all, query);
    // `limit` bypasses paging entirely — the 近 6 次變更 chart asks for the newest N, not for a page.
    const page = query.limit
      ? { rows, total: rows.length, page: 1, per_page: query.per_page, total_pages: 1 }
      : paginate(rows, query.page, query.per_page);
    return {
      data: page.rows.map(projectHistoryRow),
      meta: { ...listMeta(page), sizes: [listing.size] },
    };
  }),

  defineMock<undefined, MarginsBody, IdPath>("updateListingMargins", ({ params, body }) => {
    const listing = mustFind(params.id);
    guardActive(listing);
    const previousPercent = listing.margin_override_percent;

    // Tri-state, and the whole subtlety of the endpoint: absent leaves the override alone, null clears
    // it back to the group rule, a value sets it.
    if (Object.hasOwn(body, "margin_percent")) {
      listing.margin_override_percent = body.margin_percent === null ? null : Number(body.margin_percent);
    }
    if (Object.hasOwn(body, "margin_fixed")) {
      listing.margin_override_fixed_cents =
        body.margin_fixed === null || body.margin_fixed === undefined ? null : toCents(body.margin_fixed);
    }
    listing.margins_unresolved = false;

    recomputeListing(listing, { trigger: EDIT_TRIGGER, actorLabel: actorLabel() });
    recordMarginChange(listing, previousPercent, actorLabel());
    return { data: projectListing(db, listing) };
  }),

  defineMock<undefined, PriceBody, IdPath>("setListingPrice", ({ params, body }) => {
    const listing = mustFind(params.id);
    guardActive(listing);
    setManualPrice(listing, toCents(body.price), actorLabel());
    return { data: projectListing(db, listing) };
  }),

  defineMock<undefined, undefined, IdPath>("approveListing", ({ params }) => {
    const listing = mustFind(params.id);
    guardActive(listing);
    if (listing.approval_status === "needs_margins") {
      throw new ApiError("needs_margins", "this size has no resolvable margin");
    }
    if (
      (listing.approval_status !== "pending_price" && listing.approval_status !== "pending_new") ||
      listing.pending_price_cents === null
    ) {
      // The expected race, and it must read as 此筆已被更新的價格取代 rather than as a failure.
      throw new ApiError("not_pending", "this listing has no price waiting for approval");
    }
    approvePending(listing, actorLabel());
    return { data: projectListing(db, listing) };
  }),

  defineMock<undefined, RejectBody, IdPath>("rejectListing", ({ params, body }) => {
    const listing = mustFind(params.id);
    guardActive(listing);
    if (listing.approval_status !== "pending_price" && listing.approval_status !== "pending_new") {
      throw new ApiError("not_pending", "this listing has no price waiting for approval");
    }
    rejectPending(listing, actorLabel(), body.reason);
    return { data: projectListing(db, listing) };
  }),

  defineMock<undefined, undefined, IdPath>("deactivateListing", ({ params }) => {
    const listing = mustFind(params.id);
    if (listing.approval_status === "inactive") {
      throw new ApiError("conflict", "this size is already delisted");
    }
    setListingStatus(listing, "inactive", actorLabel());
    return { data: projectListing(db, listing) };
  }),

  defineMock<undefined, undefined, IdPath>("reactivateListing", ({ params }) => {
    const listing = mustFind(params.id);
    if (listing.approval_status !== "inactive") {
      throw new ApiError("conflict", "this size is not delisted");
    }
    if (resolved(db, listing).margins === null) {
      throw new ApiError("needs_margins", "set a margin before putting this size back on sale");
    }
    // A previously live size returns to its old approved price; one that never was returns to the
    // queue. Reactivation is not an approval.
    setListingStatus(
      listing,
      listing.approved_price_cents === null ? "pending_new" : "approved",
      actorLabel(),
    );
    return { data: projectListing(db, listing) };
  }),

  defineMock<undefined, BulkBody>("bulkApproveListings", ({ body }) => {
    if (!body.listing_ids && !body.product_sku) {
      throw new ApiError("validation_failed", "pass listing_ids or product_sku");
    }
    const targets = body.listing_ids
      ? body.listing_ids.map((id) => ({ id, listing: listingById(id) }))
      : db.listings
          .filter((l) => l.product_sku === body.product_sku)
          .map((l) => ({ id: l.id, listing: l }));

    const results = targets.map(({ id, listing }) => {
      if (!listing) {
        return { listing_id: id, size: "—", ok: false, error_code: "not_found" as const };
      }
      if (listing.approval_status === "inactive") {
        return { listing_id: id, size: listing.size, ok: false, error_code: "listing_inactive" as const };
      }
      if (listing.approval_status === "needs_margins") {
        return { listing_id: id, size: listing.size, ok: false, error_code: "needs_margins" as const };
      }
      if (
        (listing.approval_status !== "pending_price" && listing.approval_status !== "pending_new") ||
        listing.pending_price_cents === null
      ) {
        return { listing_id: id, size: listing.size, ok: false, error_code: "not_pending" as const };
      }
      approvePending(listing, actorLabel());
      return { listing_id: id, size: listing.size, ok: true, error_code: null };
    });

    return {
      data: {
        ok_count: results.filter((r) => r.ok).length,
        failed_count: results.filter((r) => !r.ok).length,
        results,
      },
    };
  }),
];
