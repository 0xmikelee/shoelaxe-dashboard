import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/auth/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
