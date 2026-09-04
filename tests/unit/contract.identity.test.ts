import { describe, expect, it, beforeAll } from "vitest";
import { z, type ZodType } from "zod";
import { WIRE_SCHEMAS } from "@/lib/schemas/wire";
import { PROVISIONAL } from "@/lib/api/contract";
import { allRoutes, registerProvisional } from "@/lib/openapi/registry";
import "@/app/api/ingest/route";
import "@/app/api/ingest/health/route";

const shared = new Set<unknown>(Object.values(WIRE_SCHEMAS));

/**
 * The teeth of the shared-contract design. A route may only respond with a schema from
 * lib/schemas/wire — reference-identical, not merely structurally similar — so an inline
 * z.object({...}) written at a route cannot drift from what the frontend generated its types from.
 */
describe("response schemas are shared, not inlined", () => {
  it.each(PROVISIONAL.filter((d) => d.response).map((d) => [d.operationId, d] as const))(
    "%s responds with a schema from lib/schemas/wire",
    (_id, doc) => {
      expect(shared.has(doc.response)).toBe(true);
    },
  );
});

describe("implemented routes share wire schemas", () => {
  beforeAll(() => {
    for (const doc of PROVISIONAL) registerProvisional(doc);
  });

  it("registers the ingest machine routes as real, not provisional", () => {
    const ingest = allRoutes().filter((r) => r.path.startsWith("/api/ingest"));
    expect(ingest.map((r) => r.operationId).sort()).toEqual(["ingestBatch", "ingestHealth"]);
    expect(ingest.every((r) => r.provisional !== true)).toBe(true);
  });

  it("responds with a schema from lib/schemas/wire", () => {
    for (const doc of allRoutes().filter((d) => !d.provisional && d.response)) {
      expect(shared.has(doc.response), doc.operationId).toBe(true);
    }
  });

  it("converts implemented request schemas on the input side", () => {
    for (const doc of allRoutes().filter((d) => !d.provisional)) {
      for (const part of ["body", "query", "params"] as const) {
        const schema = doc.request?.[part];
        if (!schema) continue;
        expect(() => representable(schema, "input"), `${doc.operationId}.${part}`).not.toThrow();
      }
    }
  });
});

const representable = (schema: ZodType, io: "input" | "output") =>
  z.toJSONSchema(schema, { io, unrepresentable: "throw", target: "draft-2020-12" });

describe("every schema in the contract is JSON-native", () => {
  it.each(Object.entries(WIRE_SCHEMAS))("%s converts to JSON Schema", (_name, schema) => {
    expect(() => representable(schema, "output")).not.toThrow();
  });

  it.each(
    PROVISIONAL.flatMap((d) =>
      (["body", "query", "params"] as const)
        .filter((part) => d.request?.[part])
        .map((part) => [`${d.operationId}.${part}`, d.request![part]!] as const),
    ),
  )("%s converts on the input side", (_name, schema) => {
    expect(() => representable(schema, "input")).not.toThrow();
  });
});

/**
 * The generator reads `properties` off the query/params object to emit parameters. A schema wrapped
 * in a transform has none, and every parameter would silently vanish from the spec.
 */
describe("query and path schemas survive the generator's parameter walk", () => {
  it.each(
    PROVISIONAL.flatMap((d) =>
      (["query", "params"] as const)
        .filter((part) => d.request?.[part])
        .map((part) => [`${d.operationId}.${part}`, d.request![part]!] as const),
    ),
  )("%s exposes properties", (_name, schema) => {
    const json = representable(schema, "input") as { properties?: Record<string, unknown> };
    expect(Object.keys(json.properties ?? {}).length).toBeGreaterThan(0);
  });
});
