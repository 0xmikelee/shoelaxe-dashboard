import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api/errors";
import { createApiClient, parseMeta } from "@/lib/api/client";
import { ListMeta } from "@/lib/schemas/wire/common";

const BASE = "http://api.test";

/** Records what the client sent, and answers with whatever the test hands back. */
function harness(respond: (req: Request) => Response | Promise<Response>) {
  const sent: Request[] = [];
  const client = createApiClient({
    baseUrl: BASE,
    requestId: () => "req-fixed",
    fetch: async (req) => {
      sent.push(req);
      return respond(req);
    },
  });
  return { client, sent, last: () => sent[sent.length - 1] };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the typed client on success", () => {
  it("unwraps {data} and hands meta through", async () => {
    const meta = { total: 128, page: 1, per_page: 20, total_pages: 7, publishing: { enabled: false } };
    const { client } = harness(() => json({ data: [], meta }));

    const res = await client.GET("/api/v1/approvals", { params: { query: { page: 1 } } });

    expect(res.data).toEqual([]);
    expect(parseMeta(ListMeta, res)).toEqual(meta);
  });

  it("omits meta when the server sent none", async () => {
    const { client } = harness(() => json({ data: { enabled: true } }));
    const res = await client.GET("/api/v1/me");
    expect(res).not.toHaveProperty("meta");
  });

  it("stamps an x-request-id on every call", async () => {
    const { client, last } = harness(() => json({ data: [] }));
    await client.GET("/api/v1/groups");
    expect(last().headers.get("x-request-id")).toBe("req-fixed");
  });

  it("comma-joins repeated filters instead of repeating the key", async () => {
    // lib/http/handler.ts reads the query as a flat map, so ?change_type=a&change_type=b would
    // silently drop the first value.
    const { client, last } = harness(() => json({ data: [] }));
    await client.GET("/api/v1/products/{sku}/history", {
      params: { path: { sku: "555088-101" }, query: { change_type: "cost,margin_percent" } },
    });
    const url = new URL(last().url);
    expect(url.pathname).toBe("/api/v1/products/555088-101/history");
    expect(url.searchParams.getAll("change_type")).toEqual(["cost,margin_percent"]);
  });

  it("sends a body as JSON on a write", async () => {
    const { client, last } = harness(() => json({ data: { sku: "x", updated_count: 1 } }));
    await client.POST("/api/v1/products/bulk", {
      body: { skus: ["555088-101"], action: "deactivate" },
    });
    expect(last().method).toBe("POST");
    await expect(last().json()).resolves.toEqual({ skus: ["555088-101"], action: "deactivate" });
  });
});

describe("the typed client on failure", () => {
  it("throws an ApiRequestError carrying the envelope's code, message and request id", async () => {
    const { client } = harness(() =>
      json(
        {
          error: {
            code: "not_pending",
            message: "此筆已被更新的價格取代",
            details: { listing_id: "abc" },
            request_id: "req-from-server",
          },
        },
        409,
      ),
    );

    const err = await client
      .POST("/api/v1/listings/{id}/approve", { params: { path: { id: "abc" } } })
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiRequestError);
    const api = err as ApiRequestError;
    expect(api.code).toBe("not_pending");
    expect(api.status).toBe(409);
    expect(api.message).toBe("此筆已被更新的價格取代");
    expect(api.details).toEqual({ listing_id: "abc" });
    // The server's id wins over the one we generated — it is the one in the logs.
    expect(api.requestId).toBe("req-from-server");
  });

  it("falls back to the status when the body is not our envelope", async () => {
    // A proxy or a crash page answered, so inventing a code the server never emitted would be a lie.
    const { client } = harness(() => new Response("<html>gateway</html>", { status: 503 }));
    const err = await client.GET("/api/v1/settings").catch((e: unknown) => e);
    expect((err as ApiRequestError).code).toBe("service_unavailable");
    expect((err as ApiRequestError).requestId).toBe("req-fixed");
  });

  it("maps an unknown code to internal_error rather than crashing", async () => {
    const { client } = harness(() => json({ error: { code: "teapot", message: "?" } }, 500));
    const err = await client.GET("/api/v1/settings").catch((e: unknown) => e);
    expect((err as ApiRequestError).code).toBe("internal_error");
  });

  it("turns a rejected fetch into service_unavailable", async () => {
    const { client } = harness(() => {
      throw new TypeError("Failed to fetch");
    });
    const err = await client.GET("/api/v1/settings").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).code).toBe("service_unavailable");
  });

  it("lets an abort through untouched", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    const { client } = harness(() => {
      throw aborted;
    });
    await expect(client.GET("/api/v1/settings")).rejects.toBe(aborted);
  });

  it("rejects a 200 that is not an envelope", async () => {
    const { client } = harness(() => json([1, 2, 3]));
    const err = await client.GET("/api/v1/groups").catch((e: unknown) => e);
    expect((err as ApiRequestError).code).toBe("internal_error");
  });
});

describe("download", () => {
  it("returns bytes and the server's filename, never a Response", async () => {
    const { client, last } = harness(
      () =>
        new Response("sku,name\n", {
          status: 200,
          headers: {
            "content-type": "text/csv",
            "content-disposition": 'attachment; filename="products-2026-08-24.csv"',
          },
        }),
    );

    const out = await client.download("/api/v1/products/export", { status: "listed", q: undefined });

    expect(await out.blob.text()).toBe("sku,name\n");
    expect(out.filename).toBe("products-2026-08-24.csv");
    expect(new URL(last().url).search).toBe("?status=listed");
  });

  it("throws an ApiError when the export fails", async () => {
    const { client } = harness(() => json({ error: { code: "not_allowed", message: "no" } }, 403));
    const err = await client.download("/api/v1/products/export").catch((e: unknown) => e);
    expect((err as ApiRequestError).code).toBe("not_allowed");
  });
});

describe("upload", () => {
  it("posts the file as multipart and unwraps {data}", async () => {
    const { client, last } = harness(() => json({ data: [] }));
    const file = new File([new Uint8Array(8)], "shoe.jpg", { type: "image/jpeg" });

    const res = await client.upload("/api/v1/products/AJ1-101/images", file);

    expect(res.data).toEqual([]);
    expect(last().method).toBe("POST");
    expect(last().headers.get("x-request-id")).toBe("req-fixed");
    expect(last().headers.get("content-type")).not.toMatch(/application\/json/);
    expect(last().headers.get("content-type")).toMatch(/multipart\/form-data/);
  });

  it("throws an ApiRequestError when the upload is refused", async () => {
    const { client } = harness(() =>
      json({ error: { code: "image_too_large", message: "too big" } }, 413),
    );
    const file = new File([new Uint8Array(8)], "shoe.jpg", { type: "image/jpeg" });
    const err = await client.upload("/api/v1/products/AJ1-101/images", file).catch((e: unknown) => e);
    expect((err as ApiRequestError).code).toBe("image_too_large");
  });
});
