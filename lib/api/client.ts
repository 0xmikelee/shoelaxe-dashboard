import createClient, {
  type Client,
  type ClientPathsWithMethod,
  type MaybeOptionalInit,
  type MethodResponse,
} from "openapi-fetch";
import type { ZodType, output as ZodOutput } from "zod";
import type { paths } from "@/lib/api/schema";
import { ERROR_CODES, type ErrorCode } from "@/lib/http/errors";
import { isErrorBody, type Meta } from "@/lib/http/wire";
import { ApiRequestError } from "./errors";

/**
 * The one place the frontend talks to `/api/v1`.
 *
 * Paths, parameters and response bodies are typed from `lib/api/schema.d.ts`, which is generated from
 * `docs/openapi.json`, which is generated from the very zod schemas the route handlers validate with.
 * A backend shape change therefore breaks the build rather than production.
 *
 * Two things this wrapper adds on top of openapi-fetch, and both are contracts rather than
 * conveniences: every failure arrives as an `ApiRequestError` carrying a real `ErrorCode` — no caller
 * ever sees a `Response` or has to remember to check `res.error` — and every request carries an
 * `x-request-id` so a user-visible failure can be quoted back to the logs.
 */

type Api = Client<paths>;

/** Mirrors openapi-fetch's own (unexported) InitParam, so an init with required params stays required. */
type RequiredKeysOf<T> = Exclude<
  { [K in keyof T]: T extends Record<K, T[K]> ? K : never }[keyof T],
  undefined
>;
type InitParam<Init> =
  RequiredKeysOf<Init> extends never
    ? [(Init & { [key: string]: unknown })?]
    : [Init & { [key: string]: unknown }];

/**
 * A success body. `data` is typed from the spec; `meta` is not — `RouteDoc` has no `meta` field, so
 * the generator only ever describes `data`. Validate it with `parseMeta` against the schema that
 * documents it rather than casting.
 */
export interface ApiResult<T> {
  data: T;
  meta?: Meta;
}

type Unwrapped<T> = T extends { data: infer D } ? ApiResult<D> : ApiResult<T>;

export interface ApiClientOptions {
  /**
   * Same-origin by default. The generated paths already begin with `/api`, so the base is the origin
   * root and **not** `"/api"` — that would produce `/api/api/v1/...`.
   */
  baseUrl?: string;
  fetch?: ClientFetch;
  /** Overrides the generated `x-request-id`; tests pin it, nothing else should. */
  requestId?: () => string;
}

type ClientFetch = (input: Request) => Promise<Response>;

const newRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `rid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * A body that is not our envelope means something in front of the app answered — a proxy, a crash
 * page, a 404 from the router. Map the status rather than inventing a code the server never emitted.
 */
const STATUS_FALLBACK: Record<number, ErrorCode> = {
  400: "validation_failed",
  401: "unauthenticated",
  403: "not_allowed",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  503: "service_unavailable",
};

function toApiError(body: unknown, status: number, requestId: string): ApiRequestError {
  if (isErrorBody(body)) {
    const { code, message, details, request_id } = body.error;
    // A code the client does not know is a server ahead of this build; do not crash on it.
    const known = code in ERROR_CODES ? code : "internal_error";
    return new ApiRequestError(known, message, { details, requestId: request_id ?? requestId });
  }
  const code = STATUS_FALLBACK[status] ?? "internal_error";
  return new ApiRequestError(code, `request failed with status ${status}`, { requestId });
}

export function createApiClient(options: ApiClientOptions = {}) {
  const nextRequestId = options.requestId ?? newRequestId;
  const doFetch: ClientFetch = options.fetch ?? ((request) => fetch(request));

  const client = createClient<paths>({
    /**
     * Resolved to an absolute origin rather than left as "".
     *
     * A browser resolves a relative URL against `location`, but the WHATWG `Request` constructor
     * does not — undici (which backs `fetch` under Node and jsdom) throws "Failed to parse URL from
     * /api/v1/…". Leaving it relative therefore works in the app and fails in every component test,
     * which is the worst possible split. Same-origin either way.
     */
    baseUrl: options.baseUrl ?? (typeof window === "undefined" ? "" : window.location.origin),
    // The session is a Supabase cookie; nothing here reads a token in JavaScript.
    credentials: "include",
    fetch: doFetch,
    headers: { accept: "application/json" },
    /**
     * `explode: false` is load-bearing, not a style choice: `lib/http/handler.ts` parses the query as
     * a flat string map, so repeated keys collapse and `?change_type=cost&change_type=quantity` would
     * silently lose the first value. Every multi-value filter travels comma-joined.
     */
    querySerializer: { array: { style: "form", explode: false } },
  });

  type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

  async function call(method: Method, url: string, init: Record<string, unknown> | undefined) {
    const requestId = nextRequestId();
    const headers = { ...(init?.headers as Record<string, string> | undefined), "x-request-id": requestId };

    let result: { data?: unknown; error?: unknown; response: Response };
    try {
      const fn = client[method] as (u: string, i: unknown) => Promise<typeof result>;
      result = await fn(url, { ...init, headers });
    } catch (cause) {
      // fetch rejected: offline, DNS, CORS, abort. There is no status and no envelope to read.
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new ApiRequestError("service_unavailable", "could not reach the server", {
        details: { cause: String(cause) },
        requestId,
      });
    }

    if (!result.response.ok) {
      throw toApiError(result.error ?? result.data, result.response.status, requestId);
    }

    const body = result.data;
    if (typeof body !== "object" || body === null || !("data" in body)) {
      throw new ApiRequestError("internal_error", "response was not a {data} envelope", { requestId });
    }
    const envelope = body as { data: unknown; meta?: Meta };
    return { data: envelope.data, ...(envelope.meta ? { meta: envelope.meta } : {}) };
  }

  return {
    GET: <P extends ClientPathsWithMethod<Api, "get">, I extends MaybeOptionalInit<paths[P], "get">>(
      url: P,
      ...init: InitParam<I>
    ) => call("GET", url, init[0]) as Promise<Unwrapped<MethodResponse<Api, "get", P, I>>>,

    POST: <P extends ClientPathsWithMethod<Api, "post">, I extends MaybeOptionalInit<paths[P], "post">>(
      url: P,
      ...init: InitParam<I>
    ) => call("POST", url, init[0]) as Promise<Unwrapped<MethodResponse<Api, "post", P, I>>>,

    PATCH: <P extends ClientPathsWithMethod<Api, "patch">, I extends MaybeOptionalInit<paths[P], "patch">>(
      url: P,
      ...init: InitParam<I>
    ) => call("PATCH", url, init[0]) as Promise<Unwrapped<MethodResponse<Api, "patch", P, I>>>,

    PUT: <P extends ClientPathsWithMethod<Api, "put">, I extends MaybeOptionalInit<paths[P], "put">>(
      url: P,
      ...init: InitParam<I>
    ) => call("PUT", url, init[0]) as Promise<Unwrapped<MethodResponse<Api, "put", P, I>>>,

    DELETE: <P extends ClientPathsWithMethod<Api, "delete">, I extends MaybeOptionalInit<paths[P], "delete">>(
      url: P,
      ...init: InitParam<I>
    ) => call("DELETE", url, init[0]) as Promise<Unwrapped<MethodResponse<Api, "delete", P, I>>>,

    /**
     * Multipart uploads. The generator cannot express `multipart/form-data` (`requestBody?: never`
     * on `uploadProductImage`), so this path stays next to `download` rather than on the typed verbs.
     * The browser sets the boundary; do not stamp `content-type` here.
     */
    async upload(path: string, file: File): Promise<ApiResult<unknown>> {
      const requestId = nextRequestId();
      const form = new FormData();
      form.append("file", file);
      const url = `${options.baseUrl ?? ""}${path}`;

      let res: Response;
      try {
        res = await doFetch(
          new Request(url, {
            method: "POST",
            credentials: "include",
            headers: { accept: "application/json", "x-request-id": requestId },
            body: form,
          }),
        );
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") throw cause;
        throw new ApiRequestError("service_unavailable", "could not reach the server", {
          details: { cause: String(cause) },
          requestId,
        });
      }

      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw toApiError(body, res.status, requestId);
      if (typeof body !== "object" || body === null || !("data" in body)) {
        throw new ApiRequestError("internal_error", "response was not a {data} envelope", { requestId });
      }
      const envelope = body as { data: unknown; meta?: Meta };
      return { data: envelope.data, ...(envelope.meta ? { meta: envelope.meta } : {}) };
    },

    /**
     * 匯出 endpoints stream `text/csv`, which is not an envelope and cannot go through the typed
     * methods. Still no `Response` escapes: the caller gets bytes and a filename, or an ApiError.
     */
    async download(
      path: keyof paths & string,
      query: Record<string, string | number | undefined> = {},
    ): Promise<{ blob: Blob; filename: string }> {
      const requestId = nextRequestId();
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined) search.set(k, String(v));
      const url = `${options.baseUrl ?? ""}${path}${search.size ? `?${search}` : ""}`;

      let res: Response;
      try {
        res = await doFetch(
          new Request(url, { credentials: "include", headers: { "x-request-id": requestId } }),
        );
      } catch (cause) {
        throw new ApiRequestError("service_unavailable", "could not reach the server", {
          details: { cause: String(cause) },
          requestId,
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw toApiError(body, res.status, requestId);
      }
      return { blob: await res.blob(), filename: filenameFrom(res.headers.get("content-disposition")) };
    },
  };
}

const filenameFrom = (disposition: string | null): string => {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : "export.csv";
};

/**
 * Validate and type `meta`, which the generator cannot describe. Pass the schema that documents the
 * shape — `ListMeta`, `ProductsListMetaWire`, `JobMetaWire` — so the escape hatch stays tied to the
 * registered contract instead of becoming a cast.
 */
export function parseMeta<S extends ZodType>(schema: S, result: { meta?: Meta }): ZodOutput<S> {
  return schema.parse(result.meta) as ZodOutput<S>;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The singleton every hook uses. Same origin, session cookie, one request id per call. */
export const api: ApiClient = createApiClient();
