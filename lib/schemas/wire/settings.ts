import { z } from "zod";
import { Count, Iso, JobStatus, Liveness, Money, NonNegativeRate, Publishing, Rate } from "./common";

export const SettingsWire = z.object({
  /** Asymmetric and independently editable: the design's 上限 10% / 下限 8% is not a typo. */
  auto_approve_up_percent: NonNegativeRate,
  auto_approve_down_percent: NonNegativeRate,
  default_margin_enabled: z.boolean(),
  default_margin_percent: Rate,
  default_margin_fixed: Money,
  /** x49/x99, applied after the group markup and **before** the threshold comparison. */
  rounding_enabled: z.boolean(),
  /**
   * Gap 33. The real cadence lives in the Apps Script trigger, which the server cannot read; this is
   * a display mirror someone must keep honest. Null means nobody has recorded it.
   */
  crawl_cadence_minutes: z.number().int().positive().nullable(),
  updated_at: Iso,
  updated_by_name: z.string().nullable(),
});

/**
 * Gap 7. Changing a threshold, the default margin or the rounding toggle re-prices every listing
 * resolving to the default margin, which is a worker fan-out. Without the job the screen shows a
 * green tick while prices keep moving for the next minute.
 *
 * The server answers 202 when it enqueued and 200 when nothing needed recomputing; the body shape is
 * identical either way, so **branch on `job`, never on the status code**.
 */
export const SettingsUpdateResultWire = z.object({
  settings: SettingsWire,
  job: z.object({ id: z.uuid(), total: Count, status: JobStatus }).nullable(),
});

/**
 * Screen 2's 爬蟲服務運行中 indicator — and it is two indicators, not one. A stale last run means
 * the Apps Script trigger stopped; a stale worker heartbeat means the background service died. Same
 * symptom in the browser, different fix, so one combined light would be useless.
 */
export const SystemHealthWire = z.object({
  database: Liveness,
  worker: z.object({
    status: Liveness,
    heartbeat_at: Iso.nullable(),
    instance: z.string().nullable(),
  }),
  crawl: z.object({
    status: Liveness,
    last_run_at: Iso.nullable(),
  }),
  publishing: Publishing,
});

export type Settings = z.infer<typeof SettingsWire>;
export type SettingsUpdateResult = z.infer<typeof SettingsUpdateResultWire>;
export type SystemHealth = z.infer<typeof SystemHealthWire>;
