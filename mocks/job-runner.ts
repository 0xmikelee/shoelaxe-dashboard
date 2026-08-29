import { iso, systemClock, type Clock } from "./clock";
import { mockConfig } from "./config";
import { db } from "./db";
import { uuidFrom } from "./random";
import type { Cents, JobItemReasonValue, JobKindValue, JobRow } from "./types";

/**
 * A worker you can watch.
 *
 * Screen 4 has five live states — queued, running, succeeded, part-failed, stalled — and four of them
 * only exist over time. A mock that answers `GET /jobs/{id}` with a finished job leaves 排隊中, the
 * progress bar, the retry path and 背景服務未運行 unbuilt until the real worker lands, which is exactly
 * the part of the screen that most needs the practice.
 *
 * Everything is driven by `tick()`. The browser attaches a timer to it; tests call it directly, so no
 * suite ever waits on a real second. `stallWorker()` freezes both progress *and* the heartbeat, which
 * is the only thing that distinguishes a dead worker from a slow one — from the browser the two look
 * identical, and they need different copy.
 */

export interface JobEffectResult {
  updated_count: number;
  overridden_cleared_count: number;
  held_count: number;
  average_price_before_cents: Cents | null;
  average_price_after_cents: Cents | null;
}

/** Runs once, when the job reaches its terminal state — a worker's work is not done at enqueue time. */
export type JobEffect = (job: JobRow) => JobEffectResult;

interface RunnerEntry {
  waited: number;
  effect?: JobEffect;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

const FAILURE_REASONS: readonly JobItemReasonValue[] = [
  "missing_cost",
  "needs_margins",
  "listing_inactive",
  "shopify_error",
];

export class JobRunner {
  private clock: Clock = systemClock;
  private entries = new Map<string, RunnerEntry>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stalled = false;
  private heartbeatAt: number | null = null;
  readonly instance = "mock-worker-1";

  constructor() {
    this.heartbeatAt = this.clock.now();
  }

  setClock(clock: Clock): void {
    this.clock = clock;
    this.heartbeatAt = clock.now();
  }

  /** Attaches a real timer. Browser and dev only — a test that needs three ticks calls tick() thrice. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), mockConfig.jobTickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reset(): void {
    this.stop();
    this.entries.clear();
    this.stalled = false;
    this.clock = systemClock;
    this.heartbeatAt = this.clock.now();
  }

  /** The worker process died: nothing advances and the heartbeat stops moving. */
  stallWorker(): void {
    this.stalled = true;
  }

  resumeWorker(): void {
    this.stalled = false;
    this.heartbeatAt = this.clock.now();
  }

  get isStalled(): boolean {
    return this.stalled;
  }

  worker(): { heartbeat_at: string | null; instance: string | null; stale: boolean } {
    const at = this.heartbeatAt;
    const stale = at === null || this.clock.now() - at > mockConfig.workerStaleAfterMs;
    return { heartbeat_at: at === null ? null : iso(at), instance: this.instance, stale };
  }

  /**
   * Creates the job *and* its items. `job_items` exist from enqueue in the real schema, which is what
   * makes `?items=all` meaningful and lets state E name a SKU and size rather than an id (Gap 16).
   */
  enqueue(input: {
    kind: JobKindValue;
    scopeKey: string | null;
    listings: readonly { id: string; product_sku: string; size: string }[];
    /** Every Nth item fails, so state E is reachable on demand. Null means every item succeeds. */
    failEvery?: number | null;
    effect?: JobEffect;
  }): JobRow {
    const now = this.clock.now();
    const id = uuidFrom(`job:${input.kind}:${input.scopeKey ?? "global"}:${now}:${db.jobs.length}`);
    const job: JobRow = {
      id,
      kind: input.kind,
      scope_key: input.scopeKey,
      status: "queued",
      total: input.listings.length,
      done: 0,
      ok_count: 0,
      failed_count: 0,
      created_at: iso(now),
      started_at: null,
      finished_at: null,
      last_error: null,
      result: null,
      fail_every: input.failEvery ?? null,
    };
    db.jobs.unshift(job);
    input.listings.forEach((listing, index) => {
      db.jobItems.push({
        id: uuidFrom(`jobitem:${id}:${listing.id}`),
        job_id: id,
        listing_id: listing.id,
        product_sku: listing.product_sku,
        size: listing.size,
        status: "queued",
        reason: null,
        attempts: 0,
        updated_at: iso(now),
      });
      void index;
    });
    this.entries.set(id, { waited: 0, effect: input.effect });
    return job;
  }

