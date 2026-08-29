import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { isSupabaseConfigured, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/public-env";

/**
 * Cookie-backed supabase for the Server Components and the OAuth callback.
 * Returns null when credentials are absent so a mock-only local run does not crash.
 */
export async function createServerSupabase() {
  if (!isSupabaseConfigured()) return null;
  const store = await cookies();
  return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        for (const cookie of all) store.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
}
