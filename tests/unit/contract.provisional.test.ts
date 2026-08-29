import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";
import {
  allRoutes,
  clearRegistry,
  hasRoute,
  registerProvisional,
  registerRoute,
  type RouteDoc,
} from "@/lib/openapi/registry";
import { PROVISIONAL } from "@/lib/api/contract";
import { ERROR_CODES, type ErrorCode } from "@/lib/http/errors";

const stub = (over: Partial<RouteDoc> = {}): RouteDoc => ({
  operationId: "stub",
  method: "get",
  path: "/api/v1/stub",
  summary: "stub",
  tags: ["ops"],
  auth: "session",
  errors: [],
  ...over,
});

/**
 * Codes that exist in the union but cannot be emitted by any endpoint in this contract. Per the
 * header of lib/http/errors.ts a declared code that nothing emits corrupts the contract, so citing
 * one here is a bug — the closed per-endpoint list is only a contract if it is checked.
 */
const DEAD_CODES: Record<string, ErrorCode[]> = {
  "offset pagination replaced cursors (Gap 3)": ["invalid_cursor", "cursor_sort_mismatch"],
  "deleting a group reassigns rather than refuses (Gap 14)": ["group_not_empty"],
  "machine-only, on /api/ingest": ["missing_key", "invalid_key", "run_mismatch", "batch_too_large"],
  "item-level reasons inside a 200, never HTTP errors": [
    "unknown_sku",
    "invalid_currency",
    "invalid_size",
    "missing_cost",
  ],
};

describe("the provisional contract", () => {
  beforeEach(() => clearRegistry());

  it("declares no duplicate method+path", () => {
    const keys = PROVISIONAL.map((d) => `${d.method} ${d.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares no duplicate operationId", () => {
    const ids = PROVISIONAL.map((d) => d.operationId);
    const seen = new Set<string>();
    const dupes = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(dupes).toEqual([]);
  });

  it("only cites error codes the API actually has", () => {
    // Typed already, but this catches a hand-edited JSON or a widened cast.
    for (const doc of PROVISIONAL) {
      for (const code of doc.errors) {
        expect(code in ERROR_CODES, `${doc.operationId} cites unknown code ${code}`).toBe(true);
      }
    }
  });

  it.each(Object.entries(DEAD_CODES))("cites no code that is dead because %s", (_why, codes) => {
    const offenders = PROVISIONAL.flatMap((doc) =>
      doc.errors.filter((c) => codes.includes(c)).map((c) => `${doc.operationId}: ${c}`),
    );
    expect(offenders).toEqual([]);
  });

  it("lists each error code once per endpoint", () => {
    for (const doc of PROVISIONAL) {
      expect(new Set(doc.errors).size, doc.operationId).toBe(doc.errors.length);
    }
  });

  it("uses OpenAPI path syntax and declares every path parameter", () => {
    for (const doc of PROVISIONAL) {
      expect(doc.path, doc.operationId).toMatch(/^\/api\/v1\//);
      expect(doc.path, `${doc.operationId} uses Next-style :params`).not.toMatch(/:[a-zA-Z]/);

      const inPath = [...doc.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();
      const declared = doc.request?.params
        ? Object.keys(z.toJSONSchema(doc.request.params, { io: "input" }).properties ?? {}).sort()
        : [];
      expect(declared, doc.operationId).toEqual(inPath);
    }
  });

  it("names its consumer and at least one tag", () => {
    for (const doc of PROVISIONAL) {
      expect(doc.tags.length, doc.operationId).toBeGreaterThan(0);
      expect(doc.consumedBy, doc.operationId).toBeTruthy();
      expect(doc.summary, doc.operationId).toBeTruthy();
    }
  });

  it("answers 202 exactly where the work is handed to the worker", () => {
    const accepted = PROVISIONAL.filter((d) => d.successStatus === 202).map((d) => d.operationId);
    // Group apply is 202 by the brief; group delete and job retry are fan-outs by Gap 18 and by
    // construction. Anything else returning 202 means a screen is polling something it should not.
    expect(accepted.sort()).toEqual(["applyGroupMargins", "deleteGroup", "retryJob"]);
  });

  it("responds with a body wherever a screen reads one", () => {
    // The CSV export is the one deliberate exception: it streams text/csv, not an envelope.
    const bodiless = PROVISIONAL.filter((d) => !d.response).map((d) => d.operationId);
    expect(bodiless).toEqual(["exportProducts"]);
  });

  it("is superseded by a real route rather than colliding with it", () => {
    const real = stub({ operationId: "realThing", response: z.object({ ok: z.boolean() }) });
    registerRoute(real);
    registerProvisional(stub({ operationId: "provisionalThing" }));

    const routes = allRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].operationId).toBe("realThing");
    expect(routes[0].provisional).toBe(false);
  });

  it("registers when the path is unclaimed, and marks itself provisional", () => {
    registerProvisional(stub({ operationId: "provisionalThing" }));
    expect(hasRoute("get", "/api/v1/stub")).toBe(true);
    expect(allRoutes()[0].provisional).toBe(true);
  });

  it("still rejects two different real routes on one path", () => {
    registerRoute(stub({ operationId: "one" }));
    expect(() => registerRoute(stub({ operationId: "two" }))).toThrow(/duplicate route/);
  });
});
