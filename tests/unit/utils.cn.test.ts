import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cn } from "@/lib/utils";

/**
 * The design's `--text-*` role names are font sizes, and tailwind-merge's default config reads any
 * unrecognised `text-*` as a colour. Unextended, every one of these assertions fails by dropping
 * one of the two classes — which is what shipped, and what made the nav row render at 16px.
 */
describe("cn", () => {
  it("keeps a design type size alongside a colour, in either order", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe("text-body text-muted-foreground");
    expect(cn("text-error-foreground", "text-num")).toBe("text-error-foreground text-num");
  });

  it("still lets one size win over another, including Tailwind's own", () => {
    expect(cn("text-body", "text-cell")).toBe("text-cell");
    // shadcn's primitives hard-code text-sm / text-base; a caller's role name must beat them.
    expect(cn("text-sm", "text-meta")).toBe("text-meta");
    expect(cn("text-base", "text-title")).toBe("text-title");
  });

  it("still merges colours as colours and leaves alignment alone", () => {
    expect(cn("text-muted-foreground", "text-error-foreground")).toBe("text-error-foreground");
    expect(cn("text-center", "text-left")).toBe("text-left");
    expect(cn("num", "text-num")).toBe("num text-num");
  });

  /**
   * The list in lib/utils.ts is hand-maintained; a tenth size added to globals.css and not here
   * would be silently dropped again, and nothing on screen would say so.
   */
  it("covers every --text-* role declared in app/globals.css", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const declared = [...css.matchAll(/--text-([a-z0-9-]+):\s*[\d.]+px/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const role of declared) {
      expect(cn(`text-${role}`, "text-muted-foreground"), role).toBe(
        `text-${role} text-muted-foreground`,
      );
    }
  });
});
