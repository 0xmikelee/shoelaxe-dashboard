import { z } from "zod";
import { ApprovalRowStatus, EventSource, Sku } from "@/lib/schemas/wire/common";
import { DateRangePreset, IsoDateOrDateTime, PageQuery, Search, SortOrder, csv } from "./common";

/** Screen 1's sortable columns. A whitelist, not a passthrough — `sort` reaches an ORDER BY. */
export const ApprovalsSort = z
  .enum(["pending_since", "created_at", "delta_percent", "new_price", "cost", "product_name", "size"])
  .default("pending_since");

export const ApprovalsQuery = PageQuery.extend({
  q: Search,
  source: EventSource.optional(),
  /** Comma-joined; the queue is usefully filtered to several row states at once (Gap 9). */
  status: csv(ApprovalRowStatus).optional().describe("Comma-joined row statuses."),
  preset: DateRangePreset.optional(),
  from: IsoDateOrDateTime.optional(),
  to: IsoDateOrDateTime.optional(),
  /** Deep links from Screen 8 land on one listing or one product. */
  listing_id: z.uuid().optional(),
  sku: Sku.optional(),
  sort: ApprovalsSort,
  order: SortOrder.default("desc"),
});

export type ApprovalsFilters = z.infer<typeof ApprovalsQuery>;
