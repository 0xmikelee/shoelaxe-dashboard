/**
 * The design's separator vocabulary, in one place so no screen reaches for a different dash.
 *
 * The interpunct is U+00B7 MIDDLE DOT. The brief calls it "full-width ·", but all 49 occurrences in
 * the .pen export are U+00B7 and not U+30FB KATAKANA MIDDLE DOT; the two are visibly different
 * widths beside Latin text, and mixing them makes a table column look misaligned for no findable
 * reason.
 */
export const MIDDLE_DOT = "·";

/**
 * Unknown or not-applicable, and nothing else. `HK$0` is a value and renders as one — a null
 * `approved_price` (a brand new product) and a zero one are both real on Screen 1 and mean
 * different things, so the em dash may never stand in for a number that exists.
 */
export const EM_DASH = "—";

/** Ranges only: 10–20%, HK$1,420–1,640. Never a minus sign, never a separator. */
export const EN_DASH = "–";

/** Old → new, in the changeset summary and the 售價變化 column. */
export const ARROW = "→";

/** Alias for readability at the call site: `orDash` returns UNKNOWN, not "a dash". */
export const UNKNOWN = EM_DASH;

/** Content that is entirely ASCII takes half-width parentheses; a Chinese run takes （）. */
const PURE_LATIN = /^[\x20-\x7E]*$/;

/**
 * `（）` inside Chinese runs and `()` around pure Latin, decided from the content rather than from a
 * flag at the call site — 待審核（新產品）, StockX（郵件）and `(US 9)` all come out right, and nobody
 * has to remember which is which.
 */
export function paren(content: string): string {
  return PURE_LATIN.test(content) ? `(${content})` : `（${content}）`;
}

/** 「」 for a quoted proper noun: 刪除「Jordan 1 系列」？ */
export function quote(content: string): string {
  return `「${content}」`;
}

/**
 * The inline separator. Empty and nullish parts are dropped rather than producing a dangling ` · `,
 * because most call sites are assembling a line out of optional fields.
 */
export function joinDot(...parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(` ${MIDDLE_DOT} `);
}

/** A range collapses when both ends are equal — HK$1,420–1,420 is noise, not information. */
export function range(min: string, max: string): string {
  return min === max ? min : `${min}${EN_DASH}${max}`;
}

/** 舊值 → 新值, the shape used by both the changeset summary and the history table. */
export function arrow(from: string, to: string): string {
  return `${from} ${ARROW} ${to}`;
}

/**
 * The one place a nullable value becomes an em dash. Written as a combinator so the null check and
 * the formatter cannot drift apart at 40 call sites.
 */
export function orDash<T>(value: T | null | undefined, render: (value: T) => string): string {
  return value === null || value === undefined ? UNKNOWN : render(value);
}
