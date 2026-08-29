import { describe, expect, it } from "vitest";
import type { ErrorBody } from "@/lib/http/wire";
import { mockConfig } from "@/mocks/config";
import { db, jobById } from "@/mocks/db";
import { jobRunner } from "@/mocks/job-runner";
import { SEED } from "@/mocks/seed";
import { apiUrl, getJson, patchJson, postJson } from "@/tests/setup/msw";
import "@/tests/setup/msw";

/**
 * Behaviour over HTTP: the things a screen gets wrong if the mock answers the same rows every time,
 * plus the failures the UI is specified to handle and would otherwise have nothing to handle.
 */

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type ProductRow = { sku: string };

const pendingListing = () =>
  db.listings.find((l) => l.approval_status === "pending_price" && l.pending_price_cents !== null)!;
const approvedListing = () => db.listings.find((l) => l.approval_status === "approved")!;

describe("offset pagination", () => {
  it("serves different rows per page and a total that does not move", async () => {
    const first = await getJson<Envelope<ProductRow[]>>("/api/v1/products?page=1&per_page=20");
    const second = await getJson<Envelope<ProductRow[]>>("/api/v1/products?page=2&per_page=20");

    expect(first.body.data).toHaveLength(20);
    expect(second.body.data).toHaveLength(20);
    expect(first.body.meta).toMatchObject({ total: 40, page: 1, per_page: 20, total_pages: 2 });
    expect(second.body.meta).toMatchObject({ total: 40, page: 2, total_pages: 2 });

    const overlap = first.body.data
      .map((p) => p.sku)
      .filter((sku) => second.body.data.some((p) => p.sku === sku));
    expect(overlap).toEqual([]);
  });

  it("answers an out-of-range page with no rows rather than with page 1", async () => {
    const res = await getJson<Envelope<ProductRow[]>>("/api/v1/products?page=9");
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ page: 9, total_pages: 2 });
  });

  it("reorders when the sort changes, which is why the client must reset to page 1", async () => {
    const byImport = await getJson<Envelope<ProductRow[]>>("/api/v1/products?sort=last_imported_at");
    const byName = await getJson<Envelope<ProductRow[]>>("/api/v1/products?sort=name&order=asc");
    expect(byName.body.data.map((p) => p.sku)).not.toEqual(byImport.body.data.map((p) => p.sku));
  });
});

describe("tab counts", () => {
  it("stay put when the status tab changes, and follow the search box", async () => {
    const all = await getJson<Envelope<ProductRow[]>>("/api/v1/products");
    const delisted = await getJson<Envelope<ProductRow[]>>("/api/v1/products?status=delisted");
    expect(delisted.body.meta.counts).toEqual(all.body.meta.counts);

    const searched = await getJson<Envelope<ProductRow[]>>("/api/v1/products?q=Yeezy");
    expect(searched.body.meta.counts).not.toEqual(all.body.meta.counts);
  });
});

describe("meta.publishing", () => {
  it("is a flag, so the disabled copy is testable", async () => {
    const off = await getJson<Envelope<unknown>>("/api/v1/products");
    expect(off.body.meta.publishing).toEqual({ enabled: false });

    mockConfig.publishingEnabled = true;
    const on = await getJson<Envelope<unknown>>("/api/v1/products");
    expect(on.body.meta.publishing).toEqual({ enabled: true });

    const health = await getJson<{ data: { publishing: { enabled: boolean } } }>("/api/v1/system/health");
    expect(health.body.data.publishing.enabled).toBe(true);
  });
});

