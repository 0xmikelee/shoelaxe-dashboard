import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { TONE_SURFACE, TONE_TEXT, type Tone } from "@/lib/format/tone";

const TONES: readonly Tone[] = ["success", "warning", "error", "info", "neutral"];

/** Comments are stripped first: they name tokens in prose and would match the lookups below. */
const GLOBALS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("the tone maps", () => {
  it("cover every tone", () => {
    expect(Object.keys(TONE_TEXT).sort()).toEqual([...TONES].sort());
    expect(Object.keys(TONE_SURFACE).sort()).toEqual([...TONES].sort());
  });

  /**
   * A class naming a token that `@theme inline` does not declare compiles to nothing, and the value
   * silently renders in the body colour — which on a Δ column means the band is invisible rather
   * than wrong, and nobody files it.
   */
  it("names only colour tokens that globals.css actually declares", () => {
    const classes = [...Object.values(TONE_TEXT), ...Object.values(TONE_SURFACE)]
      .flatMap((value) => value.split(" "))
      .map((cls) => cls.replace(/^(text|bg)-/, ""));
    for (const token of new Set(classes)) {
      expect(GLOBALS, token).toContain(`--color-${token}:`);
    }
  });

  it("pairs every surface with its own foreground", () => {
    for (const tone of TONES) {
      const [background, foreground] = TONE_SURFACE[tone].split(" ");
      expect(foreground, tone).toBe(TONE_TEXT[tone]);
      expect(background, tone).toBe(`bg-${foreground.replace(/^text-/, "").replace(/-foreground$/, "")}`);
    }
  });
});
