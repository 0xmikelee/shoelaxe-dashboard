import type { RouteDoc } from "@/lib/openapi/registry";
import { CrawlStatusWire } from "@/lib/schemas/wire/crawl";
import { CrawlRunsQuery } from "@/lib/schemas/params/settings";
import { READ_ERRORS } from "./common";

export const crawlContract: RouteDoc[] = [
  {
    operationId: "getCrawlStatus",
    method: "get",
    path: "/api/v1/crawl-runs",
    summary: "Screen 2's crawl panel: cadence, last run, next run, today's count",
    description:
      "Gap 33, with three corrections to the design baked into the shape. 今日爬取次數 counts **runs**, " +
      "not items. 下次爬取 is meaningless for the manual sheet source, so it is derived from the StockX " +
      "cadence alone. And the two sources are broken out, because one combined 上次爬取 hides a dead " +
      "Gmail trigger behind a fresh manual sync.\n\n" +
      "`cadence_minutes` is a display mirror of the Apps Script trigger, which the server cannot read.",
    tags: ["ops"],
    auth: "session",
    consumedBy: "Screen 2 (爬取排程)",
    request: { query: CrawlRunsQuery },
    response: CrawlStatusWire,
    errors: [...READ_ERRORS],
    idempotency: "Safe.",
  },
];
