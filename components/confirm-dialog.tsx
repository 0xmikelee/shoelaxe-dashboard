"use client";

import { ModalShell } from "@/components/modal-shell";
import { Button } from "@/components/ui/button";
import { zhHant } from "@/lib/i18n/zh-Hant";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel = zhHant.common.confirm,
  cancelLabel = zhHant.common.cancel,
  variant = "default",
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      cancelLabel={cancelLabel}
      action={
        <Button
          variant={variant === "destructive" ? "destructive" : "default"}
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      }
    >
      {children}
    </ModalShell>
  );
}
