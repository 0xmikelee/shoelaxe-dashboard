"use client";

import { useQuery } from "@tanstack/react-query";

import { api, parseMeta } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { JobMetaWire, JobsListWire, JobWire } from "@/lib/schemas/wire/jobs";
import type { JobKind, JobStatus } from "@/lib/i18n/enums";

const ACTIVE: JobStatus[] = ["queued", "running"];

export function useJob(id: string | undefined, items: "failed" | "all" | "none" = "failed") {
  return useQuery({
    queryKey: qk.jobs.detail(id ?? "", { items }),
    enabled: Boolean(id),
    queryFn: async () => {
      const result = await api.GET("/api/v1/jobs/{id}", {
        params: { path: { id: id! }, query: { items } },
      });
      return {
        job: JobWire.parse(result.data),
        meta: parseMeta(JobMetaWire, result),
      };
    },
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      if (status === "queued" || status === "running") {
        const started = query.state.dataUpdatedAt;
        return Date.now() - started > 30_000 ? 5_000 : 1_000;
      }
      return false;
    },
  });
}

export function useActiveJob(kind: JobKind, scopeKey: string | undefined) {
  return useQuery({
    queryKey: qk.jobs.list({ kind, scope_key: scopeKey, status: ACTIVE }),
    enabled: Boolean(scopeKey),
    queryFn: async () => {
      const result = await api.GET("/api/v1/jobs", {
        params: {
          query: {
            kind,
            scope_key: scopeKey,
            status: ACTIVE.join(","),
            page: 1,
            per_page: 20,
          },
        },
      });
      const rows = JobsListWire.parse(result.data);
      return rows[0] ?? null;
    },
    refetchInterval: (query) => (query.state.data ? 2_000 : 5_000),
  });
}
