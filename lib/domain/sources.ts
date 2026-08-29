import { assertNever, type EventSource, type ListingSourceSlot } from "@/lib/domain/types";

/** §2: a StockX ask is one pair. The crawler never reports a quantity and never should. */
export const STOCKX_QUANTITY = 1;

/**
 * The one mapping between the two vocabularies. The ingest payload speaks transports
 * (`stockx | google_sheet | dashboard`); a listing has two fixed slots (`stockx | in_house`).
 * Inlining this anywhere else is how a dashboard edit ends up written to the read-only StockX row.
 */
export function slotForEventSource(source: EventSource): ListingSourceSlot {
  switch (source) {
    case "stockx":
      return "stockx";
    case "google_sheet":
    case "dashboard":
      return "in_house";
    default:
      return assertNever(source, "slotForEventSource");
  }
}

/**
 * `null` means leave the stored quantity alone. A sheet row that carries a cost and a blank 庫存數量
 * must not zero the stock, and zero itself is a legitimate value (sold out), so absent and zero are
 * different answers here.
 */
export function quantityForSlot(slot: ListingSourceSlot, reported: number | null): number | null {
  return slot === "stockx" ? STOCKX_QUANTITY : reported;
}

/** StockX costs and quantities are crawled, never typed: §6.2 answers `source_read_only` on a write. */
export function isDashboardEditable(slot: ListingSourceSlot): boolean {
  return slot === "in_house";
}
