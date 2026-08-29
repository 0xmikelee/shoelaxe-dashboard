import type { ProductDetail } from "@/lib/schemas/wire/products";
import type { Listing } from "@/lib/schemas/wire/listings";
import type { ProductPatch, ProductListingPatch } from "@/lib/schemas/params/products";
import {
  cleared,
  displayed,
  isCleared,
  isDirty,
  setOrUntouched,
  setValue,
  untouched,
  type FieldState,
} from "./field";

export interface MarginOverrideValue {
  percent: string | null;
  fixed: string | null;
}

export interface ListingDraft {
  marginOverride: FieldState<MarginOverrideValue>;
  inHouseCost: FieldState<string>;
  inHouseQuantity: FieldState<number>;
}

export interface ProductDraft {
  name: FieldState<string>;
  nameZh: FieldState<string>;
  status: FieldState<"listed" | "delisted">;
  imageOrder: FieldState<readonly string[]>;
  listings: Readonly<Record<string, ListingDraft>>;
}

export interface ProductDraftState {
  snapshot: ProductDetail;
  draft: ProductDraft;
}

export type ProductDraftAction =
  | { type: "hydrate"; snapshot: ProductDetail }
  | { type: "hydrateIfClean"; snapshot: ProductDetail }
  | { type: "discard" }
  | { type: "setName"; value: string }
  | { type: "setNameZh"; value: string }
  | { type: "setStatus"; value: "listed" | "delisted" }
  | { type: "setImageOrder"; value: readonly string[] }
  | { type: "setMargin"; listingId: string; percent: string | null; fixed: string | null }
  | { type: "clearMargin"; listingId: string }
  | { type: "setInHouseCost"; listingId: string; value: string }
  | { type: "setInHouseQuantity"; listingId: string; value: number };

export const emptyListingDraft = (): ListingDraft => ({
  marginOverride: untouched(),
  inHouseCost: untouched(),
  inHouseQuantity: untouched(),
});

export const emptyProductDraft = (): ProductDraft => ({
  name: untouched(),
  nameZh: untouched(),
  status: untouched(),
  imageOrder: untouched(),
  listings: {},
});

export const initialProductDraft = (snapshot: ProductDetail): ProductDraftState => ({
  snapshot,
  draft: emptyProductDraft(),
});

const sameOrder = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, i) => id === right[i]);

const listingOf = (draft: ProductDraft, id: string): ListingDraft =>
  draft.listings[id] ?? emptyListingDraft();

function withListing(draft: ProductDraft, id: string, listing: ListingDraft): ProductDraft {
  const empty =
    !isDirty(listing.marginOverride) &&
    !isDirty(listing.inHouseCost) &&
    !isDirty(listing.inHouseQuantity);
  const listings = { ...draft.listings };
  if (empty) delete listings[id];
  else listings[id] = listing;
  return { ...draft, listings };
}

const findListing = (snapshot: ProductDetail, id: string): Listing | undefined =>
  snapshot.listings.find((row) => row.id === id);

function snapshotOverride(listing: Listing): MarginOverrideValue {
  return {
    percent: listing.margin_override_percent,
    fixed: listing.margin_override_fixed,
  };
}

function sameOverride(left: MarginOverrideValue, right: MarginOverrideValue): boolean {
  return left.percent === right.percent && left.fixed === right.fixed;
}

const inHouseOf = (listing: Listing) => listing.sources.find((source) => source.source === "in_house");

