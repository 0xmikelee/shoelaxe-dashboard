"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/error-state";
import { JobProgress } from "@/components/jobs/job-progress";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/format/num";
import { Timestamp } from "@/components/format/timestamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSystemHealth } from "@/components/dash-shell";
import { api } from "@/lib/api/client";
import { jobIdFromError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { computeSellingPrice } from "@/lib/domain/pricing";
import { fromCents, toCents } from "@/lib/domain/money";
import { formatMoney } from "@/lib/format/money";
import { CrawlStatusWire } from "@/lib/schemas/wire/crawl";
import { SettingsUpdateResultWire, SettingsWire, type Settings } from "@/lib/schemas/wire/settings";
import { JobWire } from "@/lib/schemas/wire/jobs";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { zhHant } from "@/lib/i18n/zh-Hant";

const t = zhHant.settings;
const EXAMPLE_COST = "1200.00";

function useSettings() {
  return useQuery({
    queryKey: qk.settings.get(),
    queryFn: async () => SettingsWire.parse((await api.GET("/api/v1/settings", {})).data),
  });
}

function useCrawlRuns() {
  return useQuery({
    queryKey: qk.crawl.status(),
    queryFn: async () => CrawlStatusWire.parse((await api.GET("/api/v1/crawl-runs", {})).data),
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-section font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-cell text-muted-foreground">{label}</span>
      <span className="text-cell font-medium text-foreground">{children}</span>
    </div>
  );
}

type Draft = Pick<
  Settings,
  | "auto_approve_up_percent"
  | "auto_approve_down_percent"
  | "default_margin_enabled"
  | "default_margin_percent"
  | "default_margin_fixed"
  | "rounding_enabled"
>;

const fromSettings = (s: Settings): Draft => ({
  auto_approve_up_percent: s.auto_approve_up_percent,
  auto_approve_down_percent: s.auto_approve_down_percent,
  default_margin_enabled: s.default_margin_enabled,
  default_margin_percent: s.default_margin_percent,
  default_margin_fixed: s.default_margin_fixed,
  rounding_enabled: s.rounding_enabled,
});

export function SettingsClient() {
  const settings = useSettings();
  const crawl = useCrawlRuns();
  const health = useSystemHealth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const resolved = draft ?? (settings.data ? fromSettings(settings.data) : null);

  const dirty = Boolean(
    settings.data && resolved && JSON.stringify(resolved) !== JSON.stringify(fromSettings(settings.data)),
  );

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings.data || !resolved) throw new Error("missing draft");
      const current = settings.data;
      const next = resolved;
      const result = await api.PATCH("/api/v1/settings", {
        body: {
          ...(next.auto_approve_up_percent !== current.auto_approve_up_percent
            ? { auto_approve_up_percent: next.auto_approve_up_percent }
            : {}),
          ...(next.auto_approve_down_percent !== current.auto_approve_down_percent
            ? { auto_approve_down_percent: next.auto_approve_down_percent }
            : {}),
          ...(next.default_margin_enabled !== current.default_margin_enabled
            ? { default_margin_enabled: next.default_margin_enabled }
            : {}),
          ...(next.default_margin_percent !== current.default_margin_percent
            ? { default_margin_percent: next.default_margin_percent }
            : {}),
          ...(next.default_margin_fixed !== current.default_margin_fixed
            ? { default_margin_fixed: next.default_margin_fixed }
            : {}),
          ...(next.rounding_enabled !== current.rounding_enabled
            ? { rounding_enabled: next.rounding_enabled }
            : {}),
        },
      });
      return SettingsUpdateResultWire.parse(result.data);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.settings.root });
      setDraft(fromSettings(result.settings));
      toastSuccess(t.saved);
      if (result.job) setJobId(result.job.id);
    },
    onError: (error) => {
      const existing = jobIdFromError(error);
      if (existing) {
        setJobId(existing);
        return;
      }
      toastApiError(error);
    },
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const result = await api.POST("/api/v1/jobs/{id}/retry", { params: { path: { id } } });
      return JobWire.parse(result.data);
    },
    onSuccess: (job) => setJobId(job.id),
    onError: toastApiError,
  });

  const example = useMemo(() => {
    if (!resolved) return null;
    return computeSellingPrice(
      toCents(EXAMPLE_COST),
      { percent: Number(resolved.default_margin_percent), fixedCents: toCents(resolved.default_margin_fixed) },
      resolved.rounding_enabled,
    );
  }, [resolved]);

  if (settings.isError) return <ErrorState onRetry={() => void settings.refetch()} />;
  if (settings.isPending || !resolved || !example) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {jobId ? (
        <Card title={t.recomputeNotice}>
          <JobProgress
            jobId={jobId}
            retrying={retry.isPending}
            onRetry={(id) => retry.mutate(id)}
            onDone={() => {
              setJobId(null);
              void queryClient.invalidateQueries({ queryKey: qk.settings.root });
            }}
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title={t.thresholds.title}>
          <Row label={t.thresholds.up}>
            <Input
              value={resolved.auto_approve_up_percent}
              onChange={(event) => setDraft({ ...resolved, auto_approve_up_percent: event.target.value })}
              className="w-24"
            />
          </Row>
          <Row label={t.thresholds.down}>
            <Input
              value={resolved.auto_approve_down_percent}
              onChange={(event) => setDraft({ ...resolved, auto_approve_down_percent: event.target.value })}
              className="w-24"
            />
          </Row>
          <p className="text-meta text-muted-foreground">{t.thresholds.hint}</p>
        </Card>

        <Card title={t.defaultMargin.title}>
          <Row label={t.defaultMargin.enabled}>
            <Switch
              checked={resolved.default_margin_enabled}
              onCheckedChange={(checked) => setDraft({ ...resolved, default_margin_enabled: checked })}
            />
          </Row>
          <Row label={t.defaultMargin.rate}>
            <Input
              value={resolved.default_margin_percent}
              onChange={(event) => setDraft({ ...resolved, default_margin_percent: event.target.value })}
              className="w-24"
            />
          </Row>
          <Row label={t.defaultMargin.fixed}>
            <Input
              value={resolved.default_margin_fixed}
              onChange={(event) => setDraft({ ...resolved, default_margin_fixed: event.target.value })}
              className="w-24"
            />
          </Row>
          <p className="text-meta text-muted-foreground">
            {t.defaultMargin.formula(
              `${resolved.default_margin_percent}%`,
              formatMoney(resolved.default_margin_fixed),
            )}
          </p>
          <p className="text-meta text-muted-foreground">
            <Num>
              {resolved.rounding_enabled
                ? t.defaultMargin.example(
                    formatMoney(EXAMPLE_COST),
                    formatMoney(fromCents(example.rawCents)),
                    formatMoney(fromCents(example.priceCents)),
                  )
                : t.defaultMargin.exampleNoRounding(
                    formatMoney(EXAMPLE_COST),
                    formatMoney(fromCents(example.rawCents)),
                  )}
            </Num>
          </p>
          <p className="text-meta text-muted-foreground">{t.defaultMargin.hint}</p>
        </Card>

        <Card title={t.rounding.title}>
          <Row label={t.defaultMargin.enabled}>
            <Switch
              checked={resolved.rounding_enabled}
              onCheckedChange={(checked) => setDraft({ ...resolved, rounding_enabled: checked })}
            />
          </Row>
          <p className="text-meta text-muted-foreground">{t.rounding.low}</p>
          <p className="text-meta text-muted-foreground">{t.rounding.high}</p>
          <p className="text-meta text-muted-foreground">{t.rounding.hint}</p>
        </Card>

        <Card title={t.crawl.title}>
          {crawl.isError ? (
            <ErrorState onRetry={() => void crawl.refetch()} />
          ) : crawl.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <Row label={t.crawl.cadence}>
                {crawl.data.cadence_minutes ? (
                  <Num>{t.crawl.cadenceValue(crawl.data.cadence_minutes)}</Num>
                ) : (
                  zhHant.common.unknown
                )}
              </Row>
              <Row label={t.crawl.lastRun}>
                {crawl.data.last_run ? (
                  <Timestamp value={crawl.data.last_run.started_at} variant="relative" />
                ) : (
                  zhHant.common.unknown
                )}
              </Row>
              <Row label={t.crawl.nextRun}>
                {crawl.data.next_run_at ? (
                  <Timestamp value={crawl.data.next_run_at} variant="relative" />
                ) : (
                  <span className="text-muted-foreground">{t.crawl.manualOnly}</span>
                )}
              </Row>
              <Row label={t.crawl.runsToday}>
                <Num>{t.crawl.runsTodayValue(crawl.data.today_run_count)}</Num>
              </Row>
              <div className="flex flex-wrap gap-2 pt-1">
                <StatusBadge
                  label={crawl.data.status === "stale" ? t.crawl.crawlerStale : t.crawl.crawlerHealthy}
                  tone={crawl.data.status === "stale" ? "warning" : "success"}
                />
                {health.data ? (
                  <StatusBadge
                    label={health.data.worker.status === "stale" ? t.crawl.workerStale : t.crawl.workerHealthy}
                    tone={health.data.worker.status === "stale" ? "warning" : "success"}
                  />
                ) : null}
              </div>
              <p className="text-meta text-muted-foreground">{t.crawl.cadenceHint}</p>
            </>
          )}
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-meta text-muted-foreground">{t.recomputeNotice}</p>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? zhHant.common.saving : t.saveButton}
        </Button>
      </div>
    </div>
  );
}
