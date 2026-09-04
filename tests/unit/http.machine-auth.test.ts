import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { assertIngestKey, keysMatch } from "@/lib/http/machine-auth";
import { resetEnvCache } from "@/lib/env";

const SECRET = "sixteen-char-key";

describe("keysMatch", () => {
  it("accepts an exact match", () => {
    expect(keysMatch(SECRET, SECRET)).toBe(true);
  });

  it("rejects a wrong value of the same length", () => {
    expect(keysMatch("sixteen-char-kez", SECRET)).toBe(false);
  });

  it("rejects a different length without throwing", () => {
    expect(keysMatch("short", SECRET)).toBe(false);
    expect(keysMatch(`${SECRET}-extra`, SECRET)).toBe(false);
  });
});

describe("assertIngestKey", () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
    resetEnvCache();
  });

  function withEnv(secret: string): void {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.INGEST_SECRET = secret;
    resetEnvCache();
  }

  it("throws missing_key when the header is absent", () => {
    withEnv(SECRET);
    expect(() => assertIngestKey(new Request("http://localhost/api/ingest"))).toThrow(ApiError);
    try {
      assertIngestKey(new Request("http://localhost/api/ingest"));
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("missing_key");
    }
  });

  it("throws invalid_key when the header is wrong", () => {
    withEnv(SECRET);
    const req = new Request("http://localhost/api/ingest", {
      headers: { "X-Shoelaxe-Key": "sixteen-char-kez" },
    });
    try {
      assertIngestKey(req);
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).code).toBe("invalid_key");
    }
  });

  it("accepts the matching key", () => {
    withEnv(SECRET);
    const req = new Request("http://localhost/api/ingest", {
      headers: { "X-Shoelaxe-Key": SECRET },
    });
    expect(() => assertIngestKey(req)).not.toThrow();
  });
});
