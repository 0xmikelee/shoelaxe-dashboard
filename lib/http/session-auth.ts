import { ApiError } from "@/lib/http/errors";
import { isSupabaseConfigured } from "@/lib/public-env";

/** The actor stamp written onto audit_log / price_history for a dashboard mutation. */
export interface SessionActor {
  id: string | null;
  email: string | null;
  label: string;
}

export const ANON_ACTOR: SessionActor = {
  id: null,
  email: null,
  label: "dashboard",
};

export const MACHINE_ACTOR: SessionActor = {
  id: null,
  email: null,
  label: "machine",
};

/**
 * Pure decision so unit tests do not have to boot Next cookies. `requireSession` is the request-path
 * wrapper that reads the cookie-backed client.
 */
export function actorFromSession(input: {
  configured: boolean;
  user: { id: string; email?: string | null; name?: string | null } | null;
  authError: boolean;
}): SessionActor {
  if (!input.configured) return ANON_ACTOR;
  if (input.authError) {
    throw new ApiError("session_expired", "session expired");
  }
  if (!input.user) {
    throw new ApiError("unauthenticated", "sign in required");
  }
  const email = input.user.email ?? null;
  const name = input.user.name?.trim();
  return {
    id: input.user.id,
    email,
    label: name || email || "user",
  };
}

/**
 * Session gate for `/api/v1`. Matches `guardDashboard`: until the allow-list is wired, any valid
 * Google session is enough. A mock-only local run (no public Supabase vars) is not gated.
 */
export async function requireSession(): Promise<SessionActor> {
  if (!isSupabaseConfigured()) return ANON_ACTOR;

  const { createServerSupabase } = await import("@/lib/auth/server");
  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch {
    throw new ApiError("unauthenticated", "sign in required");
  }
  if (!supabase) {
    throw new ApiError("unauthenticated", "sign in required");
  }

  const { data, error } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata as { name?: unknown } | undefined;
  const name = typeof meta?.name === "string" ? meta.name : null;
  return actorFromSession({
    configured: true,
    user: data.user
      ? { id: data.user.id, email: data.user.email ?? null, name }
      : null,
    authError: Boolean(error),
  });
}
