"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DisabledTooltip } from "@/components/disabled-tooltip";
import { JobProgress } from "@/components/jobs/job-progress";
import { ModalShell } from "@/components/modal-shell";
import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCloseModal } from "@/hooks/use-close-modal";
import { useActiveJob } from "@/hooks/use-jobs";
import { useGroup } from "@/hooks/use-groups";
import { api } from "@/lib/api/client";
import { jobIdFromError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { APPLY_SCOPE_HINT, APPLY_SCOPE_LABEL } from "@/lib/i18n/enums";
import type { ApplyScope } from "@/lib/i18n/enums";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError } from "@/lib/toast";
import { formatMoney } from "@/lib/format/money";
import { GroupApplyAcceptedWire, GroupApplyPreviewWire } from "@/lib/schemas/wire/groups";
import { JobWire } from "@/lib/schemas/wire/jobs";

const t = zhHant.groupApply;

export function GroupApplyModal({ groupId }: { groupId: string }) {
  const close = useCloseModal(`/groups/${groupId}`);
  const queryClient = useQueryClient();
  const group = useGroup(groupId);
  const active = useActiveJob("group_apply", groupId);

  const [scope, setScope] = useState<ApplyScope>("all");
  const [percentOn, setPercentOn] = useState(true);
  const [fixedOn, setFixedOn] = useState(false);
  const [percentOverride, setPercentOverride] = useState<string | null>(null);
  const [fixedOverride, setFixedOverride] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const percent = percentOverride ?? group.data?.margin_percent ?? "18";
  const fixed = fixedOverride ?? group.data?.margin_fixed ?? "0.00";
  const trackedJobId = jobId ?? active.data?.id ?? null;

  const previewBody = {
    scope,
    ...(percentOn ? { margin_percent: percent } : {}),
    ...(fixedOn ? { margin_fixed: fixed } : {}),
  };

  const preview = useQuery({
    queryKey: qk.groups.preview(groupId, previewBody),
    enabled: percentOn || fixedOn,
    queryFn: async () => {
      const result = await api.POST("/api/v1/groups/{id}/apply/preview", {
        params: { path: { id: groupId } },
        body: previewBody,
      });
      return GroupApplyPreviewWire.parse(result.data);
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      const result = await api.POST("/api/v1/groups/{id}/apply", {
        params: { path: { id: groupId } },
        body: previewBody,
      });
      return GroupApplyAcceptedWire.parse(result.data);
    },
    onSuccess: (data) => setJobId(data.job_id),
    onError: (error) => {
      const existing = jobIdFromError(error);
      if (existing) {
        setJobId(existing);
        return;
      }
      toastApiError(error);
    },
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const result = await api.POST("/api/v1/jobs/{id}/retry", { params: { path: { id } } });
      return JobWire.parse(result.data);
    },
    onSuccess: (job) => setJobId(job.id),
    onError: toastApiError,
  });

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: qk.groups.root });
    void queryClient.invalidateQueries({ queryKey: qk.products.root });
    void queryClient.invalidateQueries({ queryKey: qk.jobs.root });
    close();
  };

  const counts = group.data?.scope_counts;
  const canSubmit = (percentOn || fixedOn) && !trackedJobId;
  const sample = preview.data?.sample;

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) done();
      }}
      title={t.title}
      action={
        trackedJobId ? undefined : canSubmit ? (
          <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
            {t.submit(preview.data?.affected_count ?? counts?.all ?? 0)}
          </Button>
        ) : (
          <DisabledTooltip reason={t.submitDisabledHint}>
            <Button disabled>{t.submit(0)}</Button>
          </DisabledTooltip>
        )
      }
      footer={trackedJobId ? <div /> : undefined}
    >
      {trackedJobId ? (
        <JobProgress
          jobId={trackedJobId}
          retrying={retry.isPending}
          onRetry={(id) => retry.mutate(id)}
          onDone={done}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-cell font-medium">{t.scopeTitle}</legend>
            {(["all", "group_rule_only", "overridden_only"] as const).map((value) => (
              <label key={value} className="flex items-start gap-2 text-body">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  className="mt-1"
                />
                <span>
                  {APPLY_SCOPE_LABEL[value]}
                  {counts ? (
                    <span className="text-muted-foreground">
                      {" "}
                      (
                      {t.scopeCount(
                        value === "all"
                          ? counts.all
                          : value === "group_rule_only"
                            ? counts.group_rule_only
                            : counts.overridden_only,
                      )}
                      )
                    </span>
                  ) : null}
                  <span className="block text-meta text-muted-foreground">{APPLY_SCOPE_HINT[value]}</span>
                </span>
              </label>
            ))}
            {scope === "group_rule_only" && counts ? (
              <p className="text-meta text-muted-foreground">
                {t.keepsOverrides(counts.overridden_only, counts.group_rule_only)}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-cell font-medium">{t.updateTitle}</legend>
            <p className="text-meta text-muted-foreground">{t.updateHint}</p>
            <label className="flex items-center gap-2">
              <Checkbox checked={percentOn} onCheckedChange={(value) => setPercentOn(value === true)} />
              <span className="text-body">{t.marginPercent}</span>
              <Input
                value={percent}
                disabled={!percentOn}
                onChange={(event) => setPercentOverride(event.target.value)}
                className="w-24"
              />
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={fixedOn} onCheckedChange={(value) => setFixedOn(value === true)} />
              <span className="text-body">{t.marginFixed}</span>
              <Input
                value={fixed}
                disabled={!fixedOn}
                onChange={(event) => setFixedOverride(event.target.value)}
                className="w-24"
              />
            </label>
          </fieldset>

          {sample ? (
            <div className="rounded-md bg-muted p-3 text-meta">
              <p className="font-medium">{t.previewTitle}</p>
              <p>{t.previewBasis(formatMoney(sample.cost))}</p>
              <p>
                {t.previewCurrent} <Money value={sample.current_price} /> → {t.previewNext}{" "}
                <Money value={sample.new_price} />
              </p>
              {sample.rounding_applied ? (
                <p>
                  {formatMoney(sample.raw_price)} → {formatMoney(sample.new_price)}
                </p>
              ) : null}
              <p>
                {t.affected} <Num>{preview.data?.affected_count}</Num>
              </p>
            </div>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}