export function reduceProductDraft(
  state: ProductDraftState,
  action: ProductDraftAction,
): ProductDraftState {
  switch (action.type) {
    case "hydrate":
      return initialProductDraft(action.snapshot);
    case "hydrateIfClean":
      return isProductDraftDirty(state.draft) ? state : initialProductDraft(action.snapshot);
    case "discard":
      return { ...state, draft: emptyProductDraft() };
    case "setName":
      return {
        ...state,
        draft: { ...state.draft, name: setOrUntouched(action.value, state.snapshot.name) },
      };
    case "setNameZh":
      return {
        ...state,
        draft: {
          ...state.draft,
          nameZh: setOrUntouched(action.value, state.snapshot.name_zh ?? ""),
        },
      };
    case "setStatus": {
      const current = state.snapshot.status === "delisted" ? "delisted" : "listed";
      return {
        ...state,
        draft: { ...state.draft, status: setOrUntouched(action.value, current) },
      };
    }
    case "setImageOrder": {
      const current = state.snapshot.images.map((image) => image.id);
      return {
        ...state,
        draft: {
          ...state.draft,
          imageOrder: setOrUntouched(action.value, current, sameOrder),
        },
      };
    }
    case "setMargin": {
      const listing = findListing(state.snapshot, action.listingId);
      if (!listing) return state;
      const next: MarginOverrideValue = { percent: action.percent, fixed: action.fixed };
      const existing = listingOf(state.draft, action.listingId);
      return {
        ...state,
        draft: withListing(state.draft, action.listingId, {
          ...existing,
          marginOverride: setOrUntouched(next, snapshotOverride(listing), sameOverride),
        }),
      };
    }
    case "clearMargin": {
      const listing = findListing(state.snapshot, action.listingId);
      if (!listing) return state;
      const existing = listingOf(state.draft, action.listingId);
      const hadOverride =
        listing.margin_override_percent !== null || listing.margin_override_fixed !== null;
      return {
        ...state,
        draft: withListing(state.draft, action.listingId, {
          ...existing,
          marginOverride: hadOverride ? cleared() : untouched(),
        }),
      };
    }
    case "setInHouseCost": {
      const listing = findListing(state.snapshot, action.listingId);
      if (!listing) return state;
      const current = inHouseOf(listing)?.cost ?? "";
      const existing = listingOf(state.draft, action.listingId);
      return {
        ...state,
        draft: withListing(state.draft, action.listingId, {
          ...existing,
          inHouseCost: setOrUntouched(action.value, current),
        }),
      };
    }
    case "setInHouseQuantity": {
      const listing = findListing(state.snapshot, action.listingId);
      if (!listing) return state;
      const current = inHouseOf(listing)?.quantity ?? 0;
      const existing = listingOf(state.draft, action.listingId);
      return {
        ...state,
        draft: withListing(state.draft, action.listingId, {
          ...existing,
          inHouseQuantity: setOrUntouched(action.value, current),
        }),
      };
    }
  }
}

export function isProductDraftDirty(draft: ProductDraft): boolean {
  if (isDirty(draft.name) || isDirty(draft.nameZh) || isDirty(draft.status) || isDirty(draft.imageOrder)) {
    return true;
  }
  return Object.keys(draft.listings).length > 0;
}

export function changeCount(draft: ProductDraft): number {
  let count = 0;
  if (isDirty(draft.name)) count += 1;
  if (isDirty(draft.nameZh)) count += 1;
  if (isDirty(draft.status)) count += 1;
  if (isDirty(draft.imageOrder)) count += 1;
  for (const listing of Object.values(draft.listings)) {
    if (isDirty(listing.marginOverride)) count += 1;
    if (isDirty(listing.inHouseCost)) count += 1;
    if (isDirty(listing.inHouseQuantity)) count += 1;
  }
  return count;
}

export type DraftChange =
  | { kind: "nameEn" }
  | { kind: "nameZh" }
  | { kind: "status"; from: "listed" | "delisted" | "unlisted"; to: "listed" | "delisted" }
  | { kind: "imageOrder" }
  | { kind: "marginPercent"; size: string; from: string | null; to: string | null }
  | { kind: "marginFixed"; size: string; from: string | null; to: string | null }
  | { kind: "clearOverride"; size: string }
  | { kind: "quantity"; size: string; from: number; to: number }
  | { kind: "cost"; size: string; from: string; to: string };

