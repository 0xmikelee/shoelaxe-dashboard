/**
 * Runtime switches for the mock API.
 *
 * `publishingEnabled` is a flag rather than a constant because the publishing-disabled copy is a
 * specified behaviour on Screens 2, 8 and 9 (Gap 25). A mock that hard-codes `true` leaves the
 * disabled variants untestable; hard-coding `false` leaves the enabled ones untested. It seeds from
 * the environment so `NEXT_PUBLIC_MOCK_PUBLISHING=1 pnpm dev` walks the other half of the UI, and
 * stays mutable so a single test can flip it without re-importing the module graph.
 */
export interface MockConfig {
  /** Drives `meta.publishing.enabled` everywhere it appears, and `/system/health`. */
  publishingEnabled: boolean;
  /**
   * Artificial delay on every mocked response. Zero in tests — a fake wait is a slow suite, not a
   * better one — and small in the browser so skeletons and pending states are actually visible.
   */
  latencyMs: number;
  /** Milliseconds between job-runner ticks when it is driven by a real timer (browser only). */
  jobTickMs: number;
  /** How many job items each tick completes. */
  jobBatchSize: number;
  /** Ticks a job spends `queued` before the worker claims it — Screen 4's 排隊中 state. */
  jobQueuedTicks: number;
  /** A worker heartbeat older than this is `stale`: 背景服務未運行 rather than merely slow. */
  workerStaleAfterMs: number;
  /**
   * Parse every mocked response against the schema its RouteDoc declares before sending it. On in
   * tests, off in the browser: it turns "the screen renders nothing and nobody knows why" into a
   * failure at the handler that invented the field.
   */
  validateResponses: boolean;
}

const flag = (name: string, fallback = false): boolean => {
  const raw = process.env[name];
  return raw === undefined ? fallback : raw === "1" || raw === "true";
};

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

export const defaultMockConfig = (): MockConfig => ({
  publishingEnabled: flag("NEXT_PUBLIC_MOCK_PUBLISHING"),
  latencyMs: isTest ? 0 : 120,
  jobTickMs: 600,
  jobBatchSize: 7,
  jobQueuedTicks: 2,
  workerStaleAfterMs: 60_000,
  validateResponses: isTest,
});

export const mockConfig: MockConfig = defaultMockConfig();

/** Called from the MSW lifecycle so one test's flag flip cannot leak into the next. */
export function resetMockConfig(): void {
  Object.assign(mockConfig, defaultMockConfig());
}
