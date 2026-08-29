import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { WIRE_SCHEMAS } from "@/lib/schemas/wire";
import { PROVISIONAL } from "@/lib/api/contract";

const shared = new Set<unknown>(Object.values(WIRE_SCHEMAS));

/**
 * The teeth of the shared-contract design. A route may only respond with a schema from
 * lib/schemas/wire — reference-identical, not merely structurally similar — so an inline
 * z.object({...}) written at a route cannot drift from what the frontend generated its types from.
 *
 * Today this covers the provisional contract. When real routes land, extend it to walk
 * allRoutes() after importing app/api/**\/route.ts, exactly as scripts/build-openapi.ts does.
 */
describe("response schemas are shared, not inlined", () => {
  it.each(PROVISIONAL.filter((d) => d.response).map((d) => [d.operationId, d] as const))(
    "%s responds with a schema from lib/schemas/wire",
    (_id, doc) => {
      expect(shared.has(doc.response)).toBe(true);
    },
  );
});

/**
 * scripts/build-openapi.ts converts with `unrepresentable: "throw"`, so a z.date(), a bigint or a
 * transform on the output side fails the build. Catching it here names the offending schema instead
 * of failing a generator run with a stack trace, and it fails in `pnpm test` rather than in CI.
 */
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
