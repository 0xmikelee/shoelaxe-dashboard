import { z } from "zod";
import { Count, Iso, JobItemReason, JobKind, JobStatus, Money, SizeLabel, Sku } from "./common";

/**
 * Gap 16. `done / total` cannot render Screen 4's states D or E: D needs a result summary, and E
 * needs SKU and size per failure while `job_items` stores only `listing_id`. Both are joined out
 * here so no screen has to fan out N lookups to name a failed size.
 */

export const JobItemWire = z.object({
  id: z.uuid(),
  listing_id: z.uuid(),
  product_sku: Sku,
  size: SizeLabel,
  status: JobStatus,
  /** The delta says no reason badges; surface it in a tooltip anyway — `missing_cost` is actionable. */
  reason: JobItemReason.nullable(),
  attempts: z.number().int().nonnegative(),
  updated_at: Iso,
});

/** State D's 更新尺寸數 96 · 覆寫的個別設定 18 · 平均售價變化 HK$1,416 → HK$1,420. */
export const JobResultWire = z.object({
  updated_count: Count,
  overridden_cleared_count: Count,
  held_count: Count,
  average_price_before: Money.nullable(),
  average_price_after: Money.nullable(),
});

export const JobSummaryWire = z.object({
  id: z.uuid(),
  kind: JobKind,
  /** The group id for a group apply, so Screen 3 can find the job blocking its 批次更新利潤 button. */
  scope_key: z.string().nullable(),
  /** `queued` is its own state and must render 排隊中, never `0 / 96`, which reads as stalled. */
  status: JobStatus,
  total: Count,
  done: Count,
  ok_count: Count,
  failed_count: Count,
  created_at: Iso,
  started_at: Iso.nullable(),
  finished_at: Iso.nullable(),
  /** Whole-job failure. Distinct from state E, where the job finished and some items did not. */
  last_error: z.string().nullable(),
});

export const JobsListWire = z.array(JobSummaryWire);

export const JobWire = JobSummaryWire.extend({
  result: JobResultWire.nullable(),
  /** Failed items by default; `?items=all` includes the successes, `?items=none` omits the array. */
  items: z.array(JobItemWire),
});

/**
 * Rides on the job responses as `meta`. A stale heartbeat is what separates 背景服務未運行 from
 * merely slow — from the browser the two are otherwise identical, and they need different copy.
 */
export const JobMetaWire = z.object({
  worker: z.object({
    heartbeat_at: Iso.nullable(),
    instance: z.string().nullable(),
    stale: z.boolean(),
  }),
});

export type Job = z.infer<typeof JobWire>;
export type JobSummary = z.infer<typeof JobSummaryWire>;
export type JobItem = z.infer<typeof JobItemWire>;
export type JobResult = z.infer<typeof JobResultWire>;
export type JobMeta = z.infer<typeof JobMetaWire>;
