import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isSupabaseConfigured, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/public-env";

/**
 * Cookie refresh only. Next 16's convention is `proxy.ts` (middleware.ts does not exist).
 * Do not set `runtime` — it throws; the default Node runtime is what `@supabase/ssr` needs.
 * The allow-list gate lives in `app/(dash)/layout.tsx`.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        for (const cookie of all) {
          request.cookies.set(cookie.name, cookie.value);
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
