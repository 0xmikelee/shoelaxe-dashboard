"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { JobProgress } from "@/components/jobs/job-progress";
import { ModalShell } from "@/components/modal-shell";
import { Num } from "@/components/format/num";
import { Button } from "@/components/ui/button";
import { useCloseModal } from "@/hooks/use-close-modal";
import { useGroup, useGroups } from "@/hooks/use-groups";
import { useActiveJob } from "@/hooks/use-jobs";
import { api } from "@/lib/api/client";
import { jobIdFromError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError } from "@/lib/toast";
import { GroupDeleteAcceptedWire } from "@/lib/schemas/wire/groups";
import { JobWire } from "@/lib/schemas/wire/jobs";

const t = zhHant.groupDelete;

export function GroupDeleteModal({ groupId }: { groupId: string }) {
  const close = useCloseModal(`/groups/${groupId}`);
  const router = useRouter();
  const queryClient = useQueryClient();
  const group = useGroup(groupId);
  const groups = useGroups();
  const defaultId = groups.data?.find((row) => row.is_default)?.id;
  const active = useActiveJob("group_rule_recompute", defaultId);

  const [jobId, setJobId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const trackedJobId = jobId ?? active.data?.id ?? null;

  const remove = useMutation({
    mutationFn: async () => {
      const result = await api.DELETE("/api/v1/groups/{id}", { params: { path: { id: groupId } } });
      return GroupDeleteAcceptedWire.parse(result.data);
    },
    onSuccess: (data) => {
      setJobId(data.job_id);
      setTargetId(data.target_group_id);
    },
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

  const finish = () => {
    void queryClient.invalidateQueries({ queryKey: qk.groups.root });
    void queryClient.invalidateQueries({ queryKey: qk.products.root });
    void queryClient.invalidateQueries({ queryKey: qk.jobs.root });
    router.push(`/groups/${targetId ?? defaultId ?? ""}`);
  };

  const name = group.data?.name ?? "";

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) (trackedJobId ? finish : close)();
      }}
      title={t.title(name)}
      action={
        trackedJobId ? undefined : (
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t.deleting : t.submit}
          </Button>
        )
      }
      footer={trackedJobId ? <div /> : undefined}
    >
      {trackedJobId ? (
        <div className="flex flex-col gap-3">
          <p className="text-meta text-muted-foreground">{t.recomputeNotice}</p>
          <JobProgress
            jobId={trackedJobId}
            retrying={retry.isPending}
            onRetry={(id) => retry.mutate(id)}
            onDone={finish}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-body">
          <p>{t.productsSafe}</p>
          {group.data ? (
            <p>
              <Num>{t.productsCount(group.data.product_count)}</Num>
            </p>
          ) : null}
          <p>{t.ruleLost}</p>
          <p className="text-meta text-muted-foreground">{t.irreversible}</p>
        </div>
      )}
    </ModalShell>
  );
}
