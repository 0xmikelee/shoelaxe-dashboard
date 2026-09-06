import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { ANON_ACTOR } from "@/lib/http/session-auth";
import { MemoryDashboardRepo } from "@/lib/repo/dashboard-memory";
import { ApprovalsQuery } from "@/lib/schemas/params/approvals";
import { getApprovalStats, listApprovals } from "@/lib/services/approvals";
import {
  approveListing,
  bulkApproveListings,
  rejectListing,
  setListingPrice,
  type ListingWriteDeps,
} from "@/lib/services/listings";

const NOW = "2026-09-06T09:00:00.000Z";
const SKU = "555088-101";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000010";
const L1 = "00000000-0000-4000-8000-000000000011";
const L2 = "00000000-0000-4000-8000-000000000012";
const UPDATE = "00000000-0000-4000-8000-000000000013";
const ACTOR = { ...ANON_ACTOR, id: "00000000-0000-4000-8000-000000000001", label: "Mike" };

const deps = (repo: MemoryDashboardRepo, publishTarget: "none" | "shopify" = "none"): ListingWriteDeps => ({
  repo,
  publishTarget,
  now: NOW,
  actor: ACTOR,
});

function seedProduct(repo: MemoryDashboardRepo) {
  return repo.seedProduct({ id: PRODUCT_ID, product_sku: SKU, product_name: "Air Jordan 1" });
}

function seedPendingNew(repo: MemoryDashboardRepo, id = L1) {
  seedProduct(repo);
  const listing = repo.seedListing({
    id,
    product_id: PRODUCT_ID,
    product_sku: SKU,
    size: "US 9",
    approval_status: "pending_new",
    pending_price: "1349.00",
    pending_since: NOW,
    pending_update_id: UPDATE,
    base_cost: "1200.00",
    base_cost_source: "in_house",
    base_cost_at: NOW,
    margin_source: "default",
  });
  repo.seedSource({
    listing_id: listing.id,
    source: "in_house",
    cost: "1200.00",
    cost_at: NOW,
    previous_cost: null,
    previous_cost_at: null,
    quantity: 1,
    last_source_ref: "sheet:1",
    last_synced_at: NOW,
  });
  repo.seedUpdate({
    id: UPDATE,
    listing_id: listing.id,
    product_sku: SKU,
    product_name: "Air Jordan 1",
    size: "US 9",
    source: "google_sheet",
    cost: "1200.00",
    status: "pending",
    outcome: "new_listing",
    engine: "v2",
    threshold_up_percent: "10.000",
    threshold_down_percent: "10.000",
    observed_at: NOW,
    received_at: NOW,
  });
  return listing;
}

function seedPendingPrice(repo: MemoryDashboardRepo, id = L2) {
  seedProduct(repo);
  const listing = repo.seedListing({
    id,
    product_id: PRODUCT_ID,
    product_sku: SKU,
    size: "US 10",
    approval_status: "pending_price",
    approved_price: "1349.00",
    approved_at: "2026-08-01T00:00:00.000Z",
    pending_price: "1549.00",
    pending_since: NOW,
    pending_update_id: UPDATE,
    base_cost: "1380.00",
    base_cost_source: "in_house",
    base_cost_at: NOW,
    margin_source: "default",
  });
  repo.seedSource({
    listing_id: listing.id,
    source: "in_house",
    cost: "1380.00",
    cost_at: NOW,
    previous_cost: "1200.00",
    previous_cost_at: "2026-08-01T00:00:00.000Z",
    quantity: 1,
    last_source_ref: "sheet:2",
    last_synced_at: NOW,
  });
  return listing;
}

