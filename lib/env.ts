// Importing this from a client component is a build error, not a confusing runtime throw. getEnv()
// validates the whole of process.env including SUPABASE_SERVICE_ROLE_KEY; client code reads the two
// public vars from lib/public-env.ts instead.
import "server-only";

export { getEnv, resetEnvCache, type Env } from "@/lib/env-core";