  /** Is a job of this kind and scope already live? The 409 `job_already_running` answer. */
  running(kind: JobKindValue, scopeKey: string | null): JobRow | undefined {
    return db.jobs.find(
      (j) =>
        j.kind === kind &&
        j.scope_key === scopeKey &&
        (j.status === "queued" || j.status === "running"),
    );
  }

  /** One step for every live job. Returns the number of jobs it touched. */
  tick(): number {
    if (this.stalled) return 0;
    const now = this.clock.now();
    this.heartbeatAt = now;

    let touched = 0;
    for (const job of db.jobs) {
      if (TERMINAL.has(job.status)) continue;
      const entry = this.entries.get(job.id) ?? { waited: 0 };
      this.entries.set(job.id, entry);

      if (job.status === "queued") {
        entry.waited += 1;
        // The worker does not claim instantly. 排隊中 is its own state and must not render `0 / 96`.
        if (entry.waited < mockConfig.jobQueuedTicks) {
          touched += 1;
          continue;
        }
        job.status = "running";
        job.started_at = iso(now);
      }

      const remaining = job.total - job.done;
      const step = Math.min(mockConfig.jobBatchSize, remaining);
      const items = db.jobItems.filter((i) => i.job_id === job.id && i.status === "queued");
      for (let n = 0; n < step; n += 1) {
        const index = job.done + n;
        const fails = job.fail_every !== null && job.fail_every > 0 && (index + 1) % job.fail_every === 0;
        const item = items[n];
        if (item) {
          item.status = fails ? "failed" : "succeeded";
          item.reason = fails ? FAILURE_REASONS[index % FAILURE_REASONS.length] : null;
          item.attempts = fails ? 3 : 1;
          item.updated_at = iso(now);
        }
        if (fails) job.failed_count += 1;
        else job.ok_count += 1;
      }
      job.done += step;
      touched += 1;

      if (job.done >= job.total) {
        job.status = "succeeded";
        job.finished_at = iso(now);
        const effect = entry.effect;
        const result = effect?.(job);
        job.result = result ?? {
          updated_count: job.ok_count,
          overridden_cleared_count: 0,
          held_count: 0,
          average_price_before_cents: null,
          average_price_after_cents: null,
        };
        this.entries.delete(job.id);
      }
    }
    return touched;
  }

  /** Test helper: tick until the job is terminal, or give up rather than spin forever. */
  runToCompletion(jobId: string, maxTicks = 200): JobRow {
    for (let n = 0; n < maxTicks; n += 1) {
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error(`job ${jobId} does not exist`);
      if (TERMINAL.has(job.status)) return job;
      this.tick();
    }
    throw new Error(`job ${jobId} did not reach a terminal state within ${maxTicks} ticks`);
  }

  /**
   * Whole-job failure — the state that carries `last_error` and is *not* state E. Left explicit
   * because nothing in the happy path produces it and the copy for the two is different.
   */
  failJob(jobId: string, message: string): void {
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = "failed";
    job.last_error = message;
    job.finished_at = iso(this.clock.now());
    this.entries.delete(jobId);
  }
}

export const jobRunner = new JobRunner();

/** A job that finished with failures is `succeeded` + `failed_count > 0` — Screen 4's state E. */
export const isPartialFailure = (job: JobRow): boolean =>
  job.status === "succeeded" && job.failed_count > 0;
