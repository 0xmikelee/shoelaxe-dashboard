import { describe, expect, it } from "vitest";
import {
  changeCount,
  currentImageOrder,
  currentListingDraft,
  currentName,
  currentNameZh,
  currentStatus,
  describeChanges,
  displayed,
  emptyProductDraft,
  initialProductDraft,
  isCleared,
  isDirty,
  isProductDraftDirty,
  reduceProductDraft,
  setOrUntouched,
  setValue,
  toPatch,
  untouched,
} from "@/lib/draft";
import type { Listing } from "@/lib/schemas/wire/listings";
import type { ProductDetail } from "@/lib/schemas/wire/products";

const ISO = "2026-08-01T01:00:00.000Z";
const GROUP = { id: "11111111-1111-4111-8111-111111111111", name: "預設分組", is_default: true };
const LISTING_A = "22222222-2222-4222-8222-222222222222";
const LISTING_B = "33333333-3333-4333-8333-333333333333";
const IMAGE_A = "44444444-4444-4444-8444-444444444444";
const IMAGE_B = "55555555-5555-4555-8555-555555555555";

function listing(overrides: Partial<Listing> & Pick<Listing, "id" | "size">): Listing {
  return {
    product_sku: "AJ1-101",
    product_name: "Air Jordan 1",
    name_zh: "AJ1",
    currency: "HKD",
    approval_status: "approved",
    base_cost: "1200.00",
    base_cost_source: "in_house",
    base_cost_at: ISO,
    margin_percent: "15.0000",
    margin_fixed: "150.00",
    margin_source: "override",
    margin_override_percent: "15.0000",
    margin_override_fixed: "150.00",
    raw_price: "1530.00",
    rounding_applied: false,
    approved_price: "1530.00",
    approved_at: ISO,
    previous_approved_price: "1420.00",
    previous_approved_at: ISO,
    pending_price: null,
    pending_since: null,
    pending_update_id: null,
    in_house_markup: { amount: "330.00", percent: "27.5000" },
    sources: [
      {
        source: "in_house",
        cost: "1200.00",
        cost_at: ISO,
        previous_cost: "1100.00",
        previous_cost_at: ISO,
        quantity: 2,
        last_source_ref: "sheet",
        last_synced_at: ISO,
        editable: true,
      },
    ],
    updated_at: ISO,
    ...overrides,
  };
}

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    sku: "AJ1-101",
    name: "Air Jordan 1",
    name_zh: "AJ1 中文",
    title: "Air Jordan 1",
    body_html: null,
    vendor: "Nike",
    product_type: "Sneakers",
    tags: [],
    stockx_name: "Air Jordan 1",
    group: GROUP,
    status: "listed",
    images: [
      {
        id: IMAGE_A,
        url: "https://cdn.shoelaxe.test/1.jpg",
        sort_order: 0,
        is_primary: true,
        width: 1200,
        height: 1200,
        bytes: 1000,
        created_at: ISO,
      },
      {
        id: IMAGE_B,
        url: "https://cdn.shoelaxe.test/2.jpg",
        sort_order: 1,
        is_primary: false,
        width: 1200,
        height: 1200,
        bytes: 1000,
        created_at: ISO,
      },
    ],
    listings: [
      listing({ id: LISTING_A, size: "US 9" }),
      listing({
        id: LISTING_B,
        size: "US 10",
        margin_override_percent: null,
        margin_override_fixed: null,
        margin_source: "group",
        sources: [],
      }),
    ],
    aggregates: {
      size_count: 2,
      in_stock_size_count: 1,
      total_in_house_quantity: 2,
      cost: { min: "1200.00", max: "1200.00" },
      price: { min: "1530.00", max: "1530.00" },
      margin_percent: { min: "15.0000", max: "15.0000" },
      margin_fixed: { min: "150.00", max: "150.00" },
      margin_source_mix: { override: 1, group: 1, default: 0, none: 0 },
      override_count: 1,
      has_size_variance: false,
      source_count: 1,
    },
    margin_summary: {
      kind: "uniform",
      percent: "15.0000",
      fixed: "150.00",
      percent_range: null,
      fixed_range: null,
    },
    last_imported_at: ISO,
    updated_at: ISO,
    created_at: ISO,
    ...overrides,
  };
}

describe("FieldState", () => {
  it("treats only set and cleared as dirty", () => {
    expect(isDirty(untouched())).toBe(false);
    expect(isDirty(setValue(1))).toBe(true);
    expect(isCleared({ kind: "cleared" })).toBe(true);
    expect(isCleared(untouched())).toBe(false);
  });

  it("displayed prefers a set value and otherwise the snapshot", () => {
    expect(displayed(untouched<string>(), "snap")).toBe("snap");
    expect(displayed(setValue("next"), "snap")).toBe("next");
    expect(displayed({ kind: "cleared" }, "snap")).toBe("snap");
  });

  it("setOrUntouched collapses a no-op back to untouched", () => {
    expect(setOrUntouched("a", "a")).toEqual(untouched());
    expect(setOrUntouched("b", "a")).toEqual(setValue("b"));
    expect(setOrUntouched(["x"], ["x"], (a, b) => a[0] === b[0])).toEqual(untouched());
  });
});

