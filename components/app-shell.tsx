import { NavRail } from "@/components/nav-rail";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  children: React.ReactNode;
  /** A `<Topbar>`. Owned by the screen's layout, because its actions differ per screen. */
  topbar?: React.ReactNode;
  /** `<PublishingBanner>`, or a job-in-progress notice. Sits below the topbar and never scrolls. */
  banner?: React.ReactNode;
  pendingCount?: number;
  className?: string;
}

/**
 * The rail is fixed and the content column is the only scroller, so the nav stays put while a
 * 1784px-tall product page scrolls. Below ~1024px the content scrolls sideways rather than
 * reflowing: the design is a 1440 desktop canvas and there is no mobile layout to fall back to.
 */
export function AppShell({ children, topbar, banner, pendingCount, className }: AppShellProps) {
  return (
    <div className={cn("flex h-dvh w-full overflow-hidden bg-background", className)}>
      <NavRail pendingCount={pendingCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        {banner}
        <main className="min-w-0 flex-1 overflow-auto p-5">{children}</main>
      </div>
    </div>
  );
}
