/**
 * Size ordering for the mock dataset.
 *
 * The real collator, not a copy of it. `lib/format/size.ts` is what the UI sorts with, and a mock
 * that orders its rows by different rules produces screens that only look right against the mock —
 * `US 10` before `US 7`, or a youth size interleaved with its adult twin, would show up as a
 * rendering bug the day the real API answers. This module existed only because lib/format did not
 * yet; it stays as the mock's import site so nothing here reaches across into the UI layer twice.
 */
export { compareSizes, sortSizes } from "@/lib/format/size";
