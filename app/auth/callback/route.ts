import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isSupabaseConfigured, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/public-env";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const origin = url.origin;
  const nextParam = url.searchParams.get("next") ?? "/approvals";
  const next = nextParam.startsWith("/") ? nextParam : "/approvals";

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=access_denied`);
  }

  const redirect = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        for (const cookie of all) {
          redirect.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    log.error("auth.exchange_failed", { message: error.message });
    const reason = error.message.toLowerCase().includes("invalid api key")
      ? "invalid_key"
      : "access_denied";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  return redirect;
}
