import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom is missing several APIs Radix depends on. Select, Popover, DropdownMenu and Tooltip all
 * break without the pointer-capture trio in particular — the failure looks like "the menu never
 * opens" rather than a missing-API error, which is why this file exists rather than per-test stubs.
 */
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    root = null;
    rootMargin = "";
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false;
};
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};

if (!globalThis.DOMRect) {
  globalThis.DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0;
    left = 0;
    bottom = 0;
    right = 0;
    toJSON() {
      return this;
    }
    static fromRect() {
      return new globalThis.DOMRect();
    }
  } as unknown as typeof DOMRect;
}

// MSW is wired in by tests/setup/msw.ts once mocks/node.ts exists. Kept separate so a component
// test that needs no network does not pay for a server boot.
beforeAll(() => {});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
afterAll(() => {});
