/**
 * The five semantic colour pairs from docs/DESIGN-TOKENS.md, named once so a badge, a Δ value and a
 * callout that mean the same thing look the same.
 *
 * `neutral` is muted rather than a sixth pair: "nothing to see here" is the absence of a semantic
 * colour, not one of its own.
 */
export type Tone = "success" | "warning" | "error" | "info" | "neutral";

/** Foreground only — for a Δ value or an inline figure sitting on the page background. */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  error: "text-error-foreground",
  info: "text-info-foreground",
  neutral: "text-muted-foreground",
};

/** The tinted-background pair, for badges, chips and callouts. */
export const TONE_SURFACE: Readonly<Record<Tone, string>> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  error: "bg-error text-error-foreground",
  info: "bg-info text-info-foreground",
  neutral: "bg-muted text-muted-foreground",
};
