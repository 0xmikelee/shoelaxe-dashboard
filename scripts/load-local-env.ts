import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env.local` then `.env` into `process.env` without overwriting keys already set.
 * Next.js does this for `pnpm dev`; `tsx` scripts do not.
 */
export function loadLocalEnv(root = process.cwd()): void {
  for (const name of [".env.local", ".env"] as const) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
