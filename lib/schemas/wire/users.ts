import { z } from "zod";
import { Count, Iso } from "./common";

/**
 * Gap 28. Three fields the design does not draw and cannot work without: `added_at` and
 * `added_by_name` for the row, and `is_self` so 移除 can be disabled on your own row.
 */
export const AllowedUserWire = z.object({
  /** Lowercased; the column is `check (email = lower(email))`. Normalise client-side too. */
  email: z.email(),
  name: z.string(),
  added_at: Iso,
  added_by_name: z.string().nullable(),
  is_self: z.boolean(),
});

export const AllowedUsersListWire = z.array(AllowedUserWire);

/**
 * `remaining_count` exists because removing the last allowed user locks everyone out permanently and
 * the seed is a single row. The server refuses that with a 409; this is what the UI counts down.
 */
export const AllowedUserRemovedWire = z.object({
  email: z.email(),
  remaining_count: Count,
});

export type AllowedUser = z.infer<typeof AllowedUserWire>;
export type AllowedUserRemoved = z.infer<typeof AllowedUserRemovedWire>;
