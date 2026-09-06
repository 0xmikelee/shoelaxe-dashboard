import { describe, expect, it } from "vitest";
import { ANON_ACTOR } from "@/lib/http/session-auth";
import { MemoryDashboardRepo } from "@/lib/repo/dashboard-memory";
import { getSettings, updateSettings, drainSettingsRecompute } from "@/lib/services/settings";

const NOW = "2026-09-06T09:00:00.000Z";
const SKU = "555088-101";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000010";
const L1 = "00000000-0000-4000-8000-000000000011";
const ACTOR = { ...ANON_ACTOR, id: "00000000-0000-4000-8000-000000000001", label: "Mike" };

const deps = (repo: MemoryDashboardRepo) => ({
  repo,
  publishTarget: "none" as const,
  now: NOW,
  actor: ACTOR,
});

function seedApprovedOnDefault(repo: MemoryDashboardRepo) {
  repo.seedProduct({ id: PRODUCT_ID, product_sku: SKU, product_name: "Air Jordan 1" });
  repo.seedListing({
    id: L1,
    product_id: PRODUCT_ID,
    product_sku: SKU,
    size: "US 9",
    approval_status: "approved",
    approved_price: "1349.00",
    approved_at: NOW,
    base_cost: "1200.00",
    base_cost_source: "in_house",
    base_cost_at: NOW,
    margin_percent: null,
    margin_fixed: null,
    margin_source: "default",
  });
  repo.seedSource({
    listing_id: L1,
    source: "in_house",
    cost: "1200.00",
    cost_at: NOW,
    previous_cost: null,
    previous_cost_at: null,
    quantity: 1,
    last_source_ref: "sheet:1",
    last_synced_at: NOW,
  });
}

describe("settings", () => {
  it("returns the seeded thresholds, default margin and rounding toggle", async () => {
    const repo = new MemoryDashboardRepo();
    const settings = await getSettings(repo);
    expect(settings.auto_approve_up_percent).toBe("10.000");
    expect(settings.auto_approve_down_percent).toBe("10.000");
    expect(settings.default_margin_enabled).toBe(true);
    expect(settings.rounding_enabled).toBe(true);
    expect(settings.crawl_cadence_minutes).toBeNull();
  });

  it("returns 200 and no job when the patch matches the current row", async () => {
    const repo = new MemoryDashboardRepo();
    const { result, status } = await updateSettings(
      { rounding_enabled: true, default_margin_percent: "12.0000" },
      deps(repo),
    );
    expect(status).toBe(200);
    expect(result.job).toBeNull();
    expect(repo.jobs).toHaveLength(0);
  });

  it("enqueues settings_recompute when rounding or the default margin changes", async () => {
    const repo = new MemoryDashboardRepo();
    seedApprovedOnDefault(repo);
    const { result, status } = await updateSettings({ rounding_enabled: false }, deps(repo));
    expect(status).toBe(202);
    expect(result.job?.total).toBe(1);
    expect(result.settings.rounding_enabled).toBe(false);
    expect(repo.jobs[0]?.kind).toBe("settings_recompute");
    expect(repo.jobs[0]?.scope_key).toBe("system");
    expect(repo.jobItems).toHaveLength(1);
  });

  it("refuses a second save while a recompute is already running", async () => {
    const repo = new MemoryDashboardRepo();
    seedApprovedOnDefault(repo);
    await updateSettings({ rounding_enabled: false }, deps(repo));
    await expect(updateSettings({ rounding_enabled: true }, deps(repo))).rejects.toMatchObject({
      code: "job_already_running",
    });
  });

  it("does not unapprove a live price when the default margin is disabled", async () => {
    const repo = new MemoryDashboardRepo();
    seedApprovedOnDefault(repo);
    const { status } = await updateSettings({ default_margin_enabled: false }, deps(repo));
    expect(status).toBe(202);

    const drained = await drainSettingsRecompute(deps(repo));
    expect(drained.processed).toBe(1);
    const listing = await repo.findListingById(L1);
    expect(listing?.approval_status).toBe("approved");
    expect(listing?.approved_price).toBe("1349.00");
  });
});
