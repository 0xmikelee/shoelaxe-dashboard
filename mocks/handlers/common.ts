import { http, HttpResponse, type HttpHandler } from "msw";
import { ZodError } from "zod";
import { CONTRACT_DOCS } from "@/lib/api/contract";
import type { RouteDoc } from "@/lib/openapi/registry";
import { ApiError, ERROR_CODES, type ErrorCode } from "@/lib/http/errors";
import type { Meta } from "@/lib/http/wire";
import { mockConfig } from "./../config";
import { db } from "./../db";

/**
 * Every handler is defined against the RouteDoc it implements, looked up by `operationId`.
 *
 * That is the mechanism, not a nicety: the URL, the method, the success status and the request
 * schemas all come from `lib/api/contract`, so a handler cannot be mounted on a path the contract
 * does not declare, and an operationId that no longer exists throws at import rather than 404-ing at
 * runtime. It also means query parsing behaves exactly as `lib/http/handler.ts` does — a flat string
 * map through the same zod schema, so `validation_failed` is real rather than simulated.
 */

const DOCS = new Map<string, RouteDoc>(CONTRACT_DOCS.map((doc) => [doc.operationId, doc]));

const REGISTERED = new Set<string>();

export const registeredOperations = (): ReadonlySet<string> => REGISTERED;

/**
 * OpenAPI style `{sku}` → MSW style `:sku`, with a leading `*` so the handler matches any origin.
 *
 * The `*` is load-bearing in Node: a path-only predicate is resolved against `http://localhost/`
 * there, so `http://localhost:3000/api/v1/products` misses it on the port alone and — worse than
 * 404ing — reaches whatever is actually listening on 3000.
 */
const toMswPath = (path: string): string => `*${path.replace(/\{(\w+)\}/g, ":$1")}`;

export interface MockContext<Q, B, P> {
  query: Q;
  body: B;
  params: P;
  request: Request;
  url: URL;
  requestId: string;
}

export interface MockResult<T> {
  data: T;
  meta?: Meta;
  /** Overrides the doc's `successStatus`; 202 versus 200 on PATCH /settings is a real distinction. */
  status?: number;
}

export type MockReturn<T> = MockResult<T> | Response;

/**
 * A forced failure, for the error states the happy path cannot produce. `?__error=internal_error` or
 * an `x-mock-error` header on any request.
 *
 * Deliberately a transport rather than a route behaviour: each endpoint's `errors` list is closed, so
 * teaching a route to emit a 422 it may never return would corrupt the contract it is mocking. The
 * data-driven failures — `not_pending` on an already-approved row, `job_already_running`, `conflict`,
 * `not_found` — are real and need no override.
 */
export const MOCK_ERROR_HEADER = "x-mock-error";
export const MOCK_ERROR_QUERY = "__error";

const forcedError = (request: Request, url: URL): ErrorCode | null => {
  const raw = request.headers.get(MOCK_ERROR_HEADER) ?? url.searchParams.get(MOCK_ERROR_QUERY);
  if (raw && raw in ERROR_CODES) return raw as ErrorCode;
  return null;
};

export function errorResponse(
  code: ErrorCode,
  message: string,
  opts: { details?: unknown; requestId?: string } = {},
): Response {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        ...(opts.details !== undefined ? { details: opts.details } : {}),
        ...(opts.requestId ? { request_id: opts.requestId } : {}),
      },
    },
    { status: ERROR_CODES[code], headers: opts.requestId ? { "x-request-id": opts.requestId } : {} },
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function defineMock<Q = undefined, B = undefined, P = undefined>(
  operationId: string,
  resolver: (ctx: MockContext<Q, B, P>) => MockReturn<unknown> | Promise<MockReturn<unknown>>,
): HttpHandler {
  const doc = DOCS.get(operationId);
  if (!doc) {
    throw new Error(
      `mock handler for unknown operationId "${operationId}" — lib/api/contract declares no such route`,
    );
  }
  if (REGISTERED.has(operationId)) {
    throw new Error(`duplicate mock handler for "${operationId}"`);
  }
  REGISTERED.add(operationId);

  const method = doc.method;
  const path = toMswPath(doc.path);

  return http[method](path, async ({ request, params }) => {
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    if (mockConfig.latencyMs > 0) await sleep(mockConfig.latencyMs);

    const forced = forcedError(request, url);
    if (forced) {
      return errorResponse(forced, `forced by ${MOCK_ERROR_HEADER}`, { requestId });
    }

    try {
      let body: unknown;
      if (doc.request?.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw new ApiError("invalid_json", "request body is not valid JSON");
        }
        body = doc.request.body.parse(raw);
      }

      const query = doc.request?.query
        ? doc.request.query.parse(Object.fromEntries(url.searchParams))
        : undefined;

      const parsedParams = doc.request?.params
        ? doc.request.params.parse(
            Object.fromEntries(
              Object.entries(params).map(([k, v]) => [
                k,
                decodeURIComponent(Array.isArray(v) ? v[0] : v),
              ]),
            ),
          )
        : undefined;

      const result = await resolver({
        query: query as Q,
        body: body as B,
        params: parsedParams as P,
        request,
        url,
        requestId,
      });

      if (result instanceof Response) return result;

      if (mockConfig.validateResponses && doc.response) {
        const parsed = doc.response.safeParse(result.data);
        if (!parsed.success) {
          throw new Error(
            `mock response for ${operationId} does not satisfy its wire schema:\n${JSON.stringify(
              parsed.error.issues.slice(0, 5),
              null,
              2,
            )}`,
          );
        }
      }

      return HttpResponse.json(result.meta ? { data: result.data, meta: result.meta } : { data: result.data }, {
        status: result.status ?? doc.successStatus ?? 200,
        headers: { "x-request-id": requestId },
      });
    } catch (e) {
      if (e instanceof ZodError) {
        return errorResponse("validation_failed", "request failed validation", {
          details: { issues: e.issues },
          requestId,
        });
      }
      if (e instanceof ApiError) {
        return errorResponse(e.code, e.message, { details: e.details, requestId });
      }
      throw e;
    }
  });
}

/** `{publishing}` rides on every list response so the UI never renders sync copy it has to retract. */
export const publishing = () => ({ enabled: mockConfig.publishingEnabled });

export interface PageMetaInput {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** Picks the four pagination fields explicitly: the `Paged<T>` it is usually handed also carries the
 * rows, and spreading them into `meta` ships the page twice. */
export const listMeta = (page: PageMetaInput): Meta => ({
  total: page.total,
  page: page.page,
  per_page: page.per_page,
  total_pages: page.total_pages,
  publishing: publishing(),
});

export const notFound = (what: string): never => {
  throw new ApiError("not_found", `${what} not found`);
};

export const conflict = (code: ErrorCode, message: string): never => {
  throw new ApiError(code, message);
};

/** The signed-in identity every write is attributed to. */
export const actor = () => db.me;
