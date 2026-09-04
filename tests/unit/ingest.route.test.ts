import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/route";
import { GET } from "@/app/api/ingest/health/route";
import { resetEnvCache } from "@/lib/env";
import { ACCEPTS_MAX_ITEMS } from "@/lib/services/ingest";

const SECRET = "sixteen-char-key";

const previous = { ...process.env };

afterEach(() => {
  process.env = { ...previous };
  resetEnvCache();
});

function withEnv(secret = SECRET): void {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.INGEST_SECRET = secret;
  resetEnvCache();
}

const item = (over: Record<string, unknown> = {}) => ({
  product_name: "Air Jordan 1",
  product_sku: "555088-101",
  brand: "Jordan",
  size: "US 9",
  cost: "1200.00",
  quantity: 1,
  currency: "HKD",
  source: "google_sheet",
  source_ref: "sheet:run-1:row:1",
  allow_create: true,
  ...over,
});

async function postIngest(body: unknown, key: string | null): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (key != null) headers.set("X-Shoelaxe-Key", key);
  return POST(
    new Request("http://localhost/api/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

async function errorCode(res: Response): Promise<string> {
  const json = (await res.json()) as { error?: { code?: string } };
  return json.error?.code ?? "";
}

describe("POST /api/ingest", () => {
  it("returns missing_key when the header is absent", async () => {
    const res = await postIngest({ run: {}, updates: [] }, null);
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("missing_key");
  });

  it("returns invalid_key when the header is wrong", async () => {
    withEnv();
    const res = await postIngest({ run: {}, updates: [] }, "sixteen-char-kez");
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("invalid_key");
  });

  it("rejects a batch larger than accepts_max_items", async () => {
    withEnv();
    const res = await postIngest(
      {
        run: {
          run_id: "run-1",
          source: "google_sheet",
          trigger: "manual",
          started_at: "2026-08-29T06:00:00.000Z",
        },
        updates: Array.from({ length: ACCEPTS_MAX_ITEMS + 1 }, (_, i) =>
          item({ source_ref: `sheet:run-1:row:${i}` }),
        ),
      },
      SECRET,
    );
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("batch_too_large");
  });

  it("rejects an item whose source does not match run.source", async () => {
    withEnv();
    const res = await postIngest(
      {
        run: {
          run_id: "run-1",
          source: "google_sheet",
          trigger: "manual",
          started_at: "2026-08-29T06:00:00.000Z",
        },
        updates: [item({ source: "stockx", source_ref: "gmail:1" })],
      },
      SECRET,
    );
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("run_mismatch");
  });
});

describe("GET /api/ingest/health", () => {
  it("returns missing_key when the header is absent", async () => {
    const res = await GET(new Request("http://localhost/api/ingest/health"));
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("missing_key");
  });
});
