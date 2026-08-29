import { db } from "../db";
import { rate, money } from "../project";
import { defineMock, publishing } from "./common";

/**
 * Gap 5. The settings snapshot rides along because Screens 2, 3, 4 and 8 all render a price formula
 * preview; without it each of them needs a second round trip before it can draw one.
 */
export const meHandlers = [
  defineMock("getMe", () => ({
    data: { user_id: db.me.user_id, email: db.me.email, name: db.me.name },
    meta: {
      publishing: publishing(),
      default_group_id: db.groups.find((g) => g.is_default)?.id ?? db.groups[0].id,
      settings: {
        auto_approve_up_percent: rate(db.settings.auto_approve_up_percent),
        auto_approve_down_percent: rate(db.settings.auto_approve_down_percent),
        default_margin_enabled: db.settings.default_margin_enabled,
        default_margin_percent: rate(db.settings.default_margin_percent),
        default_margin_fixed: money(db.settings.default_margin_fixed_cents),
        rounding_enabled: db.settings.rounding_enabled,
      },
    },
  })),
];
