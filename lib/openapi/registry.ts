import type { ZodType } from "zod";
import type { ErrorCode } from "@/lib/http/errors";

/**
 * Route metadata, registered as a side effect of defining the route. docs/openapi.json is generated
 * from the very same zod schemas the handler validates with, so the spec cannot drift from the code
 * by convention-failure — only by someone deleting the registration, which the coverage test catches.
 */
export interface RouteDoc {
  operationId: string;
  method: "get" | "post" | "patch" | "put" | "delete";
  /** OpenAPI-style path, e.g. /api/v1/products/{sku} */
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: "session" | "machine" | "none";
  /** Design screen(s) that call this, or `machine: <file>`. */
  consumedBy?: string;
  request?: { body?: ZodType; query?: ZodType; params?: ZodType };
  response?: ZodType;
  successStatus?: number;
  /** Closed list. If a code is not here, the endpoint must not emit it. */
  errors: ErrorCode[];
  idempotency?: string;
  sideEffects?: string[];
  budget?: string;
  /**
   * Set only by registerProvisional: this operation is a frontend-authored contract for an endpoint
   * that does not exist yet. Emitted into the spec as `x-provisional` and deleted when the real
   * route lands. Zero of these remaining is the definition of done for the bootstrap.
   */
  provisional?: boolean;
}

const key = (doc: Pick<RouteDoc, "method" | "path">) => `${doc.method} ${doc.path}`;

const registry = new Map<string, RouteDoc>();

export function registerRoute(doc: RouteDoc): void {
  const k = key(doc);
  const existing = registry.get(k);
  if (existing && !existing.provisional && existing.operationId !== doc.operationId) {
    throw new Error(`duplicate route registration for ${k}`);
  }
  registry.set(k, { ...doc, provisional: false });
}

export function hasRoute(method: RouteDoc["method"], path: string): boolean {
  return registry.has(key({ method, path }));
}

/**
 * Register a contract for an endpoint the backend has not built yet, so the frontend can generate
 * types and mocks against the same artifact the real route will later produce.
 *
 * A no-op when the path is already claimed by a real route — that is what makes the handoff a
 * deletion rather than a merge. The provisional entry becomes dead the moment the route lands, and
 * `contract.provisional.test.ts` fails until it is removed from lib/api/contract/**.
 */
export function registerProvisional(doc: RouteDoc): void {
  const k = key(doc);
  if (registry.has(k)) return;
  registry.set(k, { ...doc, provisional: true });
}

export function allRoutes(): RouteDoc[] {
  return [...registry.values()].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
}

export function clearRegistry(): void {
  registry.clear();
}
