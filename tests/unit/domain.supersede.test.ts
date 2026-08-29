import { describe, expect, it } from "vitest";
import { supersede, type UnapprovedUpdate } from "@/lib/domain/supersede";
import { DomainError } from "@/lib/domain/types";

const at = (id: string, observedAt: string): UnapprovedUpdate => ({ id, observedAt });

describe("supersede", () => {
  it("lets the newest observation win and supersedes the rest", () => {
    const incoming = at("u3", "2026-08-24T03:00:00Z");
    const result = supersede({
      incoming,
      unapproved: [at("u1", "2026-08-24T01:00:00Z"), at("u2", "2026-08-24T02:00:00Z"), incoming],
      baseCostAt: "2026-08-24T02:00:00Z",
    });
    expect(result.applies).toBe(true);
    expect(result.superseded).toEqual(["u1", "u2"]);
  });

  it("keeps pending_since from the oldest unapproved observation", () => {
    const incoming = at("u3", "2026-08-24T03:00:00Z");
    const result = supersede({
      incoming,
      unapproved: [at("u2", "2026-08-24T02:00:00Z"), at("u1", "2026-08-24T01:00:00Z"), incoming],
      baseCostAt: null,
    });
    expect(result.pendingSince).toBe("2026-08-24T01:00:00Z");
  });

  it("starts pending_since at the incoming update when nothing was waiting", () => {
    const incoming = at("u1", "2026-08-24T03:00:00Z");
    expect(supersede({ incoming, unapproved: [incoming], baseCostAt: null }).pendingSince).toBe(
      "2026-08-24T03:00:00Z",
    );
  });

  // Arrival order is not observation order: a retried chunk can deliver an hour-old crawl after a
  // fresh one. Replaying it must not walk base_cost backwards.
  it("supersedes an update observed before base_cost_at without moving base cost", () => {
    const incoming = at("stale", "2026-08-24T01:00:00Z");
    const result = supersede({
      incoming,
      unapproved: [at("u2", "2026-08-24T02:30:00Z"), incoming],
      baseCostAt: "2026-08-24T02:00:00Z",
    });
    expect(result).toEqual({
      applies: false,
      superseded: ["stale"],
      pendingSince: "2026-08-24T02:30:00Z",
    });
  });

  it("leaves pending_since null when the only update is a stale one", () => {
    const incoming = at("stale", "2026-08-24T01:00:00Z");
    expect(
      supersede({ incoming, unapproved: [incoming], baseCostAt: "2026-08-24T02:00:00Z" }).pendingSince,
    ).toBeNull();
  });

  it("applies an update observed exactly at base_cost_at", () => {
    const incoming = at("u1", "2026-08-24T02:00:00Z");
    expect(
      supersede({ incoming, unapproved: [incoming], baseCostAt: "2026-08-24T02:00:00Z" }).applies,
    ).toBe(true);
  });

  it("gives a same-instant tie to the incoming update", () => {
    const incoming = at("u2", "2026-08-24T02:00:00Z");
    const result = supersede({
      incoming,
      unapproved: [at("u1", "2026-08-24T02:00:00Z"), incoming],
      baseCostAt: null,
    });
    expect(result.applies).toBe(true);
    expect(result.superseded).toEqual(["u1"]);
  });

  it("tolerates an unapproved list that does not contain the incoming row", () => {
    const incoming = at("u2", "2026-08-24T02:00:00Z");
    const result = supersede({ incoming, unapproved: [at("u1", "2026-08-24T01:00:00Z")], baseCostAt: null });
    expect(result.superseded).toEqual(["u1"]);
    expect(result.pendingSince).toBe("2026-08-24T01:00:00Z");
  });

  it.each([
    ["the incoming observation", { id: "u1", observedAt: "soon" }, null],
    ["base_cost_at", { id: "u1", observedAt: "2026-08-24T02:00:00Z" }, "whenever"],
  ])("refuses a timestamp it cannot order: %s", (_label, incoming, baseCostAt) => {
    expect(() => supersede({ incoming, unapproved: [incoming], baseCostAt })).toThrow(DomainError);
  });
});
