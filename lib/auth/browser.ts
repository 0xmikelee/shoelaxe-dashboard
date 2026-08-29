import { createBrowserClient } from "@supabase/ssr";

import { isSupabaseConfigured, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/public-env";

export function createBrowserSupabase() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * GoTrue's public settings list which OAuth providers are switched on. Hitting `/authorize`
 * for a disabled provider returns a JSON 400 instead of Google's account picker.
 */
export async function isGoogleProviderEnabled(): Promise<boolean | null> {
  if (!isSupabaseConfigured()) return false;
  try {
    const response = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: {
        apikey: PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { external?: { google?: boolean } };
    return body.external?.google === true;
  } catch {
    return null;
  }
}
