/**
 * The domain vocabulary, hand-written on purpose.
 *
 * lib/domain does not import lib/db/types.generated.ts: the pure core is imported by client
 * components (API-GAPS Gap 2 — the screens that render a price preview call the same function the
 * server decides with), and the generated file drags the whole schema into the browser bundle.
 * These unions mirror the enums in docs/SCHEMA-007-012.md; a value added there and not here fails
 * the exhaustive switch in decide() at compile time, which is the reason they are duplicated.
 */

export type ApprovalStatus =
  | "approved"
  | "pending_new"
  | "pending_price"
  | "needs_margins"
  | "rejected"
  | "inactive";

export type MarginSource = "override" | "group" | "default";

/** The two fixed price-source slots on a listing (docs/PROMPT.md §2). */
export type ListingSourceSlot = "stockx" | "in_house";

/** The ingest event vocabulary. Mapped to slots in lib/domain/sources.ts and nowhere else. */
export type EventSource = "stockx" | "google_sheet" | "dashboard";

/**
 * Every value the widened `price_updates_outcome_check` accepts. The first eight are legacy: the log
 * is append-only, so v1 rows keep their meanings and `price_updates.engine` discriminates the eras.
 * decide() emits only the DecisionOutcome subset declared in lib/domain/approval.ts.
 */
export type Outcome =
  | "new_listing"
  | "price_change"
  | "quantity_change"
  | "no_change"
  | "error"
  | "cost_change"
  | "margin_change"
  | "listing_price_change"
  | "held_for_approval"
  | "auto_approved"
  | "superseded"
  | "needs_margins"
  | "unknown_sku"
  | "invalid_currency"
  | "missing_cost"
  | "invalid_size";

export type PriceHistoryChangeType =
  | "cost"
  | "margin_percent"
  | "margin_fixed"
  | "listing_price"
  | "quantity"
  | "listing_status"
  | "margin_source"
  | "manual_price";

/** The auto-approval window, in percent. Asymmetric and independently editable (§5). */
export interface ApprovalBand {
  upPercent: number;
  downPercent: number;
}

/** The three tabs the UI partitions listings into (§2). */
export type ListingTab = "unlisted" | "listed" | "delisted";

/**
 * API-GAPS Gap 4: §2 partitions listings three ways but the CHECK has six values, and the missing
 * one is `pending_price` — a listing that is LIVE at its old approved price while a new one waits.
 * It belongs under 已上架. Reversing that decision is this one table entry; `productTab` below and
 * every screen count derive from it.
 */
export const LISTING_TAB_BY_STATUS: Readonly<Record<ApprovalStatus, ListingTab>> = {
  approved: "listed",
  pending_price: "listed",
  pending_new: "unlisted",
  needs_margins: "unlisted",
  rejected: "unlisted",
  inactive: "delisted",
};

/**
 * Screen 7's product-level tab, derived so the three counts partition all six statuses and sum to
 * 全部: 已下架 when every size is delisted, else 已上架 when any size is live, else 未上架.
 */
export function productTab(statuses: readonly ApprovalStatus[]): ListingTab {
  if (statuses.length === 0) return "unlisted";
  const tabs = statuses.map((s) => LISTING_TAB_BY_STATUS[s]);
  if (tabs.every((t) => t === "delisted")) return "delisted";
  if (tabs.some((t) => t === "listed")) return "listed";
  return "unlisted";
}

/** Thrown for inputs the domain cannot interpret. Never thrown for a legitimate business outcome. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Compile-time exhaustiveness with a runtime backstop: the DB enums are wider than nothing, and a
 * value added in a migration but not here must fail loudly rather than fall through a switch.
 */
export function assertNever(value: never, context: string): never {
  throw new DomainError(`${context}: unexpected value ${JSON.stringify(value)}`);
}
