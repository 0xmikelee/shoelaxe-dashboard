import { z } from "zod";
import {
  ApplyScope,
  Count,
  Iso,
  JobStatus,
  Money,
  Rate,
  Sku,
} from "./common";

/** Embedded in every product row, so the table never needs a second query to name the group. */
export const GroupRefWire = z.object({
  id: z.uuid(),
  name: z.string(),
  /** 預設分組 cannot be deleted or lose is_default, so the group list is never empty. */
  is_default: z.boolean(),
});

export const GroupSummaryWire = GroupRefWire.extend({
  /** Null margins are the seeded default-group state, and are what lets the system default fire. */
  margin_percent: Rate.nullable(),
  margin_fixed: Money.nullable(),
  product_count: Count,
  listing_count: Count,
  updated_at: Iso,
});

export const GroupsListWire = z.array(GroupSummaryWire);

/**
 * Gap 10. Screen 4's 96 / 78 / 18 must be known before submit and cannot be computed client-side —
 * the product table is paginated and per-size data only loads on expand.
 *
 * Two invariants, both asserted server-side: `all = group_rule_only + overridden_only`, and
 * `all + ineligible.total = listing_count`. Inactive and rejected listings are **not** counted in
 * the scopes; they are the `ineligible` breakdown, because a batch that silently skipped them while
 * reporting 96 would be lying about what it did.
 */
export const ScopeCountsWire = z.object({
  all: Count,
  group_rule_only: Count,
  overridden_only: Count,
});

export const IneligibleWire = z.object({
  total: Count,
  inactive: Count,
  rejected: Count,
  missing_cost: Count,
});

export const GroupDetailWire = GroupSummaryWire.extend({
  scope_counts: ScopeCountsWire,
  ineligible: IneligibleWire,
});

/**
 * Gap 15. 「以成本 HK$1,200 計算 … 目前售價 → 更新後」 needs the margin precedence chain, the
 * rounding rule and the per-scope selection — all server-side. POST for the body; it writes nothing.
 */
export const GroupApplyPreviewWire = z.object({
  scope: ApplyScope,
  /**
   * The worked example. `cost` defaults to the group's median `base_cost` so the illustrative figure
   * is explainable rather than arbitrary; `cost_basis` says which it was.
   */
  sample: z.object({
    cost: Money,
    cost_basis: z.enum(["median_base_cost", "provided"]),
    margin_percent: Rate.nullable(),
    margin_fixed: Money.nullable(),
    current_price: Money.nullable(),
    raw_price: Money,
    new_price: Money,
    rounding_applied: z.boolean(),
  }),
  affected_count: Count,
  scope_counts: ScopeCountsWire,
  ineligible: IneligibleWire,
  average_price_before: Money.nullable(),
  average_price_after: Money.nullable(),
  increase_count: Count,
  decrease_count: Count,
  unchanged_count: Count,
  /**
   * Informational while BATCH_BYPASSES_BAND is true (Gap 1) — a human-initiated batch *is* the
   * approval, so this is what *would* have been held, not what will be. Flip that constant and this
   * becomes the count Screen 4 must render as 「N 個尺寸待審核」.
   */
  would_hold_for_approval: Count,
});

/** 202. Five rapid clicks on 套用 return the same job id by design. */
export const GroupApplyAcceptedWire = z.object({
  job_id: z.uuid(),
  total: Count,
  status: JobStatus,
});

/**
 * Gap 18. Deleting a group reassigns its products to 預設分組 and re-runs §5 for each affected
 * listing — at 24 products × 8 sizes that is a fan-out, so 202 and a job, and Screen 6 needs
 * JobProgress too.
 *
 * Gap 14, resolved the other way from `group_not_empty`: deletion never refuses a non-empty group.
 * That code is therefore dead here and is cited by no contract.
 */
export const GroupDeleteAcceptedWire = z.object({
  job_id: z.uuid(),
  reassigned_product_count: Count,
  target_group_id: z.uuid(),
});

/**
 * Screen 5. Products already in another group are accepted; the response reports what moved so the
 * modal's 將移出 Nike Dunk 系列 warning can be confirmed against the server rather than guessed.
 */
export const GroupMembersResultWire = z.object({
  group_id: z.uuid(),
  added_count: Count,
  removed_count: Count,
  recomputed_listing_count: Count,
  moved: z.array(
    z.object({ sku: Sku, from_group_id: z.uuid(), from_group_name: z.string() }),
  ),
});

export type GroupRef = z.infer<typeof GroupRefWire>;
export type GroupSummary = z.infer<typeof GroupSummaryWire>;
export type GroupDetail = z.infer<typeof GroupDetailWire>;
export type ScopeCounts = z.infer<typeof ScopeCountsWire>;
export type GroupApplyPreview = z.infer<typeof GroupApplyPreviewWire>;
export type GroupApplyAccepted = z.infer<typeof GroupApplyAcceptedWire>;
export type GroupMembersResult = z.infer<typeof GroupMembersResultWire>;
