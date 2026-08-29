import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockConfig } from "@/mocks/config";
import { resetDb } from "@/mocks/db";
import { jobRunner } from "@/mocks/job-runner";
import { server } from "@/mocks/node";

/**
 * The MSW lifecycle for tests. Import it from a test file, or list it in a vitest project's
 * `setupFiles` — the hooks register against whichever suite is collecting, so both work.
 *
 * `onUnhandledRequest: "error"` is not optional. A silently unmocked request resolves to whatever the
 * environment does with it and the test passes for the wrong reason; the failure it produces instead
 * names the URL nobody wrote a handler for.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  // The dataset is mutable and the write handlers mean it. Without the reset, an approve in one test
  // is a `not_pending` in the next, in file order, on some machines.
  resetDb();
  jobRunner.reset();
  resetMockConfig();
});

afterAll(() => {
  server.close();
});

/**
 * Requests need an absolute URL in Node, and the handlers match any origin. Deliberately not
 * localhost: an unmatched request to a port a dev server happens to be listening on would be answered
 * by that server, and the test would fail somewhere much less obvious than "no handler".
 */
export const MOCK_ORIGIN = "http://mock.shoelaxe.test";

export const apiUrl = (path: string): string => `${MOCK_ORIGIN}${path}`;

export interface JsonResponse<T = unknown> {
  status: number;
  body: T;
  response: Response;
}

/** Fetch one endpoint and hand back status and parsed body — the shape every assertion here wants. */
export async function getJson<T = unknown>(path: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(apiUrl(path), init);
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : undefined) as T,
    response,
  };
}

export async function postJson<T = unknown>(
  path: string,
  body: unknown,
  init: RequestInit = {},
): Promise<JsonResponse<T>> {
  return getJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

export async function patchJson<T = unknown>(
  path: string,
  body: unknown,
  init: RequestInit = {},
): Promise<JsonResponse<T>> {
  return getJson<T>(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

export { server };
