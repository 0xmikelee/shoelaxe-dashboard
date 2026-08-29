import { Inbox, type LucideIcon } from "lucide-react";

import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Defaults to 沒有資料; every screen with something more specific to say passes its own. */
  title?: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** 清除篩選, 新增分組 — the way out of the empty state, when there is one. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Deliberately quiet, and deliberately not shaped like `ErrorState`: an empty list is a normal
 * result. Dashed muted border, no alert role, no retry. "No rows match this filter" must never
 * borrow the visual language of "the request failed".
 */
export function EmptyState({
  title = zhHant.emptyState.title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-cell font-bold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-meta text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
