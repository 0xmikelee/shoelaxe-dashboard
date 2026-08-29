"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ModalShell } from "@/components/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCloseModal } from "@/hooks/use-close-modal";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { AllowedUserWire } from "@/lib/schemas/wire/users";

const t = zhHant.users;

export function UserNewModal() {
  const close = useCloseModal("/users");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const result = await api.POST("/api/v1/settings/allowed-users", {
        body: { name: name.trim(), email: email.trim().toLowerCase() },
      });
      return AllowedUserWire.parse(result.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings.allowedUsers() });
      toastSuccess(zhHant.common.saveChanges);
      close();
    },
    onError: toastApiError,
  });

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t.newUser}
      action={
        <Button disabled={!name.trim() || !email.trim() || create.isPending} onClick={() => create.mutate()}>
          {t.submit}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-meta text-muted-foreground">{t.accountSection}</p>
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.name}</span>
          <span className="text-meta text-muted-foreground">{t.nameHint}</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.email}</span>
          <span className="text-meta text-muted-foreground">{t.emailHint}</span>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
      </div>
    </ModalShell>
  );
}
