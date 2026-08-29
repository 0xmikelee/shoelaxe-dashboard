import { z } from "zod";
import { Count, CrawlSource, CrawlTrigger, Iso, Liveness } from "./common";

export const CrawlRunWire = z.object({
  id: z.uuid(),
  /** The Apps Script's per-run UUID. One run spans several chunk requests. */
  run_id: z.string(),
  source: CrawlSource,
  trigger: CrawlTrigger,
  started_at: Iso,
  finished_at: Iso.nullable(),
  item_count: Count,
  ok_count: Count,
  error_count: Count,
});

/**
 * Gap 33. Screen 2's crawl panel. Three corrections to the design are baked into the shape:
 * 今日爬取次數 counts **runs**, not items; 下次爬取 is meaningless for the manual sheet source and is
 * therefore derived from the StockX cadence alone; and the two sources are broken out because one
 * combined 上次爬取 hides a dead Gmail trigger behind a fresh manual sync.
 */
export const CrawlStatusWire = z.object({
  cadence_minutes: z.number().int().positive().nullable(),
  last_run: CrawlRunWire.nullable(),
  /** Null when the cadence is unknown or the last StockX run never finished. */
  next_run_at: Iso.nullable(),
  today_run_count: Count,
  status: Liveness,
  sources: z.array(
    z.object({
      source: CrawlSource,
      last_run: CrawlRunWire.nullable(),
      next_run_at: Iso.nullable(),
      today_run_count: Count,
      status: Liveness,
    }),
  ),
  /** Most recent first, bounded by `limit`. Screen 2 asks for one. */
  runs: z.array(CrawlRunWire),
});

export type CrawlRun = z.infer<typeof CrawlRunWire>;
export type CrawlStatus = z.infer<typeof CrawlStatusWire>;
