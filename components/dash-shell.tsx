"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { PublishingBanner } from "@/components/publishing-banner";
import { Topbar } from "@/components/topbar";
import { useApprovalStats } from "@/hooks/use-approvals";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { AUTH_REQUIRED } from "@/lib/public-env";
import { SystemHealthWire } from "@/lib/schemas/wire/settings";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { Num } from "@/components/format/num";

function titleFor(pathname: string): { title?: React.ReactNode; subtitle?: React.ReactNode } {
  if (pathname.startsWith("/approvals")) return { title: zhHant.approvals.title };
  if (pathname.startsWith("/products/") && pathname !== "/products") return {};
  if (pathname.startsWith("/products")) return { title: zhHant.products.title };
  if (pathname.startsWith("/groups")) return { title: zhHant.groups.title };
  if (pathname.startsWith("/settings")) return { title: zhHant.settings.title };
  if (pathname.startsWith("/users")) return { title: zhHant.users.title };
  return {};
}

function AccountChip({ name }: { name: string }) {
  return (
    <span className="truncate text-meta text-muted-foreground" title={name}>
      {name}
    </span>
  );
}

/**
 * The authenticated chrome. Fetches `/me` and `/approvals/stats` once so the publishing banner and
 * the nav badge cannot disagree with a per-screen read, and so sync copy does not flash on first
 * paint. Auth itself is gated in the server layout; this component assumes it is allowed to render.
 */
export function DashShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useMe();
  const stats = useApprovalStats();
  const { title, subtitle } = titleFor(pathname);

  const pending = stats.data?.pending;
  const publishing = me.data?.meta.publishing;
  const topbarTitle =
    pathname.startsWith("/approvals") && pending !== undefined ? (
      <span className="flex items-baseline gap-2">
        <span className="text-section font-bold">{zhHant.approvals.title}</span>
        <Num className="text-meta text-muted-foreground">{zhHant.approvals.pendingChip(pending)}</Num>
      </span>
    ) : (
      title
    );

  return (
    <AppShell
      pendingCount={pending}
      banner={<PublishingBanner publishing={publishing} />}
      topbar={
        <Topbar title={topbarTitle} subtitle={subtitle}>
          {me.data ? <AccountChip name={me.data.user.name} /> : null}
          {AUTH_REQUIRED ? (
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="text-meta text-muted-foreground hover:text-foreground">
                {zhHant.shell.signOut}
              </button>
            </form>
          ) : null}
        </Topbar>
      }
    >
      {children}
    </AppShell>
  );
}

/** Prefetch helper used by Screen 2 so the worker badge is not a second surprise after crawl. */
export function useSystemHealth() {
  return useQuery({
    queryKey: qk.system.health(),
    queryFn: async () => SystemHealthWire.parse((await api.GET("/api/v1/system/health", {})).data),
  });
}
