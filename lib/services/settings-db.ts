import { getEnv } from "@/lib/env-core";
import { getSql } from "@/lib/db/sql";
import { PostgresDashboardRepo } from "@/lib/repo/dashboard";
import { ANON_ACTOR } from "@/lib/http/session-auth";
import { recomputeListing } from "@/lib/services/listings";

/**
 * Worker-safe (no `server-only`). Claims one `settings_recompute` job and re-runs `decide` per
 * listing with `trigger: "ingest"` so live prices still go through the band.
 */
export async function drainSettingsRecomputeFromDb(): Promise<{ processed: number }> {
  const env = getEnv();
  const sql = getSql();
  const now = new Date().toISOString();
  const outer = new PostgresDashboardRepo(sql);
  const claimed = await outer.claimQueuedJob("settings_recompute", now);
  if (!claimed) return { processed: 0 };
  const ids = await outer.listQueuedJobListingIds(claimed.id);
  let failed = 0;
  for (const listingId of ids) {
    try {
      await sql.begin(async (tx) => {
        await recomputeListing(
          listingId,
          {
            repo: new PostgresDashboardRepo(tx),
            publishTarget: env.PUBLISH_TARGET,
            now,
            actor: ANON_ACTOR,
          },
          "ingest",
        );
      });
      await outer.markJobItemDone(claimed.id, listingId, "succeeded", null);
    } catch (e) {
      failed += 1;
      await outer.markJobItemDone(
        claimed.id,
        listingId,
        "failed",
        e instanceof Error ? e.message : "internal_error",
      );
    }
    await outer.incrementJobDone(claimed.id);
  }
  await outer.finishJob(
    claimed.id,
    failed === 0 ? "succeeded" : "failed",
    now,
    failed === 0 ? null : `${failed} listing(s) failed`,
  );
  return { processed: ids.length };
}
