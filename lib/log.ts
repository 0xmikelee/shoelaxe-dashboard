type Level = "debug" | "info" | "warn" | "error";

/**
 * One JSON object per line. At Singapore-to-Singapore latency a slow request is almost always an
 * accidental N+1, so `db_statements` and `db_ms` are first-class fields rather than an afterthought.
 */
function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, t: new Date().toISOString(), ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
