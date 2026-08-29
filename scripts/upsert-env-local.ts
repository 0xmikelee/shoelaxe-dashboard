import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Upsert a key in `.env.local`. Never logs the value (location GIDs are fine to print at the call site). */
export function upsertEnvLocal(key: string, value: string, root = process.cwd()): void {
  const path = resolve(root, ".env.local");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  let next: string;
  if (re.test(existing)) {
    next = existing.replace(re, line);
  } else if (existing === "" || existing.endsWith("\n")) {
    next = `${existing}${line}\n`;
  } else {
    next = `${existing}\n${line}\n`;
  }
  writeFileSync(path, next);
}
