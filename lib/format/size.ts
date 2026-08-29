/**
 * Sizes are rendered verbatim — `US 9`, `US 7.5`, `US 7Y`, `EU 41` — and never re-derived from a
 * number, because `US 9.0` is not a size anyone writes and any round-trip through a float produces
 * one eventually.
 *
 * The collator is the part that matters. Lexicographically `US 10` sorts before `US 7`, and every
 * screen that lists sizes — Screen 8's tabs and table, Screen 3's expanded rows, Screen 4's failure
 * list, Screen 1's rows — would show them in that order unless they all share this comparator.
 */

/** Rank, not alphabet: the tabs read US · UK · EU · CM, and that is the order the design draws. */
export const SIZE_SYSTEMS = ["US", "UK", "EU", "CM"] as const;

export type SizeSystem = (typeof SIZE_SYSTEMS)[number];

const SYSTEM_RANK: Readonly<Record<SizeSystem, number>> = {
  US: 0,
  UK: 1,
  EU: 2,
  CM: 3,
};

/** `US 7Y`, `US 7 Y`, `us7y` — the crawler and the sheet do not agree on spacing or case. */
const SIZE = /^([A-Za-z]+)\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]*)$/;

export interface ParsedSize {
  /** Null when the label does not parse — a free-text size from the sheet, e.g. `均碼`. */
  system: SizeSystem | null;
  value: number;
  /** `Y` (youth), `C` (child) or empty. Sorted after the bare number: `US 7` before `US 7Y`. */
  suffix: string;
  /** The whitespace-normalised original. Always what gets rendered. */
  label: string;
}

/** Unrecognised systems and unparseable labels sort after every known one, in a stable order. */
const UNKNOWN_SYSTEM_RANK = SIZE_SYSTEMS.length;
const UNPARSEABLE_RANK = UNKNOWN_SYSTEM_RANK + 1;

export function parseSizeLabel(label: string): ParsedSize {
  const normalised = formatSize(label);
  const match = SIZE.exec(normalised);
  if (!match) return { system: null, value: Number.NaN, suffix: "", label: normalised };
  const [, system, value, suffix] = match;
  const upper = system.toUpperCase();
  return {
    system: (SIZE_SYSTEMS as readonly string[]).includes(upper) ? (upper as SizeSystem) : null,
    value: Number(value),
    suffix: suffix.toUpperCase(),
    label: normalised,
  };
}

/**
 * Whitespace normalisation and nothing else. The number is never reformatted: `US 7.5` keeps its
 * half and `US 9` never grows a `.0`.
 */
export function formatSize(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

/** Free-text labels are ordered against each other by locale, not by accident of insertion. */
const TEXT = new Intl.Collator("zh-Hant-HK");

function rankOf(parsed: ParsedSize): number {
  if (Number.isNaN(parsed.value)) return UNPARSEABLE_RANK;
  return parsed.system === null ? UNKNOWN_SYSTEM_RANK : SYSTEM_RANK[parsed.system];
}

/**
 * System rank, then numeric value, then the youth flag. Ties fall through to a locale compare of the
 * label so the sort is total — an unstable order in a size column looks like data corruption.
 */
export function compareSizes(a: string, b: string): number {
  const left = parseSizeLabel(a);
  const right = parseSizeLabel(b);
  const rank = rankOf(left) - rankOf(right);
  if (rank !== 0) return rank;
  if (!Number.isNaN(left.value) && !Number.isNaN(right.value) && left.value !== right.value) {
    return left.value - right.value;
  }
  if (left.suffix !== right.suffix) {
    // Bare first: `US 7` is an adult 7 and `US 7Y` a youth 7, and the adult row is the one people
    // are looking for.
    if (left.suffix === "") return -1;
    if (right.suffix === "") return 1;
    return TEXT.compare(left.suffix, right.suffix);
  }
  return TEXT.compare(left.label, right.label);
}

export function sortSizes(labels: readonly string[]): string[] {
  return [...labels].sort(compareSizes);
}

/** For a table column or an object list: `rows.sort(bySize((r) => r.size))`. */
export function bySize<T>(get: (row: T) => string): (a: T, b: T) => number {
  return (a, b) => compareSizes(get(a), get(b));
}
