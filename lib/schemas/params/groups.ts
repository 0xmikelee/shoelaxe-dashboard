import { z } from "zod";
import { ApplyScope, Money, Rate, Sku } from "@/lib/schemas/wire/common";

export const GroupCreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  margin_percent: Rate.optional(),
  margin_fixed: Money.optional(),
});

/**
 * Name only. Every margin change routes through POST /groups/{id}/apply, because changing a rule
 * without saying which sizes it overwrites is exactly the ambiguity Screen 4's scope radio exists
 * to remove.
 */
export const GroupPatchBody = z.object({
  name: z.string().trim().min(1).max(60),
});

/**
 * Screen 4. **Field presence is the checkbox**: an absent field means 不更新, which is why neither
 * margin may be nullable here — there is no "clear the group rule" gesture in the design.
 */
export const GroupApplyBody = z.object({
  scope: ApplyScope,
  margin_percent: Rate.optional(),
  margin_fixed: Money.optional(),
});

/** Gap 15. POST for the body; it writes nothing. `sample_cost` overrides the median base cost. */
export const GroupApplyPreviewBody = GroupApplyBody.extend({
  sample_cost: Money.optional(),
});

export const GroupMembersBody = z.object({
  product_skus: z.array(Sku).min(1).max(200),
});
