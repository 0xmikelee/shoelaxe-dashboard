import { z } from "zod";
import { toCents } from "@/lib/domain/money";
import { ApiError } from "@/lib/http/errors";
import type { SettingsPatchBody } from "@/lib/schemas/params/settings";
import { MINUTE, SEED_NOW_MS, iso } from "../clock";
import { db } from "../db";
import { recomputeListing } from "../effects";
import { jobRunner } from "../job-runner";
import { projectSettings } from "../project";
import { defineMock, publishing } from "./common";
import type { ListingRow } from "../types";

type PatchBody = z.infer<typeof SettingsPatchBody>;

/** Three fields re-price every listing resolving to the system default, which is a worker fan-out. */
const REPRICING_FIELDS: readonly (keyof PatchBody)[] = [
  "auto_approve_up_percent",
  "auto_approve_down_percent",
  "default_margin_enabled",
  "default_margin_percent",
  "default_margin_fixed",
  "rounding_enabled",
];

export const settingsHandlers = [
  defineMock("getSettings", () => ({ data: projectSettings(db.settings) })),

  /**
   * Gap 7. The body shape is identical whether or not work was enqueued, so the client must branch on
   * `job`, never on 200 versus 202 — otherwise the screen shows a green tick while prices keep moving
   * for the next minute.
   */
  defineMock<undefined, PatchBody>("updateSettings", ({ body }) => {
    const running = jobRunner.running("settings_recompute", null);
    if (running) {
      throw new ApiError("job_already_running", "a settings recompute is already running", {
        job_id: running.id,
      });
    }

    const repricing = REPRICING_FIELDS.some((field) => body[field] !== undefined);

    if (body.auto_approve_up_percent !== undefined) {
      db.settings.auto_approve_up_percent = Number(body.auto_approve_up_percent);
    }
    if (body.auto_approve_down_percent !== undefined) {
      db.settings.auto_approve_down_percent = Number(body.auto_approve_down_percent);
    }
    if (body.default_margin_enabled !== undefined) {
      db.settings.default_margin_enabled = body.default_margin_enabled;
    }
    if (body.default_margin_percent !== undefined) {
      db.settings.default_margin_percent = Number(body.default_margin_percent);
    }
    if (body.default_margin_fixed !== undefined) {
      db.settings.default_margin_fixed_cents = toCents(body.default_margin_fixed);
    }
    if (body.rounding_enabled !== undefined) db.settings.rounding_enabled = body.rounding_enabled;
    if (body.crawl_cadence_minutes !== undefined) {
      db.settings.crawl_cadence_minutes = body.crawl_cadence_minutes;
    }
    db.settings.updated_at = iso(Date.now());
    db.settings.updated_by_name = db.me.name;

    // Only listings resolving to the *system default* are repriced: an overridden or group-ruled size
    // is unaffected by a change to a default it never reads.
    const affected: ListingRow[] = repricing
      ? db.listings.filter(
          (l) =>
            l.approval_status !== "inactive" &&
            l.margin_override_percent === null &&
            l.margin_override_fixed_cents === null,
        )
      : [];

    const job =
      affected.length > 0
        ? jobRunner.enqueue({
            kind: "settings_recompute",
            scopeKey: null,
            listings: affected,
            effect: () => {
              let updated = 0;
              let held = 0;
              for (const listing of affected) {
                const outcome = recomputeListing(listing, {
                  trigger: "ingest",
                  actorLabel: "系統自動",
                });
                if (outcome.outcome === "auto_approved") updated += 1;
                if (outcome.outcome === "held_for_approval") held += 1;
              }
              return {
                updated_count: updated,
                overridden_cleared_count: 0,
                held_count: held,
                average_price_before_cents: null,
                average_price_after_cents: null,
              };
            },
          })
        : null;

    return {
      data: {
        settings: projectSettings(db.settings),
        job: job ? { id: job.id, total: job.total, status: job.status } : null,
      },
      // 202 when work was enqueued, 200 when nothing needed recomputing — and the body is the same
      // either way, which is exactly why the client must not branch on the status code.
      status: job ? 202 : 200,
    };
  }),

  defineMock("getSystemHealth", () => {
    const worker = jobRunner.worker();
    const lastCrawl = db.crawlRuns.find((r) => r.source === "stockx") ?? null;
    const cadence = db.settings.crawl_cadence_minutes;
    const crawlStale =
      lastCrawl === null ||
      (cadence !== null && Date.parse(lastCrawl.started_at) < SEED_NOW_MS - 2 * cadence * MINUTE);

    return {
      data: {
        database: "ok" as const,
        // Two indicators, never one: a stale crawl means the Apps Script trigger stopped, a stale
        // heartbeat means the background service died. Same symptom in the browser, different fix.
        worker: {
          status: worker.stale ? ("stale" as const) : ("ok" as const),
          heartbeat_at: worker.heartbeat_at,
          instance: worker.instance,
        },
        crawl: {
          status: lastCrawl === null ? ("never" as const) : crawlStale ? ("stale" as const) : ("ok" as const),
          last_run_at: lastCrawl?.started_at ?? null,
        },
        publishing: publishing(),
      },
    };
  }),
];