describe("the error paths the UI is specified to handle", () => {
  it("409 not_pending on a row somebody else already approved", async () => {
    const listing = approvedListing();
    const res = await postJson<ErrorBody>(`/api/v1/listings/${listing.id}/approve`, undefined);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_pending");
  });

  it("409 job_already_running when a second apply lands on a group", async () => {
    const group = SEED.groupIds.jordan;
    const first = await postJson<{ data: { job_id: string } }>(`/api/v1/groups/${group}/apply`, {
      scope: "all",
      margin_percent: "18.0000",
    });
    expect(first.status).toBe(202);

    const second = await postJson<ErrorBody>(`/api/v1/groups/${group}/apply`, {
      scope: "all",
      margin_percent: "19.0000",
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("job_already_running");
    // Screen 4 adopts the running job rather than surfacing this, so the id has to be findable.
    expect(second.body.error.details).toMatchObject({ job_id: first.body.data.job_id });
    expect(jobById(first.body.data.job_id)).toBeDefined();
  });

  it("409 default_group_immutable on 預設分組", async () => {
    const res = await getJson<ErrorBody>(`/api/v1/groups/${SEED.groupIds.default}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("default_group_immutable");
  });

  it("404 for an unknown SKU, in the envelope and not as a bare status", async () => {
    const res = await getJson<ErrorBody>("/api/v1/products/NOPE-000");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "not_found" });
    expect(res.body.error.message).toContain("NOPE-000");
  });

  it("400 validation_failed on a query the contract rejects", async () => {
    const res = await getJson<ErrorBody>("/api/v1/products?per_page=7");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
  });

  it("forces any code on any endpoint, including the 422s and 500s nothing else emits", async () => {
    const unprocessable = await getJson<ErrorBody>("/api/v1/products?__error=unknown_sku");
    expect(unprocessable.status).toBe(422);
    expect(unprocessable.body.error.code).toBe("unknown_sku");

    const boom = await getJson<ErrorBody>("/api/v1/approvals", {
      headers: { "x-mock-error": "internal_error" },
    });
    expect(boom.status).toBe(500);
    expect(boom.body.error.code).toBe("internal_error");

    const down = await getJson<ErrorBody>("/api/v1/me", {
      headers: { "x-mock-error": "service_unavailable" },
    });
    expect(down.status).toBe(503);
  });

  it("echoes the request id it was given, so a failure can be quoted back to the logs", async () => {
    const res = await getJson("/api/v1/me", { headers: { "x-request-id": "rid-test-1" } });
    expect(res.response.headers.get("x-request-id")).toBe("rid-test-1");
  });
});

describe("writes change the dataset", () => {
  it("approving a held price makes it the live one and closes the queue row", async () => {
    const listing = pendingListing();
    const before = listing.approved_price_cents;
    const pending = listing.pending_price_cents;

    const res = await postJson<{ data: { approved_price: string; pending_price: string | null } }>(
      `/api/v1/listings/${listing.id}/approve`,
      undefined,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.pending_price).toBeNull();
    expect(res.body.data.approved_price).not.toBe(before === null ? null : String(before));
    expect(listing.approved_price_cents).toBe(pending);

    const again = await postJson<ErrorBody>(`/api/v1/listings/${listing.id}/approve`, undefined);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("not_pending");
  });

  it("a group apply moves real prices, but only once the job finishes", async () => {
    const group = SEED.groupIds.yeezy;
    const sku = db.products.find((p) => p.group_id === group)!.sku;
    const listing = db.listings.find(
      (l) => l.product_sku === sku && l.approval_status === "approved",
    )!;
    const before = listing.approved_price_cents;

    const accepted = await postJson<{ data: { job_id: string; total: number; status: string } }>(
      `/api/v1/groups/${group}/apply`,
      { scope: "all", margin_percent: "45.0000" },
    );
    expect(accepted.status).toBe(202);
    expect(accepted.body.data.status).toBe("queued");
    expect(accepted.body.data.total).toBeGreaterThan(0);
    // Nothing has moved yet: the worker has not run, and the screen must not claim otherwise.
    expect(listing.approved_price_cents).toBe(before);

    const finished = jobRunner.runToCompletion(accepted.body.data.job_id);
    expect(finished.status).toBe("succeeded");
    expect(listing.approved_price_cents).not.toBe(before);
    expect(finished.result?.average_price_after_cents).not.toBe(
      finished.result?.average_price_before_cents,
    );

    const detail = await getJson<{ data: { result: { updated_count: number } } }>(
      `/api/v1/jobs/${finished.id}`,
    );
    expect(detail.body.data.result.updated_count).toBeGreaterThan(0);
  });

  it("a preview writes nothing at all", async () => {
    const group = SEED.groupIds.dunk;
    const snapshot = JSON.stringify(db.listings.filter((l) => l.product_sku.startsWith("DD1391")));
    const res = await postJson<{ data: { affected_count: number; scope_counts: { all: number } } }>(
      `/api/v1/groups/${group}/apply/preview`,
      { scope: "all", margin_percent: "30.0000" },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.affected_count).toBe(res.body.data.scope_counts.all);
    expect(JSON.stringify(db.listings.filter((l) => l.product_sku.startsWith("DD1391")))).toBe(snapshot);
  });

  it("PATCH /settings answers 202 with a job when it repriced, 200 without one when it did not", async () => {
    const repriced = await patchJson<{ data: { job: { id: string } | null } }>("/api/v1/settings", {
      default_margin_percent: "19.0000",
    });
    expect(repriced.status).toBe(202);
    expect(repriced.body.data.job).not.toBeNull();

    jobRunner.runToCompletion(repriced.body.data.job!.id);

    const cosmetic = await patchJson<{ data: { job: unknown } }>("/api/v1/settings", {
      crawl_cadence_minutes: 30,
    });
    expect(cosmetic.status).toBe(200);
    expect(cosmetic.body.data.job).toBeNull();
  });

  it("reports a per-SKU result for a bulk action rather than hiding failures behind a 200", async () => {
    const res = await postJson<{
      data: { ok_count: number; failed_count: number; results: { sku: string; error_code: string | null }[] };
    }>("/api/v1/products/bulk", { skus: [SEED.edgeSku, "NOPE-000"], action: "deactivate" });

    expect(res.status).toBe(200);
    expect(res.body.data.ok_count).toBe(1);
    expect(res.body.data.failed_count).toBe(1);
    expect(res.body.data.results.find((r) => r.sku === "NOPE-000")?.error_code).toBe("not_found");
  });
});

describe("the CSV export", () => {
  it("exports the filter rather than the page", async () => {
    const res = await fetch(apiUrl("/api/v1/products/export"));
    const text = await res.text();
    expect(res.headers.get("content-type")).toContain("text/csv");
    // 40 products plus a header, and no paging in sight.
    expect(text.trim().split("\n")).toHaveLength(41);

    const filtered = await fetch(apiUrl("/api/v1/products/export?q=Yeezy"));
    const filteredText = await filtered.text();
    expect(filteredText.trim().split("\n").length).toBeLessThan(41);
  });
});
