"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SizeLabel } from "@/components/format/size-label";
import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { StatusBadge } from "@/components/status-badge";
import { useJob } from "@/hooks/use-jobs";
import { JOB_ITEM_REASON_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE } from "@/lib/i18n/enums";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { bySize } from "@/lib/format/size";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const t = zhHant.groupApply;
const jobs = zhHant.jobs;

export interface JobProgressProps {
  jobId: string;
  onRetry?: (jobId: string) => void;
  onDone?: () => void;
  retrying?: boolean;
}

/**
 * Screen 4 states C–E, reused by settings recompute and group delete. Polls a pure read: closing
 * the tab does not stall the worker, and reopening adopts the same job.
 */
export function JobProgress({ jobId, onRetry, onDone, retrying }: JobProgressProps) {
  const query = useJob(jobId);
  if (query.isError || !query.data) {
    return query.isError ? (
      <p className="text-meta text-error-foreground">{zhHant.errorState.description}</p>
    ) : (
      <p className="text-meta text-muted-foreground">{zhHant.common.loading}</p>
    );
  }

  const { job, meta } = query.data;
  const stalled = job.status === "running" && meta.worker.stale;
  const percent = job.total === 0 ? 0 : Math.round((job.done / job.total) * 100);

  if (job.status === "queued") {
    return (
      <div className="flex flex-col gap-2">
        <StatusBadge label={JOB_STATUS_LABEL.queued} tone={JOB_STATUS_TONE.queued} />
        <p className="text-body text-foreground">{t.queued}</p>
        <p className="text-meta text-muted-foreground">{jobs.waitingForWorker}</p>
      </div>
    );
  }

  if (stalled) {
    return (
      <div className="flex flex-col gap-2">
        <StatusBadge label={t.stalled} tone="warning" />
        <p className="text-meta text-muted-foreground">{jobs.workerStale}</p>
      </div>
    );
  }

  if (job.status === "running") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <p className="text-title font-bold">{t.running}</p>
          <Num className="text-num font-bold">{t.progress(job.done, job.total)}</Num>
        </div>
        <Progress value={percent} />
        <p className="text-meta text-muted-foreground">{t.dismissKeepsRunning}</p>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-title font-bold">{t.failedTitle}</p>
        <p className="text-meta text-muted-foreground">{job.last_error ?? t.failedBody}</p>
      </div>
    );
  }

  if (job.failed_count > 0) {
    const failed = [...job.items].sort(bySize((row) => row.size));
    return (
      <div className="flex flex-col gap-3">
        <p className="text-title font-bold">{t.partialTitle}</p>
        <p className="text-body">{t.partialCount(job.failed_count)}</p>
        <p className="text-meta text-muted-foreground">{t.partialBody(job.ok_count)}</p>
        <ul className="flex flex-col gap-1">
          {failed.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-cell">
              <span>
                <Num>{item.product_sku}</Num>
                {" · "}
                <SizeLabel value={item.size} />
              </span>
              {item.reason ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-meta text-muted-foreground underline decoration-dotted">
                      {JOB_ITEM_REASON_LABEL[item.reason]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{JOB_ITEM_REASON_LABEL[item.reason]}</TooltipContent>
                </Tooltip>
              ) : null}
            </li>
          ))}
        </ul>
        {onRetry ? (
          <Button onClick={() => onRetry(job.id)} disabled={retrying}>
            {t.retryFailed}
          </Button>
        ) : null}
      </div>
    );
  }

  const result = job.result;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-title font-bold">{t.successTitle}</p>
      {result ? (
        <dl className="grid grid-cols-2 gap-2 text-cell">
          <dt className="text-muted-foreground">{t.updatedCount}</dt>
          <dd className="text-right">
            <Num>{result.updated_count}</Num>
          </dd>
          <dt className="text-muted-foreground">{t.clearedCount}</dt>
          <dd className="text-right">
            <Num>{result.overridden_cleared_count}</Num>
          </dd>
          <dt className="text-muted-foreground">{t.averagePrice}</dt>
          <dd className="text-right">
            <Money value={result.average_price_before} />
            {" → "}
            <Money value={result.average_price_after} />
          </dd>
        </dl>
      ) : null}
      {onDone ? <Button onClick={onDone}>{t.done}</Button> : null}
    </div>
  );
}