describe("approveListing", () => {
  it("approves a pending_new listing, stamps history, and enqueues Shopify", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingNew(repo);
    const wire = await approveListing(L1, deps(repo, "shopify"));
    expect(wire.approval_status).toBe("approved");
    expect(wire.approved_price).toBe("1349.00");
    expect(wire.pending_price).toBeNull();
    expect(repo.history[0]?.change_type).toBe("listing_price");
    expect(repo.audit.some((a) => a.action === "approve")).toBe(true);
    expect(repo.shopifyJobs).toEqual([{ listing_id: L1, state: "queued" }]);
    expect(repo.priceUpdates[0]?.status).toBe("applied");
  });

  it("approves a held pending_price listing at the pending price", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingPrice(repo);
    const wire = await approveListing(L2, deps(repo));
    expect(wire.approval_status).toBe("approved");
    expect(wire.approved_price).toBe("1549.00");
    expect(wire.previous_approved_price).toBe("1349.00");
    expect(repo.shopifyJobs[0]?.state).toBe("deferred");
  });

  it("returns not_pending on a second approve (the expected race)", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingNew(repo);
    await approveListing(L1, deps(repo));
    await expect(approveListing(L1, deps(repo))).rejects.toMatchObject({ code: "not_pending" });
    expect(repo.shopifyJobs).toHaveLength(1);
  });

  it("refuses needs_margins and inactive listings", async () => {
    const repo = new MemoryDashboardRepo();
    seedProduct(repo);
    repo.seedListing({
      id: L1,
      product_id: PRODUCT_ID,
      product_sku: SKU,
      size: "US 9",
      approval_status: "needs_margins",
      pending_price: "1349.00",
    });
    await expect(approveListing(L1, deps(repo))).rejects.toMatchObject({ code: "needs_margins" });

    const inactive = new MemoryDashboardRepo();
    seedProduct(inactive);
    inactive.seedListing({
      id: L1,
      product_id: PRODUCT_ID,
      product_sku: SKU,
      size: "US 9",
      approval_status: "inactive",
      pending_price: "1349.00",
    });
    await expect(approveListing(L1, deps(inactive))).rejects.toMatchObject({ code: "listing_inactive" });
  });
});

describe("rejectListing", () => {
  it("rejects a pending_new listing and does not enqueue Shopify", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingNew(repo);
    const wire = await rejectListing(L1, "too high", deps(repo, "shopify"));
    expect(wire.approval_status).toBe("rejected");
    expect(repo.shopifyJobs).toHaveLength(0);
    expect(repo.audit[0]?.action).toBe("reject");
  });

  it("returns a pending_price listing to approved at the old price without publishing", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingPrice(repo);
    const wire = await rejectListing(L2, undefined, deps(repo, "shopify"));
    expect(wire.approval_status).toBe("approved");
    expect(wire.approved_price).toBe("1349.00");
    expect(wire.pending_price).toBeNull();
    expect(repo.shopifyJobs).toHaveLength(0);
  });
});

describe("setListingPrice", () => {
  it("bypasses the band, writes manual_price, and enqueues Shopify", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingPrice(repo);
    const wire = await setListingPrice(L2, "1699.00", deps(repo, "shopify"));
    expect(wire.approval_status).toBe("approved");
    expect(wire.approved_price).toBe("1699.00");
    expect(repo.history[0]?.change_type).toBe("manual_price");
    expect(repo.shopifyJobs).toEqual([{ listing_id: L2, state: "queued" }]);
  });
});

describe("bulkApproveListings", () => {
  it("approves by listing_ids and reports not_pending for a race", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingNew(repo, L1);
    const result = await bulkApproveListings({ listing_ids: [L1, L1] }, deps(repo));
    expect(result.ok_count).toBe(1);
    expect(result.failed_count).toBe(1);
    expect(result.results[1]?.error_code).toBe("not_pending");
  });

  it("approves every size of a product_sku", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingNew(repo, L1);
    repo.seedListing({
      id: L2,
      product_id: PRODUCT_ID,
      product_sku: SKU,
      size: "US 10",
      approval_status: "pending_new",
      pending_price: "1349.00",
    });
    const result = await bulkApproveListings({ product_sku: SKU }, deps(repo));
    expect(result.ok_count).toBe(2);
    expect(result.failed_count).toBe(0);
  });
});

describe("approvals reads", () => {
  it("lists the queue and reports Gap 8 lifetime stats", async () => {
    const repo = new MemoryDashboardRepo();
    seedPendingNew(repo);
    const listed = await listApprovals(ApprovalsQuery.parse({}), {
      repo,
      now: NOW,
      publishingEnabled: false,
    });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.status).toBe("pending_new");
    expect(listed.meta.publishing.enabled).toBe(false);

    const stats = await getApprovalStats({ repo, now: NOW, publishingEnabled: false });
    expect(stats.pending).toBe(1);
    expect(stats.total_crawled).toBe(1);
    expect(stats.crawled_today).toBe(1);
  });
});

describe("ApiError identity", () => {
  it("is an ApiError, not a generic Error", async () => {
    const repo = new MemoryDashboardRepo();
    try {
      await approveListing(L1, deps(repo));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("not_found");
    }
  });
});
