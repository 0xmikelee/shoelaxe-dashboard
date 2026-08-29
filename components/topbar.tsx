import { cn } from "@/lib/utils";

export interface TopbarProps {
  /** A string, or a node when the screen needs a breadcrumb here (Screen 8). */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned actions: 匯出清單, 批次操作, a search field. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The export measures the bar as `p-[0_32px]` — no vertical padding at all, so its height is set by
 * whatever it contains. `min-h-14` only stops it collapsing on a screen whose topbar is a bare title.
 */
export function Topbar({ title, subtitle, children, className }: TopbarProps) {
  return (
    <header
      data-slot="topbar"
      className={cn(
        "flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-8 text-card-foreground",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {typeof title === "string" ? (
          <h1 className="truncate text-section font-bold">{title}</h1>
        ) : (
          title
        )}
        {subtitle ? <p className="truncate text-meta text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  );
}
