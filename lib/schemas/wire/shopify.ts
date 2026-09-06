import { z } from "zod";

export const ShopifyDrainWire = z.object({
  target: z.enum(["none", "shopify"]),
  claimed: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  deferred: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export const ShopifySyncWire = z.object({
  listing_id: z.uuid(),
  state: z.enum(["queued", "deferred"]),
  created: z.boolean(),
});

export type DrainResult = z.infer<typeof ShopifyDrainWire>;
export type ShopifySyncResult = z.infer<typeof ShopifySyncWire>;
