import { defineRoute } from "@/lib/http/handler";
import { IngestHealthWire } from "@/lib/schemas/wire/ingest";

export const GET = defineRoute(
  {
    operationId: "ingestHealth",
    method: "get",
    path: "/api/ingest/health",
    summary: "Connection test and batch sizing for Apps Script",
    description:
      "The script reads accepts_max_items at run start so batch size can change server-side without redeploy.",
    tags: ["machine"],
    auth: "machine",
    consumedBy: "machine: Apps Script (testIngestConnection)",
    response: IngestHealthWire,
    errors: ["missing_key", "invalid_key", "internal_error", "service_unavailable"],
    idempotency: "Safe.",
  },
  async () => {
    const { pingSql } = await import("@/lib/db/sql");
    const { ACCEPTS_MAX_ITEMS } = await import("@/lib/services/ingest");
    const { ApiError } = await import("@/lib/http/errors");
    try {
      await pingSql();
    } catch {
      throw new ApiError("service_unavailable", "database is unreachable");
    }
    return { data: { ok: true as const, accepts_max_items: ACCEPTS_MAX_ITEMS } };
  },
);
