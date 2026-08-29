"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";

export interface ModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Defaults to 取消. */
  cancelLabel?: string;
  /** The primary action, already labelled and wired — 套用至 96 個項目, 刪除分組, 建立帳號. */
  action?: React.ReactNode;
  /** Replaces the whole footer, for the states that have no cancel (Screen 4 D/E). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * The 560px modal chrome from the design, composed from the Radix primitives rather than shadcn's
 * `DialogContent`: that one hard-codes its own overlay and a top-right close button, and the design
 * wants the `#11111199` scrim (`--overlay`) and an 18px close inside the header.
 */
export function ModalShell({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  cancelLabel = zhHant.common.cancel,
  action,
  footer,
  className,
}: ModalShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-overlay supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Content
          data-slot="modal-shell"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-4rem)] w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-4">
            {/* The Radix primitives rather than shadcn's DialogTitle / DialogDescription: the
                design's header is a title, a subtitle and an 18px close on one row, and those two
                wrappers each bring their own type and spacing to unpick. */}
            <div className="flex min-w-0 flex-col gap-1">
              <DialogPrimitive.Title data-slot="dialog-title" className="text-title font-bold">
                {title}
              </DialogPrimitive.Title>
              {subtitle ? (
                <DialogPrimitive.Description
                  data-slot="dialog-description"
                  className="text-meta text-muted-foreground"
                >
                  {subtitle}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 shrink-0">
                <X className="size-[18px]" />
                <span className="sr-only">{zhHant.common.close}</span>
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-body">{children}</div>

          {footer ?? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-4">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost">{cancelLabel}</Button>
              </DialogPrimitive.Close>
              {action}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
