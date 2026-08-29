import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import { computeSellingPrice, withinBand } from "@/lib/domain/pricing";
import { toCents } from "@/lib/domain/money";
import type {
  GroupApplyBody,
  GroupApplyPreviewBody,
  GroupCreateBody,
  GroupMembersBody,
  GroupPatchBody,
} from "@/lib/schemas/params/groups";
import { iso } from "../clock";
import { db, groupById, listingsInGroup, resolveListing } from "../db";
import { recomputeListing } from "../effects";
import { jobRunner } from "../job-runner";
import { moneyOrNull, projectGroupDetail, projectGroupSummary } from "../project";
import { uuidFrom } from "../random";
import { defineMock, notFound } from "./common";
import type { GroupRow, ListingRow } from "../types";

type IdPath = { id: string };
type CreateBody = z.infer<typeof GroupCreateBody>;
type PatchBody = z.infer<typeof GroupPatchBody>;
type MembersBody = z.infer<typeof GroupMembersBody>;
type ApplyBody = z.infer<typeof GroupApplyBody>;
type PreviewBody = z.infer<typeof GroupApplyPreviewBody>;

const now = (): string => iso(Date.now());

const mustFind = (id: string): GroupRow => groupById(id) ?? (notFound(`group ${id}`) as never);

const defaultGroup = (): GroupRow => db.groups.find((g) => g.is_default) ?? db.groups[0];

const hasOverride = (l: ListingRow): boolean =>
  l.margin_override_percent !== null || l.margin_override_fixed_cents !== null;

const eligibleIn = (groupId: string): ListingRow[] =>
  listingsInGroup(groupId).filter(
    (l) =>
      l.approval_status !== "inactive" &&
      l.approval_status !== "rejected" &&
      resolveListing(l).base !== null,
  );

const inScope = (groupId: string, scope: ApplyBody["scope"]): ListingRow[] => {
  const eligible = eligibleIn(groupId);
  if (scope === "all") return eligible;
  if (scope === "group_rule_only") return eligible.filter((l) => !hasOverride(l));
  return eligible.filter(hasOverride);
};

const averageOf = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

/** The rule after this apply: an absent field means 不更新, so the current group value stands. */
const nextRule = (group: GroupRow, body: ApplyBody) => ({
  percent: body.margin_percent !== undefined ? Number(body.margin_percent) : group.margin_percent,
  fixedCents: body.margin_fixed !== undefined ? toCents(body.margin_fixed) : group.margin_fixed_cents,
});

