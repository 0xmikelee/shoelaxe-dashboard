"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { zhHant } from "@/lib/i18n/zh-Hant";
import type { ErrorCode } from "@/lib/http/errors";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  /** Shown verbatim in mono. It is what a screenshot needs to carry for anyone to diagnose this. */
  code?: ErrorCode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Solid tinted `--error` panel with an alert role and a retry — structurally unlike `EmptyState`'s
 * dashed muted box, because at a glance the difference between "nothing matched" and "we could not
 * load this" has to be obvious without reading the copy.
 */
export function ErrorState({
  title = zhHant.errorState.title,
  description = zhHant.errorState.description,
  code,
  onRetry,
  retryLabel = zhHant.common.retry,
  className,
}: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-error-foreground/20 bg-error px-6 py-12 text-center",
        className,
      )}
    >
      <TriangleAlert className="size-5 text-error-foreground" aria-hidden />
      <p className="text-cell font-bold text-error-foreground">{title}</p>
      <p className="max-w-md text-meta text-error-foreground/80">{description}</p>
      {code ? <code className="font-mono text-micro text-error-foreground/70">{code}</code> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
