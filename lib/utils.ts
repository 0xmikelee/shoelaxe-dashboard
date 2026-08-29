import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design's type scale is nine role names — `text-body`, `text-meta`, `text-cell` … — not
 * t-shirt sizes, and tailwind-merge has no way to know that. Its default config files any
 * unrecognised `text-*` under the *colour* group, so `cn("text-body", "text-muted-foreground")`
 * resolves to `"text-muted-foreground"` alone and the size is gone. Measured live: the nav row
 * rendered at 16px with the right colour.
 *
 * It bites in both directions. `cn("text-error-foreground", "text-num")` keeps only `text-num`,
 * so `<Delta className="text-num">` loses its band colour entirely.
 *
 * Declaring the nine names as a font-size group fixes both: sizes conflict with sizes (including
 * Tailwind's own `text-sm`, which shadcn's primitives hard-code), colours conflict with colours,
 * and `text-center` / `text-left` are untouched. Keep this list in step with the `--text-*` block
 * in app/globals.css — a size added there and not here is silently dropped again.
 */
const TEXT_SIZES = [
  "micro",
  "badge",
  "meta",
  "label",
  "body",
  "cell",
  "num",
  "title",
  "section",
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...TEXT_SIZES] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