describe("the product draft reducer", () => {
  it("hydrates from a snapshot and discard restores empty", () => {
    let state = initialProductDraft(product());
    expect(isProductDraftDirty(state.draft)).toBe(false);
    expect(changeCount(state.draft)).toBe(0);
    expect(emptyProductDraft()).toEqual(state.draft);

    state = reduceProductDraft(state, { type: "setName", value: "New" });
    expect(isProductDraftDirty(state.draft)).toBe(true);
    state = reduceProductDraft(state, { type: "discard" });
    expect(isProductDraftDirty(state.draft)).toBe(false);

    const next = product({ name: "Reloaded" });
    state = reduceProductDraft(state, { type: "hydrate", snapshot: next });
    expect(state.snapshot.name).toBe("Reloaded");
    expect(currentName(state)).toBe("Reloaded");
  });

  it("stages name, chinese name, status and image order, and ignores no-ops", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, { type: "setName", value: "Air Jordan 1" });
    state = reduceProductDraft(state, { type: "setNameZh", value: "AJ1 中文" });
    state = reduceProductDraft(state, { type: "setStatus", value: "listed" });
    state = reduceProductDraft(state, { type: "setImageOrder", value: [IMAGE_A, IMAGE_B] });
    expect(isProductDraftDirty(state.draft)).toBe(false);

    state = reduceProductDraft(state, { type: "setName", value: "Chicago" });
    state = reduceProductDraft(state, { type: "setNameZh", value: "芝加哥" });
    state = reduceProductDraft(state, { type: "setStatus", value: "delisted" });
    state = reduceProductDraft(state, { type: "setImageOrder", value: [IMAGE_B, IMAGE_A] });
    expect(changeCount(state.draft)).toBe(4);
    expect(currentName(state)).toBe("Chicago");
    expect(currentNameZh(state)).toBe("芝加哥");
    expect(currentStatus(state)).toBe("delisted");
    expect(currentImageOrder(state)).toEqual([IMAGE_B, IMAGE_A]);

    const patch = toPatch(state.draft);
    expect(patch).toEqual({
      name: "Chicago",
      name_zh: "芝加哥",
      status: "delisted",
      image_order: [IMAGE_B, IMAGE_A],
    });
  });

  it("treats a delisted snapshot's status no-op as untouched", () => {
    let state = initialProductDraft(product({ status: "delisted" }));
    expect(currentStatus(state)).toBe("delisted");
    state = reduceProductDraft(state, { type: "setStatus", value: "delisted" });
    expect(isDirty(state.draft.status)).toBe(false);
    state = reduceProductDraft(state, { type: "setStatus", value: "listed" });
    expect(state.draft.status).toEqual(setValue("listed"));
  });

  it("clears an override as JSON null and drops an empty listing slot", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, { type: "clearMargin", listingId: LISTING_A });
    expect(isCleared(currentListingDraft(state, LISTING_A).marginOverride)).toBe(true);
    expect(toPatch(state.draft)).toEqual({
      listings: [{ id: LISTING_A, margin_override: null }],
    });
    expect(describeChanges(state)).toEqual([{ kind: "clearOverride", size: "US 9" }]);

    state = reduceProductDraft(state, {
      type: "setMargin",
      listingId: LISTING_A,
      percent: "15.0000",
      fixed: "150.00",
    });
    expect(state.draft.listings[LISTING_A]).toBeUndefined();
  });

  it("does not clear a listing that already has no override", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, { type: "clearMargin", listingId: LISTING_B });
    expect(state.draft.listings[LISTING_B]).toBeUndefined();
    expect(toPatch(state.draft)).toEqual({});
  });

  it("sets per-size margins and in-house fields independently", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, {
      type: "setMargin",
      listingId: LISTING_A,
      percent: "10.0000",
      fixed: "100.00",
    });
    state = reduceProductDraft(state, { type: "setInHouseCost", listingId: LISTING_A, value: "1300.00" });
    state = reduceProductDraft(state, { type: "setInHouseQuantity", listingId: LISTING_A, value: 4 });

    const patch = toPatch(state.draft);
    expect(patch.listings).toEqual([
      {
        id: LISTING_A,
        margin_override: { margin_percent: "10.0000", margin_fixed: "100.00" },
        in_house: { cost: "1300.00", quantity: 4 },
      },
    ]);

    const changes = describeChanges(state);
    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: "marginPercent", size: "US 9", from: "15.0000", to: "10.0000" },
        { kind: "marginFixed", size: "US 9", from: "150.00", to: "100.00" },
        { kind: "cost", size: "US 9", from: "1200.00", to: "1300.00" },
        { kind: "quantity", size: "US 9", from: 2, to: 4 },
      ]),
    );
    expect(changeCount(state.draft)).toBe(3);
  });

  it("ignores unknown listing ids rather than inventing a write", () => {
    let state = initialProductDraft(product());
    const unknown = "99999999-9999-4999-8999-999999999999";
    state = reduceProductDraft(state, {
      type: "setMargin",
      listingId: unknown,
      percent: "1",
      fixed: "1.00",
    });
    state = reduceProductDraft(state, { type: "clearMargin", listingId: unknown });
    state = reduceProductDraft(state, { type: "setInHouseCost", listingId: unknown, value: "1.00" });
    state = reduceProductDraft(state, { type: "setInHouseQuantity", listingId: unknown, value: 1 });
    expect(state.draft).toEqual(emptyProductDraft());
  });

  it("records a name-only changeset and a status change", () => {
    let state = initialProductDraft(product({ name_zh: null }));
    expect(currentNameZh(state)).toBe("");
    state = reduceProductDraft(state, { type: "setName", value: "Chicago" });
    state = reduceProductDraft(state, { type: "setNameZh", value: "芝加哥" });
    state = reduceProductDraft(state, { type: "setStatus", value: "delisted" });
    state = reduceProductDraft(state, { type: "setImageOrder", value: [IMAGE_B, IMAGE_A] });
    expect(describeChanges(state)).toEqual([
      { kind: "nameEn" },
      { kind: "nameZh" },
      { kind: "status", from: "listed", to: "delisted" },
      { kind: "imageOrder" },
    ]);
  });

  it("treats in-house absence as empty cost and zero quantity", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, { type: "setInHouseCost", listingId: LISTING_B, value: "900.00" });
    state = reduceProductDraft(state, { type: "setInHouseQuantity", listingId: LISTING_B, value: 1 });
    expect(describeChanges(state)).toEqual([
      { kind: "cost", size: "US 10", from: "", to: "900.00" },
      { kind: "quantity", size: "US 10", from: 0, to: 1 },
    ]);
    expect(toPatch(state.draft).listings?.[0].in_house).toEqual({ cost: "900.00", quantity: 1 });
  });

  it("emits only the changed half of a margin pair", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, {
      type: "setMargin",
      listingId: LISTING_A,
      percent: "20.0000",
      fixed: "150.00",
    });
    expect(describeChanges(state)).toEqual([
      { kind: "marginPercent", size: "US 9", from: "15.0000", to: "20.0000" },
    ]);

    state = initialProductDraft(product());
    state = reduceProductDraft(state, {
      type: "setMargin",
      listingId: LISTING_A,
      percent: "15.0000",
      fixed: "200.00",
    });
    expect(describeChanges(state)).toEqual([
      { kind: "marginFixed", size: "US 9", from: "150.00", to: "200.00" },
    ]);
  });

  it("treats an unlisted product as listed until the user picks 已下架", () => {
    const state = initialProductDraft(product({ status: "unlisted" }));
    expect(currentStatus(state)).toBe("listed");
  });

  it("counts a cost-only listing change without a margin edit", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, { type: "setInHouseCost", listingId: LISTING_A, value: "999.00" });
    expect(changeCount(state.draft)).toBe(1);
  });

  it("counts each listing field independently", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, {
      type: "setMargin",
      listingId: LISTING_A,
      percent: "20.0000",
      fixed: "150.00",
    });
    expect(changeCount(state.draft)).toBe(1);
    state = reduceProductDraft(state, { type: "setInHouseCost", listingId: LISTING_A, value: "999.00" });
    expect(changeCount(state.draft)).toBe(2);
    state = reduceProductDraft(state, { type: "setInHouseQuantity", listingId: LISTING_A, value: 9 });
    expect(changeCount(state.draft)).toBe(3);
  });

  it("keeps an in-progress draft when a background refetch hydrates", () => {
    let state = initialProductDraft(product());
    state = reduceProductDraft(state, { type: "setName", value: "Chicago" });
    const next = reduceProductDraft(state, { type: "hydrateIfClean", snapshot: product({ name: "Other" }) });
    expect(currentName(next)).toBe("Chicago");
    const clean = reduceProductDraft(initialProductDraft(product()), {
      type: "hydrateIfClean",
      snapshot: product({ name: "Other" }),
    });
    expect(currentName(clean)).toBe("Other");
  });
});
