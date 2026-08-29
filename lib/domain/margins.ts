import type { MarginSource } from "@/lib/domain/types";

/** A margin pair as stored: either half may be NULL, and NULL is not zero. */
export interface MarginRule {
  percent: number | null;
  fixedCents: number | null;
}

/** Screen 2's system default. Disabled + nothing else set is what produces `needs_margins`. */
export interface DefaultMarginRule {
  enabled: boolean;
  percent: number;
  fixedCents: number;
}

export interface MarginPair {
  percent: number;
  fixedCents: number;
}

export interface ResolvedMargins extends MarginPair {
  /** Which level of the chain won. Denormalised onto `listings.margin_source` for the 已覆寫 badge. */
  source: MarginSource;
}

/**
 * All-or-nothing, at every level. A listing is overridden iff percent OR fixed is non-null, and the
 * null half then counts as zero — never as "fall through for this half".
 *
 * The alternative (per-field fallback) reads reasonable and is wrong: clearing 固定毛利 on a listing
 * would silently re-inherit the group's fixed amount, so 「覆寫 15% + HK$0」 and 「覆寫 15%」 would price
 * differently for no visible reason. It also makes `margin_source` un-computable — a listing would be
 * two sources at once.
 */
function isSet(rule: MarginRule | null): rule is MarginRule {
  return rule !== null && (rule.percent !== null || rule.fixedCents !== null);
}

/**
 * §5's precedence chain: per-listing override → group rule → system default (if enabled) → none.
 * `null` means the chain came up empty, which is the `needs_margins` outcome, not a zero margin.
 */
export function resolveMargins(
  override: MarginRule | null,
  group: MarginRule | null,
  defaults: DefaultMarginRule,
): ResolvedMargins | null {
  if (isSet(override)) {
    return { percent: override.percent ?? 0, fixedCents: override.fixedCents ?? 0, source: "override" };
  }
  if (isSet(group)) {
    return { percent: group.percent ?? 0, fixedCents: group.fixedCents ?? 0, source: "group" };
  }
  if (defaults.enabled) {
    return { percent: defaults.percent, fixedCents: defaults.fixedCents, source: "default" };
  }
  return null;
}
