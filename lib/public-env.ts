/**
 * The two public vars client components are allowed to read.
 *
 * `lib/env.ts` is `server-only` and validates the whole of process.env, including
 * SUPABASE_SERVICE_ROLE_KEY. Importing it from a client component is a build error. These are
 * the subset that is safe in the browser, and they are optional so a local mock-only run does
 * not require a Supabase project.
 */

/**
 * Next only inlines *literal* `process.env.NEXT_PUBLIC_*` member access. `process.env[name]` is
 * left as a runtime lookup, which is empty in the browser bundle.
 */
export const MOCKS_ENABLED =
  process.env.NEXT_PUBLIC_API_MOCKS === "1" || process.env.NEXT_PUBLIC_API_MOCKS === "true";

export const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = (): boolean =>
  PUBLIC_SUPABASE_URL.length > 0 && PUBLIC_SUPABASE_ANON_KEY.length > 0;

/**
 * A configured Supabase project means Google SSO is the door. MSW only substitutes `/api/v1`;
 * it is not a reason to skip the login screen.
 */
export const AUTH_REQUIRED = isSupabaseConfigured();
