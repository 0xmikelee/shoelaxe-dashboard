"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ModalShell } from "@/components/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCloseModal } from "@/hooks/use-close-modal";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { GroupDetailWire } from "@/lib/schemas/wire/groups";

const t = zhHant.groups.newGroupModal;

export function GroupNewModal({ fallbackHref }: { fallbackHref: string }) {
  const close = useCloseModal(fallbackHref);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [fixed, setFixed] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const result = await api.POST("/api/v1/groups", {
        body: {
          name: name.trim(),
          ...(percent ? { margin_percent: percent } : {}),
          ...(fixed ? { margin_fixed: fixed } : {}),
        },
      });
      return GroupDetailWire.parse(result.data);
    },
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.root });
      toastSuccess(zhHant.common.saveChanges);
      router.push(`/groups/${group.id}`);
    },
    onError: toastApiError,
  });

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t.title}
      action={
        <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          {t.submit}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.nameLabel}</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={60}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.marginPercentLabel}</span>
          <Input value={percent} onChange={(event) => setPercent(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.marginFixedLabel}</span>
          <Input value={fixed} onChange={(event) => setFixed(event.target.value)} />
        </label>
      </div>
    </ModalShell>
  );
}