export const groupsHandlers = [
  defineMock("listGroups", () => ({
    data: db.groups.map((g) => projectGroupSummary(db, g)),
  })),

  defineMock<undefined, CreateBody>("createGroup", ({ body }) => {
    if (db.groups.some((g) => g.name === body.name)) {
      throw new ApiError("conflict", "a group with that name already exists");
    }
    const group: GroupRow = {
      id: uuidFrom(`group:new:${body.name}`),
      name: body.name,
      is_default: false,
      margin_percent: body.margin_percent === undefined ? null : Number(body.margin_percent),
      margin_fixed_cents: body.margin_fixed === undefined ? null : toCents(body.margin_fixed),
      updated_at: now(),
    };
    db.groups.push(group);
    return { data: projectGroupDetail(db, group) };
  }),

  defineMock<undefined, undefined, IdPath>("getGroup", ({ params }) => ({
    data: projectGroupDetail(db, mustFind(params.id)),
  })),

  defineMock<undefined, PatchBody, IdPath>("updateGroup", ({ params, body }) => {
    const group = mustFind(params.id);
    if (group.is_default) {
      throw new ApiError("default_group_immutable", "預設分組 cannot be renamed");
    }
    if (db.groups.some((g) => g.id !== group.id && g.name === body.name)) {
      throw new ApiError("conflict", "a group with that name already exists");
    }
    group.name = body.name;
    group.updated_at = now();
    return { data: projectGroupDetail(db, group) };
  }),

  /**
   * Gap 18/14. Deletion never refuses a non-empty group — it reassigns to 預設分組 and re-runs §5 for
   * every affected listing, which at 24 products × 8 sizes is a fan-out. Hence 202 and a job, and hence
   * `group_not_empty` being a dead code.
   */
  defineMock<undefined, undefined, IdPath>("deleteGroup", ({ params }) => {
    const group = mustFind(params.id);
    if (group.is_default) {
      throw new ApiError("default_group_immutable", "預設分組 cannot be deleted");
    }
    const live = jobRunner.running("group_apply", group.id) ?? jobRunner.running("group_rule_recompute", group.id);
    if (live) {
      throw new ApiError("job_already_running", "a job for this group is still running", {
        job_id: live.id,
      });
    }

    const target = defaultGroup();
    const moved = db.products.filter((p) => p.group_id === group.id);
    const listings = moved.flatMap((p) => db.listings.filter((l) => l.product_sku === p.sku));
    for (const product of moved) {
      product.group_id = target.id;
      product.updated_at = now();
    }
    db.groups.splice(db.groups.indexOf(group), 1);

    const job = jobRunner.enqueue({
      kind: "group_rule_recompute",
      scopeKey: target.id,
      listings,
      effect: () => {
        const before = averageOf(
          listings.flatMap((l) => (l.approved_price_cents === null ? [] : [l.approved_price_cents])),
        );
        let updated = 0;
        for (const listing of listings) {
          const outcome = recomputeListing(listing, { trigger: "batch", actorLabel: "分組批次更新" });
          if (outcome.outcome === "auto_approved") updated += 1;
        }
        return {
          updated_count: updated,
          overridden_cleared_count: 0,
          held_count: 0,
          average_price_before_cents: before,
          average_price_after_cents: averageOf(
            listings.flatMap((l) => (l.approved_price_cents === null ? [] : [l.approved_price_cents])),
          ),
        };
      },
    });

    return {
      data: {
        job_id: job.id,
        reassigned_product_count: moved.length,
        target_group_id: target.id,
      },
    };
  }),

  defineMock<undefined, MembersBody, IdPath>("addGroupMembers", ({ params, body }) => {
    const group = mustFind(params.id);
    const moved: { sku: string; from_group_id: string; from_group_name: string }[] = [];
    let recomputed = 0;

    for (const sku of body.product_skus) {
      const product = db.products.find((p) => p.sku === sku);
      if (!product || product.group_id === group.id) continue;
      const from = groupById(product.group_id);
      moved.push({
        sku,
        from_group_id: product.group_id,
        from_group_name: from?.name ?? "—",
      });
      product.group_id = group.id;
      product.updated_at = now();
      for (const listing of db.listings.filter((l) => l.product_sku === sku)) {
        recomputeListing(listing, { trigger: "batch", actorLabel: "分組批次更新" });
        recomputed += 1;
      }
    }

    return {
      data: {
        group_id: group.id,
        added_count: moved.length,
        removed_count: 0,
        recomputed_listing_count: recomputed,
        moved,
      },
    };
  }),

  defineMock<undefined, MembersBody, IdPath>("removeGroupMembers", ({ params, body }) => {
    const group = mustFind(params.id);
    if (group.is_default) {
      // Every product is in exactly one group and 預設分組 is the catch-all: there is nowhere to
      // remove a product *to* (Gap 17 — 未分組 does not exist).
      throw new ApiError("default_group_immutable", "products cannot be removed from 預設分組");
    }
    const target = defaultGroup();
    let removed = 0;
    let recomputed = 0;
    for (const sku of body.product_skus) {
      const product = db.products.find((p) => p.sku === sku);
      if (!product || product.group_id !== group.id) continue;
      product.group_id = target.id;
      product.updated_at = now();
      removed += 1;
      for (const listing of db.listings.filter((l) => l.product_sku === sku)) {
        recomputeListing(listing, { trigger: "batch", actorLabel: "分組批次更新" });
        recomputed += 1;
      }
    }
    return {
      data: {
        group_id: group.id,
        added_count: 0,
        removed_count: removed,
        recomputed_listing_count: recomputed,
        moved: [],
      },
    };
  }),

  /**
   * Gap 15. 「以成本 HK$1,200 計算 … 目前售價 → 更新後」 needs the margin precedence chain, the rounding
   * rule and the per-scope selection, all of which live server-side. POST for the body; it writes
   * nothing.
   */
  defineMock<undefined, PreviewBody, IdPath>("previewGroupApply", ({ params, body }) => {
    const group = mustFind(params.id);
    const detail = projectGroupDetail(db, group);
    const selected = inScope(group.id, body.scope);
    const rule = nextRule(group, body);
    const margins = { percent: rule.percent ?? 0, fixedCents: rule.fixedCents ?? 0 };

    const costs = selected.flatMap((l) => {
      const base = resolveListing(l).base;
      return base ? [base.costCents] : [];
    });
    const providedCost = body.sample_cost === undefined ? null : toCents(body.sample_cost);
    const sampleCost = providedCost ?? median(costs) ?? 100_000;
    const sample = computeSellingPrice(sampleCost, margins, db.settings.rounding_enabled);
    const sampleListing = selected.find((l) => resolveListing(l).base?.costCents === sampleCost);

    let increase = 0;
    let decrease = 0;
    let unchanged = 0;
    let wouldHold = 0;
    const before: number[] = [];
    const after: number[] = [];

    for (const listing of selected) {
      const base = resolveListing(listing).base;
      if (!base) continue;
      const next = computeSellingPrice(base.costCents, margins, db.settings.rounding_enabled);
      const current = listing.approved_price_cents;
      if (current !== null) {
        before.push(current);
        after.push(next.priceCents);
        if (next.priceCents > current) increase += 1;
        else if (next.priceCents < current) decrease += 1;
        else unchanged += 1;
        if (
          current > 0 &&
          !withinBand(next.priceCents, current, {
            upPercent: db.settings.auto_approve_up_percent,
            downPercent: db.settings.auto_approve_down_percent,
          })
        ) {
          wouldHold += 1;
        }
      } else {
        unchanged += 1;
      }
    }

    return {
      data: {
        scope: body.scope,
        sample: {
          cost: moneyOrNull(sampleCost) as string,
          cost_basis: providedCost === null ? ("median_base_cost" as const) : ("provided" as const),
          margin_percent: rule.percent === null ? null : rule.percent.toFixed(4),
          margin_fixed: moneyOrNull(rule.fixedCents),
          current_price: moneyOrNull(sampleListing?.approved_price_cents ?? null),
          raw_price: moneyOrNull(sample.rawCents) as string,
          new_price: moneyOrNull(sample.priceCents) as string,
          rounding_applied: sample.roundingApplied,
        },
        affected_count: selected.length,
        scope_counts: detail.scope_counts,
        ineligible: detail.ineligible,
        average_price_before: moneyOrNull(averageOf(before)),
        average_price_after: moneyOrNull(averageOf(after)),
        increase_count: increase,
        decrease_count: decrease,
        unchanged_count: unchanged,
        // Informational while a human-initiated batch *is* the approval (Gap 1). Flip
        // BATCH_BYPASSES_BAND and this becomes the count Screen 4 must render as 「N 個尺寸待審核」.
        would_hold_for_approval: wouldHold,
      },
    };
  }),

  defineMock<undefined, ApplyBody, IdPath>("applyGroupMargins", ({ params, body }) => {
    const group = mustFind(params.id);
    const existing = jobRunner.running("group_apply", group.id);
    if (existing) {
      // Screen 4 must adopt the running job rather than surface this as an error.
      throw new ApiError("job_already_running", `job ${existing.id} is already applying this group`, {
        job_id: existing.id,
      });
    }

    const selected = inScope(group.id, body.scope);
    const rule = nextRule(group, body);
    const clearedCount = selected.filter(hasOverride).length;

    const job = jobRunner.enqueue({
      kind: "group_apply",
      scopeKey: group.id,
      listings: selected,
      effect: () => {
        const before = averageOf(
          selected.flatMap((l) => (l.approved_price_cents === null ? [] : [l.approved_price_cents])),
        );
        group.margin_percent = rule.percent;
        group.margin_fixed_cents = rule.fixedCents;
        group.updated_at = now();

        let updated = 0;
        let held = 0;
        for (const listing of selected) {
          // The scope's whole meaning: a size selected for the group rule loses its per-size override.
          listing.margin_override_percent = null;
          listing.margin_override_fixed_cents = null;
          listing.margins_unresolved = false;
          const outcome = recomputeListing(listing, { trigger: "batch", actorLabel: "分組批次更新" });
          if (outcome.outcome === "auto_approved") updated += 1;
          if (outcome.outcome === "held_for_approval") held += 1;
        }

        return {
          updated_count: updated,
          overridden_cleared_count: clearedCount,
          held_count: held,
          average_price_before_cents: before,
          average_price_after_cents: averageOf(
            selected.flatMap((l) => (l.approved_price_cents === null ? [] : [l.approved_price_cents])),
          ),
        };
      },
    });

    return { data: { job_id: job.id, total: job.total, status: job.status } };
  }),
];
