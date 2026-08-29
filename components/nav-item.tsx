import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";

export interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  /**
   * The pending-approvals count. `undefined` while the stats query is loading — the shell renders
   * nothing rather than a `0` that reads as "the queue is clear".
   */
  badge?: number;
}

export function NavItem({ href, label, icon: Icon, active = false, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      data-slot="nav-item"
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md p-3 font-medium transition-colors",
        "text-nav-foreground hover:bg-nav-active/60 hover:text-nav-active-foreground",
        "focus-visible:ring-2 focus-visible:ring-nav-active-foreground/60 focus-visible:outline-none",
        active && "bg-nav-active text-nav-active-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-body">{label}</span>
      {badge === undefined ? null : (
        <span
          aria-label={zhHant.nav.pendingBadgeLabel}
          className="num rounded-full bg-primary px-1.5 py-px text-micro font-semibold text-primary-foreground"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
