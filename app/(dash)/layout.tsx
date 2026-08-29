import { DashShell } from "@/components/dash-shell";

/**
 * The authenticated shell. The allow-list gate belongs here — a Server Component that can
 * `redirect()` — rather than in `proxy.ts`. Until Supabase credentials exist locally (or mocks
 * are on) the gate is a no-op; see `lib/auth/gate.ts`.
 */
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { guardDashboard } = await import("@/lib/auth/gate");
  await guardDashboard();
  return <DashShell>{children}</DashShell>;
}
