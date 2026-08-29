import { parseInstant } from "@/lib/domain/time";
import { UNKNOWN } from "@/lib/format/punct";

/**
 * Three date forms, used deliberately:
 *   - **relative** for sync freshness — 剛剛, 12 分鐘前, 3 小時前;
 *   - **semi-absolute** for "last updated" — 今日 09:00, 昨日 09:00, 8月12日 09:00;
 *   - **absolute** `YYYY-MM-DD HH:mm` in history tables, where rows are scanned and compared.
 *
 * 24-hour clock throughout, and the time zone is passed explicitly on every call: the server runs in
 * Singapore, so a bare `toLocaleString()` is off by an hour for part of the data and right for the
 * rest, which is the hardest kind of wrong to notice.
 */
export const TIME_ZONE = "Asia/Hong_Kong";

export type DateInput = string | number | Date;

/**
 * Also exposed through the dictionary as `zhHant.time`. These four live here rather than in
 * lib/i18n because they interleave with the arithmetic that chooses between them, and a copy change
 * to 「分鐘前」 that did not also see the 60-minute cutoff would be a change made blind.
 */
export const RELATIVE_TIME = {
  justNow: "剛剛",
  minutesAgo: (n: number) => `${n} 分鐘前`,
  hoursAgo: (n: number) => `${n} 小時前`,
  daysAgo: (n: number) => `${n} 天前`,
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Past a month, "35 天前" stops being a fact anyone can use and a date starts being one. */
const RELATIVE_LIMIT = 30 * DAY;

/**
 * `hourCycle` alone, without `hour12`: the two together are specified to have `hour12` win, and
 * `hour12: false` renders midnight as `24:00` on some ICU builds. The `=== 24` guard below is the
 * belt to that braces.
 */
const HK = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toMs(value: DateInput, field = "timestamp"): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return parseInstant(value, field);
}

/** The Hong Kong wall clock for an instant, which is the only calendar this UI ever reasons about. */
function wall(ms: number): Wall {
  const found: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of HK.formatToParts(new Date(ms))) found[part.type] = part.value;
  const hour = Number(found.hour);
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(found.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

const hhmm = (w: Wall) => `${pad(w.hour)}:${pad(w.minute)}`;

const ymd = (w: Wall) => `${w.year}-${pad(w.month)}-${pad(w.day)}`;

/** Days since the epoch in Hong Kong, so 今日 / 昨日 are calendar answers rather than 24-hour ones. */
const dayNumber = (w: Wall) => Date.UTC(w.year, w.month - 1, w.day) / DAY;

/** `2026-08-24 09:00`. The history-table form. */
export function formatAbsolute(value: DateInput): string {
  const w = wall(toMs(value));
  return `${ymd(w)} ${hhmm(w)}`;
}

/** `2026-08-24`. Date filters and CSV columns. */
export function formatDateOnly(value: DateInput): string {
  return ymd(wall(toMs(value)));
}

/** `09:00`. */
export function formatTimeOnly(value: DateInput): string {
  return hhmm(wall(toMs(value)));
}

/**
 * `今日 09:00` · `昨日 09:00` · `8月12日 09:00` · `2025年8月12日 09:00`.
 *
 * `now` is injectable because 今日 is a property of the pair, not of the timestamp, and a test that
 * cannot pin "now" can only assert the branch it happens to be in today.
 */
export function formatSemiAbsolute(value: DateInput, now: DateInput = Date.now()): string {
  const w = wall(toMs(value));
  const n = wall(toMs(now, "now"));
  const days = dayNumber(n) - dayNumber(w);
  const time = hhmm(w);
  if (days === 0) return `今日 ${time}`;
  if (days === 1) return `昨日 ${time}`;
  if (w.year === n.year) return `${w.month}月${w.day}日 ${time}`;
  return `${w.year}年${w.month}月${w.day}日 ${time}`;
}

/**
 * `剛剛` · `12 分鐘前` · `3 小時前` · `5 天前`, falling back to the semi-absolute form after a month.
 *
 * A timestamp in the future is 剛剛 rather than a negative count: clock skew between the crawler's
 * host and the browser is real and small, and "-1 分鐘前" would be reported as a bug.
 */
export function formatRelative(value: DateInput, now: DateInput = Date.now()): string {
  const ms = toMs(now, "now") - toMs(value);
  if (ms < MINUTE) return RELATIVE_TIME.justNow;
  if (ms < HOUR) return RELATIVE_TIME.minutesAgo(Math.floor(ms / MINUTE));
  if (ms < DAY) return RELATIVE_TIME.hoursAgo(Math.floor(ms / HOUR));
  if (ms < RELATIVE_LIMIT) return RELATIVE_TIME.daysAgo(Math.floor(ms / DAY));
  return formatSemiAbsolute(value, now);
}

export function formatAbsoluteOrDash(value: DateInput | null | undefined): string {
  return value === null || value === undefined ? UNKNOWN : formatAbsolute(value);
}

export function formatSemiAbsoluteOrDash(
  value: DateInput | null | undefined,
  now?: DateInput,
): string {
  return value === null || value === undefined ? UNKNOWN : formatSemiAbsolute(value, now);
}

export function formatRelativeOrDash(value: DateInput | null | undefined, now?: DateInput): string {
  return value === null || value === undefined ? UNKNOWN : formatRelative(value, now);
}
