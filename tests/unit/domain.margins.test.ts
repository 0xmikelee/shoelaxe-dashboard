import { describe, expect, it } from "vitest";
import { resolveMargins, type DefaultMarginRule, type MarginRule } from "@/lib/domain/margins";

const OVERRIDE: MarginRule = { percent: 20, fixedCents: 15000 };
const GROUP: MarginRule = { percent: 15, fixedCents: 5000 };
const ON: DefaultMarginRule = { enabled: true, percent: 12, fixedCents: 0 };
const OFF: DefaultMarginRule = { enabled: false, percent: 12, fixedCents: 0 };

describe("the §5 precedence chain, all eight combinations", () => {
  it.each([
    ["override + group + default on", OVERRIDE, GROUP, ON, { percent: 20, fixedCents: 15000, source: "override" }],
    ["override + group + default off", OVERRIDE, GROUP, OFF, { percent: 20, fixedCents: 15000, source: "override" }],
    ["override + no group + default on", OVERRIDE, null, ON, { percent: 20, fixedCents: 15000, source: "override" }],
    ["override + no group + default off", OVERRIDE, null, OFF, { percent: 20, fixedCents: 15000, source: "override" }],
    ["no override + group + default on", null, GROUP, ON, { percent: 15, fixedCents: 5000, source: "group" }],
    ["no override + group + default off", null, GROUP, OFF, { percent: 15, fixedCents: 5000, source: "group" }],
    ["no override + no group + default on", null, null, ON, { percent: 12, fixedCents: 0, source: "default" }],
    ["no override + no group + default off", null, null, OFF, null],
  ])("%s", (_label, override, group, defaults, expected) => {
    expect(resolveMargins(override, group, defaults)).toEqual(expected);
  });
});

describe("all-or-nothing", () => {
  it("treats a percent-only override as a whole override with fixed 0", () => {
    expect(resolveMargins({ percent: 18, fixedCents: null }, GROUP, ON)).toEqual({
      percent: 18,
      fixedCents: 0,
      source: "override",
    });
  });

  it("treats a fixed-only override as a whole override with percent 0", () => {
    expect(resolveMargins({ percent: null, fixedCents: 20000 }, GROUP, ON)).toEqual({
      percent: 0,
      fixedCents: 20000,
      source: "override",
    });
  });

  it("treats a zero override as set - 0% + HK$0 is a decision, not an absence", () => {
    expect(resolveMargins({ percent: 0, fixedCents: 0 }, GROUP, ON)).toEqual({
      percent: 0,
      fixedCents: 0,
      source: "override",
    });
  });

  it("falls through a both-null override row", () => {
    expect(resolveMargins({ percent: null, fixedCents: null }, GROUP, ON)?.source).toBe("group");
  });

  it("applies the same rule to a percent-only group", () => {
    expect(resolveMargins(null, { percent: 15, fixedCents: null }, ON)).toEqual({
      percent: 15,
      fixedCents: 0,
      source: "group",
    });
  });

  it("applies the same rule to a fixed-only group", () => {
    expect(resolveMargins(null, { percent: null, fixedCents: 8000 }, ON)).toEqual({
      percent: 0,
      fixedCents: 8000,
      source: "group",
    });
  });

  it("falls through a both-null group row to the default", () => {
    expect(resolveMargins(null, { percent: null, fixedCents: null }, ON)?.source).toBe("default");
  });
});
