// Importing this from a client component is a build error, not a confusing runtime throw. getEnv()
// validates the whole of process.env including SUPABASE_SERVICE_ROLE_KEY; client code reads the two
// public vars from lib/public-env.ts instead.
import "server-only";
import { z } from "zod";

/**
 * Validated lazily, never at module scope: `next build` runs inside the Docker image where
 * RUN_TIME-scoped secrets are absent, and a top-level parse would fail the build. The tempting
 * workaround — promoting DATABASE_URL to a build-time variable — bakes the database password
 * into an image layer.
 */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ROLE: z.enum(["web", "worker"]).default("web"),

  // Supavisor session-mode pooler. Never db.<ref>.supabase.co: that host is IPv6-only and
  // DigitalOcean App Platform cannot egress to IPv6.
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  PG_PREPARE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  INGEST_SECRET: z.string().min(16),

  // Explicit, never absent-credential detection: a lost secret must not degrade silently to
  // "everything skipped, dashboard green".
  PUBLISH_TARGET: z.enum(["none", "shopify"]).default("none"),
  SHOPIFY_STORE_DOMAIN: z.string().optional(),
  // Client credentials, exchanged for a 24-hour access token; there is no static Admin token.
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_LOCATION_ID: z.string().optional(),
});

export type Env = z.infer<typeof Env>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${detail}`);
  }
  if (parsed.data.PUBLISH_TARGET === "shopify") {
    const missing = (
      [
        "SHOPIFY_STORE_DOMAIN",
        "SHOPIFY_API_KEY",
        "SHOPIFY_API_SECRET",
        "SHOPIFY_LOCATION_ID",
      ] as const
    ).filter((k) => !parsed.data[k]);
    if (missing.length) {
      throw new Error(`PUBLISH_TARGET=shopify requires: ${missing.join(", ")}`);
    }
  }
  cached = parsed.data;
  return cached;
}

/** Test-only. */
export function resetEnvCache(): void {
  cached = undefined;
}
