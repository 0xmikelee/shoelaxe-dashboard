import { z } from "zod";
import { JobKind, JobStatus } from "@/lib/schemas/wire/common";
import { PageQuery, csv } from "./common";

/**
 * Screen 4 rehydrates a running job after a reload and Screen 3 shows an apply-in-progress banner;
 * both need `kind` + `scope_key` + `status`, or the modal starts a second job instead of adopting
 * the first.
 */
export const JobsQuery = PageQuery.extend({
  kind: JobKind.optional(),
  scope_key: z.string().max(120).optional(),
  status: csv(JobStatus).optional().describe("Comma-joined job statuses."),
});

/**
 * A finished 96-size job would otherwise ship 96 rows to render a failure list of 12, so the detail
 * carries failures by default. `all` is for a debug expander; `none` is for the ~1s poll.
 */
export const JobDetailQuery = z.object({
  items: z.enum(["failed", "all", "none"]).default("failed"),
});
