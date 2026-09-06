import { ZodError, type ZodType } from "zod";
import { ApiError } from "./errors";
import { fail, failFrom, ok, type Meta } from "./envelope";
import { log } from "@/lib/log";
import { registerRoute, type RouteDoc } from "@/lib/openapi/registry";
import { MACHINE_ACTOR, type SessionActor } from "./session-auth";

export interface Ctx<B, Q, P> {
  body: B;
  query: Q;
  params: P;
  requestId: string;
  req: Request;
  actor: SessionActor;
}

export type Handled<T> = { data: T; meta?: Meta; status?: number };

type Inferred<S> = S extends ZodType<infer O> ? O : undefined;

/**
 * Wraps a route handler with parsing, the error envelope and a request id, and registers the
 * endpoint for OpenAPI generation in the same call. Registration and validation share one schema
 * object, which is the only anti-drift mechanism here that isn't a convention someone can forget.
 */
export function defineRoute<D extends RouteDoc>(
  doc: D,
  handler: (
    ctx: Ctx<
      Inferred<NonNullable<D["request"]>["body"]>,
      Inferred<NonNullable<D["request"]>["query"]>,
      Inferred<NonNullable<D["request"]>["params"]>
    >,
  ) => Promise<Handled<unknown>>,
) {
  registerRoute(doc);

  return async function route(
    req: Request,
    segmentData?: { params: Promise<Record<string, string>> },
  ): Promise<Response> {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = Date.now();

    try {
      let actor: SessionActor = MACHINE_ACTOR;
      if (doc.auth === "machine") {
        const { assertIngestKey } = await import("@/lib/http/machine-auth");
        assertIngestKey(req);
      } else if (doc.auth === "session") {
        const { requireSession } = await import("@/lib/http/session-auth");
        actor = await requireSession();
      }

      let body: unknown;
      if (doc.request?.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new ApiError("invalid_json", "request body is not valid JSON");
        }
        body = doc.request.body.parse(raw);
      }

      let query: unknown;
      if (doc.request?.query) {
        const url = new URL(req.url);
        query = doc.request.query.parse(Object.fromEntries(url.searchParams));
      }

      let params: unknown;
      if (doc.request?.params) {
        const rawParams = segmentData ? await segmentData.params : {};
        params = doc.request.params.parse(rawParams);
      }

      const result = await handler({
        body,
        query,
        params,
        requestId,
        req,
        actor,
      } as Ctx<never, never, never>);

      log.info("request", {
        request_id: requestId,
        op: doc.operationId,
        status: result.status ?? doc.successStatus ?? 200,
        ms: Date.now() - started,
      });

      return ok(result.data, result.meta, {
        status: result.status ?? doc.successStatus ?? 200,
        headers: { "x-request-id": requestId },
      });
    } catch (e) {
      if (e instanceof ZodError) {
        log.warn("validation_failed", { request_id: requestId, op: doc.operationId });
        return fail("validation_failed", "request failed validation", {
          details: { issues: e.issues },
          requestId,
        });
      }
      if (e instanceof ApiError) {
        // Expected, declared outcomes: log at warn, never as an incident.
        log.warn("api_error", {
          request_id: requestId,
          op: doc.operationId,
          code: e.code,
          ms: Date.now() - started,
        });
        return failFrom(e, requestId);
      }
      log.error("unhandled", {
        request_id: requestId,
        op: doc.operationId,
        err: e instanceof Error ? e.stack : String(e),
      });
      return fail("internal_error", "something went wrong", { requestId });
    }
  };
}
