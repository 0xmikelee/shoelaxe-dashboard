import "server-only";
import { redirect } from "next/navigation";

import { AUTH_REQUIRED } from "@/lib/public-env";
import { createServerSupabase } from "./server";

/**
 * Allow-list check belongs here, not in proxy.ts: proxy cannot sign a user out and would turn
 * a not-allowed account into a Google-to-blank-page loop. The DB-backed allow-list itself is
 * backend M6; until then a valid Google session is enough.
 */
export async function guardDashboard(): Promise<void> {
  if (!AUTH_REQUIRED) return;
  const supabase = await createServerSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
}
