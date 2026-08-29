import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import type { JobDetailQuery, JobsQuery } from "@/lib/schemas/params/jobs";
import { db, itemsForJob, jobById, listingById, paginate } from "../db";
import { jobRunner } from "../job-runner";
import { projectJob, projectJobSummary } from "../project";
import { defineMock, listMeta, notFound } from "./common";
import type { JobItemRow } from "../types";

type IdPath = { id: string };
type ListQuery = z.infer<typeof JobsQuery>;
type DetailQuery = z.infer<typeof JobDetailQuery>;

/**
 * `meta.worker` rides on every job response. It is the only thing that separates 背景服務未運行 from
 * merely slow — from the browser, a job at 42/96 that is not moving looks identical either way.
 */
const workerMeta = () => ({ worker: jobRunner.worker() });

const itemsFor = (jobId: string, mode: DetailQuery["items"]): JobItemRow[] => {
  if (mode === "none") return [];
  const all = itemsForJob(jobId);
  // Failures by default: a finished 96-size job would otherwise ship 96 rows to render a list of 12.
  return mode === "all" ? all : all.filter((i) => i.status === "failed");
};

export const jobsHandlers = [
  defineMock<ListQuery>("listJobs", ({ query }) => {
    const rows = db.jobs.filter(
      (job) =>
        (!query.kind || job.kind === query.kind) &&
        (!query.scope_key || job.scope_key === query.scope_key) &&
        (!query.status?.length || query.status.includes(job.status)),
    );
    const page = paginate(rows, query.page, query.per_page);
    return { data: page.rows.map(projectJobSummary), meta: listMeta(page) };
  }),

  defineMock<DetailQuery, undefined, IdPath>("getJob", ({ params, query }) => {
    const job = jobById(params.id) ?? (notFound(`job ${params.id}`) as never);
    return { data: projectJob(job, itemsFor(job.id, query.items)), meta: workerMeta() };
  }),

  /** 重試失敗項目: a new job seeded from the failures only, single-flighted like the original. */
  defineMock<undefined, undefined, IdPath>("retryJob", ({ params }) => {
    const job = jobById(params.id) ?? (notFound(`job ${params.id}`) as never);
    if (job.status === "queued" || job.status === "running") {
      throw new ApiError("job_already_running", "this job has not finished yet", { job_id: job.id });
    }
    const failed = itemsForJob(job.id).filter((i) => i.status === "failed");
    if (failed.length === 0) {
      throw new ApiError("job_not_retryable", "this job has no failed items");
    }
    const live = jobRunner.running(job.kind, job.scope_key);
    if (live) {
      throw new ApiError("job_already_running", "another job for this scope is already running", {
        job_id: live.id,
      });
    }

    const retry = jobRunner.enqueue({
      kind: job.kind,
      scopeKey: job.scope_key,
      listings: failed.flatMap((item) => {
        const listing = listingById(item.listing_id);
        return listing
          ? [{ id: listing.id, product_sku: listing.product_sku, size: listing.size }]
          : [];
      }),
    });
    return { data: projectJob(retry, itemsForJob(retry.id)), meta: workerMeta() };
  }),
];
