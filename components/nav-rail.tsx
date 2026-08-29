"use client";

import { usePathname } from "next/navigation";
import { Layers, type LucideIcon, Package, Settings, TrendingUp, Users } from "lucide-react";

import { NavItem } from "@/components/nav-item";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: readonly NavLink[];
}

/**
 * 通知中心 and 幫助文檔 appear in the .pen rail and are explicit design deltas — cut from v1. They
 * are not to be restored from the screen dump; see docs/design-screens.md "App shell".
 */
const SECTIONS: readonly NavSection[] = [
  {
    label: zhHant.nav.mainSection,
    items: [
      { href: "/approvals", label: zhHant.nav.approvals, icon: TrendingUp },
      { href: "/products", label: zhHant.nav.products, icon: Package },
      { href: "/groups", label: zhHant.nav.groups, icon: Layers },
    ],
  },
  {
    label: zhHant.nav.systemSection,
    items: [
      { href: "/settings", label: zhHant.nav.settings, icon: Settings },
      { href: "/users", label: zhHant.nav.users, icon: Users },
    ],
  },
];

/** `/products/AJ1-555088-101` keeps 產品列表 lit, so the rail matches on the route prefix. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface NavRailProps {
  className?: string;
  /** Pending approvals. Omitted while the stats query is in flight — see NavItem.badge. */
  pendingCount?: number;
}

/**
 * Hand-rolled rather than shadcn's `Sidebar`, which brings a provider, offcanvas machinery, cookie
 * persistence and its own theme-following `--sidebar-*` tokens — the last of those is the reliable
 * way to end up with a rail that turns light in light mode. The rail is dark in both themes, and
 * `--nav*` is declared only in `:root` so that stays true without a `dark:` override.
 */
export function NavRail({ className, pendingCount }: NavRailProps) {
  const pathname = usePathname();

  return (
    <nav
      data-slot="nav-rail"
      aria-label={zhHant.nav.railLabel}
      className={cn("flex h-full w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-nav p-4", className)}
    >
      <div className="px-3 pt-2 pb-1">
        <span className="text-section font-bold tracking-tight text-nav-active-foreground">
          {zhHant.app.name}
        </span>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <h2 className="px-3 pb-1 text-micro font-semibold tracking-widest text-nav-foreground/70">
            {section.label}
          </h2>
          {section.items.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(pathname, item.href)}
              badge={item.href === "/approvals" ? pendingCount : undefined}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
