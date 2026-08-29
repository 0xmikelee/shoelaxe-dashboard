import { describe, expect, it, beforeEach } from "vitest";
import { MINUTE, SEED_NOW_MS, fixedClock } from "@/mocks/clock";
import { mockConfig } from "@/mocks/config";
import { db, itemsForJob, jobById, resetDb } from "@/mocks/db";
import { isPartialFailure, jobRunner } from "@/mocks/job-runner";
import { SEED } from "@/mocks/seed";

/**
 * Screen 4's five live states, driven by hand. Nothing here waits on a real timer: the runner's clock
 * is injectable precisely so "the worker has been silent for five minutes" costs no wall time.
 */

const someListings = (count: number) =>
  db.listings.slice(0, count).map((l) => ({ id: l.id, product_sku: l.product_sku, size: l.size }));

beforeEach(() => {
  resetDb();
  jobRunner.reset();
  jobRunner.setClock(fixedClock(SEED_NOW_MS));
});

describe("the job lifecycle", () => {
  it("walks queued → running → succeeded, and 排隊中 is a state of its own", () => {
    const job = jobRunner.enqueue({ kind: "group_apply", scopeKey: "g", listings: someListings(20) });
    expect(job).toMatchObject({ status: "queued", done: 0, total: 20, started_at: null });

    // The worker does not claim instantly. Until it does, the job is queued with no progress at all —
    // which must not be rendered as `0 / 20`.
    for (let n = 0; n < mockConfig.jobQueuedTicks - 1; n += 1) jobRunner.tick();
    expect(job.status).toBe("queued");

    jobRunner.tick();
    expect(job.status).toBe("running");
    expect(job.started_at).not.toBeNull();
    expect(job.done).toBeGreaterThan(0);
    expect(job.done).toBeLessThan(job.total);

    const finished = jobRunner.runToCompletion(job.id);
    expect(finished.status).toBe("succeeded");
    expect(finished.done).toBe(20);
    expect(finished.ok_count).toBe(20);
    expect(finished.failed_count).toBe(0);
    expect(finished.finished_at).not.toBeNull();
    expect(finished.result).not.toBeNull();
  });

  it("reaches state E: succeeded with failures that name a SKU, a size and a reason", () => {
    const job = jobRunner.enqueue({
      kind: "group_apply",
      scopeKey: "g",
      listings: someListings(12),
      failEvery: 4,
    });
    const finished = jobRunner.runToCompletion(job.id);

    expect(finished.status).toBe("succeeded");
    expect(isPartialFailure(finished)).toBe(true);
    expect(finished.failed_count).toBe(3);
    expect(finished.ok_count).toBe(9);

    const failures = itemsForJob(job.id).filter((i) => i.status === "failed");
    expect(failures).toHaveLength(3);
    for (const item of failures) {
      expect(item.product_sku).toBeTruthy();
      expect(item.size).toBeTruthy();
      // The design shows no reason badge; `missing_cost` is actionable, so the data is there anyway.
      expect(item.reason).not.toBeNull();
    }
  });

  it("distinguishes a whole-job failure from state E", () => {
    const job = jobRunner.enqueue({ kind: "group_apply", scopeKey: "g", listings: someListings(8) });
    jobRunner.tick();
    jobRunner.tick();
    jobRunner.failJob(job.id, "worker lost the database connection");
    expect(job.status).toBe("failed");
    expect(job.last_error).toContain("database");
    expect(job.done).toBeLessThan(job.total);
    expect(isPartialFailure(job)).toBe(false);
  });

  it("runs the effect exactly once, when the job finishes and not before", () => {
    let ran = 0;
    const job = jobRunner.enqueue({
      kind: "settings_recompute",
      scopeKey: null,
      listings: someListings(8),
      effect: () => {
        ran += 1;
        return {
          updated_count: 8,
          overridden_cleared_count: 2,
          held_count: 1,
          average_price_before_cents: 141_600,
          average_price_after_cents: 142_000,
        };
      },
    });
    jobRunner.tick();
    expect(ran).toBe(0);
    jobRunner.runToCompletion(job.id);
    expect(ran).toBe(1);
    expect(job.result).toMatchObject({ overridden_cleared_count: 2, average_price_after_cents: 142_000 });
    jobRunner.tick();
    expect(ran).toBe(1);
  });
});

describe("the stalled worker", () => {
  it("freezes progress and lets the heartbeat go stale — the pair is what says 背景服務未運行", () => {
    const clock = fixedClock(SEED_NOW_MS);
    jobRunner.setClock(clock);
    const job = jobRunner.enqueue({ kind: "group_apply", scopeKey: "g", listings: someListings(40) });
    jobRunner.tick();
    jobRunner.tick();
    const progress = job.done;
    expect(job.status).toBe("running");
    expect(jobRunner.worker().stale).toBe(false);

    jobRunner.stallWorker();
    clock.advance(mockConfig.workerStaleAfterMs + MINUTE);
    jobRunner.tick();

    // Running, not advancing, and the heartbeat has stopped: three facts, and only together do they
    // mean the worker died rather than the job being slow.
    expect(job.status).toBe("running");
    expect(job.done).toBe(progress);
    expect(jobRunner.worker().stale).toBe(true);

    jobRunner.resumeWorker();
    expect(jobRunner.worker().stale).toBe(false);
    jobRunner.tick();
    expect(job.done).toBeGreaterThan(progress);
  });
});

describe("single-flighting", () => {
  it("finds a live job by kind and scope, which is what answers job_already_running", () => {
    expect(jobRunner.running("group_apply", SEED.groupIds.dunk)).toBeUndefined();
    const job = jobRunner.enqueue({
      kind: "group_apply",
      scopeKey: SEED.groupIds.dunk,
      listings: someListings(4),
    });
    expect(jobRunner.running("group_apply", SEED.groupIds.dunk)?.id).toBe(job.id);
    expect(jobRunner.running("group_apply", SEED.groupIds.jordan)).toBeUndefined();
    jobRunner.runToCompletion(job.id);
    expect(jobRunner.running("group_apply", SEED.groupIds.dunk)).toBeUndefined();
  });

  it("leaves the seeded terminal jobs alone", () => {
    jobRunner.tick();
    expect(jobById(SEED.jobIds.succeeded)?.done).toBe(96);
    expect(jobById(SEED.jobIds.failed)?.status).toBe("failed");
  });
});
