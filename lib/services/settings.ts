import { ApiError } from "@/lib/http/errors";
import type { SessionActor } from "@/lib/http/session-auth";
import { SettingsPatchBody } from "@/lib/schemas/params/settings";
import type { Settings, SettingsUpdateResult } from "@/lib/schemas/wire/settings";
import type { DashboardRepo, SettingsPatch } from "@/lib/repo/dashboard-types";
import type { ListingWriteDeps } from "@/lib/services/listings";
import { recomputeListing } from "@/lib/services/listings";
import type { z } from "zod";

export interface SettingsDeps {
  repo: DashboardRepo;
  publishTarget: "none" | "shopify";
  now: string;
  actor: SessionActor;
}

function toWire(row: Awaited<ReturnType<DashboardRepo["getSettings"]>>): Settings {
  return {
    auto_approve_up_percent: row.auto_approve_up_percent,
    auto_approve_down_percent: row.auto_approve_down_percent,
    default_margin_enabled: row.default_margin_enabled,
    default_margin_percent: row.default_margin_percent,
    default_margin_fixed: row.default_margin_fixed,
    rounding_enabled: row.rounding_enabled,
    crawl_cadence_minutes: null,
    updated_at: row.updated_at,
    updated_by_name: row.updated_by_name,
  };
}

const REPRICING_KEYS: readonly (keyof SettingsPatch)[] = [
  "auto_approve_up_percent",
  "auto_approve_down_percent",
  "default_margin_enabled",
  "default_margin_percent",
  "default_margin_fixed",
  "rounding_enabled",
];

export async function getSettings(repo: DashboardRepo): Promise<Settings> {
  return toWire(await repo.getSettings());
}

export async function updateSettings(
  body: z.infer<typeof SettingsPatchBody>,
  deps: SettingsDeps,
): Promise<{ result: SettingsUpdateResult; status: 200 | 202 }> {
  const running = await deps.repo.findActiveJob("settings_recompute", "system");
  if (running) {
    throw new ApiError("job_already_running", "a settings recompute is already running", {
      job_id: running.id,
    });
  }

  const current = await deps.repo.getSettings();
  const patch: SettingsPatch = {};
  if (body.auto_approve_up_percent !== undefined) patch.auto_approve_up_percent = body.auto_approve_up_percent;
  if (body.auto_approve_down_percent !== undefined) {
    patch.auto_approve_down_percent = body.auto_approve_down_percent;
  }
  if (body.default_margin_enabled !== undefined) patch.default_margin_enabled = body.default_margin_enabled;
  if (body.default_margin_percent !== undefined) patch.default_margin_percent = body.default_margin_percent;
  if (body.default_margin_fixed !== undefined) patch.default_margin_fixed = body.default_margin_fixed;
  if (body.rounding_enabled !== undefined) patch.rounding_enabled = body.rounding_enabled;

  const changed = (Object.keys(patch) as (keyof SettingsPatch)[]).some(
    (k) => patch[k] !== undefined && patch[k] !== current[k],
  );
  const settings = changed ? await deps.repo.updateSettings(patch, deps.actor, deps.now) : current;

  await deps.repo.insertAuditLog({
    user_id: deps.actor.id,
    actor_label: deps.actor.label,
    action: "update_settings",
    target_table: "pricing_settings",
    target_id: null,
    before: current,
    after: settings,
  });

  const repricing = REPRICING_KEYS.some((k) => patch[k] !== undefined && patch[k] !== current[k]);
  if (!repricing) {
    return { result: { settings: toWire(settings), job: null }, status: 200 };
  }

  const roundingOrBandChanged =
    patch.rounding_enabled !== undefined ||
    patch.auto_approve_up_percent !== undefined ||
    patch.auto_approve_down_percent !== undefined;
  const defaultMarginChanged =
    patch.default_margin_enabled !== undefined ||
    patch.default_margin_percent !== undefined ||
    patch.default_margin_fixed !== undefined;

  const listingIds = await deps.repo.listRecomputeListingIds({
    roundingOrBandChanged,
    defaultMarginChanged,
  });
  if (listingIds.length === 0) {
    return { result: { settings: toWire(settings), job: null }, status: 200 };
  }

  let job;
  try {
    job = await deps.repo.insertJob({
      kind: "settings_recompute",
      scope_key: "system",
      total: listingIds.length,
      payload: { listing_ids: listingIds },
      triggered_by: deps.actor.id,
    });
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23505") {
      const active = await deps.repo.findActiveJob("settings_recompute", "system");
      throw new ApiError("job_already_running", "a settings recompute is already running", {
        job_id: active?.id,
      });
    }
    throw e;
  }
  await deps.repo.insertJobItems(job.id, listingIds);

  return {
    result: {
      settings: toWire(settings),
      job: { id: job.id, total: job.total, status: job.status },
    },
    status: 202,
  };
}

export async function drainSettingsRecompute(deps: ListingWriteDeps): Promise<{ processed: number }> {
  const job = await deps.repo.claimQueuedJob("settings_recompute", deps.now);
  if (!job) return { processed: 0 };
  const ids = await deps.repo.listQueuedJobListingIds(job.id);
  let failed = 0;
  for (const listingId of ids) {
    try {
      await recomputeListing(listingId, deps, "ingest");
      await deps.repo.markJobItemDone(job.id, listingId, "succeeded", null);
    } catch (e) {
      failed += 1;
      await deps.repo.markJobItemDone(
        job.id,
        listingId,
        "failed",
        e instanceof Error ? e.message : "internal_error",
      );
    }
    await deps.repo.incrementJobDone(job.id);
  }
  await deps.repo.finishJob(
    job.id,
    failed === 0 ? "succeeded" : "failed",
    deps.now,
    failed === 0 ? null : `${failed} listing(s) failed`,
  );
  return { processed: ids.length };
}
