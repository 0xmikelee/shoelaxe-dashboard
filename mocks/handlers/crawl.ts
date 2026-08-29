import { z } from "zod";
import type { CrawlRunsQuery } from "@/lib/schemas/params/settings";
import { DAY, MINUTE, SEED_NOW_MS, iso } from "../clock";
import { db } from "../db";
import { projectCrawlRun } from "../project";
import { defineMock } from "./common";
import type { CrawlRunRow } from "../types";

type Query = z.infer<typeof CrawlRunsQuery>;
type Liveness = "ok" | "stale" | "never";

const latest = (source: CrawlRunRow["source"]): CrawlRunRow | null =>
  db.crawlRuns.filter((r) => r.source === source)[0] ?? null;

const todayCount = (runs: readonly CrawlRunRow[]): number =>
  runs.filter((r) => Date.parse(r.started_at) >= SEED_NOW_MS - DAY).length;

/**
 * A run is `stale` at more than twice the cadence: one missed tick is a slow crawl, two is a trigger
 * that has stopped. With no cadence recorded there is nothing to be late against, so it stays `ok`.
 */
const livenessOf = (run: CrawlRunRow | null, cadenceMinutes: number | null): Liveness => {
  if (!run) return "never";
  if (cadenceMinutes === null) return "ok";
  return Date.parse(run.started_at) < SEED_NOW_MS - 2 * cadenceMinutes * MINUTE ? "stale" : "ok";
};

export const crawlHandlers = [
  defineMock<Query>("getCrawlStatus", ({ query }) => {
    const cadence = db.settings.crawl_cadence_minutes;
    const stockx = latest("stockx");
    const sheet = latest("google_sheet");

    // 下次爬取 is derived from the StockX cadence alone: the sheet source is manual, and averaging the
    // two would print a schedule for a run nothing will trigger (Gap 33).
    const nextRunAt =
      cadence !== null && stockx?.finished_at
        ? iso(Date.parse(stockx.finished_at) + cadence * MINUTE)
        : null;

    return {
      data: {
        cadence_minutes: cadence,
        last_run: db.crawlRuns[0] ? projectCrawlRun(db.crawlRuns[0]) : null,
        next_run_at: nextRunAt,
        // 今日爬取次數 counts runs, not items — the design's label is right and its number was not.
        today_run_count: todayCount(db.crawlRuns),
        status: livenessOf(stockx, cadence),
        sources: [
          {
            source: "stockx" as const,
            last_run: stockx ? projectCrawlRun(stockx) : null,
            next_run_at: nextRunAt,
            today_run_count: todayCount(db.crawlRuns.filter((r) => r.source === "stockx")),
            status: livenessOf(stockx, cadence),
          },
          {
            source: "google_sheet" as const,
            last_run: sheet ? projectCrawlRun(sheet) : null,
            next_run_at: null,
            today_run_count: todayCount(db.crawlRuns.filter((r) => r.source === "google_sheet")),
            status: sheet ? ("ok" as const) : ("never" as const),
          },
        ],
        runs: db.crawlRuns.slice(0, query.limit).map(projectCrawlRun),
      },
    };
  }),
];
