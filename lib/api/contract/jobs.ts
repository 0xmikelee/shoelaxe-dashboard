import type { RouteDoc } from "@/lib/openapi/registry";
import { JobWire, JobsListWire } from "@/lib/schemas/wire/jobs";
import { JobDetailQuery, JobsQuery } from "@/lib/schemas/params/jobs";
import { JobIdPath } from "@/lib/schemas/params/paths";
import { READ_ERRORS, SESSION_ERRORS } from "./common";

export const jobsContract: RouteDoc[] = [
  {
    operationId: "listJobs",
    method: "get",
    path: "/api/v1/jobs",
    summary: "Find a running job by kind and scope",
    description:
      "Without `kind` + `scope_key` + `status` filters Screen 4 cannot rehydrate a running job after " +
      "a reload and Screen 3 cannot show its apply-in-progress banner — so it would start a second " +
      "job instead of adopting the first.",
    tags: ["ops"],
    auth: "session",
    consumedBy: "Screen 4 (rehydrate); Screen 3 (running banner); Screen 2",
    request: { query: JobsQuery },
    response: JobsListWire,
    errors: [...READ_ERRORS],
    idempotency: "Safe.",
  },
  {
    operationId: "getJob",
    method: "get",
    path: "/api/v1/jobs/{id}",
    summary: "Job progress, result summary and failed items",
    description:
      "A **pure read**: polling it does not drive the work, so a closed tab does not stall the job.\n\n" +
      "Gap 16 is what makes states D and E renderable — `done / total` alone cannot produce 更新尺寸數 " +
      "or name a failed size, because `job_items` stores only `listing_id`. `meta.worker.heartbeat_at` " +
      "is how state C tells 'slow' from '背景服務未運行', which look identical from the browser.\n\n" +
      "`queued` is its own state and must render 排隊中, never `0 / 96`, which reads as stalled.",
    tags: ["ops"],
    auth: "session",
    consumedBy: "Screen 4 states C–E; Screen 2 settings recompute; Screen 6 delete",
    request: { params: JobIdPath, query: JobDetailQuery },
    response: JobWire,
    errors: [...READ_ERRORS, "not_found"],
    idempotency: "Safe. Poll ~1s while running, back off after 30s.",
  },
  {
    operationId: "retryJob",
    method: "post",
    path: "/api/v1/jobs/{id}/retry",
    summary: "重試失敗項目 — seed a new job from the failures only",
    tags: ["ops"],
    auth: "session",
    consumedBy: "Screen 4 state E",
    request: { params: JobIdPath },
    response: JobWire,
    successStatus: 202,
    errors: [...SESSION_ERRORS, "not_found", "job_not_retryable", "job_already_running", "conflict"],
    idempotency: "Single-flighted on (kind, scope_key) like the original.",
    sideEffects: ["jobs", "job_items"],
  },
];
