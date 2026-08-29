"use client";

import { useEffect, useState } from "react";

import { zhHant } from "@/lib/i18n/zh-Hant";

/**
 * True when the app was started with mocks on.
 *
 * Read as a literal member access, not `process.env[key]` — Next's inliner is textual, so only the
 * literal form is replaced at build time. Because it *is* replaced, this is readable during the
 * server render too, which is what lets the gate below hydrate cleanly.
 */
const MOCKS_ENABLED = process.env.NEXT_PUBLIC_API_MOCKS === "1";

/**
 * Holds the tree back until the MSW service worker is active, when the app is run with
 * `NEXT_PUBLIC_API_MOCKS=1`.
 *
 * Registration is asynchronous, so a query fired in the same tick as `worker.start()` goes to the
 * real network and 404s — the classic MSW-in-App-Router failure, which presents as a flaky backend
 * rather than a race.
 *
 * Two things here are load-bearing and both were found by breaking them:
 *
 * 1. **`mocks/browser` is imported dynamically, inside the effect.** It calls `setupWorker(...)` at
 *    module scope, and `setupWorker` throws "Failed to execute `setupWorker` in a non-browser
 *    environment" during prerender. A static import fails `next build` even though this is a client
 *    component, because client components are still rendered on the server.
 * 2. **The initial state is `!MOCKS_ENABLED`, not `false`.** The flag is build-inlined and therefore
 *    readable on the server, so both sides render the same placeholder and hydration matches. A
 *    `useEffect`-only flag would render children on the server and a placeholder on the client,
 *    which is a mismatch on every page.
 *
 * With mocks off this is inert: `ready` starts true, the effect returns immediately, and the dynamic
 * import never runs, so production never pulls MSW into the bundle.
 */
export function MswGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void import("@/mocks/browser")
      .then(({ startMocks }) => startMocks())
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        // Without this the gate waits forever on the placeholder and the app looks hung. Service
        // worker registration fails for ordinary reasons — an incognito-like context, a browser
        // with SW disabled, a stale registration — and none of them should be indistinguishable
        // from a slow start. Fall through to the app so its own error states can do the talking.
        if (cancelled) return;
        setFailed(error instanceof Error ? error.message : String(error));
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (ready && failed) {
    return (
      <>
        <div
          role="alert"
          className="bg-warning px-5 py-2 text-meta text-warning-foreground"
        >
          {zhHant.app.mocksFailed}
        </div>
        {children}
      </>
    );
  }

  if (!ready) {
    return (
      <div
        className="flex min-h-svh items-center justify-center bg-background text-meta text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {zhHant.app.mocksStarting}
      </div>
    );
  }

  return <>{children}</>;
}
