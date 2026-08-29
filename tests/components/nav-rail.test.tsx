import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/approvals" }));

import { NavRail } from "@/components/nav-rail";

// Resolved off the vitest root rather than import.meta.url: under the jsdom environment that URL
// is an http:// document URL, not a file:// one.
// Comments are stripped first: they legitimately contain braces and token names, and both would
// otherwise confuse the block match below.
const GLOBALS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const NAV_TOKENS = ["--nav", "--nav-foreground", "--nav-active", "--nav-active-foreground"] as const;

/** Neither `:root` nor `.dark` in globals.css nests a block, so a brace-free body match is exact. */
function ruleBody(selector: string): string {
  const match = new RegExp(`(?:^|\\n)${selector}\\s*\\{([^{}]*)\\}`).exec(GLOBALS);
  if (!match) throw new Error(`globals.css has no top-level \`${selector}\` rule`);
  return match[1];
}

function tokensOn(element: Element): Record<string, string> {
  const computed = getComputedStyle(element);
  return Object.fromEntries(
    NAV_TOKENS.map((token) => [token, computed.getPropertyValue(token).trim().toLowerCase()]),
  );
}

function renderRail(theme: "light" | "dark") {
  const { getByRole, unmount } = render(<NavRail />, {
    wrapper: ({ children }) => <div className={theme === "dark" ? "dark" : undefined}>{children}</div>,
  });
  const rail = getByRole("navigation", { name: "主要導覽" });
  const result = { tokens: tokensOn(rail), background: getComputedStyle(rail).getPropertyValue("--background").trim(), className: rail.className };
  unmount();
  return result;
}

/**
 * The rail is dark on the light canvas too, and nothing on screen reveals a regression until
 * someone opens dark mode and screenshots it. Rather than assert on class names — which would pass
 * just as happily with `--nav` redeclared under `.dark` — this loads the real globals.css into
 * jsdom and reads the token off the rendered element in both themes.
 */
describe("NavRail", () => {
  beforeAll(() => {
    const style = document.createElement("style");
    style.textContent = `:root{${ruleBody(":root")}} .dark{${ruleBody("\\.dark")}}`;
    document.head.appendChild(style);
  });

  it("resolves the same nav tokens in light and dark", () => {
    const light = renderRail("light");
    const dark = renderRail("dark");

    // Guards the guard: if the .dark wrapper were not actually applying the dark cascade, every
    // token below would match for the wrong reason and this test would never fail again.
    expect(dark.background).not.toBe(light.background);

    expect(dark.tokens).toEqual(light.tokens);
    expect(light.tokens["--nav"]).toBe("#0f1117");
    expect(light.tokens["--nav-active"]).toBe("#1e293b");
    // The equality above only means anything while the rail is painted from these tokens.
    expect(light.className).toContain("bg-nav");
  });

  it("declares no nav token under .dark", () => {
    const dark = ruleBody("\\.dark");
    for (const token of NAV_TOKENS) {
      expect(dark).not.toMatch(new RegExp(`${token}\\s*:`));
    }
  });
});
