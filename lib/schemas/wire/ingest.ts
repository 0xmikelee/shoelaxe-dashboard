import { z } from "zod";
import { PriceUpdateOutcome } from "./common";

export const IngestItemStatus = z.enum(["pending", "applied", "skipped", "rejected", "error"]);

export const IngestHealthWire = z.object({
  ok: z.literal(true),
  accepts_max_items: z.number().int().positive(),
});

export const IngestItemResultWire = z.object({
  source_ref: z.string(),
  ok: z.boolean(),
  status: IngestItemStatus,
  outcome: PriceUpdateOutcome.nullable(),
  error: z.string().nullable(),
  listing_id: z.uuid().nullable(),
  idempotent: z.boolean(),
});

export const IngestBatchWire = z.object({
  run_id: z.string(),
  items: z.array(IngestItemResultWire),
});

export type IngestHealth = z.infer<typeof IngestHealthWire>;
export type IngestItemResult = z.infer<typeof IngestItemResultWire>;
export type IngestBatch = z.infer<typeof IngestBatchWire>;
