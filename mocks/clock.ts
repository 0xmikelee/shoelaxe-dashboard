/**
 * Two clocks, deliberately.
 *
 * The seeded dataset is stamped against `SEED_NOW`, a fixed instant, so committed fixtures keep
 * matching the generated rows and 「3 天前」 does not become 「4 天前」 overnight in a snapshot. Live
 * behaviour — job progress, worker heartbeats, anything a user watches move — reads the wall clock,
 * because a frozen heartbeat would report the worker dead the moment the dev server started.
 */

/** The instant the dataset is seeded "now" at: 2026-08-24T02:00:00Z (10:00 Asia/Hong_Kong). */
export const SEED_NOW_MS = Date.parse("2026-08-24T02:00:00.000Z");

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** RFC 3339 in UTC with milliseconds — the shape `z.iso.datetime()` accepts. */
export const iso = (ms: number): string => new Date(ms).toISOString();

/** `agoIso(2 * DAY)` — a seeded timestamp relative to SEED_NOW. */
export const agoIso = (offsetMs: number): string => iso(SEED_NOW_MS - offsetMs);

export const seedNowIso = (): string => iso(SEED_NOW_MS);

/**
 * Wall-clock now, injectable. The job runner and the heartbeat read through this so a test can drive
 * staleness without waiting a real minute for it.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export function fixedClock(startMs = SEED_NOW_MS): Clock & { advance(ms: number): void } {
  let current = startMs;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}
