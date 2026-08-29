import { setupWorker, type SetupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { jobRunner } from "./job-runner";

/**
 * The browser worker, for `NEXT_PUBLIC_API_MOCKS=1 pnpm dev`.
 *
 * `startMocks()` returns a promise that resolves only once the service worker is *active*. Awaiting it
 * before the first query is the whole point: registration is asynchronous, and a fetch fired in the
 * same tick as `worker.start()` goes to the network and 404s. That is the classic MSW-in-App-Router
 * failure, and it looks like a flaky backend rather than a race.
 */
export const worker: SetupWorker = setupWorker(...handlers);

export interface StartMocksOptions {
  /** Leave the job runner stopped — a test harness that ticks it by hand does not want a timer. */
  tickJobs?: boolean;
  quiet?: boolean;
}

let starting: Promise<void> | undefined;

export function startMocks(options: StartMocksOptions = {}): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  starting ??= (async () => {
    await worker.start({
      // Bypass, not error: Next's own /_next/*, RSC payloads and HMR sockets are not ours to mock,
      // and failing them would break the dev server rather than catch a missing handler. The strict
      // setting belongs in tests, where every request is the app's own.
      onUnhandledRequest: "bypass",
      quiet: options.quiet ?? true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
    if (options.tickJobs ?? true) jobRunner.start();
  })();
  return starting;
}

export function stopMocks(): void {
  jobRunner.stop();
  worker.stop();
  starting = undefined;
}

/** True when the app was started with mocks on. Read this, never `process.env` inline. */
export const mocksEnabled = (): boolean => process.env.NEXT_PUBLIC_API_MOCKS === "1";