export function describeChanges(state: ProductDraftState): DraftChange[] {
  const { snapshot, draft } = state;
  const items: DraftChange[] = [];
  if (isDirty(draft.name)) items.push({ kind: "nameEn" });
  if (isDirty(draft.nameZh)) items.push({ kind: "nameZh" });
  if (draft.status.kind === "set") {
    items.push({ kind: "status", from: snapshot.status, to: draft.status.value });
  }
  if (isDirty(draft.imageOrder)) items.push({ kind: "imageOrder" });

  for (const listing of snapshot.listings) {
    const local = draft.listings[listing.id];
    if (!local) continue;
    if (isCleared(local.marginOverride)) {
      items.push({ kind: "clearOverride", size: listing.size });
    } else if (local.marginOverride.kind === "set") {
      const from = snapshotOverride(listing);
      const to = local.marginOverride.value;
      if (from.percent !== to.percent) {
        items.push({
          kind: "marginPercent",
          size: listing.size,
          from: from.percent,
          to: to.percent,
        });
      }
      if (from.fixed !== to.fixed) {
        items.push({ kind: "marginFixed", size: listing.size, from: from.fixed, to: to.fixed });
      }
    }
    if (local.inHouseCost.kind === "set") {
      items.push({
        kind: "cost",
        size: listing.size,
        from: inHouseOf(listing)?.cost ?? "",
        to: local.inHouseCost.value,
      });
    }
    if (local.inHouseQuantity.kind === "set") {
      items.push({
        kind: "quantity",
        size: listing.size,
        from: inHouseOf(listing)?.quantity ?? 0,
        to: local.inHouseQuantity.value,
      });
    }
  }
  return items;
}

export function toPatch(draft: ProductDraft): ProductPatch {
  const patch: ProductPatch = {};
  if (draft.name.kind === "set") patch.name = draft.name.value;
  if (draft.nameZh.kind === "set") patch.name_zh = draft.nameZh.value;
  if (draft.status.kind === "set") patch.status = draft.status.value;
  if (draft.imageOrder.kind === "set") patch.image_order = [...draft.imageOrder.value];

  const listings: ProductListingPatch[] = [];
  for (const [id, local] of Object.entries(draft.listings)) {
    const item: ProductListingPatch = { id };
    if (local.marginOverride.kind === "cleared") {
      item.margin_override = null;
    } else if (local.marginOverride.kind === "set") {
      item.margin_override = {
        margin_percent: local.marginOverride.value.percent,
        margin_fixed: local.marginOverride.value.fixed,
      };
    }
    const inHouse: { cost?: string; quantity?: number } = {};
    if (local.inHouseCost.kind === "set") inHouse.cost = local.inHouseCost.value;
    if (local.inHouseQuantity.kind === "set") inHouse.quantity = local.inHouseQuantity.value;
    if (Object.keys(inHouse).length > 0) item.in_house = inHouse;
    listings.push(item);
  }
  if (listings.length > 0) patch.listings = listings;
  return patch;
}

export function currentName(state: ProductDraftState): string {
  return displayed(state.draft.name, state.snapshot.name);
}

export function currentNameZh(state: ProductDraftState): string {
  return displayed(state.draft.nameZh, state.snapshot.name_zh ?? "");
}

export function currentStatus(state: ProductDraftState): "listed" | "delisted" {
  const fallback = state.snapshot.status === "delisted" ? "delisted" : "listed";
  return displayed(state.draft.status, fallback);
}

export function currentImageOrder(state: ProductDraftState): readonly string[] {
  return displayed(
    state.draft.imageOrder,
    state.snapshot.images.map((image) => image.id),
  );
}

export function currentListingDraft(
  state: ProductDraftState,
  listingId: string,
): ListingDraft {
  return listingOf(state.draft, listingId);
}

export { setValue };
