import { z } from "zod";
import { Money, NonNegativeRate, Rate } from "@/lib/schemas/wire/common";

/**
 * PATCH /settings — changed fields only. Three of these re-price every listing resolving to the
 * system default, so the response carries a job (Gap 7).
 */
export const SettingsPatchBody = z.object({
  auto_approve_up_percent: NonNegativeRate.optional(),
  auto_approve_down_percent: NonNegativeRate.optional(),
  default_margin_enabled: z.boolean().optional(),
  default_margin_percent: Rate.optional(),
  default_margin_fixed: Money.optional(),
  rounding_enabled: z.boolean().optional(),
  /** Gap 33: a display mirror of the Apps Script trigger, which the server cannot read. */
  crawl_cadence_minutes: z.number().int().positive().nullable().optional(),
});

export const AllowedUserCreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  /** Normalised to lowercase client-side; the column enforces it anyway. */
  email: z.email().max(254),
});

/** Screen 2 asks for one run; the panel needs no more. */
export const CrawlRunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(1),
});
