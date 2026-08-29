/**
 * Generates docs/openapi.json from the route registrations in lib/openapi/registry.
 *
 * The spec is built from the very same zod schemas the handlers validate with, so it cannot drift
 * from the implementation by anyone forgetting to update it — only by deleting a registration,
 * which the registry-coverage test catches. CI runs this and fails on a dirty diff.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { allRoutes, registerProvisional, type RouteDoc } from "../lib/openapi/registry";
import { PROVISIONAL } from "../lib/api/contract";
import { ERROR_CODES } from "../lib/http/errors";

const ROOT = resolve(import.meta.dirname, "..");
const ROUTES_DIR = join(ROOT, "app", "api");
const OUT = join(ROOT, "docs", "openapi.json");

const TAG_ORDER = [
  "machine", "auth", "approvals", "products", "listings",
  "groups", "images", "settings", "users", "ops", "shopify",
];

function routeFiles(dir: string): string[] {
  try {
    statSync(dir);
  } catch {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : [];
  });
}

/**
 * `unrepresentable: "throw"` is the point: a Date, bigint or transform in a *wire* schema is a bug,
 * because the client will receive a string and the spec would quietly lie about the type.
 */
function schema(s: z.ZodType, io: "input" | "output", where: string): unknown {
  try {
    return z.toJSONSchema(s, { io, unrepresentable: "throw", target: "draft-2020-12" });
  } catch (e) {
    throw new Error(
      `${where}: schema is not representable in JSON Schema — wire types must be JSON-native ` +
        `(use an ISO string, not z.date()).\n  ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function errorResponses(codes: RouteDoc["errors"]) {
  const byStatus = new Map<number, string[]>();
  for (const c of codes) {
    const s = ERROR_CODES[c];
    (byStatus.get(s) ?? byStatus.set(s, []).get(s)!).push(c);
  }
  return Object.fromEntries(
    [...byStatus].map(([status, cs]) => [
      String(status),
      {
        description: cs.map((c) => `\`${c}\``).join(", "),
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            examples: Object.fromEntries(
              cs.map((c) => [c, { value: { error: { code: c, message: "…" } } }]),
            ),
          },
        },
      },
    ]),
  );
}

async function main() {
  const files = routeFiles(ROUTES_DIR);
  for (const f of files) await import(pathToFileURL(f).href);

  // After the real routes, never before: registerProvisional is a no-op on a claimed path, so a
  // landed endpoint silently supersedes its placeholder.
  for (const doc of PROVISIONAL) registerProvisional(doc);

  const routes = allRoutes();
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of routes) {
    const where = `${r.method.toUpperCase()} ${r.path}`;
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      ...(r.provisional ? { "x-provisional": true } : {}),
      summary: r.summary,
      description: [
        r.description,
        r.consumedBy && `**Consumed by:** ${r.consumedBy}`,
        r.idempotency && `**Idempotency:** ${r.idempotency}`,
        r.sideEffects?.length && `**Side effects:** ${r.sideEffects.join("; ")}`,
        r.budget && `**Budget:** ${r.budget}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      tags: r.tags,
      security: r.auth === "none" ? [] : [{ [r.auth === "machine" ? "ingestKey" : "session"]: [] }],
      responses: {
        [String(r.successStatus ?? 200)]: {
          description: "Success",
          content: r.response
            ? {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["data"],
                    properties: { data: schema(r.response, "output", `${where} response`) },
                  },
                },
              }
            : undefined,
        },
        ...errorResponses(r.errors),
      },
    };

    if (r.request?.body) {
      op.requestBody = {
        required: true,
        content: {
          "application/json": { schema: schema(r.request.body, "input", `${where} body`) },
        },
      };
    }

    const params: unknown[] = [];
    for (const [loc, s] of [
      ["path", r.request?.params],
      ["query", r.request?.query],
    ] as const) {
      if (!s) continue;
      const js = schema(s, "input", `${where} ${loc}`) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      for (const [name, sub] of Object.entries(js.properties ?? {})) {
        params.push({
          name,
          in: loc,
          required: loc === "path" ? true : (js.required ?? []).includes(name),
          schema: sub,
        });
      }
    }
    if (params.length) op.parameters = params;

    paths[r.path] ??= {};
    paths[r.path][r.method] = op;
  }

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Shoelaxe Dashboard API",
      version: "1.0.0",
      description:
        "Generated from the zod schemas the route handlers validate with — do not edit by hand. " +
        "See docs/API.md for the narrative documentation.",
    },
    tags: TAG_ORDER.map((name) => ({ name })),
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "sb-access-token" },
        ingestKey: { type: "apiKey", in: "header", name: "X-Shoelaxe-Key" },
      },
      schemas: {
        ErrorEnvelope: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", enum: Object.keys(ERROR_CODES) },
                message: { type: "string" },
                details: {},
                request_id: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths,
  };

  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(spec, null, 2) + "\n");
  const provisional = routes.filter((r) => r.provisional).length;
  console.log(
    `docs/openapi.json — ${routes.length} operation(s) from ${files.length} route file(s)` +
      (provisional ? `, ${provisional} provisional` : "") +
      (routes.length === 0 ? " (no routes registered yet)" : ""),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
