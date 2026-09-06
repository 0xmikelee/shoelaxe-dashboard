import "server-only";
import postgres from "postgres";
import { getEnv } from "@/lib/env-core";

/**
 * Lazy postgres.js client. Constructed on first use, never at module scope: `pnpm contract` imports
 * route files, and `next build` inside Docker has no runtime secrets.
 */
let cached: postgres.Sql | undefined;

export function getSql(): postgres.Sql {
  if (cached) return cached;
  const env = getEnv();
  cached = postgres(env.DATABASE_URL, {
    max: env.PG_POOL_MAX,
    prepare: env.PG_PREPARE,
  });
  return cached;
}

export async function pingSql(): Promise<void> {
  const [row] = await getSql()`select 1 as ok`;
  if (!row) throw new Error("database ping returned no row");
}

/** Test-only. Does not end the pool — tests should not construct a real client. */
export function resetSqlCache(): void {
  cached = undefined;
}
