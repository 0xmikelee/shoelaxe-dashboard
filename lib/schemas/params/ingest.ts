import { z } from "zod";
import { Iso, Money, SizeLabel, Sku } from "@/lib/schemas/wire/common";

export const IngestTrigger = z.enum(["cron", "manual"]);
export const IngestTransport = z.enum(["stockx", "google_sheet"]);

export const IngestRun = z.object({
  run_id: z.string().min(1).max(64),
  source: IngestTransport,
  trigger: IngestTrigger,
  started_at: Iso,
});

/**
 * One row from StockX email or the Google Sheet. Image URLs and margins are not accepted: the
 * sheet no longer sends them, and margins are resolved server-side (override → group → default).
 * Unknown keys (including a leftover `image_url`) are stripped.
 */
export const IngestItem = z.object({
  product_name: z.string().min(1).max(200),
  product_sku: Sku,
  brand: z.string().min(1).max(80),
  size: SizeLabel,
  cost: Money.nullable().optional(),
  quantity: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default("HKD"),
  source: IngestTransport,
  source_ref: z.string().min(1).max(200),
  stockx_internal_id: z.string().min(1).max(80).nullable().optional(),
  allow_create: z.boolean().default(true),
});

export const IngestBody = z.object({
  run: IngestRun,
  updates: z.array(IngestItem),
});

export type IngestRunInput = z.infer<typeof IngestRun>;
export type IngestItemInput = z.infer<typeof IngestItem>;
export type IngestBodyInput = z.infer<typeof IngestBody>;
