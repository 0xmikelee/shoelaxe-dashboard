import { z } from "zod";
import { Money, NonNegativeRate, Publishing, Rate } from "./common";

/**
 * GET /api/v1/me — API-GAPS Gap 5.
 *
 * Answers "who am I", and carries the settings snapshot so the four screens that render a price
 * formula preview (2, 3, 4, 8) do not each need a second round trip to resolve the margin chain.
 *
 * Deliberately omits a pending count: the nav badge reads /approvals/stats, and two sources for one
 * number means the badge and the card disagree the moment someone approves something.
 */
export const SettingsSnapshotWire = z.object({
  auto_approve_up_percent: NonNegativeRate,
  auto_approve_down_percent: NonNegativeRate,
  default_margin_enabled: z.boolean(),
  default_margin_percent: Rate,
  default_margin_fixed: Money,
  rounding_enabled: z.boolean(),
});

export const MeWire = z.object({
  user_id: z.uuid(),
  email: z.string(),
  name: z.string(),
});

export const MeMetaWire = z.object({
  publishing: Publishing,
  default_group_id: z.uuid(),
  settings: SettingsSnapshotWire,
});

export type Me = z.infer<typeof MeWire>;
export type MeMeta = z.infer<typeof MeMetaWire>;
export type SettingsSnapshot = z.infer<typeof SettingsSnapshotWire>;
